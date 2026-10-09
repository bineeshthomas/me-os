import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, type Note } from '../api'
import { renderMarkdown, taskCounts, toggleTask } from '../markdown'

function Markdown({ source, onToggleTask }: { source: string; onToggleTask?: (index: number) => void }) {
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

const isLong = (body: string) => body.split('\n').length > 10 || body.length > 500

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [pinned, setPinned] = useState(false)
  const [preview, setPreview] = useState(false)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  const load = () => api.notes().then(setNotes).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const open = (n: Note | 'new') => {
    setEditing(n)
    setTitle(n === 'new' ? '' : n.title)
    setBody(n === 'new' ? '' : n.body)
    setTags(n === 'new' ? [] : n.tags)
    setPinned(n === 'new' ? false : n.pinned)
    setTagInput(''); setPreview(false)
  }

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

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const pending = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    const finalTags = [...tags, ...pending]
    try {
      if (editing === 'new') await api.createNote({ title, body, tags: finalTags, pinned })
      else if (editing) await api.updateNote(editing.id, { title, body, tags: finalTags, pinned })
      setEditing(null)
      load()
    } catch (err) { setError((err as Error).message) }
  }

  const remove = async (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return
    await api.deleteNote(n.id).catch((e) => setError(e.message))
    load()
  }

  // Pinning and ticking checklist items save straight away and don't reshuffle the list
  const patch = async (n: Note, p: { pinned?: boolean; body?: string }) => {
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, ...p } : x)))
    try { await api.updateNote(n.id, { ...p, touch: false }); if (p.pinned !== undefined) load() }
    catch (err) { setError((err as Error).message); load() }
  }

  // Wrap or prefix the selected text in the editor
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
      const block = body.slice(start, z)
      const withPrefix = block.split('\n').map((l) => prefix + l).join('\n')
      next = body.slice(0, start) + withPrefix + body.slice(z)
      caret = start + withPrefix.length
    }
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  const q = query.trim().toLowerCase()
  const visible = notes.filter((n) =>
    (!tagFilter || n.tags.includes(tagFilter)) &&
    (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q))))
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
            <button className="ghost" onClick={() => open(n)}>Edit</button>
            <button className="ghost" onClick={() => remove(n)}>Delete</button>
          </div>
        </div>
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
          <p>Markdown, checklists, tags. Pin the ones you need close.</p>
        </div>
        <button className="primary" onClick={() => open('new')}>+ New Note</button>
      </section>
      {error && <p className="error">{error}</p>}

      {editing && (
        <form className="card form" onSubmit={save}>
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="editor-bar">
            <div className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={!preview} className={!preview ? 'sel' : ''} onClick={() => setPreview(false)}>Write</button>
              <button type="button" role="tab" aria-selected={preview} className={preview ? 'sel' : ''} onClick={() => setPreview(true)}>Preview</button>
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
            : <textarea ref={area} rows={10} placeholder={'Write something…\n\n- [ ] checklist item\n**bold**, # heading, [link](https://…)'} value={body} onChange={(e) => setBody(e.target.value)} />}
          <div className="tagbox">
            {tags.map((t) => <span key={t} className="tag">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>)}
            <input list="tag-suggestions" placeholder={tags.length ? 'Add tag…' : 'Add tags (press Enter)'} value={tagInput}
              onChange={(e) => (e.target.value.includes(',') ? addTag(e.target.value) : setTagInput(e.target.value))} onKeyDown={onTagKey} onBlur={() => tagInput.trim() && addTag(tagInput)} aria-label="Add tag" />
            <datalist id="tag-suggestions">{allTags.filter(([t]) => !tags.includes(t)).map(([t]) => <option key={t} value={t} />)}</datalist>
          </div>
          <label className="inline"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 Pin to top</label>
          <div className="actions">
            <button className="primary">Save</button>
            <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {notes.length > 0 && (
        <div className="notebar">
          <input type="search" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
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
