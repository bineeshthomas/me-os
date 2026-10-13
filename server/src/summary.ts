import { Router } from "express";
import { pool } from "./db/pool.js";
import { getCalendarUrl, getEvents } from "./calendar.js";
import { streak } from "./review.js";

export const summary = Router();

const MAX_PER_SECTION = 8;

function validTimeZone(tz: unknown): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof tz !== "string" || !tz) return fallback;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return fallback; }
}

// "Today" as the person sees it: their own time zone, so it is right even if the app runs in a container set to UTC
const dayString = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); // YYYY-MM-DD
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// A short plain-text briefing for the day, meant to be pasted into a phone note or chat
summary.get("/summary/today", async (req, res) => {
  const tz = validTimeZone(req.query.tz);
  const h12 = req.query.h12 === "1";
  const now = new Date();
  const today = dayString(now, tz);
  const timeOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: h12, timeZone: tz }).format(d).replace(/\s?(am|pm)/i, (m) => m.toUpperCase());

  const [items, review, projects, steps, habits, logs, window] = await Promise.all([
    pool.query("SELECT kind, title, due_at, app FROM items WHERE NOT done ORDER BY due_at NULLS LAST, id"),
    pool.query("SELECT priorities FROM daily_reviews WHERE date = $1::date - 1", [today]),
    pool.query(
      `SELECT p.title, to_char(p.due_date, 'YYYY-MM-DD') AS due,
              (SELECT count(*) FROM project_steps s WHERE s.project_id = p.id)::int AS steps,
              (SELECT count(*) FROM project_steps s WHERE s.project_id = p.id AND NOT s.done)::int AS open_steps
       FROM projects p WHERE p.due_date IS NOT NULL AND p.due_date <= $1::date ORDER BY p.due_date`, [today]),
    pool.query(
      `SELECT s.title, p.title AS project, to_char(s.due_date, 'YYYY-MM-DD') AS due
       FROM project_steps s JOIN projects p ON p.id = s.project_id
       WHERE NOT s.done AND s.due_date IS NOT NULL AND s.due_date <= $1::date ORDER BY s.due_date, s.id`, [today]),
    pool.query("SELECT id, name, icon FROM habits ORDER BY id"),
    pool.query("SELECT habit_id, to_char(date, 'YYYY-MM-DD') AS date FROM habit_logs WHERE date <= $1::date", [today]),
    pool.query("SELECT ($1::date::timestamp AT TIME ZONE $2) AS s, (($1::date + 1)::timestamp AT TIME ZONE $2) AS e", [today, tz]),
  ]);

  // Meetings today: yours, plus Outlook if it's connected (a calendar problem never blocks the summary)
  type Meeting = { at: number; allDay: boolean; text: string };
  const meetings: Meeting[] = [];
  for (const it of items.rows.filter((i) => i.kind === "meeting" && i.due_at && dayString(new Date(i.due_at), tz) === today)) {
    meetings.push({ at: new Date(it.due_at).getTime(), allDay: false, text: `${timeOf(new Date(it.due_at))} ${it.title}` });
  }
  const url = await getCalendarUrl();
  if (url) {
    try {
      for (const e of await getEvents(url, window.rows[0].s, window.rows[0].e)) {
        const start = new Date(e.start);
        meetings.push({ at: e.allDay ? 0 : start.getTime(), allDay: e.allDay, text: e.allDay ? `All day: ${e.title}` : `${timeOf(start)} ${e.title}${e.location ? ` (${e.location})` : ""}` });
      }
    } catch { /* leave Outlook out this time */ }
  }
  meetings.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.at - b.at);

  const open = (kind: string) => items.rows.filter((i) => i.kind === kind);
  const appName = (a: string | null) => (a === "whatsapp" ? " (WhatsApp)" : a === "teams" ? " (Teams)" : "");
  const reminders = open("reminder")
    .filter((r) => !r.due_at || dayString(new Date(r.due_at), tz) <= today)
    .map((r) => {
      if (!r.due_at) return r.title;
      const d = dayString(new Date(r.due_at), tz);
      return d < today ? `${r.title} (overdue ${daysBetween(d, today)}d)` : `${timeOf(new Date(r.due_at))} ${r.title}`;
    });

  const deadlines: string[] = [];
  const dueText = (due: string) => (due === today ? "due today" : `overdue ${daysBetween(due, today)}d`);
  for (const p of projects.rows) if (p.steps === 0 || p.open_steps > 0) deadlines.push(`${p.title}, ${dueText(p.due)}`);
  for (const s of steps.rows) deadlines.push(`${s.title} (${s.project}), ${dueText(s.due)}`);

  const todo = habits.rows
    .map((h) => ({ h, dates: logs.rows.filter((l) => l.habit_id === h.id).map((l) => l.date as string) }))
    .filter(({ dates }) => !dates.includes(today))
    .map(({ h, dates }) => { const n = streak(dates, today); return `${h.icon} ${h.name}${n > 0 ? ` (keep your ${n}-day streak)` : ""}`; });

  const top3: string[] = (review.rows[0]?.priorities ?? []).filter((p: unknown) => typeof p === "string" && p.trim());

  const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(now).replace(",", "");
  const blocks: string[] = [];
  const add = (title: string, lines: string[], numbered = false) => {
    if (!lines.length) return;
    const shown = lines.slice(0, MAX_PER_SECTION).map((l, i) => (numbered ? `${i + 1}. ${l}` : `• ${l}`));
    if (lines.length > MAX_PER_SECTION) shown.push(`… and ${lines.length - MAX_PER_SECTION} more`);
    blocks.push(`${title}\n${shown.join("\n")}`);
  };
  add("🎯 TOP 3", top3, true);
  add("📅 MEETINGS", meetings.map((m) => m.text));
  add("⏰ DEADLINES", deadlines);
  add("🔔 REMINDERS", reminders);
  add("✅ TASKS", open("task").map((t) => t.title));
  add("📞 CALLS", open("call").map((t) => t.title));
  add("✉️ EMAILS", open("email").map((t) => t.title));
  add("💬 MESSAGES", open("message").map((t) => `${t.title}${appName(t.app)}`));
  add("🔁 CHECK-INS", todo);

  const text = `☀️ ${label}\n\n${blocks.length ? blocks.join("\n\n") : "Nothing planned for today. Enjoy the open day. 🎉"}`;
  res.json({ date: today, text, sections: blocks.length });
});
