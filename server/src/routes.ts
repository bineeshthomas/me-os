import { Router } from "express";
import { pool } from "./db/pool.js";

export const api = Router();

const PROJECTS_SQL = `
  SELECT p.*, COALESCE(
    json_agg(json_build_object('id', s.id, 'title', s.title, 'done', s.done, 'position', s.position)
             ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
  FROM projects p LEFT JOIN project_steps s ON s.project_id = p.id`;

// Projects
api.get("/projects", async (_req, res) => {
  const { rows } = await pool.query(`${PROJECTS_SQL} GROUP BY p.id ORDER BY p.created_at DESC`);
  res.json(rows);
});

api.post("/projects", async (req, res) => {
  const { title, description, steps } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    "INSERT INTO projects (title, description) VALUES ($1, $2) RETURNING id",
    [title, description ?? null],
  );
  const list: string[] = Array.isArray(steps) ? steps.filter((s) => typeof s === "string" && s.trim()) : [];
  for (const [i, s] of list.entries()) {
    await pool.query("INSERT INTO project_steps (project_id, title, position) VALUES ($1, $2, $3)", [rows[0].id, s.trim(), i]);
  }
  const out = await pool.query(`${PROJECTS_SQL} WHERE p.id = $1 GROUP BY p.id`, [rows[0].id]);
  res.status(201).json(out.rows[0]);
});

api.patch("/projects/:id", async (req, res) => {
  const { title, description } = req.body ?? {};
  const { rows } = await pool.query(
    "UPDATE projects SET title = COALESCE($2, title), description = COALESCE($3, description) WHERE id = $1 RETURNING id",
    [req.params.id, title ?? null, description ?? null],
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
  const { rows } = await pool.query(
    `INSERT INTO project_steps (project_id, title, position)
     VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM project_steps WHERE project_id = $1), 0)) RETURNING *`,
    [req.params.id, title],
  );
  res.status(201).json(rows[0]);
});

api.patch("/steps/:id", async (req, res) => {
  const { title, done } = req.body ?? {};
  const { rows } = await pool.query(
    "UPDATE project_steps SET title = COALESCE($2, title), done = COALESCE($3, done) WHERE id = $1 RETURNING *",
    [req.params.id, title ?? null, done ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

api.delete("/steps/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM project_steps WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
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
    pool.query(`${PROJECTS_SQL} GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5`),
    pool.query("SELECT id, title, body, updated_at FROM notes ORDER BY updated_at DESC LIMIT 5"),
  ]);
  res.json({ counts: counts.rows[0], projects: projects.rows, notes: notes.rows });
});
