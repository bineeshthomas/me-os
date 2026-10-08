import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type CalEvent, type Item, type Kind, type MessageApp, type SearchHit } from './api'

const WIDGETS: { kind: Kind; label: string; icon: string; empty: string; timed: boolean; apps?: boolean }[] = [
  { kind: 'task', label: 'Focus Tasks', icon: '✅', empty: 'Nothing pressing.', timed: false },
  { kind: 'call', label: 'Calls', icon: '📞', empty: 'Nothing on the phone today.', timed: true },
  { kind: 'email', label: 'Emails', icon: '✉️', empty: 'Nothing queued.', timed: false },
  { kind: 'message', label: 'Messages', icon: '💬', empty: 'No messages to send.', timed: false, apps: true },
  { kind: 'meeting', label: 'Meetings', icon: '📅', empty: 'Nothing on the calendar.', timed: true },
  { kind: 'reminder', label: 'Reminders', icon: '🔔', empty: 'All clear.', timed: true },
]

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const APPS: { id: MessageApp; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'teams', label: 'Teams' },
]

export function AppIcon({ app, size = 18 }: { app: MessageApp; size?: number }) {
  return app === 'whatsapp' ? (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="WhatsApp">
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.9A6.5 6.5 0 1 0 12 5.5Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.6 9.3c.2-.4.5-.4.7-.3l.5 1.1-.4.6a3.6 3.6 0 0 0 1.9 1.9l.6-.4 1.1.5c.1.2.1.5-.3.8-.8.7-1.9.4-3.1-.6-1.2-1.1-1.7-2.4-1-3.6Z" fill="#fff" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Teams">
      <rect width="24" height="24" rx="6" fill="#5B5FC7" />
      <circle cx="17" cy="8" r="2.3" fill="#c7c9f2" />
      <path d="M14.5 11h5v4.5a2.5 2.5 0 0 1-5 0Z" fill="#c7c9f2" />
      <rect x="4" y="7" width="11" height="10" rx="2" fill="#fff" />
      <path d="M7 10h5M9.5 10v5" stroke="#5B5FC7" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const evTime = (e: CalEvent) =>
  e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const evWhen = (e: CalEvent) =>
  e.allDay
    ? `${new Date(e.start).toLocaleDateString([], { month: 'short', day: 'numeric' })} · All day`
    : fmt(e.start)

function Widget({ cfg, items, reload, extra = [] }: { cfg: (typeof WIDGETS)[number]; items: Item[]; reload: () => void; extra?: CalEvent[] }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [app, setApp] = useState<MessageApp>('whatsapp')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.createItem(cfg.kind, title.trim(), due ? new Date(due).toISOString() : null, cfg.apps ? app : undefined)
    setTitle(''); setDue(''); setAdding(false)
    reload()
  }

  return (
    <section className="card widget">
      <div className="head">
        <h4>{cfg.icon} {cfg.label}</h4>
        <button className="ghost" aria-label={`Add ${cfg.kind}`} onClick={() => setAdding(!adding)}>＋</button>
      </div>
      {adding && (
        <form onSubmit={add} className="form">
          <input autoFocus placeholder={`New ${cfg.kind}…`} value={title} onChange={(e) => setTitle(e.target.value)} />
          {cfg.apps && (
            <div className="apps" role="radiogroup" aria-label="Send via">
              {APPS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={app === a.id} className={app === a.id ? 'app-btn sel' : 'app-btn'} onClick={() => setApp(a.id)}>
                  <AppIcon app={a.id} /> {a.label}
                </button>
              ))}
            </div>
          )}
          {cfg.timed && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
          <button className="primary">Add</button>
        </form>
      )}
      {items.length === 0 && extra.length === 0 && !adding && <p className="empty">{cfg.empty}</p>}
      <ul className="steps">
        {items.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <button className="circle" aria-label="Toggle" onClick={() => api.setItemDone(i.id, !i.done).then(reload)}>{i.done ? '✓' : ''}</button>
            <span>{i.app && <AppIcon app={i.app} size={14} />} {i.title}{i.due_at && <small> · {fmt(i.due_at)}</small>}</span>
            <button className="ghost" aria-label="Delete" onClick={() => api.deleteItem(i.id).then(reload)}>✕</button>
          </li>
        ))}
        {extra.map((e) => (
          <li key={e.id}>
            <span><span className="outlook-tag">Outlook</span>{e.title}<small> · {evWhen(e)}</small></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function WidgetRail() {
  const [items, setItems] = useState<Item[]>([])
  const [outlook, setOutlook] = useState<CalEvent[]>([])
  const load = () => api.items().then(setItems).catch(() => {})
  useEffect(() => {
    load()
    const now = new Date()
    api.calendarEvents(now, new Date(now.getTime() + 7 * 86_400_000))
      .then((r) => setOutlook(r.events.filter((e) => new Date(e.end) > new Date())))
      .catch(() => {})
  }, [])
  return (
    <aside className="rail">
      {WIDGETS.map((w) => (
        <Widget key={w.kind} cfg={w} items={items.filter((i) => i.kind === w.kind)} reload={load}
          extra={w.kind === 'meeting' ? outlook : undefined} />
      ))}
    </aside>
  )
}

const WMO: [number, string][] = [[0, '☀️'], [3, '⛅'], [48, '🌫️'], [67, '🌧️'], [77, '🌨️'], [82, '🌧️'], [86, '🌨️'], [99, '⛈️']]
const icon = (code: number) => (WMO.find(([max]) => code <= max) ?? [0, '🌡️'])[1]

export function Weather() {
  const [city, setCity] = useState(() => { try { return localStorage.getItem('city') ?? 'New Delhi' } catch { return 'New Delhi' } })
  const [text, setText] = useState('…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [name, cc] = city.split(',').map((x) => x.trim())
        const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10`)).json()
        const results: { latitude: number; longitude: number; country_code: string; name: string }[] = geo.results ?? []
        const prefer = (cc || 'IN').toUpperCase()
        const place = results.find((r) => r.country_code === prefer) ?? (cc ? undefined : results[0])
        if (!place) return !cancelled && setText('City not found')
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`)).json()
        if (!cancelled) setText(`${icon(w.current.weather_code)} ${Math.round(w.current.temperature_2m)}°C ${place.name}, ${place.country_code}`)
      } catch { if (!cancelled) setText('Weather unavailable') }
    })()
    return () => { cancelled = true }
  }, [city])

  const change = () => {
    const next = prompt('Weather city (add a country code to be exact, e.g. Paris, FR)', city)?.trim()
    if (!next) return
    setCity(next)
    try { localStorage.setItem('city', next) } catch { /* ignore */ }
  }
  return <button className="pill" onClick={change} title="Change city">{text}</button>
}

