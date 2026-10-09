import { Router } from "express";
import { pool } from "./db/pool.js";
import { rollOverThrough } from "./rollover.js";

export const review = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Consecutive days ending on `today` (or yesterday, if today isn't done yet)
function streak(dates: string[], today: string): number {
  const set = new Set(dates);
  let day = set.has(today) ? today : shift(today, -1);
  let n = 0;
  while (set.has(day)) { n++; day = shift(day, -1); }
  return n;
}

const REVIEW_COLS = `to_char(date, 'YYYY-MM-DD') AS date, wins, went_well, blocker, learned, priorities, brain_dump,
                     gratitude, rating, energy, stress, completed_at, updated_at`;

// --- The review for one day, with everything the page needs
review.get("/review/:date", async (req, res) => {
  const date = req.params.date;
  if (!isDate(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const [rv, habits, logs, goals, entries, wins, open, done, focusRow] = await Promise.all([
    pool.query(`SELECT ${REVIEW_COLS} FROM daily_reviews WHERE date = $1`, [date]),
    pool.query("SELECT id, name, icon, points FROM habits ORDER BY id"),
    pool.query("SELECT habit_id, to_char(date, 'YYYY-MM-DD') AS date FROM habit_logs WHERE date <= $1", [date]),
    pool.query(`SELECT g.*, COALESCE((SELECT SUM(points) FROM goal_entries e WHERE e.goal_id = g.id), 0)::int AS total
                FROM goals g WHERE g.achieved_at IS NULL OR g.achieved_at::date >= $1::date ORDER BY g.created_at`, [date]),
    pool.query("SELECT id, goal_id, points, note FROM goal_entries WHERE date = $1 ORDER BY id", [date]),
    pool.query("SELECT title FROM items WHERE done AND completed_at::date = $1::date ORDER BY completed_at", [date]),
    pool.query(`SELECT id, kind, title, due_at, app FROM items
                WHERE NOT done AND kind <> 'meeting' ORDER BY due_at NULLS LAST, id`),
    pool.query("SELECT to_char(date, 'YYYY-MM-DD') AS date FROM daily_reviews WHERE completed_at IS NOT NULL AND date <= $1", [date]),
    pool.query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))), 0)::int AS seconds
       FROM focus_sessions WHERE started_at::date = $1::date`,
      [date],
    ),
  ]);

  const habitList = habits.rows.map((h) => {
    const dates = logs.rows.filter((l) => l.habit_id === h.id).map((l) => l.date);
    return { ...h, done: dates.includes(date), streak: streak(dates, date) };
  });
  const goalList = goals.rows.map((g) => ({ ...g, today: entries.rows.filter((e) => e.goal_id === g.id) }));
  const points =
    habitList.filter((h) => h.done).reduce((a, h) => a + h.points, 0) + entries.rows.reduce((a, e) => a + e.points, 0);

  res.json({
    date,
    review: rv.rows[0] ?? null,
    habits: habitList,
    goals: goalList,
    wins: wins.rows.map((r) => r.title),
    open_items: open.rows,
    points_today: points,
    focus_seconds: focusRow.rows[0].seconds,
    review_streak: streak(done.rows.map((r) => r.date), date),
  });
});

const TEXT_FIELDS = ["wins", "went_well", "blocker", "learned", "brain_dump", "gratitude"];

review.put("/review/:date", async (req, res) => {
  const date = req.params.date;
  if (!isDate(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  const b = req.body ?? {};
  const cols: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => { cols.push(col); vals.push(val); };

  for (const f of TEXT_FIELDS) if (typeof b[f] === "string") set(f, b[f]);
  if (Array.isArray(b.priorities)) {
    set("priorities", JSON.stringify(b.priorities.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 3)));
  }
  for (const [f, lo, hi] of [["rating", 1, 5], ["energy", 1, 5], ["stress", 0, 100]] as const) {
    if (f in b) {
      const n = b[f] === null ? null : Math.round(Number(b[f]));
      if (n !== null && !(n >= lo && n <= hi)) return res.status(400).json({ error: `${f} must be ${lo}-${hi}` });
      set(f, n);
    }
  }
  if (typeof b.complete === "boolean") set("completed_at", b.complete ? new Date() : null);

  const names = ["date", ...cols];
  const params = names.map((_, i) => `$${i + 1}`);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).concat("updated_at = now()");
  const { rows } = await pool.query(
    `INSERT INTO daily_reviews (${names.join(", ")}) VALUES (${params.join(", ")})
     ON CONFLICT (date) DO UPDATE SET ${updates.join(", ")}
     RETURNING ${REVIEW_COLS}`,
    [date, ...vals],
  );

  // Finishing the day rolls unfinished dated items (e.g. reminders) over to the next day, keeping their time.
  // Undated items aren't tied to a day, so they simply stay open. Meetings are events and never move.
  let rolled = 0;
  if (b.complete === true) {
    rolled = await rollOverThrough(date);
  }
  res.json({ ...rows[0], rolled_over: rolled });
});

review.get("/reviews", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${REVIEW_COLS} FROM daily_reviews WHERE completed_at IS NOT NULL ORDER BY date DESC LIMIT 30`,
  );
  res.json(rows);
});

