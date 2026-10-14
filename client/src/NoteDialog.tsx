import { useEffect, useState } from 'react'
import { api, type MeetingRef, type Note, type NoteDraft, type Project } from './api'
import NoteForm from './NoteForm'

// Read or edit one note in a window, without leaving the page you're on (a project, or a meeting).
// It opens in edit mode, with a Preview tab for reading. It is the same editor as on the Notes page.
export default function NoteDialog({ noteId, defaultProjectId = null, defaultMeeting = null, projects, onClose, onChanged }: {
  noteId?: number
  defaultProjectId?: number | null
  defaultMeeting?: MeetingRef | null
  projects: Project[]
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(noteId !== undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    if (noteId === undefined) return
    api.note(noteId).then(setNote).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [noteId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (draft: NoteDraft) => {
    if (noteId === undefined) await api.createNote(draft)
    else await api.updateNote(noteId, draft)
    await onChanged()
    onClose()
  }
  const remove = async () => {
    if (!note || !confirm(`Delete "${note.title}"?`)) return
    await api.deleteNote(note.id).catch((e) => setError(e.message))
    await onChanged()
    onClose()
  }

  const project = projects.find((x) => x.id === (note ? note.project_id : defaultProjectId))
  const meetingTitle = note ? note.meeting_title : defaultMeeting?.title
  return (
    <div className="overlay top" onClick={onClose}>
      <div className="card notedlg" role="dialog" aria-label={noteId === undefined ? 'New note' : 'Edit note'} onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h3>
            {noteId === undefined ? '📝 New note' : '📝 Note'}
            {meetingTitle && <small className="muted"> · 📅 {meetingTitle}</small>}
            {project && <small className="muted"> · {project.category === 'personal' ? '🏠' : '📋'} {project.title}</small>}
          </h3>
          <button className="ghost" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? <p className="empty">Loading…</p> : (noteId === undefined || note) && (
          <NoteForm note={note} defaultProjectId={defaultProjectId} defaultMeeting={defaultMeeting} projects={projects} onSave={save} onCancel={onClose} onDelete={note ? remove : undefined} />
        )}
      </div>
    </div>
  )
}