const HIT_HREF: Record<string, string> = { project: '#projects', step: '#projects', note: '#notes' }

export function Search() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) input.current?.focus() }, [open])

  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    const t = setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 200)
    return () => clearTimeout(t)
  }, [q])

  const close = () => { setOpen(false); setQ('') }

  return (
    <>
      <button className="searchbtn" onClick={() => setOpen(true)}>
        🔍 Search projects, tasks, notes… <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className="overlay" onClick={close}>
          <div className="card dialog" onClick={(e) => e.stopPropagation()}>
            <input ref={input} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q.trim() && hits.length === 0 && <p className="empty">No results.</p>}
            {hits.map((h, i) => (
              <a key={i} className="hit" href={HIT_HREF[h.type] ?? '#home'} onClick={close}>
                <small>{h.type}</small> <span>{h.title}</span>
                {h.snippet && <small className="muted"> — {h.snippet}</small>}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function Calendar({ onClose }: { onClose: () => void }) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [items, setItems] = useState<Item[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])

  useEffect(() => { api.items().then(setItems).catch(() => {}) }, [])
  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay())
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42)
    api.calendarEvents(start, end).then((r) => setEvents(r.events)).catch(() => setEvents([]))
  }, [month])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dated = items.filter((i) => i.due_at)
  const forDay = (d: Date) => dated.filter((i) => sameDay(new Date(i.due_at!), d))
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const eventsOn = (d: Date) => {
    const a = dayStart(d)
    const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1)
    return events.filter((e) => new Date(e.start) < b && new Date(e.end) > a)
  }
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const cells = Array.from({ length: 42 }, (_, n) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + n))
  const rows = cells[35].getMonth() === month.getMonth() ? 6 : 5
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const dayItems = forDay(selected)
  const dayEvents = eventsOn(selected)
  const icons: Record<string, string> = { task: '✅', call: '📞', email: '✉️', message: '💬', meeting: '📅', reminder: '🔔' }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card calendar" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h2>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
          <div className="actions">
            <button className="ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <button className="ghost" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today) }}>Today</button>
            <button className="ghost" onClick={() => shift(1)} aria-label="Next month">›</button>
            <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="cal-grid">
          {DAYS.map((d) => <b key={d} className="cal-dow">{d}</b>)}
          {cells.slice(0, rows * 7).map((d) => {
            const n = forDay(d).length + eventsOn(d).length
            const cls = ['cal-day', d.getMonth() !== month.getMonth() && 'other', sameDay(d, today) && 'today', sameDay(d, selected) && 'sel'].filter(Boolean).join(' ')
            return (
              <button key={d.toISOString()} className={cls} onClick={() => setSelected(d)}>
                <span>{d.getDate()}</span>
                {n > 0 && <i>{n}</i>}
              </button>
            )
          })}
        </div>
        <h3 className="cal-sel">{selected.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {dayItems.length === 0 && dayEvents.length === 0 && <p className="empty">Nothing scheduled.</p>}
        <ul className="steps">
          {dayItems.map((i) => (
            <li key={i.id} className={i.done ? 'done' : ''}>
              <span>{icons[i.kind]} {i.title} <small>· {new Date(i.due_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
            </li>
          ))}
          {dayEvents.map((e) => (
            <li key={e.id}>
              <span><span className="outlook-tag">Outlook</span>{e.title} <small>· {evTime(e)}{e.location ? ` · ${e.location}` : ''}</small></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
