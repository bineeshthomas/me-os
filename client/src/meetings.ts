import { api } from './api'

// One shape for every meeting: ones you added yourself, and Outlook ones (read-only)
export interface Meeting {
  key: string // "item:<id>" or "ics:<id>", the same key that notes use
  title: string
  start: Date | null
  end: Date | null
  allDay: boolean
  location: string | null
  source: 'own' | 'outlook'
  itemId?: number
}

export const HOUR = 3_600_000
export const DAY = 86_400_000

export const dayKey = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'none')
export const clock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const timeText = (m: Meeting) => (m.allDay ? 'All day' : !m.start ? '' : m.source === 'outlook' && m.end ? `${clock(m.start)} – ${clock(m.end)}` : clock(m.start))
export const isPast = (m: Meeting, now = Date.now()) => !!m.start && !!m.end && m.end.getTime() <= now
export const isLive = (m: Meeting, now = Date.now()) => !!m.start && !!m.end && !m.allDay && m.start.getTime() <= now && now < m.end.getTime()

// Meetings between two moments. Your own meetings have no end time, so they count as one hour long.
export async function fetchMeetings(from: Date, to: Date, opts: { undated?: boolean } = {}) {
  const [items, cal] = await Promise.all([
    api.items(),
    api.calendarEvents(from, to).catch((e: Error) => ({ connected: true, events: [], error: e.message })),
  ])
  const own: Meeting[] = items
    .filter((i) => i.kind === 'meeting')
    .map((i) => {
      const start = i.due_at ? new Date(i.due_at) : null
      return { key: `item:${i.id}`, title: i.title, start, end: start ? new Date(start.getTime() + HOUR) : null, allDay: false, location: null, source: 'own' as const, itemId: i.id }
    })
    .filter((m) => (m.start ? m.start >= from && m.start < to : !!opts.undated))
  const outlook: Meeting[] = cal.events.map((e) => ({
    key: `ics:${e.id}`, title: e.title, start: new Date(e.start), end: new Date(e.end), allDay: e.allDay, location: e.location, source: 'outlook' as const,
  }))
  return {
    meetings: [...own, ...outlook],
    connected: cal.connected,
    error: 'error' in cal ? String((cal as { error?: string }).error ?? '') : '',
  }
}
