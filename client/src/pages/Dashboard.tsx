import { useEffect, useState } from 'react'
import { api, type Dashboard as Data } from '../api'

const progress = (steps: { done: boolean }[]) =>
  steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="empty">Loading…</p>
  const { counts } = data

  return (
    <>
      <div className="stats">
        <div className="card stat"><b>{counts.projects}</b><span>Projects</span></div>
        <div className="card stat"><b>{counts.open_steps}</b><span>Open steps</span></div>
        <div className="card stat"><b>{counts.done_steps}</b><span>Steps done</span></div>
        <div className="card stat"><b>{counts.notes}</b><span>Notes</span></div>
      </div>

      <section className="card">
        <h2>Active projects</h2>
        {data.projects.length === 0 && <p className="empty">No projects yet.</p>}
        {data.projects.map((p) => (
          <div key={p.id} className="row">
            <span>{p.title}</span>
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
