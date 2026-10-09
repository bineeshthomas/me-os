import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Category, type Project, type Step } from '../api'

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

const daysUntil = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date()
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86_400_000)
}
const shortDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { day: 'numeric', month: 'short' })
}
// overdue (red), due within 3 days (amber), later (neutral)
const dueTone = (date: string, finished: boolean) => (finished ? 'ok' : daysUntil(date) < 0 ? 'late' : daysUntil(date) <= 3 ? 'soon' : '')
const dueText = (date: string) => {
  const n = daysUntil(date)
  return n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n < 0 ? `Overdue · ${shortDate(date)}` : `Due ${shortDate(date)}`
}

function CategoryPicker({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Project type">
      {(['work', 'personal'] as const).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} className={value === c ? 'sel' : ''} onClick={() => onChange(c)}>
          {c === 'work' ? '💼 Work' : '🏠 Personal'}
        </button>
      ))}
    </div>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [category, setCategory] = useState<Category>('work')
  const [due, setDue] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => api.projects().then(setProjects).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e.message))

  const create = async (e: FormEvent) => {
    e.preventDefault()
    await run(api.createProject(title, description, steps.split('\n'), category, due || null))
    setTitle(''); setDescription(''); setSteps(''); setCategory('work'); setDue(''); setAdding(false)
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
          <CategoryPicker value={category} onChange={setCategory} />
          <label className="inline">Due date <small className="muted">(optional)</small> <input type="date" className="datein" value={due} onChange={(e) => setDue(e.target.value)} /></label>
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
          const finished = p.steps.length > 0 && done === p.steps.length
          return (
            <button key={p.id} className={p.category === 'personal' ? 'card pcard personal' : 'card pcard'} onClick={() => setOpenId(p.id)}>
              {p.category === 'personal' && <span className="ptag">🏠 Personal</span>}
              <b>{p.title}</b>
              <div className="pmeta">
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <small>{done}/{p.steps.length}</small>
              </div>
              <small className="muted">Updated {ago(p.updated_at)}</small>
              {p.due_date && <span className={`due ${dueTone(p.due_date, finished)}`}>📅 {finished ? `Was due ${shortDate(p.due_date)}` : dueText(p.due_date)}</span>}
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

  // Step order is kept locally so a drag feels instant, then saved
  const serverOrder = p.steps.map((s) => s.id).join(',')
  const [order, setOrder] = useState<number[]>(() => p.steps.map((s) => s.id))
  useEffect(() => { setOrder(p.steps.map((s) => s.id)) }, [serverOrder]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(p.steps.map((s) => [s.id, s]))
  const steps = order.map((id) => byId.get(id)).filter((s): s is Step => !!s)

  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const grips = useRef(new Map<number, HTMLElement>())

  const moveTo = (id: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= order.length) return
    const next = order.filter((x) => x !== id)
    next.splice(toIndex, 0, id)
    if (next.join(',') === order.join(',')) return
    setOrder(next)
    run(api.reorderSteps(p.id, next))
    requestAnimationFrame(() => grips.current.get(id)?.focus())
  }

  const saveHeader = (field: 'title' | 'description', value: string) => {
    const next = { title: p.title, description: p.description ?? '', [field]: value.trim() }
    if (field === 'title' && !next.title) return // a project needs a name
    if (next.title === p.title && next.description === (p.description ?? '')) return
    run(api.updateProject(p.id, { title: next.title, description: next.description }))
  }

  const finished = p.steps.length > 0 && p.steps.every((s) => s.done)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card pdetail" role="dialog" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <input className="ptitle" defaultValue={p.title} aria-label="Project title" onBlur={(e) => saveHeader('title', e.target.value)} />
          <button className="ghost" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="pmetaRow">
          <CategoryPicker value={p.category} onChange={(c) => c !== p.category && run(api.updateProject(p.id, { category: c }))} />
          <label className="inline">Due
            <input type="date" className={`datein ${p.due_date ? dueTone(p.due_date, finished) : ''}`} value={p.due_date ?? ''} aria-label="Project due date"
              onChange={(e) => run(api.updateProject(p.id, { due_date: e.target.value || null }))} />
          </label>
        </div>
        <small className="muted">Created {fmtDate(p.created_at)} · Updated {ago(p.updated_at)}</small>
        <textarea
          className="pdesc" rows={2} placeholder="Context / description" defaultValue={p.description ?? ''}
          aria-label="Description" onBlur={(e) => saveHeader('description', e.target.value)}
        />

        <ul className="steps" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverId(null) }}>
          {steps.map((s, index) => (
            <li
              key={`${s.id}-${s.title}`}
              className={`${s.done ? 'done' : ''}${dragId === s.id ? ' dragging' : ''}${overId === s.id && dragId !== s.id ? ' dragover' : ''}`}
              onDragOver={(e) => { if (dragId !== null) { e.preventDefault(); setOverId(s.id) } }}
              onDrop={(e) => { e.preventDefault(); if (dragId !== null) moveTo(dragId, index); setDragId(null); setOverId(null) }}
            >
              <span
                className="grip" role="button" tabIndex={0} draggable
                aria-label={`Reorder "${s.title}". Drag, or press the up and down arrow keys.`}
                ref={(el) => { if (el) grips.current.set(s.id, el); else grips.current.delete(s.id) }}
                onDragStart={(e) => {
                  setDragId(s.id)
                  e.dataTransfer.effectAllowed = 'move'
                  const row = (e.currentTarget as HTMLElement).closest('li')
                  if (row) e.dataTransfer.setDragImage(row, 12, 12)
                }}
                onDragEnd={() => { setDragId(null); setOverId(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(s.id, index - 1) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(s.id, index + 1) }
                }}
              >⋮⋮</span>
              <button className="circle" aria-label="Toggle step" onClick={() => run(api.setStepDone(s.id, !s.done))}>{s.done ? '✓' : ''}</button>
              <input
                className="stepedit" defaultValue={s.title} aria-label="Step"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) run(api.renameStep(s.id, v)) }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <input
                type="date" className={`datein stepdate ${s.due_date ? dueTone(s.due_date, s.done) : 'empty'}`}
                value={s.due_date ?? ''} aria-label={`Due date for "${s.title}"`} title="Due date"
                onChange={(e) => run(api.setStepDue(s.id, e.target.value || null))}
              />
              <span className="mv">
                <button className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => moveTo(s.id, index - 1)}>▲</button>
                <button className="ghost" aria-label="Move down" disabled={index === steps.length - 1} onClick={() => moveTo(s.id, index + 1)}>▼</button>
              </span>
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
