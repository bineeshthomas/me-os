import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Item, type Kind, type SearchHit } from './api'

const WIDGETS: { kind: Kind; label: string; icon: string; empty: string; timed: boolean }[] = [
  { kind: 'task', label: 'Focus Tasks', icon: '✅', empty: 'Nothing pressing.', timed: false },
  { kind: 'call', label: 'Calls', icon: '📞', empty: 'Nothing on the phone today.', timed: true },
  { kind: 'email', label: 'Emails', icon: '✉️', empty: 'Nothing queued.', timed: false },
  { kind: 'meeting', label: 'Meetings', icon: '📅', empty: 'Nothing on the calendar.', timed: true },
  { kind: 'reminder', label: 'Reminders', icon: '🔔', empty: 'All clear.', timed: true },
]

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function Widget({ cfg, items, reload }: { cfg: (typeof WIDGETS)[number]; items: Item[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.createItem(cfg.kind, title.trim(), due ? new Date(due).toISOString() : null)
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
          {cfg.timed && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
          <button className="primary">Add</button>
        </form>
      )}
      {items.length === 0 && !adding && <p className="empty">{cfg.empty}</p>}
      <ul className="steps">
        {items.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <button className="circle" aria-label="Toggle" onClick={() => api.setItemDone(i.id, !i.done).then(reload)}>{i.done ? '✓' : ''}</button>
            <span>{i.title}{i.due_at && <small> · {fmt(i.due_at)}</small>}</span>
            <button className="ghost" aria-label="Delete" onClick={() => api.deleteItem(i.id).then(reload)}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function WidgetRail() {
  const [items, setItems] = useState<Item[]>([])
  const load = () => api.items().then(setItems).catch(() => {})
  useEffect(() => { load() }, [])
  return (
    <aside className="rail">
      {WIDGETS.map((w) => (
        <Widget key={w.kind} cfg={w} items={items.filter((i) => i.kind === w.kind)} reload={load} />
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
