import { useEffect, useState, type ComponentType } from 'react'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Notes from './pages/Notes'
import Activity from './pages/Activity'
import DailyReview from './pages/DailyReview'
import History from './pages/History'
import Links from './pages/Links'
import Meetings from './pages/Meetings'
import Settings from './pages/Settings'
import { Calendar, Footer, Search, Weather, WidgetRail } from './components'
import { FocusPill } from './focus'

interface Page {
  label: string; icon: string; title: string; subtitle: string
  view: ComponentType<{ arg?: string }>
  hidden?: boolean // reachable by link, not shown in the menu
  parent?: string // menu item to highlight while on this page
}

const PAGES: Record<string, Page> = {
  home: { label: 'Home', icon: '🏠', title: 'Dashboard 🧭', subtitle: 'Your day at a glance', view: Dashboard },
  projects: { label: 'Projects', icon: '📋', title: 'Projects 📋', subtitle: 'Structured Goals & Milestones', view: Projects },
  notes: { label: 'Notes', icon: '📝', title: 'Notes 📝', subtitle: 'Instant Context & Ideas', view: Notes },
  meetings: { label: 'Meetings', icon: '📅', title: 'Meetings 📅', subtitle: 'Upcoming, past, and your notes', view: Meetings },
  review: { label: 'Daily Review', icon: '🌙', title: 'Daily Review 🌙', subtitle: 'Close the day, plan tomorrow', view: DailyReview },
  history: { label: 'Review History', icon: '📊', title: 'Review History 📊', subtitle: 'Spot patterns in your days', view: History, hidden: true, parent: 'review' },
  activity: { label: 'Activity', icon: '⏱️', title: 'Activity ⏱️', subtitle: 'Focus time log', view: Activity },
  links: { label: 'Links', icon: '🔗', title: 'Links 🔗', subtitle: 'Quick Launch', view: Links },
  settings: { label: 'Settings', icon: '⚙️', title: 'Settings ⚙️', subtitle: 'Connections & Preferences', view: Settings },
}

// "#review:2026-10-07" -> page "review" with argument "2026-10-07"
const current = (): { key: string; arg?: string } => {
  const [k, arg] = window.location.hash.slice(1).split(':')
  return { key: k in PAGES ? k : 'home', arg }
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
  const [route, setRoute] = useState(current)
  const page = route.key
  const online = useOnline()
  const [calOpen, setCalOpen] = useState(false)
  // Sidebar collapses to an icon rail; the choice is remembered
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nav-collapsed') === '1' } catch { return false }
  })
  const toggleNav = () => setCollapsed((c) => {
    try { localStorage.setItem('nav-collapsed', c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const onHash = () => setRoute(current())
    // Ctrl/Cmd+B toggles the sidebar (not while typing in a field)
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault(); toggleNav()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onHash)
    const t = setInterval(() => setTime(new Date()), 30_000)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); clearInterval(t) }
  }, [])

  const { title, subtitle, view: View } = PAGES[page]
  const activeMenu = PAGES[page].parent ?? page

  return (
    <div className={collapsed ? 'app collapsed' : 'app'}>
      <nav>
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#2f5d46" strokeWidth="2.3" strokeLinecap="round">
              <path d="M7.2 6.6a7.2 7.2 0 1 0 9.6 0" /><path d="M12 3.2v8.3" />
            </svg>
          </div>
          <b>Me-OS</b>
        </div>
        <button className="navtoggle" onClick={toggleNav} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={`${collapsed ? 'Expand' : 'Collapse'} menu (Ctrl+B)`}>{collapsed ? '»' : '«'}</button>
        <small className="section">Workspace</small>
        {Object.entries(PAGES).filter(([, p]) => !p.hidden).map(([k, p]) => (
          <a key={k} href={`#${k}`} className={k === activeMenu ? 'active' : ''} title={collapsed ? p.label : undefined} aria-label={p.label}>
            <span className="ico">{p.icon}</span><span className="lbl">{p.label}</span>
          </a>
        ))}
      </nav>
      <div className="main">
        {!online && <div className="offline">You're offline — showing saved data. Changes need a connection.</div>}
        {calOpen && <Calendar onClose={() => setCalOpen(false)} />}
        <div className="body">
          <WidgetRail />
          <div className="pane">
            <header>
              <div><h1>{title}</h1><small>{subtitle}</small></div>
              <Search />
              <div className="actions">
                <FocusPill />
                <Weather />
                <button className="pill clock" onClick={() => setCalOpen(true)} title="Open calendar">
                  {time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              </div>
            </header>
            <main><View key={`${route.key}:${route.arg ?? ''}`} arg={route.arg} /></main>
          </div>
        </div>
        <Footer page={page} />
      </div>
    </div>
  )
}
