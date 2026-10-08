import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Notes from './pages/Notes'
import { Calendar, Search, Weather, WidgetRail } from './components'

const PAGES = {
  home: { label: 'Home', icon: '🏠', title: 'Dashboard ⚓', subtitle: 'Personal Control Surface', view: Dashboard },
  projects: { label: 'Projects', icon: '📋', title: 'Projects 📋', subtitle: 'Structured Goals & Milestones', view: Projects },
  notes: { label: 'Notes', icon: '📝', title: 'Notes 📝', subtitle: 'Instant Context & Ideas', view: Notes },
} as const
type Key = keyof typeof PAGES

const current = (): Key => {
  const h = window.location.hash.slice(1)
  return h in PAGES ? (h as Key) : 'home'
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export default function App() {
  const [page, setPage] = useState<Key>(current)
  const online = useOnline()
  const [calOpen, setCalOpen] = useState(false)
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const onHash = () => setPage(current())
    window.addEventListener('hashchange', onHash)
    const t = setInterval(() => setTime(new Date()), 30_000)
    return () => { window.removeEventListener('hashchange', onHash); clearInterval(t) }
  }, [])

  const { title, subtitle, view: View } = PAGES[page]

  return (
    <div className="app">
      <nav>
        <div className="brand">
          <div className="logo">⚓</div>
          <b>Main Deck</b>
        </div>
        <small className="section">Workspace</small>
        {(Object.keys(PAGES) as Key[]).map((k) => (
          <a key={k} href={`#${k}`} className={k === page ? 'active' : ''}>
            <span>{PAGES[k].icon}</span>{PAGES[k].label}
          </a>
        ))}
      </nav>
      <div className="main">
        {!online && <div className="offline">You're offline — showing saved data. Changes need a connection.</div>}
        <header>
          <div><h1>{title}</h1><small>{subtitle}</small></div>
          <Search />
          <div className="actions">
            <Weather />
            <button className="pill clock" onClick={() => setCalOpen(true)} title="Open calendar">
              {time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          </div>
        </header>
        {calOpen && <Calendar onClose={() => setCalOpen(false)} />}
        <div className="body"><main><View /></main><WidgetRail /></div>
      </div>
    </div>
  )
}
