import { Router } from "express";
import { pool } from "./db/pool.js";
import { clearCalendarCache } from "./calendar.js";

export const privacy = Router();

// Everything the app stores. Used by "export" and "erase", so both always cover all of it.
const TABLES = [
  "projects", "project_steps", "notes", "items", "daily_reviews", "habits", "habit_logs",
  "goals", "goal_entries", "focus_sessions", "links", "settings",
] as const;

// Optional outside services. Off until you turn them on in Settings, so a fresh install contacts nobody.
export const PRIVACY_KEYS = { weather: "privacy_weather", favicons: "privacy_favicons" } as const;

export async function getPrivacy() {
  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key = ANY($1)", [Object.values(PRIVACY_KEYS)]);
  const on = (k: string) => rows.find((r) => r.key === k)?.value === "1";
  return { weather: on(PRIVACY_KEYS.weather), favicons: on(PRIVACY_KEYS.favicons) };
}

privacy.put("/settings/privacy", async (req, res) => {
  for (const [name, key] of Object.entries(PRIVACY_KEYS)) {
    const v = req.body?.[name];
    if (typeof v !== "boolean") continue;
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, v ? "1" : "0"],
    );
  }
  res.json(await getPrivacy());
});

// Download everything as one JSON file. The Outlook calendar link is a secret, so it is left out.
privacy.get("/export", async (_req, res) => {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { rows } = await pool.query(t === "settings" ? "SELECT * FROM settings WHERE key <> 'calendar_url' ORDER BY key" : `SELECT * FROM ${t} ORDER BY 1`);
    tables[t] = rows;
  }
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="me-os-export-${today}.json"`);
  res.json({ app: "me-os", format: 1, exported_at: new Date().toISOString(), note: "The Outlook calendar link is not included.", tables });
});

// Delete everything. The caller has to send {"confirm":"DELETE"}, so it can't happen by accident.
privacy.post("/erase", async (req, res) => {
  if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: 'Send {"confirm":"DELETE"} to erase everything' });
  await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  clearCalendarCache();
  res.json({ erased: true });
});
