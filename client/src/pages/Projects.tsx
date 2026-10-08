import { useEffect, useState, type FormEvent } from 'react'
import { api, type Project } from '../api'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`
  if (mins < 7 * 24 * 60) return `${Math.round(mins / 1440)}d ago`
  return fmtDate(iso)
}

const progress = (p: Project) => p.steps.filter((s) => s.done).length

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => api.projects().then(setProjects).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e.message))

  const create = async (e: FormEvent) => {
    e.preventDefault()
    await run(api.createProject(title, description, steps.split('\n')))
    setTitle(''); setDescription(''); setSteps(''); setAdding(false)
  }

  const open = projects.find((p) => p.id === openId)

  return (
    <>
      <section className="card head">
        <div>
          <h2>Projects</h2>
          <p>Most recently updated first. Click a project to edit its steps.</p>
        </div>
        <button className="primary" onClick={() => setAdding(!adding)}>+ New Project</button>
      </section>
      {error && <p className="error">{error}</p>}

      {adding && (
        <form className="card form" onSubmit={create}>
          <input required autoFocus placeholder="Project title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea placeholder="Context / description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <textarea placeholder="Steps, one per line" value={steps} onChange={(e) => setSteps(e.target.value)} />
          <button className="primary">Create</button>
        </form>
      )}

      {projects.length === 0 && !adding && <p className="card empty">No projects yet. Click "+ New Project" to set up your first roadmap.</p>}

      <div className="pgrid">
        {projects.map((p) => {
          const done = progress(p)
          const pct = p.steps.length ? Math.round((done / p.steps.length) * 100) : 0
          return (
            <button key={p.id} className="card pcard" onClick={() => setOpenId(p.id)}>
              <b>{p.title}</b>
              <div className="pmeta">
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <small>{done}/{p.steps.length}</small>
              </div>
              <small className="muted">Updated {ago(p.updated_at)}</small>
            </button>
          )
        })}
      </div>

      {open && <ProjectDetail key={open.id} project={open} run={run} onClose={() => setOpenId(null)} />}
    </>
  )
}

function ProjectDetail({ project: p, run, onClose }: { project: Project; run: (p: Promise<unknown>) => Promise<void>; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveHeader = (field: 'title' | 'description', value: string) => {
    const next = { title: p.title, description: p.description ?? '', [field]: value.trim() }
    if (field === 'title' && !next.title) return // a project needs a name
    if (next.title === p.title && next.description === (p.description ?? '')) return
    run(api.updateProject(p.id, next.title, next.description))
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card pdetail" role="dialog" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <input className="ptitle" defaultValue={p.title} aria-label="Project title" onBlur={(e) => saveHeader('title', e.target.value)} />
          <button className="ghost" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <small className="muted">Created {fmtDate(p.created_at)} · Updated {ago(p.updated_at)}</small>
        <textarea
          className="pdesc" rows={2} placeholder="Context / description" defaultValue={p.description ?? ''}
          aria-label="Description" onBlur={(e) => saveHeader('description', e.target.value)}
        />

        <ul className="steps">
          {p.steps.map((s) => (
            <li key={`${s.id}-${s.title}`} className={s.done ? 'done' : ''}>
              <button className="circle" aria-label="Toggle step" onClick={() => run(api.setStepDone(s.id, !s.done))}>{s.done ? '✓' : ''}</button>
              <input
                className="stepedit" defaultValue={s.title} aria-label="Step"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) run(api.renameStep(s.id, v)) }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <button className="ghost" aria-label="Delete step" onClick={() => run(api.deleteStep(s.id))}>✕</button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => {
          e.preventDefault()
          const input = e.currentTarget.elements.namedItem('step') as HTMLInputElement
          if (input.value.trim()) run(api.addStep(p.id, input.value.trim())).then(() => { input.value = '' })
        }}>
          <input name="step" placeholder="Add a step…" />
        </form>

        <div className="actions pfoot">
          <button className="ghost" onClick={() => confirm(`Delete "${p.title}"?`) && run(api.deleteProject(p.id)).then(onClose)}>Delete project</button>
        </div>
      </div>
    </div>
  )
}
