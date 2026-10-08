import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Notes from './pages/Notes'

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

export default function App() {
  const [page, setPage] = useState<Key>(current)
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
        <header>
          <div><h1>{title}</h1><small>{subtitle}</small></div>
          <span className="pill">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </header>
        <main><View /></main>
      </div>
    </div>
  )
}
