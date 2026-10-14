import { useCallback, useEffect, useState } from 'react'
import { DAY, fetchMeetings, isLive, isPast, timeText, type Meeting } from './meetings'

// Today's meetings on the dashboard: yours and Outlook's, read only. Add notes and manage them on the Meetings page.
export function TodayMeetings() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    fetchMeetings(start, new Date(start.getTime() + DAY))
      .then((r) => {
        // meetings that start today, plus all-day events that cover today
        setMeetings(r.meetings
          .filter((m) => m.start && m.start.getTime() < start.getTime() + DAY && (m.end?.getTime() ?? 0) > start.getTime())
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start!.getTime() - b.start!.getTime()))
        setNow(Date.now())
      })
      .catch(() => setMeetings([]))
  }, [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const t = setInterval(load, 5 * 60_000) // keeps "Now" and the dimmed past ones current
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [load])

  if (meetings === null) return null

  return (
    <section className="card todaymeet">
      <h2>📅 Today's meetings <a href="#meetings" className="more">All meetings</a></h2>
      {meetings.length === 0 ? (
        <p className="empty">No meetings today.</p>
      ) : (
        <ul className="tmlist">
          {meetings.map((m) => (
            <li key={m.key} className={`${isPast(m, now) ? 'past' : ''}${isLive(m, now) ? ' live' : ''}`}>
              <span className="mtime">{timeText(m)}</span>
              <span className="mtitle">
                <b>{m.title}</b>
                {m.source === 'outlook' && <span className="outlook-tag">Outlook</span>}
                {isLive(m, now) && <span className="nowtag">Now</span>}
                {m.location && <small className="muted"> · {m.location}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
