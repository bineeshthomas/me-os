import ical, { type CalendarResponse, type VEvent } from "node-ical";
import { pool } from "./db/pool.js";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

const TTL_MS = 5 * 60 * 1000;
let cache: { url: string; at: number; data: CalendarResponse } | null = null;

export async function getCalendarUrl(): Promise<string | null> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'calendar_url'");
  return rows[0]?.value ?? null;
}

export function clearCalendarCache() {
  cache = null;
}

// Accepts https:// or webcal:// links (webcal is just https for calendars)
export function normalizeCalendarUrl(input: string): string {
  const url = new URL(input.trim().replace(/^webcal:\/\//i, "https://"));
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL must start with https:// or webcal://");
  return url.toString();
}

// ICS text fields are either plain strings or { val, params }
function text(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const val = (v as { val?: unknown }).val;
  return typeof val === "string" ? val : null;
}

async function load(url: string) {
  if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) return cache.data;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Calendar server returned ${res.status}`);
  const data = ical.sync.parseICS(await res.text());
  cache = { url, at: Date.now(), data };
  return data;
}

export async function getEvents(url: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const data = await load(url);
  const out: CalendarEvent[] = [];
  for (const entry of Object.values(data)) {
    if (!entry || entry.type !== "VEVENT") continue;
    const item = entry as VEvent;
    if (item.status === "CANCELLED") continue;
    for (const inst of ical.expandRecurringEvent(item, { from, to, expandOngoing: true })) {
      out.push({
        id: `${item.uid}_${inst.start.toISOString()}`,
        title: text(inst.summary) ?? "(no title)",
        start: inst.start.toISOString(),
        end: inst.end.toISOString(),
        allDay: inst.isFullDay,
        location: text(item.location),
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
