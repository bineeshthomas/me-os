import { Router } from "express";
import { pool } from "./db/pool.js";

export const api = Router();

const PROJECTS_SQL = `
  SELECT p.*, COALESCE(
    json_agg(json_build_object('id', s.id, 'title', s.title, 'done', s.done, 'position', s.position, 'due_date', to_char(s.due_date, 'YYYY-MM-DD'))
             ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps,
    (SELECT COALESCE(json_agg(json_build_object('id', n.id, 'title', n.title, 'pinned', n.pinned, 'updated_at', n.updated_at)
                              ORDER BY n.pinned DESC, n.updated_at DESC), '[]') FROM notes n WHERE n.project_id = p.id) AS notes
  FROM projects p LEFT JOIN project_steps s ON s.project_id = p.id`;

const CATEGORIES = ["work", "personal"];

// "YYYY-MM-DD" -> itself, "" or null -> null (clears the date), anything else -> undefined (invalid)
function dateOrNull(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return v;
  return undefined;
}

// Projects
api.get("/projects", async (_req, res) => {
  const { rows } = await pool.query(`${PROJECTS_SQL} GROUP BY p.id ORDER BY p.updated_at DESC, p.id DESC`);
  res.json(rows);
});

api.post("/projects", async (req, res) => {
  const { title, description, steps, category } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  if (category != null && !CATEGORIES.includes(category)) return res.status(400).json({ error: "category must be work or personal" });
  const due = dateOrNull(req.body?.due_date ?? null);
  if (due === undefined) return res.status(400).json({ error: "due_date must be YYYY-MM-DD" });
  const { rows } = await pool.query(
    "INSERT INTO projects (title, description, category, due_date) VALUES ($1, $2, $3, $4) RETURNING id",
    [title, description ?? null, category ?? "work", due],
  );
  const list: string[] = Array.isArray(steps) ? steps.filter((s) => typeof s === "string" && s.trim()) : [];
  for (const [i, s] of list.entries()) {
    await pool.query("INSERT INTO project_steps (project_id, title, position) VALUES ($1, $2, $3)", [rows[0].id, s.trim(), i]);
  }
  const out = await pool.query(`${PROJECTS_SQL} WHERE p.id = $1 GROUP BY p.id`, [rows[0].id]);
  res.status(201).json(out.rows[0]);
});

