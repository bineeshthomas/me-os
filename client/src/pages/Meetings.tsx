import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type MeetingRef, type Note, type Project } from '../api'
import NoteDialog from '../NoteDialog'

import { DAY, HOUR, dayKey, fetchMeetings, isLive, isPast, timeText, type Meeting } from '../meetings'

const PAST_DAYS = 60
const UPCOMING_DAYS = 30

const dayLabel = (d: Date | null) => {
  if (!d) return 'No date'
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY)
  const text = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return diff === 0 ? `Today · ${text}` : diff === 1 ? `Tomorrow · ${text}` : diff === -1 ? `Yesterday · ${text}` : text
}
const refOf = (m: Meeting): MeetingRef => ({ key: m.key, title: m.title, start: m.start ? m.start.toISOString() : null })

export default function Meetings({ arg }: { arg?: string }) {
  const today = dayKey(new Date())
  const target = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : null // a link from a note: open the right tab at that day
  const [tab, setTab] = useState<'upcoming' | 'past'>(target && target < today ? 'past' : 'upcoming')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [outlook, setOutlook] = useState<{ connected: boolean; error: string }>({ connected: false, error: '' })
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [dlg, setDlg] = useState<{ meeting: Meeting; noteId?: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(() => { const d = new Date(Date.now() + HOUR); return `${String(d.getHours()).padStart(2, '0')}:00` })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const now = Date.now()
    try {
      const [res, ns, ps] = await Promise.all([
        fetchMeetings(new Date(now - PAST_DAYS * DAY), new Date(now + UPCOMING_DAYS * DAY), { undated: true }),
        api.meetingNotes(),
        api.projects(),
      ])
      setMeetings(res.meetings); setNotes(ns); setProjects(ps)
      setOutlook({ connected: res.connected, error: res.error })
    } catch (e) { setError((e as Error).message) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const reloadNotes = () => api.meetingNotes().then(setNotes).catch((e) => setError(e.message))

  const now = Date.now()
  const upcoming = useMemo(
    () => meetings.filter((m) => !isPast(m, now)).sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) || Number(b.allDay) - Number(a.allDay)),
    [meetings, now], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const past = useMemo(
    () => meetings.filter((m) => isPast(m, now)).sort((a, b) => b.start!.getTime() - a.start!.getTime()),
    [meetings, now], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shown = tab === 'upcoming' ? upcoming : past

  const notesByMeeting = useMemo(() => {
    const map = new Map<string, Note[]>()
    for (const n of notes) if (n.meeting_key) map.set(n.meeting_key, [...(map.get(n.meeting_key) ?? []), n])
    return map
  }, [notes])

  const groups = useMemo(() => {
    const g = new Map<string, Meeting[]>()
    for (const m of shown) g.set(dayKey(m.start), [...(g.get(dayKey(m.start)) ?? []), m])
    return [...g.entries()]
  }, [shown])

  // Arrived from a note's meeting chip: scroll to that day and highlight it
  useEffect(() => {
    if (!loaded || !target) return
    const el = document.getElementById(`day-${target}`)
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200) }
  }, [loaded, target, tab])

  const addMeeting = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.createItem('meeting', title.trim(), new Date(`${date}T${time}`).toISOString())
      setTitle(''); setAdding(false); setTab('upcoming')
      await load()
    } catch (err) { setError((err as Error).message) }
  }
  const removeMeeting = async (m: Meeting) => {
    const n = notesByMeeting.get(m.key)?.length ?? 0
    if (!confirm(`Delete "${m.title}"?${n ? ` Its ${n} note${n === 1 ? '' : 's'} will be kept on the Notes page.` : ''}`)) return
    await api.deleteItem(m.itemId!).catch((e) => setError(e.message))
    load()
  }

  const row = (m: Meeting) => {
    const ns = notesByMeeting.get(m.key) ?? []
    const live = isLive(m, now)
    return (
      <li key={m.key} className={`mrow${isPast(m, now) ? ' past' : ''}${live ? ' live' : ''}`}>
        <div className="mline">
          <span className="mtime">{timeText(m)}</span>
          <span className="mtitle">
            <b>{m.title}</b>
            {m.source === 'outlook' && <span className="outlook-tag">Outlook</span>}
            {live && <span className="nowtag">Now</span>}
            {m.location && <small className="muted"> · {m.location}</small>}
          </span>
          <span className="mbtns">
            {ns.length > 0 && (
              <button className="notechip" aria-expanded={!!open[m.key]} onClick={() => setOpen({ ...open, [m.key]: !open[m.key] })} title="Show the notes for this meeting">
                📝 {ns.length} {open[m.key] ? '▾' : '▸'}
              </button>
            )}
            <button className="ghost addnote" onClick={() => setDlg({ meeting: m })}>+ Note</button>
            {m.source === 'own' && <button className="ghost" aria-label={`Delete ${m.title}`} onClick={() => removeMeeting(m)}>✕</button>}
          </span>
        </div>
        {open[m.key] && ns.length > 0 && (
          <ul className="pnotes mnotes">
            {ns.map((n) => (
              <li key={n.id}>
                <button onClick={() => setDlg({ meeting: m, noteId: n.id })} title="Open note">
                  <span className="nico">{n.pinned ? '📌' : '📝'}</span><b>{n.title}</b>
                  <small>{new Date(n.updated_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small><span className="go" aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <>
      <section className="card head">
        <div>
          <h2>Meetings</h2>
          <p>Yours and Outlook's, upcoming and past. Add a note to any of them.</p>
        </div>
        <button className="primary" onClick={() => setAdding(!adding)}>+ New meeting</button>
      </section>
      {error && <p className="error">{error}</p>}

      {adding && (
        <form className="card form" onSubmit={addMeeting}>
          <input required autoFocus placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Meeting title" />
          <div className="mwhen">
            <label>Date <input type="date" className="datein" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Time <input type="time" className="datein" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
          </div>
          <div className="actions">
            <button className="primary">Add meeting</button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="seg mtabs" role="tablist" aria-label="Which meetings">
        <button role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'sel' : ''} onClick={() => setTab('upcoming')}>Upcoming <small>{upcoming.length}</small></button>
        <button role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'sel' : ''} onClick={() => setTab('past')}>Past <small>{past.length}</small></button>
      </div>

      {outlook.error && <p className="muted">Couldn't reach your Outlook calendar just now ({outlook.error}). Your own meetings are shown.</p>}
      {loaded && !outlook.connected && <p className="muted"><small>Connect your Outlook calendar in <a href="#settings">Settings</a> to see its meetings here too.</small></p>}
      {tab === 'past' && <p className="muted"><small>Showing the last {PAST_DAYS} days.</small></p>}

      {loaded && shown.length === 0 && (
        <p className="card empty">{tab === 'upcoming' ? 'No upcoming meetings. Add one, or connect Outlook.' : 'No past meetings in the last 60 days.'}</p>
      )}
      {groups.map(([key, list]) => (
        <section key={key} id={`day-${key}`} className="card mday">
          <h5>{dayLabel(list[0].start)}</h5>
          <ul className="mlist">{list.map(row)}</ul>
        </section>
      ))}

      {dlg && (
        <NoteDialog noteId={dlg.noteId} defaultMeeting={refOf(dlg.meeting)} projects={projects} onClose={() => setDlg(null)} onChanged={reloadNotes} />
      )}
    </>
  )
}
