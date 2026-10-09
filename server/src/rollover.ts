import { pool } from "./db/pool.js";

// Moves unfinished dated items (reminders etc.) due on or before `date` to the day after it, keeping their time
// of day. Items with no date aren't tied to a day, and meetings are calendar events, so neither moves.
export async function rollOverThrough(date: string): Promise<number> {
  const r = await pool.query(
    `UPDATE items SET due_at = due_at + ((($1::date + 1) - due_at::date) * interval '1 day')
     WHERE NOT done AND kind <> 'meeting' AND due_at IS NOT NULL AND due_at::date <= $1::date`,
    [date],
  );
  return r.rowCount ?? 0;
}

// Everything left over from yesterday or earlier moves to today. Repeating it is harmless.
export async function rollOverOverdue(): Promise<number> {
  const { rows } = await pool.query("SELECT to_char(CURRENT_DATE - 1, 'YYYY-MM-DD') AS yesterday");
  return rollOverThrough(rows[0].yesterday);
}

const CHECK_EVERY_MS = 10 * 60 * 1000;

// Runs at startup (catching up after the laptop was off or asleep) and then shortly after each midnight
export function startRollover() {
  const run = () =>
    rollOverOverdue()
      .then((n) => n > 0 && console.log(`Rollover: moved ${n} unfinished item${n === 1 ? "" : "s"} to today`))
      .catch((e) => console.error("Rollover failed:", e.message));
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