// What I planned yesterday for today (dashboard)
review.get("/focus", async (_req, res) => {
  const { rows } = await pool.query("SELECT priorities FROM daily_reviews WHERE date = CURRENT_DATE - 1");
  res.json({ priorities: rows[0]?.priorities ?? [] });
});

// --- Habits
review.put("/review/:date/habits/:id", async (req, res) => {
  const date = req.params.date;
  if (!isDate(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  if (req.body?.done) {
    await pool.query("INSERT INTO habit_logs (habit_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.id, date]);
  } else {
    await pool.query("DELETE FROM habit_logs WHERE habit_id = $1 AND date = $2", [req.params.id, date]);
  }
  res.status(204).end();
});

review.post("/habits", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const icon = String(req.body?.icon ?? "").trim() || "⭐";
  const points = Math.max(1, Math.round(Number(req.body?.points) || 10));
  const { rows } = await pool.query("INSERT INTO habits (name, icon, points) VALUES ($1, $2, $3) RETURNING *", [name, icon, points]);
  res.status(201).json(rows[0]);
});

review.delete("/habits/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM habits WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

// --- Goals
const GOALS_SQL = `
  SELECT g.*, COALESCE(SUM(e.points), 0)::int AS total,
         COALESCE(json_agg(json_build_object('id', e.id, 'date', to_char(e.date, 'YYYY-MM-DD'), 'points', e.points, 'note', e.note)
                  ORDER BY e.date DESC, e.id DESC) FILTER (WHERE e.id IS NOT NULL), '[]') AS entries
  FROM goals g LEFT JOIN goal_entries e ON e.goal_id = g.id`;

review.get("/goals", async (_req, res) => {
  const { rows } = await pool.query(`${GOALS_SQL} GROUP BY g.id ORDER BY g.achieved_at NULLS FIRST, g.created_at`);
  res.json(rows);
});

review.post("/goals", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const target = Math.max(1, Math.round(Number(req.body?.target_points) || 100));
  const { rows } = await pool.query("INSERT INTO goals (title, why, target_points) VALUES ($1, $2, $3) RETURNING *", [
    title,
    String(req.body?.why ?? "").trim(),
    target,
  ]);
  res.status(201).json(rows[0]);
});

review.delete("/goals/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM goals WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

review.post("/goals/:id/entries", async (req, res) => {
  const points = Math.round(Number(req.body?.points));
  if (!(points >= 1 && points <= 1000)) return res.status(400).json({ error: "points must be 1-1000" });
  const date = isDate(req.body?.date) ? req.body.date : new Date().toISOString().slice(0, 10);
  const exists = await pool.query("SELECT 1 FROM goals WHERE id = $1", [req.params.id]);
  if (!exists.rowCount) return res.status(404).json({ error: "goal not found" });
  await pool.query("INSERT INTO goal_entries (goal_id, date, points, note) VALUES ($1, $2, $3, $4)", [
    req.params.id,
    date,
    points,
    String(req.body?.note ?? "").trim(),
  ]);
  // Reaching the target marks the goal achieved
  const { rows } = await pool.query(
    `UPDATE goals g SET achieved_at = COALESCE(achieved_at, now())
     WHERE g.id = $1 AND (SELECT SUM(points) FROM goal_entries WHERE goal_id = g.id) >= g.target_points
     RETURNING achieved_at`,
    [req.params.id],
  );
  res.status(201).json({ achieved: !!rows[0] });
});

review.delete("/goal-entries/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM goal_entries WHERE id = $1 RETURNING goal_id", [req.params.id]);
  if (rows[0]) {
    // Removing points can un-achieve a goal
    await pool.query(
      `UPDATE goals g SET achieved_at = NULL
       WHERE g.id = $1 AND COALESCE((SELECT SUM(points) FROM goal_entries WHERE goal_id = g.id), 0) < g.target_points`,
      [rows[0].goal_id],
    );
  }
  res.status(rows[0] ? 204 : 404).end();
});

// --- Weekly summary: the 7 days ending on :date
review.get("/review-summary/:date", async (req, res) => {
  const end = req.params.date;
  if (!isDate(end)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  const start = shift(end, -6);

  const [reviews, habits, logs, goals, entries, finished] = await Promise.all([
    pool.query(`SELECT ${REVIEW_COLS} FROM daily_reviews WHERE completed_at IS NOT NULL AND date BETWEEN $1 AND $2`, [start, end]),
    pool.query("SELECT id, name, icon, points FROM habits ORDER BY id"),
    pool.query("SELECT habit_id, to_char(date, 'YYYY-MM-DD') AS date FROM habit_logs WHERE date BETWEEN $1 AND $2", [start, end]),
    pool.query("SELECT id, title FROM goals"),
    pool.query("SELECT goal_id, to_char(date, 'YYYY-MM-DD') AS date, points FROM goal_entries WHERE date BETWEEN $1 AND $2", [start, end]),
    pool.query("SELECT to_char(date, 'YYYY-MM-DD') AS date FROM daily_reviews WHERE completed_at IS NOT NULL AND date <= $1", [end]),
  ]);

  const pointsOf = new Map(habits.rows.map((h) => [h.id, h.points as number]));
  const avg = (key: "rating" | "energy" | "stress") => {
    const v = reviews.rows.map((r) => r[key]).filter((n) => n !== null) as number[];
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shift(start, i);
    const r = reviews.rows.find((x) => x.date === date);
    const habitPts = logs.rows.filter((l) => l.date === date).reduce((a, l) => a + (pointsOf.get(l.habit_id) ?? 0), 0);
    const goalPts = entries.rows.filter((e) => e.date === date).reduce((a, e) => a + e.points, 0);
    return {
      date,
      reviewed: !!r,
      rating: r?.rating ?? null,
      habits_done: logs.rows.filter((l) => l.date === date).length,
      points: habitPts + goalPts,
    };
  });

  res.json({
    start,
    end,
    days,
    reviews_done: reviews.rows.length,
    review_streak: streak(finished.rows.map((r) => r.date), end),
    avg_rating: avg("rating"),
    avg_energy: avg("energy"),
    avg_stress: avg("stress"),
    points_total: days.reduce((a, d) => a + d.points, 0),
    habits: habits.rows.map((h) => ({ id: h.id, name: h.name, icon: h.icon, count: logs.rows.filter((l) => l.habit_id === h.id).length })),
    goals: goals.rows
      .map((g) => ({ id: g.id, title: g.title, points: entries.rows.filter((e) => e.goal_id === g.id).reduce((a, e) => a + e.points, 0) }))
      .filter((g) => g.points > 0),
  });
});