api.patch("/projects/:id", async (req, res) => {
  const { title, description, category } = req.body ?? {};
  if (category != null && !CATEGORIES.includes(category)) return res.status(400).json({ error: "category must be work or personal" });
  const hasDue = "due_date" in (req.body ?? {});
  const due = dateOrNull(req.body?.due_date);
  if (hasDue && due === undefined) return res.status(400).json({ error: "due_date must be YYYY-MM-DD" });
  const { rows } = await pool.query(
    `UPDATE projects SET title = COALESCE($2, title), description = COALESCE($3, description),
       category = COALESCE($4, category), due_date = CASE WHEN $5::boolean THEN $6::date ELSE due_date END,
       updated_at = now() WHERE id = $1 RETURNING id`,
    [req.params.id, title ?? null, description ?? null, category ?? null, hasDue, due ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  const out = await pool.query(`${PROJECTS_SQL} WHERE p.id = $1 GROUP BY p.id`, [req.params.id]);
  res.json(out.rows[0]);
});

api.delete("/projects/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

// Steps
api.post("/projects/:id/steps", async (req, res) => {
  const { title } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const due = dateOrNull(req.body?.due_date ?? null);
  if (due === undefined) return res.status(400).json({ error: "due_date must be YYYY-MM-DD" });
  const { rows } = await pool.query(
    `INSERT INTO project_steps (project_id, title, position, due_date)
     VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM project_steps WHERE project_id = $1), 0), $3) RETURNING *`,
    [req.params.id, title, due],
  );
  await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [req.params.id]);
  res.status(201).json(rows[0]);
});

api.patch("/steps/:id", async (req, res) => {
  const { title, done } = req.body ?? {};
  const hasDue = "due_date" in (req.body ?? {});
  const due = dateOrNull(req.body?.due_date);
  if (hasDue && due === undefined) return res.status(400).json({ error: "due_date must be YYYY-MM-DD" });
  const { rows } = await pool.query(
    `UPDATE project_steps SET title = COALESCE($2, title), done = COALESCE($3, done),
       due_date = CASE WHEN $4::boolean THEN $5::date ELSE due_date END
     WHERE id = $1 RETURNING *`,
    [req.params.id, title ?? null, done ?? null, hasDue, due ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [rows[0].project_id]);
  res.json(rows[0]);
});

// Drag-to-reorder: the full list of this project's step ids, in the new order
api.put("/projects/:id/steps/order", async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) return res.status(400).json({ error: "ids must be an array of step ids" });
  const owned = await pool.query("SELECT id FROM project_steps WHERE project_id = $1", [req.params.id]);
  const have = new Set(owned.rows.map((r) => r.id as number));
  if (ids.length !== have.size || !ids.every((n) => have.has(n as number)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "ids must list every step of this project exactly once" });
  }
  await pool.query(
    `UPDATE project_steps s SET position = t.ord - 1
     FROM unnest($2::int[]) WITH ORDINALITY AS t(id, ord) WHERE s.id = t.id AND s.project_id = $1`,
    [req.params.id, ids],
  );
  await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// Project and step deadlines inside a date range (calendar)
api.get("/deadlines", async (req, res) => {
  const from = dateOrNull(req.query.from);
  const to = dateOrNull(req.query.to);
  if (!from || !to) return res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
  const { rows } = await pool.query(
    `SELECT 'project' AS type, p.id, p.id AS project_id, p.title, p.title AS project_title, p.category,
            to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
            COALESCE((SELECT bool_and(s.done) FROM project_steps s WHERE s.project_id = p.id), false) AS done
       FROM projects p WHERE p.due_date BETWEEN $1 AND $2
     UNION ALL
     SELECT 'step', s.id, s.project_id, s.title, p.title, p.category, to_char(s.due_date, 'YYYY-MM-DD'), s.done
       FROM project_steps s JOIN projects p ON p.id = s.project_id WHERE s.due_date BETWEEN $1 AND $2
     ORDER BY due_date, type DESC, id`,
    [from, to],
  );
  res.json(rows);
});

api.delete("/steps/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM project_steps WHERE id = $1 RETURNING project_id", [req.params.id]);
  if (rows[0]) await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [rows[0].project_id]);
  res.status(rows[0] ? 204 : 404).end();
});

// Notes
// Tags: lowercase, no leading #, spaces become dashes, de-duplicated, at most 10 of 24 characters each
function cleanTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const tags = input
    .map((t) => String(t).trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 24))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 10);
}

const NOTES_SQL = `
  SELECT n.*, p.title AS project_title, p.category AS project_category
  FROM notes n LEFT JOIN projects p ON p.id = n.project_id`;

// ?project_id=N  notes of one project   |   ?meeting=1  only notes that belong to a meeting   |   ?meeting_key=K  one meeting's notes
api.get("/notes", async (req, res) => {
  const projectId = req.query.project_id === undefined ? null : Number(req.query.project_id);
  const meetingKey = typeof req.query.meeting_key === "string" ? req.query.meeting_key : null;
  const { rows } = await pool.query(
    `${NOTES_SQL} WHERE ($1::int IS NULL OR n.project_id = $1)
       AND ($2::boolean IS NOT TRUE OR n.meeting_key IS NOT NULL) AND ($3::text IS NULL OR n.meeting_key = $3)
     ORDER BY n.pinned DESC, n.updated_at DESC`,
    [Number.isInteger(projectId) ? projectId : null, req.query.meeting === "1", meetingKey],
  );
  res.json(rows);
});

