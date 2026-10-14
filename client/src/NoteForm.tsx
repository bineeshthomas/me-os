import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { MeetingRef, Note, NoteDraft, Project } from './api'
import { renderMarkdown } from './markdown'

export function Markdown({ source, onToggleTask }: { source: string; onToggleTask?: (index: number) => void }) {
  const html = useMemo(() => renderMarkdown(source), [source])
  return (
    <div
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (onToggleTask && t instanceof HTMLInputElement && t.type === 'checkbox') {
          const boxes = [...e.currentTarget.querySelectorAll('input[type=checkbox]')]
          onToggleTask(boxes.indexOf(t))
        }
      }}
    />
  )
}

export const isFinished = (p: Project) => p.steps.length > 0 && p.steps.every((s) => s.done)
export const projectLabel = (p: { title: string; category?: string | null }) => `${p.category === 'personal' ? '🏠' : '📋'} ${p.title}`

// Pick a project to link a note to: active projects first, finished ones tucked underneath
export function ProjectSelect({ value, onChange, projects }: { value: number | null; onChange: (id: number | null) => void; projects: Project[] }) {
  const active = projects.filter((p) => !isFinished(p))
  const done = projects.filter(isFinished)
  const known = value === null || projects.some((p) => p.id === value)
  return (
    <select className="projselect" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Link to project">
      <option value="">No project</option>
      {!known && <option value={value ?? ''}>(project no longer available)</option>}
      {active.length > 0 && <optgroup label="Active projects">{active.map((p) => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}</optgroup>}
      {done.length > 0 && <optgroup label="Completed projects">{done.map((p) => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}</optgroup>}
    </select>
  )
}

interface Props {
  note?: Note | null
  defaultProjectId?: number | null // pre-select a project when creating from one
  defaultMeeting?: MeetingRef | null // link a new note to a meeting when creating from one
  projects: Project[]
  tagSuggestions?: string[]
  onSave: (draft: NoteDraft) => Promise<void>
  onCancel: () => void
  onDelete?: () => void
}

// The note editor, shared by the Notes page and the project's note dialog
export default function NoteForm({ note, defaultProjectId = null, defaultMeeting = null, projects, tagSuggestions = [], onSave, onCancel, onDelete }: Props) {
  const listId = useId()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [pinned, setPinned] = useState(note?.pinned ?? false)
  const [projectId, setProjectId] = useState<number | null>(note ? note.project_id : defaultProjectId)
  const [meeting, setMeeting] = useState<MeetingRef | null>(
    note ? (note.meeting_key ? { key: note.meeting_key, title: note.meeting_title ?? 'Meeting', start: note.meeting_start } : null) : defaultMeeting,
  )
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  // Accepts one tag or several separated by commas (typed or pasted)
  const addTag = (raw: string) => {
    const next = [...tags]
    for (const part of raw.split(',')) {
      const t = part.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-')
      if (t && !next.includes(t) && next.length < 10) next.push(t)
    }
    setTags(next)
    setTagInput('')
  }
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1))
  }

  // Wrap or prefix the selected text
  const format = (kind: 'bold' | 'list' | 'check') => {
    const el = area.current
    if (!el) return
    const { selectionStart: a, selectionEnd: z } = el
    let next: string
    let caret: number
    if (kind === 'bold') {
      const sel = body.slice(a, z) || 'bold text'
      next = `${body.slice(0, a)}**${sel}**${body.slice(z)}`
      caret = a + 2 + sel.length + 2
    } else {
      const prefix = kind === 'check' ? '- [ ] ' : '- '
      const start = body.lastIndexOf('\n', a - 1) + 1
      const withPrefix = body.slice(start, z).split('\n').map((l) => prefix + l).join('\n')
      next = body.slice(0, start) + withPrefix + body.slice(z)
      caret = start + withPrefix.length
    }
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const pending = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    try { await onSave({ title: title.trim(), body, tags: [...tags, ...pending], pinned, project_id: projectId, meeting }) }
    catch (err) { setError((err as Error).message) }
    setBusy(false)
  }

  return (
    <form className="noteform" onSubmit={submit}>
      <input className="nf-title" required autoFocus={!note} placeholder="Note title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Note title" />

      {meeting && (
        <div className="nf-meeting">
          <span>📅 <b>{meeting.title}</b>{meeting.start && <small> · {new Date(meeting.start).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>}</span>
          <button type="button" className="ghost" onClick={() => setMeeting(null)} title="Remove the link to this meeting">Unlink</button>
        </div>
      )}

      <div className="nf-meta">
        <label>
          <span className="nf-label">🔗 Project</span>
          <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} />
        </label>
        <label className="nf-pin"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 Pin to top</label>
      </div>

      <div className="editor-bar">
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={!preview ? 'sel' : ''} onClick={() => setPreview(false)}>✏️ Write</button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? 'sel' : ''} onClick={() => setPreview(true)}>👁 Preview</button>
        </div>
        {!preview && (
          <div className="fmt">
            <button type="button" className="ghost" onClick={() => format('check')} title="Checklist">☑ Checklist</button>
            <button type="button" className="ghost" onClick={() => format('list')} title="Bullet list">• List</button>
            <button type="button" className="ghost" onClick={() => format('bold')} title="Bold"><b>B</b></button>
          </div>
        )}
      </div>
      {preview
        ? <div className="preview"><Markdown source={body || '*Nothing to preview yet.*'} /></div>
        : <textarea ref={area} rows={9} placeholder={'Write here…\n\n- [ ] checklist item\n**bold**, # heading, [link](https://…)'} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Note" />}

      <div className="tagbox">
        {tags.map((t) => <span key={t} className="tag">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>)}
        <input list={listId} placeholder={tags.length ? 'Add tag…' : 'Add tags (press Enter)'} value={tagInput}
          onChange={(e) => (e.target.value.includes(',') ? addTag(e.target.value) : setTagInput(e.target.value))}
          onKeyDown={onTagKey} onBlur={() => tagInput.trim() && addTag(tagInput)} aria-label="Add tag" />
        <datalist id={listId}>{tagSuggestions.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="nf-actions">
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="ghost danger" onClick={onDelete}>Delete note</button>}
      </div>
    </form>
  )
}
