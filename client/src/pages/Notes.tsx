import { useEffect, useState, type FormEvent } from 'react'
import { api, type Note } from '../api'

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const load = () => api.notes().then(setNotes).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const open = (n: Note | 'new') => {
    setEditing(n)
    setTitle(n === 'new' ? '' : n.title)
    setBody(n === 'new' ? '' : n.body)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.createNote(title, body)
      else if (editing) await api.updateNote(editing.id, title, body)
      setEditing(null)
      load()
    } catch (err) { setError((err as Error).message) }
  }

  const remove = async (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return
    await api.deleteNote(n.id).catch((e) => setError(e.message))
    load()
  }

  return (
    <>
      <section className="card head">
        <div>
          <h2>Quick Notes</h2>
          <p>Capture thoughts, scratchpads, and context immediately.</p>
        </div>
        <button className="primary" onClick={() => open('new')}>+ New Note</button>
      </section>
      {error && <p className="error">{error}</p>}

      {editing && (
        <form className="card form" onSubmit={save}>
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={8} placeholder="Write something…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="actions">
            <button className="primary">Save</button>
            <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {notes.length === 0 && !editing && <p className="card empty">No notes written. Keep thoughts out of your head and on the workbench.</p>}
      {notes.map((n) => (
        <article key={n.id} className="card">
          <div className="head">
            <h3>{n.title}</h3>
            <div className="actions">
              <button className="ghost" onClick={() => open(n)}>Edit</button>
              <button className="ghost" onClick={() => remove(n)}>Delete</button>
            </div>
          </div>
          <p className="note-body">{n.body}</p>
          <small className="muted">{new Date(n.updated_at).toLocaleString()}</small>
        </article>
      ))}
    </>
  )
}
