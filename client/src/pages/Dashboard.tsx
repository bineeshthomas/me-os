import { useEffect, useState } from 'react'
import { api, type Dashboard as Data, type Focus, type WeekSummary } from '../api'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MOODS = ['😞', '🙁', '😐', '🙂', '😄']
const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' })
}

// The last 7 nights at a glance: a mood face where the review was finished, a dot where it wasn't
function ReviewBand({ week, today }: { week: WeekSummary; today: string }) {
  return (
    <a href="#review" className="card band" aria-label="Daily review, last 7 days">
      <div className="band-title">
        <b>🌙 Daily review</b>
        <span className="badge">🔥 {week.review_streak} night{week.review_streak === 1 ? '' : 's'}</span>
      </div>
      <div className="band-days">
        {week.days.map((d) => {
          const pending = d.date === today && !d.reviewed
          return (
            <div key={d.date} className={`bday${d.reviewed ? ' ok' : ''}${pending ? ' pending' : ''}${d.date === today ? ' today' : ''}`}
              title={d.reviewed ? `${d.date}: reviewed` : pending ? 'Tonight' : `${d.date}: no review`}>
              <small>{d.date === today ? 'Today' : weekday(d.date)}</small>
              <span>{d.reviewed ? (d.rating ? MOODS[d.rating - 1] : '✓') : pending ? '🌙' : '·'}</span>
            </div>
          )
        })}
      </div>
    </a>
  )
}

const progress = (steps: { done: boolean }[]) =>
  steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [week, setWeek] = useState<WeekSummary | null>(null)
  const today = ymd(new Date())
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message))
    api.focus().then(setFocus).catch(() => {})
    api.weekSummary(ymd(new Date())).then(setWeek).catch(() => {})
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="empty">Loading…</p>
  const { counts } = data

  return (
    <>
      {week && <ReviewBand week={week} today={today} />}

      <div className="stats">
        <div className="card stat"><b>{counts.projects}</b><span>Projects</span></div>
        <div className="card stat"><b>{counts.open_steps}</b><span>Open steps</span></div>
        <div className="card stat"><b>{counts.done_steps}</b><span>Steps done</span></div>
        <div className="card stat"><b>{counts.notes}</b><span>Notes</span></div>
      </div>

      {focus && focus.priorities.length > 0 && (
        <section className="card">
          <h2>🎯 Today's top {focus.priorities.length}</h2>
          <ol className="top3">{focus.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </section>
      )}

      <section className="card">
        <h2>Active projects</h2>
        {data.projects.length === 0 && <p className="empty">No projects yet.</p>}
        {data.projects.map((p) => (
          <div key={p.id} className="row">
            <span>{p.category === 'personal' && <span className="ptag" title="Personal project">🏠</span>}{p.title} <small>· {new Date(p.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small></span>
            <div className="bar"><i style={{ width: `${progress(p.steps)}%` }} /></div>
            <small>{progress(p.steps)}%</small>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Recent notes</h2>
        {data.notes.length === 0 && <p className="empty">No notes yet.</p>}
        {data.notes.map((n) => (
          <div key={n.id} className="row">
            <span>{n.title}</span>
            <small>{new Date(n.updated_at).toLocaleDateString()}</small>
          </div>
        ))}
      </section>
    </>
  )
}
