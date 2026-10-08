import express from "express";
import cors from "cors";
import { pool } from "./db/pool.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/activities", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : null;
  const { rows } = date
    ? await pool.query("SELECT * FROM activities WHERE date = $1 ORDER BY start_time NULLS LAST, id", [date])
    : await pool.query("SELECT * FROM activities ORDER BY date DESC, start_time NULLS LAST, id");
  res.json(rows);
});

app.post("/api/activities", async (req, res) => {
  const { title, notes, date, start_time, end_time } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO activities (title, notes, date, start_time, end_time)
     VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5) RETURNING *`,
    [title, notes ?? null, date ?? null, start_time ?? null, end_time ?? null],
  );
  res.status(201).json(rows[0]);
});

app.patch("/api/activities/:id", async (req, res) => {
  const { title, notes, date, start_time, end_time, done } = req.body ?? {};
  const { rows } = await pool.query(
    `UPDATE activities SET
       title = COALESCE($2, title), notes = COALESCE($3, notes),
       date = COALESCE($4, date), start_time = COALESCE($5, start_time),
       end_time = COALESCE($6, end_time), done = COALESCE($7, done)
     WHERE id = $1 RETURNING *`,
    [req.params.id, title ?? null, notes ?? null, date ?? null, start_time ?? null, end_time ?? null, done ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

app.delete("/api/activities/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM activities WHERE id = $1", [req.params.id]);
  res.status(rowCount ? 204 : 404).end();
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
