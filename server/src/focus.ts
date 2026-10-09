import { Router } from "express";
import { pool } from "./db/pool.js";

export const focus = Router();

const SECONDS = "EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))::int";

// What the timer and the dashboard card need: the running session (if any), plus today's and this week's totals.
// `now` is the server's clock, so the timer is right even if this machine's clock is off.
focus.get("/focus/status", async (_req, res) => {
  const [running, today, week, now] = await Promise.all([
    pool.query("SELECT id, activity, started_at FROM focus_sessions WHERE ended_at IS NULL"),
    pool.query(`SELECT COALESCE(SUM(${SECONDS}), 0)::int AS seconds, COUNT(*)::int AS sessions
                FROM focus_sessions WHERE started_at::date = CURRENT_DATE`),
    pool.query(`SELECT COALESCE(SUM(${SECONDS}), 0)::int AS seconds
                FROM focus_sessions WHERE started_at::date >= CURRENT_DATE - 6`),
    pool.query("SELECT now() AS now"),
  ]);
  res.json({
    now: now.rows[0].now,
    running: running.rows[0] ?? null,
    today_seconds: today.rows[0].seconds,
    today_sessions: today.rows[0].sessions,
    week_seconds: week.rows[0].seconds,
  });
});

focus.post("/focus/start", async (req, res) => {
  const activity = String(req.body?.activity ?? "").trim();
  if (!activity) return res.status(400).json({ error: "Type what you'll focus on" });
  if (activity.length > 200) return res.status(400).json({ error: "Keep the activity under 200 characters" });
  try {
    const { rows } = await pool.query("INSERT INTO focus_sessions (activity) VALUES ($1) RETURNING id, activity, started_at", [activity]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return res.status(409).json({ error: "A focus session is already running" });
    throw e;
  }
});

focus.post("/focus/stop", async (_req, res) => {
  const { rows } = await pool.query(
    `UPDATE focus_sessions SET ended_at = now() WHERE ended_at IS NULL
     RETURNING id, activity, started_at, ended_at, ${SECONDS} AS seconds`,
  );
  if (!rows[0]) return res.status(409).json({ error: "No focus session is running" });
  res.json(rows[0]);
});

// Paged list for the Activity page, newest first
focus.get("/focus/sessions", async (req, res) => {
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.page_size)) || 10));
  const total = (await pool.query("SELECT COUNT(*)::int AS n FROM focus_sessions")).rows[0].n as number;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(req.query.page)) || 1));
  const { rows } = await pool.query(
    `SELECT id, activity, started_at, ended_at, ended_at IS NULL AS running, ${SECONDS} AS seconds
     FROM focus_sessions ORDER BY started_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  res.json({ items: rows, total, page, pages, page_size: pageSize });
});

focus.patch("/focus/sessions/:id", async (req, res) => {
  const activity = String(req.body?.activity ?? "").trim();
  if (!activity || activity.length > 200) return res.status(400).json({ error: "activity is required (max 200 characters)" });
  const { rows } = await pool.query("UPDATE focus_sessions SET activity = $2 WHERE id = $1 RETURNING id", [req.params.id, activity]);
  res.status(rows[0] ? 204 : 404).end();
});

focus.delete("/focus/sessions/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM focus_sessions WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});