api.get("/notes/:id", async (req, res) => {
  const { rows } = await pool.query(`${NOTES_SQL} WHERE n.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

// A note's project link: null or a number. Anything else is rejected.
const projectIdOrNull = (v: unknown): number | null | undefined => (v === null ? null : Number.isInteger(v) ? (v as number) : undefined);
const isFkError = (e: unknown) => (e as { code?: string }).code === "23503";

// A note's meeting link: null, or { key, title, start }. Anything else is rejected (undefined).
type MeetingLink = { key: string; title: string; start: string | null };
function meetingOrNull(v: unknown): MeetingLink | null | undefined {
  if (v === null) return null;
  if (typeof v !== "object" || v === undefined) return undefined;
  const m = v as Record<string, unknown>;
  const key = typeof m.key === "string" ? m.key.trim() : "";
  const title = typeof m.title === "string" ? m.title.trim() : "";
  if (!key || key.length > 300 || !title || title.length > 300) return undefined;
  if (m.start === null || m.start === undefined) return { key, title, start: null };
  if (typeof m.start !== "string" || Number.isNaN(Date.parse(m.start))) return undefined;
  return { key, title, start: new Date(m.start).toISOString() };
}

api.post("/notes", async (req, res) => {
  const { title, body } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const projectId = projectIdOrNull(req.body?.project_id ?? null);
  if (projectId === undefined) return res.status(400).json({ error: "project_id must be a project id or null" });
  const meeting = meetingOrNull(req.body?.meeting ?? null);
  if (meeting === undefined) return res.status(400).json({ error: "meeting must be { key, title, start } or null" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO notes (title, body, tags, pinned, project_id, meeting_key, meeting_title, meeting_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [title, body ?? "", cleanTags(req.body?.tags) ?? [], req.body?.pinned === true, projectId, meeting?.key ?? null, meeting?.title ?? null, meeting?.start ?? null],
    );
    if (projectId) await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [projectId]);
    res.status(201).json((await pool.query(`${NOTES_SQL} WHERE n.id = $1`, [rows[0].id])).rows[0]);
  } catch (e) {
    if (isFkError(e)) return res.status(400).json({ error: "That project doesn't exist" });
    throw e;
  }
});

// `touch: false` saves without bumping "updated" (pinning, or ticking a checklist item, shouldn't reshuffle the list)
api.patch("/notes/:id", async (req, res) => {
  const { title, body } = req.body ?? {};
  if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: "title is required" });
  const hasProject = "project_id" in (req.body ?? {});
  const projectId = projectIdOrNull(req.body?.project_id);
  if (hasProject && projectId === undefined) return res.status(400).json({ error: "project_id must be a project id or null" });
  const hasMeeting = "meeting" in (req.body ?? {});
  const meeting = meetingOrNull(req.body?.meeting);
  if (hasMeeting && meeting === undefined) return res.status(400).json({ error: "meeting must be { key, title, start } or null" });
  try {
    const { rows } = await pool.query(
      `UPDATE notes SET title = COALESCE($2, title), body = COALESCE($3, body), tags = COALESCE($4, tags),
         pinned = COALESCE($5, pinned), project_id = CASE WHEN $7::boolean THEN $8::int ELSE project_id END,
         meeting_key = CASE WHEN $9::boolean THEN $10 ELSE meeting_key END,
         meeting_title = CASE WHEN $9::boolean THEN $11 ELSE meeting_title END,
         meeting_start = CASE WHEN $9::boolean THEN $12::timestamptz ELSE meeting_start END,
         updated_at = CASE WHEN $6::boolean THEN now() ELSE updated_at END
       WHERE id = $1 RETURNING id, project_id`,
      [
        req.params.id,
        title ?? null,
        body ?? null,
        cleanTags(req.body?.tags) ?? null,
        typeof req.body?.pinned === "boolean" ? req.body.pinned : null,
        req.body?.touch !== false,
        hasProject,
        projectId ?? null,
        hasMeeting,
        meeting?.key ?? null,
        meeting?.title ?? null,
        meeting?.start ?? null,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    if (rows[0].project_id && req.body?.touch !== false) await pool.query("UPDATE projects SET updated_at = now() WHERE id = $1", [rows[0].project_id]);
    res.json((await pool.query(`${NOTES_SQL} WHERE n.id = $1`, [rows[0].id])).rows[0]);
  } catch (e) {
    if (isFkError(e)) return res.status(400).json({ error: "That project doesn't exist" });
    throw e;
  }
});

api.delete("/notes/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM notes WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

// Dashboard
api.get("/dashboard", async (_req, res) => {
  const [counts, projects, notes] = await Promise.all([
    pool.query(`SELECT
      (SELECT COUNT(*) FROM projects)::int AS projects,
      (SELECT COUNT(*) FROM notes)::int AS notes,
      (SELECT COUNT(*) FROM project_steps WHERE NOT done)::int AS open_steps,
      (SELECT COUNT(*) FROM project_steps WHERE done)::int AS done_steps`),
    pool.query(`${PROJECTS_SQL} GROUP BY p.id ORDER BY p.updated_at DESC, p.id DESC LIMIT 5`),
    pool.query("SELECT id, title, body, updated_at FROM notes ORDER BY updated_at DESC LIMIT 5"),
  ]);
  res.json({ counts: counts.rows[0], projects: projects.rows, notes: notes.rows });
});

// Widget items: tasks, calls, emails, messages, meetings and follow ups
const KINDS = ["task", "call", "email", "message", "meeting", "followup"];
const APPS = ["whatsapp", "teams"];

// "Notify me by": a date and time, or null to clear it. Anything unreadable gives undefined.
function parseWhen(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v).toISOString();
}

// A follow up's tag: who or what you are waiting on. Trimmed, no leading #, at most 30 characters. Empty clears it.
function parseTag(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 30);
  return t || null;
}

api.get("/items", async (req, res) => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const { rows } = await pool.query(
    "SELECT * FROM items WHERE ($1::text IS NULL OR kind = $1) ORDER BY done, due_at NULLS LAST, id",
    [kind],
  );
  res.json(rows);
});

api.post("/items", async (req, res) => {
  const { kind, app } = req.body ?? {};
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "invalid kind" });
  if (app != null && !APPS.includes(app)) return res.status(400).json({ error: "invalid app" });
  if (!title) return res.status(400).json({ error: "title is required" });
  const when = parseWhen(req.body?.due_at);
  if (when === undefined) return res.status(400).json({ error: "due_at must be a date and time" });
  const tag = parseTag(req.body?.tag);
  if (tag === undefined) return res.status(400).json({ error: "tag must be text" });
  if (kind === "followup" && when) return res.status(400).json({ error: "A follow up has a tag, not a date or time" });
  if (kind !== "followup" && tag) return res.status(400).json({ error: "Only follow ups have a tag" });
  const { rows } = await pool.query("INSERT INTO items (kind, title, due_at, app, tag) VALUES ($1, $2, $3, $4, $5) RETURNING *", [
    kind,
    title,
    when,
    kind === "message" ? (app ?? "whatsapp") : null,
    tag,
  ]);
  res.status(201).json(rows[0]);
});

// due_at ("Notify me by") and tag are set exactly as sent: send null to clear them. Anything left out is unchanged.
api.patch("/items/:id", async (req, res) => {
  const { done } = req.body ?? {};
  if ("title" in (req.body ?? {}) && !String(req.body.title ?? "").trim()) return res.status(400).json({ error: "title is required" });
  const hasDue = "due_at" in (req.body ?? {});
  const hasTag = "tag" in (req.body ?? {});
  const when = parseWhen(req.body?.due_at);
  const tag = parseTag(req.body?.tag);
  if (hasDue && when === undefined) return res.status(400).json({ error: "due_at must be a date and time" });
  if (hasTag && tag === undefined) return res.status(400).json({ error: "tag must be text" });
  const current = await pool.query("SELECT kind FROM items WHERE id = $1", [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ error: "not found" });
  const kind = current.rows[0].kind;
  if (hasDue && kind === "followup" && when) return res.status(400).json({ error: "A follow up has a tag, not a date or time" });
  if (hasTag && kind !== "followup" && tag) return res.status(400).json({ error: "Only follow ups have a tag" });
  const { rows } = await pool.query(
    `UPDATE items SET title = COALESCE($2, title), done = COALESCE($3::boolean, done),
       due_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE due_at END,
       tag = CASE WHEN $6::boolean THEN $7 ELSE tag END,
       completed_at = CASE WHEN $3::boolean IS TRUE THEN COALESCE(completed_at, now())
                           WHEN $3::boolean IS FALSE THEN NULL ELSE completed_at END
     WHERE id = $1 RETURNING *`,
    [req.params.id, typeof req.body?.title === "string" ? req.body.title.trim() : null, done ?? null, hasDue, when ?? null, hasTag, tag ?? null],
  );
  res.json(rows[0]);
});

api.delete("/items/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM items WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

// Search across projects, steps, notes and items
api.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json([]);
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const { rows } = await pool.query(
    `SELECT 'project' AS type, id, title, description AS snippet FROM projects WHERE title ILIKE $1 OR description ILIKE $1
     UNION ALL
     SELECT 'step', project_id, title, NULL FROM project_steps WHERE title ILIKE $1
     UNION ALL
     SELECT 'note', id, title, LEFT(body, 120) FROM notes WHERE title ILIKE $1 OR body ILIKE $1 OR array_to_string(tags, ' ') ILIKE $1 OR meeting_title ILIKE $1
     UNION ALL
     SELECT kind, id, title, tag FROM items WHERE title ILIKE $1 OR tag ILIKE $1
     UNION ALL
     SELECT 'link', id, name, url FROM links WHERE name ILIKE $1 OR url ILIKE $1
     LIMIT 30`,
    [like],
  );
  res.json(rows);
});

// Settings: Outlook / ICS calendar link (the URL itself never leaves the server)
import { clearCalendarCache, getCalendarUrl, getEvents, normalizeCalendarUrl } from "./calendar.js";

api.get("/settings", async (_req, res) => {
  const url = await getCalendarUrl();
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'stress_level'");
  res.json({
    calendar: url ? { connected: true, host: new URL(url).host } : { connected: false },
    stress: rows[0] ? Number(rows[0].value) : 20,
    privacy: await getPrivacy(),
  });
});

api.put("/settings/stress", async (req, res) => {
  const level = Math.round(Number(req.body?.level));
  if (!Number.isFinite(level) || level < 0 || level > 100) return res.status(400).json({ error: "level must be 0-100" });
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('stress_level', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [String(level)],
  );
  res.json({ stress: level });
});

api.put("/settings/calendar", async (req, res) => {
  let url: string;
  try {
    url = normalizeCalendarUrl(String(req.body?.url ?? ""));
    clearCalendarCache();
    await getEvents(url, new Date(), new Date(Date.now() + 86_400_000)); // validate: fetch + parse
  } catch (e) {
    return res.status(400).json({ error: `Could not read that calendar: ${(e as Error).message}` });
  }
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('calendar_url', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [url],
  );
  res.json({ calendar: { connected: true, host: new URL(url).host } });
});

api.delete("/settings/calendar", async (_req, res) => {
  await pool.query("DELETE FROM settings WHERE key = 'calendar_url'");
  clearCalendarCache();
  res.status(204).end();
});

api.get("/calendar/events", async (req, res) => {
  const url = await getCalendarUrl();
  if (!url) return res.json({ connected: false, events: [] });
  const from = new Date(String(req.query.from));
  const to = new Date(String(req.query.to));
  if (Number.isNaN(+from) || Number.isNaN(+to)) return res.status(400).json({ error: "from and to are required" });
  try {
    res.json({ connected: true, events: await getEvents(url, from, to) });
  } catch (e) {
    res.status(502).json({ connected: true, events: [], error: (e as Error).message });
  }
});

// Quick-launch links
function cleanUrl(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; // no javascript: etc.
  } catch {
    return null;
  }
}

api.get("/links", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM links ORDER BY lower(name), id");
  res.json(rows);
});

api.post("/links", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const url = cleanUrl(req.body?.url);
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!url) return res.status(400).json({ error: "enter a valid http(s) link" });
  const { rows } = await pool.query("INSERT INTO links (name, url) VALUES ($1, $2) RETURNING *", [name, url]);
  res.status(201).json(rows[0]);
});

api.patch("/links/:id", async (req, res) => {
  const name = req.body?.name == null ? null : String(req.body.name).trim();
  const url = req.body?.url == null ? null : cleanUrl(req.body.url);
  if (name === "" ) return res.status(400).json({ error: "name is required" });
  if (req.body?.url != null && !url) return res.status(400).json({ error: "enter a valid http(s) link" });
  const { rows } = await pool.query(
    "UPDATE links SET name = COALESCE($2, name), url = COALESCE($3, url) WHERE id = $1 RETURNING *",
    [req.params.id, name, url],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

api.delete("/links/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM links WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

import { review } from "./review.js";
api.use(review);

import { focus } from "./focus.js";
api.use(focus);

import { getPrivacy, privacy } from "./privacy.js";
api.use(privacy);

import { summary } from "./summary.js";
api.use(summary);
