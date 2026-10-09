import { Router } from "express";
import { pool } from "./db/pool.js";

export const api = Router();

const PROJECTS_SQL = `
  SELECT p.*, COALESCE(
    json_agg(json_build_object('id', s.id, 'title', s.title, 'done', s.done, 'position', s.position, 'due_date', to_char(s.due_date, 'YYYY-MM-DD'))
             ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
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
api.get("/notes", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM notes ORDER BY updated_at DESC");
  res.json(rows);
});

api.post("/notes", async (req, res) => {
  const { title, body } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query("INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING *", [title, body ?? ""]);
  res.status(201).json(rows[0]);
});

api.patch("/notes/:id", async (req, res) => {
  const { title, body } = req.body ?? {};
  const { rows } = await pool.query(
    "UPDATE notes SET title = COALESCE($2, title), body = COALESCE($3, body), updated_at = now() WHERE id = $1 RETURNING *",
    [req.params.id, title ?? null, body ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
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

// Widget items: tasks, calls, emails, meetings, reminders
const KINDS = ["task", "call", "email", "message", "meeting", "reminder"];
const APPS = ["whatsapp", "teams"];

api.get("/items", async (req, res) => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const { rows } = await pool.query(
    "SELECT * FROM items WHERE ($1::text IS NULL OR kind = $1) ORDER BY done, due_at NULLS LAST, id",
    [kind],
  );
  res.json(rows);
});

api.post("/items", async (req, res) => {
  const { kind, title, due_at, app } = req.body ?? {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "invalid kind" });
  if (app != null && !APPS.includes(app)) return res.status(400).json({ error: "invalid app" });
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query("INSERT INTO items (kind, title, due_at, app) VALUES ($1, $2, $3, $4) RETURNING *", [
    kind,
    title,
    due_at || null,
    kind === "message" ? (app ?? "whatsapp") : null,
  ]);
  res.status(201).json(rows[0]);
});

api.patch("/items/:id", async (req, res) => {
  const { title, due_at, done } = req.body ?? {};
  const { rows } = await pool.query(
    `UPDATE items SET title = COALESCE($2, title), due_at = COALESCE($3, due_at), done = COALESCE($4::boolean, done),
       completed_at = CASE WHEN $4::boolean IS TRUE THEN COALESCE(completed_at, now())
                           WHEN $4::boolean IS FALSE THEN NULL ELSE completed_at END
     WHERE id = $1 RETURNING *`,
    [req.params.id, title ?? null, due_at ?? null, done ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
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
     SELECT 'note', id, title, LEFT(body, 120) FROM notes WHERE title ILIKE $1 OR body ILIKE $1
     UNION ALL
     SELECT kind, id, title, NULL FROM items WHERE title ILIKE $1
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
