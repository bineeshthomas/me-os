import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { usePrivacy } from './privacy'
import { api, type CalEvent, type Deadline, type Item, type Kind, type MessageApp, type SearchHit } from './api'

// notify = the optional "Notify me by" date and time. tags = a tag for what/who you're waiting on (follow ups have no date).
const WIDGETS: { kind: Kind; noun: string; label: string; icon: string; empty: string; notify?: boolean; tags?: boolean; apps?: boolean }[] = [
  { kind: 'task', noun: 'task', label: 'Focus Tasks', icon: '✅', empty: 'Nothing pressing.', notify: true },
  { kind: 'call', noun: 'call', label: 'Calls', icon: '📞', empty: 'Nothing on the phone today.' },
  { kind: 'email', noun: 'email', label: 'Emails', icon: '✉️', empty: 'Nothing queued.' },
  { kind: 'message', noun: 'message', label: 'Messages', icon: '💬', empty: 'No messages to send.', apps: true },
  { kind: 'followup', noun: 'follow up', label: 'Follow Up', icon: '🤝', empty: "Nobody to chase. You're not waiting on anyone.", tags: true },
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

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// One task/call/email/message/follow up. Tasks can have a "Notify me by" time; follow ups can have a tag. Both are editable here.
function ItemRow({ item: i, reload, tagOptions, activeTag, onTag }: {
  item: Item; reload: () => void; tagOptions: string[]; activeTag: string | null; onTag: (t: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const listId = useId()
  const overdue = !!i.due_at && !i.done && new Date(i.due_at).getTime() < Date.now()

  const startEdit = () => { setValue(i.kind === 'task' ? (i.due_at ? toLocalInput(i.due_at) : '') : (i.tag ?? '')); setEditing(true) }
  const save = async (clear = false) => {
    if (i.kind === 'task') await api.setItemNotify(i.id, clear || !value ? null : new Date(value).toISOString())
    else await api.setItemTag(i.id, clear ? null : value.trim() || null)
    setEditing(false)
    reload()
  }

  return (
    <li className={i.done ? 'done' : ''}>
      <button className="circle" aria-label="Toggle" onClick={() => api.setItemDone(i.id, !i.done).then(reload)}>{i.done ? '✓' : ''}</button>
      <span>
        {i.app && <AppIcon app={i.app} size={14} />} {i.title}
        {i.kind === 'task' && i.due_at && (
          <button className={overdue ? 'notify late' : 'notify'} title="Notify me by. Click to change" onClick={startEdit}>🔔 {fmt(i.due_at)}</button>
        )}
        {i.kind === 'followup' && i.tag && (
          <button className={activeTag?.toLowerCase() === i.tag.toLowerCase() ? 'tagchip sel' : 'tagchip'} title="Show only this tag"
            onClick={() => onTag(activeTag?.toLowerCase() === i.tag!.toLowerCase() ? null : i.tag)}>#{i.tag}</button>
        )}
      </span>
      {i.kind === 'task' && !i.due_at && <button className="ghost mini" aria-label="Set Notify me by" title="Notify me by" onClick={startEdit}>🔔</button>}
      {i.kind === 'followup' && <button className="ghost mini" aria-label={i.tag ? 'Change tag' : 'Add a tag'} title={i.tag ? 'Change tag' : 'Add a tag'} onClick={startEdit}>🏷</button>}
      <button className="ghost" aria-label="Delete" onClick={() => api.deleteItem(i.id).then(reload)}>✕</button>
      {editing && (
        <form className="rowedit" onSubmit={(e) => { e.preventDefault(); save() }} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}>
          {i.kind === 'task' ? (
            <label>Notify me by <input autoFocus type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></label>
          ) : (
            <label>Tag <input autoFocus list={listId} maxLength={30} placeholder="Who or what are you waiting on?" value={value} onChange={(e) => setValue(e.target.value)} />
              <datalist id={listId}>{tagOptions.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
          )}
          <div className="actions">
            <button className="primary">Save</button>
            {(i.due_at || i.tag) && <button type="button" className="ghost" onClick={() => save(true)}>Clear</button>}
            <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  )
}

function Widget({ cfg, items, reload, tagOptions }: { cfg: (typeof WIDGETS)[number]; items: Item[]; reload: () => void; tagOptions: string[] }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [tag, setTag] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [app, setApp] = useState<MessageApp>('whatsapp')
  const listId = useId()

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.createItem(cfg.kind, title.trim(), cfg.notify && due ? new Date(due).toISOString() : null, cfg.apps ? app : undefined, cfg.tags ? tag.trim() || null : undefined)
    setTitle(''); setDue(''); setTag(''); setAdding(false)
    reload()
  }

  // Follow up tags in use on this card (case-insensitive), to filter by
  const tagCounts = new Map<string, { label: string; n: number }>()
  if (cfg.tags) for (const i of items) if (i.tag) { const k = i.tag.toLowerCase(); tagCounts.set(k, { label: tagCounts.get(k)?.label ?? i.tag, n: (tagCounts.get(k)?.n ?? 0) + 1 }) }
  const activeKey = tagFilter?.toLowerCase() ?? null
  const shown = activeKey && tagCounts.has(activeKey) ? items.filter((i) => i.tag?.toLowerCase() === activeKey) : items

  return (
    <section className="card widget">
      <div className="head">
        <h4>{cfg.icon} {cfg.label}</h4>
        <button className="ghost" aria-label={`Add ${cfg.noun}`} onClick={() => setAdding(!adding)}>＋</button>
      </div>
      {adding && (
        <form onSubmit={add} className="form">
          <input autoFocus placeholder={`New ${cfg.noun}…`} value={title} onChange={(e) => setTitle(e.target.value)} />
          {cfg.apps && (
            <div className="apps" role="radiogroup" aria-label="Send via">
              {APPS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={app === a.id} className={app === a.id ? 'app-btn sel' : 'app-btn'} onClick={() => setApp(a.id)}>
                  <AppIcon app={a.id} /> {a.label}
                </button>
              ))}
            </div>
          )}
          {cfg.notify && (
            <label className="fieldlabel">Notify me by <small className="muted">(optional)</small>
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          )}
          {cfg.tags && (
            <label className="fieldlabel">Tag <small className="muted">(who or what you're waiting on)</small>
              <input list={listId} maxLength={30} placeholder="e.g. Rao, Legal, Supplier" value={tag} onChange={(e) => setTag(e.target.value)} />
              <datalist id={listId}>{tagOptions.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
          )}
          <button className="primary">Add</button>
        </form>
      )}
      {tagCounts.size > 0 && (
        <div className="tagfilter widgettags">
          <button className={!activeKey ? 'tag sel' : 'tag'} onClick={() => setTagFilter(null)}>All</button>
          {[...tagCounts.entries()].map(([k, v]) => (
            <button key={k} className={activeKey === k ? 'tag sel' : 'tag'} onClick={() => setTagFilter(activeKey === k ? null : v.label)}>#{v.label} <small>{v.n}</small></button>
          ))}
        </div>
      )}
      {items.length === 0 && !adding && <p className="empty">{cfg.empty}</p>}
      <ul className="steps">
        {shown.map((i) => <ItemRow key={i.id} item={i} reload={reload} tagOptions={tagOptions} activeTag={tagFilter} onTag={setTagFilter} />)}
      </ul>
    </section>
  )
}

// Completed items stay (crossed out) until the end of the day they were ticked, then drop off the card
const visible = (i: Item) => {
  if (!i.done) return true
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  return !!i.completed_at && new Date(i.completed_at).getTime() >= startOfToday
}

export function WidgetRail() {
  const [items, setItems] = useState<Item[]>([])
  const load = () => api.items().then(setItems).catch(() => {})
  useEffect(() => { load() }, [])
  // Tags already used on follow ups, offered as suggestions when adding or changing one
  const seen = new Set<string>()
  const tagOptions = items.filter((i) => i.kind === 'followup' && i.tag).map((i) => i.tag!).filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
  return (
    <aside className="rail">
      {WIDGETS.map((w) => (
        <Widget key={w.kind} cfg={w} items={items.filter((i) => i.kind === w.kind && visible(i))} reload={load} tagOptions={tagOptions} />
      ))}
    </aside>
  )
}

const WMO: [number, string][] = [[0, '☀️'], [3, '⛅'], [48, '🌫️'], [67, '🌧️'], [77, '🌨️'], [82, '🌧️'], [86, '🌨️'], [99, '⛈️']]
const icon = (code: number) => (WMO.find(([max]) => code <= max) ?? [0, '🌡️'])[1]

export function Weather() {
  const privacy = usePrivacy()
  return privacy?.weather ? <WeatherChip /> : null
}

function WeatherChip() {
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

const HIT_HREF: Record<string, string> = { project: '#projects', step: '#projects', note: '#notes', link: '#links', meeting: '#meetings' }

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
        🔍 <span className="s-long">Search projects, tasks, notes…</span><span className="s-short">Search…</span> <kbd>Ctrl K</kbd>
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
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Calendar({ onClose }: { onClose: () => void }) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [items, setItems] = useState<Item[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])

  useEffect(() => { api.items().then(setItems).catch(() => {}) }, [])
  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay())
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42)
    api.calendarEvents(start, end).then((r) => setEvents(r.events)).catch(() => setEvents([]))
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
    api.deadlines(toYmd(start), toYmd(last)).then(setDeadlines).catch(() => setDeadlines([]))
  }, [month])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dated = items.filter((i) => i.due_at)
  const forDay = (d: Date) => dated.filter((i) => sameDay(new Date(i.due_at!), d))
  const deadlinesOn = (d: Date) => deadlines.filter((x) => x.due_date === toYmd(d))
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
  const dayDeadlines = deadlinesOn(selected)
  const icons: Record<string, string> = { task: '✅', call: '📞', email: '✉️', message: '💬', meeting: '📅', followup: '🤝' }

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
            const n = forDay(d).length + eventsOn(d).length + deadlinesOn(d).filter((x) => !x.done).length
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
        {dayItems.length === 0 && dayEvents.length === 0 && dayDeadlines.length === 0 && <p className="empty">Nothing scheduled.</p>}
        <ul className="steps">
          {dayItems.map((i) => (
            <li key={i.id} className={i.done ? 'done' : ''}>
              <span>{icons[i.kind]} {i.title} <small>· {new Date(i.due_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
            </li>
          ))}
          {dayDeadlines.map((d) => (
            <li key={`${d.type}-${d.id}`} className={d.done ? 'done' : ''}>
              <span>
                <span className="deadline-tag">{d.type === 'project' ? '🎯 Project due' : '📌 Step due'}</span>
                {d.title}{d.type === 'step' && <small> · {d.project_title}</small>}
                {d.category === 'personal' && <small> · 🏠</small>}
              </span>
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

const QUOTES = [
  'One thing at a time.',
  'Remember what you are working for.',
  'Progress, not perfection.',
  'Start small, keep going.',
  'Done is better than perfect.',
  'Breathe. Then begin.',
]

const stressLabel = (n: number) =>
  n < 25 ? 'Calm & focused.' : n < 50 ? 'Steady.' : n < 75 ? 'Getting busy. Take a breather.' : 'High stress. Step away for a minute.'

export function Footer({ page }: { page: string }) {
  const [level, setLevel] = useState(20)
  const quote = QUOTES[(page.length + new Date().getDate()) % QUOTES.length]

  useEffect(() => { api.settings().then((s) => setLevel(s.stress)).catch(() => {}) }, [])

  const commit = (n: number) => { api.saveStress(n).catch(() => {}) }

  return (
    <footer className="footer">
      <span className="quote">💬 “{quote}”</span>
      <div className="stress" title="How stressed are you right now?">
        <button type="button" className="ghost" aria-label="Set to 0 (Calm)" onClick={() => { setLevel(0); commit(0) }}>🌿</button>
        <input
          type="range" min={0} max={100} value={level} aria-label="Stress level"
          onChange={(e) => setLevel(Number(e.target.value))}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        />
        <button type="button" className="ghost" aria-label="Set to 100 (High stress)" onClick={() => { setLevel(100); commit(100) }}>⚡</button>
        <b className={`stress-n ${level < 25 ? 'lo' : level < 50 ? 'mid' : level < 75 ? 'hi' : 'max'}`}>{level}</b>
        <span className="stress-label">{stressLabel(level)}</span>
      </div>
    </footer>
  )
}
