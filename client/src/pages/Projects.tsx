import { useEffect, useState, type FormEvent } from 'react'
import { api, type Project } from '../api'

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [error, setError] = useState('')

  const load = () => api.projects().then(setProjects).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e.message))

  const create = async (e: FormEvent) => {
    e.preventDefault()
    await run(api.createProject(title, description, steps.split('\n')))
    setTitle(''); setDescription(''); setSteps(''); setAdding(false)
  }

  return (
    <>
      <section className="card head">
        <div>
          <h2>Projects</h2>
          <p>Outline context notes and milestones. Click a step circle to mark it complete.</p>
        </div>
        <button className="primary" onClick={() => setAdding(!adding)}>+ New Project</button>
      </section>
      {error && <p className="error">{error}</p>}

      {adding && (
        <form className="card form" onSubmit={create}>
          <input required placeholder="Project title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea placeholder="Context / description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <textarea placeholder="Steps, one per line" value={steps} onChange={(e) => setSteps(e.target.value)} />
          <button className="primary">Create</button>
        </form>
      )}

      {projects.length === 0 && !adding && <p className="card empty">No projects yet. Click "+ New Project" to set up your first roadmap.</p>}
      {projects.map((p) => (
        <section key={p.id} className="card">
          <div className="head">
            <h3>{p.title}</h3>
            <button className="ghost" onClick={() => confirm(`Delete "${p.title}"?`) && run(api.deleteProject(p.id))}>Delete</button>
          </div>
          {p.description && <p className="muted">{p.description}</p>}
          <ul className="steps">
            {p.steps.map((s) => (
              <li key={s.id} className={s.done ? 'done' : ''}>
                <button className="circle" aria-label="Toggle step" onClick={() => run(api.setStepDone(s.id, !s.done))}>{s.done ? '✓' : ''}</button>
                <span>{s.title}</span>
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
        </section>
      ))}
    </>
  )
}
