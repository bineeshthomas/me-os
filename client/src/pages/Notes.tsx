import { useEffect, useMemo, useState } from 'react'
import { api, type Note, type NoteDraft, type Project } from '../api'
import { taskCounts, toggleTask } from '../markdown'
import NoteForm, { Markdown } from '../NoteForm'

const isLong = (body: string) => body.split('\n').length > 10 || body.length > 500

// Project filter values: everything, only notes without a project, or one project's id
type ProjectFilter = 'all' | 'none' | number

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [error, setError] = useState('')

  const load = () => Promise.all([api.notes(), api.projects()]).then(([n, p]) => { setNotes(n); setProjects(p) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async (draft: NoteDraft) => {
    if (editing === 'new') await api.createNote(draft)
    else if (editing) await api.updateNote(editing.id, draft)
    setEditing(null)
    await load()
  }

  const remove = async (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return
    await api.deleteNote(n.id).catch((e) => setError(e.message))
    if (editing && editing !== 'new' && editing.id === n.id) setEditing(null)
    load()
  }

  // Pinning and ticking checklist items save straight away and don't reshuffle the list
  const patch = async (n: Note, p: { pinned?: boolean; body?: string }) => {
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, ...p } : x)))
    try { await api.updateNote(n.id, { ...p, touch: false }); if (p.pinned !== undefined) load() }
    catch (err) { setError((err as Error).message); load() }
  }

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  // Only offer projects that have notes in the filter, so it never lists dead ends
  const filterProjects = projects.filter((p) => notes.some((n) => n.project_id === p.id))
  const hasLinked = notes.some((n) => n.project_id !== null)

  const q = query.trim().toLowerCase()
  const visible = notes.filter((n) =>
    (!tagFilter || n.tags.includes(tagFilter)) &&
    (projectFilter === 'all' || (projectFilter === 'none' ? n.project_id === null : n.project_id === projectFilter)) &&
    (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)) || (n.project_title ?? '').toLowerCase().includes(q)))
  const pinnedNotes = visible.filter((n) => n.pinned)
  const otherNotes = visible.filter((n) => !n.pinned)

  const card = (n: Note) => {
    const { done, total } = taskCounts(n.body)
    const long = isLong(n.body)
    const open_ = expanded[n.id]
    return (
      <article key={n.id} className={n.pinned ? 'card note pinned' : 'card note'}>
        <div className="head">
          <h3>{n.title}</h3>
          <div className="actions">
            <button className={n.pinned ? 'ghost pin on' : 'ghost pin'} aria-pressed={n.pinned} title={n.pinned ? 'Unpin' : 'Pin to top'}
              onClick={() => patch(n, { pinned: !n.pinned })}>📌</button>
            <button className="ghost" onClick={() => { setEditing(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
            <button className="ghost" onClick={() => remove(n)}>Delete</button>
          </div>
        </div>
        {n.project_id !== null && n.project_title && (
          <a className={n.project_category === 'personal' ? 'projchip personal' : 'projchip'} href={`#projects:${n.project_id}`} title="Open this project">
            {n.project_category === 'personal' ? '🏠' : '📋'} {n.project_title} <span aria-hidden>↗</span>
          </a>
        )}
        <div className={long && !open_ ? 'clamp' : ''}>
          <Markdown source={n.body} onToggleTask={(i) => patch(n, { body: toggleTask(n.body, i) })} />
        </div>
        {long && <button className="ghost more-btn" onClick={() => setExpanded({ ...expanded, [n.id]: !open_ })}>{open_ ? 'Show less' : 'Show more'}</button>}
        <div className="note-foot">
          {n.tags.map((t) => <button key={t} className={tagFilter === t ? 'tag sel' : 'tag'} onClick={() => setTagFilter(tagFilter === t ? null : t)}>#{t}</button>)}
          {total > 0 && <small className="muted">☑ {done}/{total}</small>}
          <small className="muted foot-date">{new Date(n.updated_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small>
        </div>
      </article>
    )
  }

  return (
    <>
      <section className="card head">
        <div>
          <h2>Quick Notes</h2>
          <p>Markdown, checklists and tags. Link a note to a project to keep it with the work.</p>
        </div>
        <button className="primary" onClick={() => setEditing('new')}>+ New Note</button>
      </section>
      {error && <p className="error">{error}</p>}

      {editing && (
        <section className="card">
          <h2>{editing === 'new' ? 'New note' : 'Edit note'}</h2>
          <NoteForm
            key={editing === 'new' ? 'new' : editing.id}
            note={editing === 'new' ? null : editing}
            projects={projects}
            tagSuggestions={allTags.map(([t]) => t)}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={editing === 'new' ? undefined : () => remove(editing)}
          />
        </section>
      )}

      {notes.length > 0 && (
        <div className="notebar">
          <div className="notebar-row">
            <input type="search" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
            {(filterProjects.length > 0 || hasLinked) && (
              <select className="projfilter" value={String(projectFilter)} aria-label="Filter by project"
                onChange={(e) => setProjectFilter(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}>
                <option value="all">All projects</option>
                <option value="none">No project</option>
                {filterProjects.map((p) => <option key={p.id} value={p.id}>{p.category === 'personal' ? '🏠' : '📋'} {p.title}</option>)}
              </select>
            )}
          </div>
          <div className="tagfilter">
            <button className={tagFilter === null ? 'tag sel' : 'tag'} onClick={() => setTagFilter(null)}>All</button>
            {allTags.map(([t, c]) => <button key={t} className={tagFilter === t ? 'tag sel' : 'tag'} onClick={() => setTagFilter(tagFilter === t ? null : t)}>#{t} <small>{c}</small></button>)}
          </div>
        </div>
      )}

      {notes.length === 0 && !editing && <p className="card empty">No notes written. Keep thoughts out of your head and on the workbench.</p>}
      {notes.length > 0 && visible.length === 0 && <p className="card empty">No notes match.</p>}

      {pinnedNotes.length > 0 && <h3 className="notes-label">📌 Pinned</h3>}
      <div className="notegrid">{pinnedNotes.map(card)}</div>
      {pinnedNotes.length > 0 && otherNotes.length > 0 && <h3 className="notes-label">Notes</h3>}
      <div className="notegrid">{otherNotes.map(card)}</div>
    </>
  )
}
