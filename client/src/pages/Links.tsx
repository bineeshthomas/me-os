import { useEffect, useState, type FormEvent } from 'react'
import { api, type QuickLink } from '../api'
import { usePrivacy } from '../privacy'

const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// A coloured letter, always available and never contacts anyone
function LetterIcon({ name }: { name: string }) {
  const hue = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
  return <span className="lettericon" style={{ background: `hsl(${hue} 55% 82%)`, color: `hsl(${hue} 45% 28%)` }} aria-hidden>{(name.trim()[0] ?? '?').toUpperCase()}</span>
}

// The site's own icon, only if the owner has allowed it in Settings; falls back to the letter if the site has none
function SiteIcon({ link, allow }: { link: QuickLink; allow: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!allow || failed) return <LetterIcon name={link.name} />
  return <img src={`${new URL(link.url).origin}/favicon.ico`} alt="" width={22} height={22} onError={() => setFailed(true)} referrerPolicy="no-referrer" />
}

export default function Links() {
  const privacy = usePrivacy()
  const [links, setLinks] = useState<QuickLink[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const load = () => api.links().then(setLinks).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const reset = () => { setEditing(null); setName(''); setUrl('') }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editing === null) await api.createLink(name, url)
      else await api.updateLink(editing, name, url)
      reset()
      load()
    } catch (err) { setError((err as Error).message) }
  }

  const edit = (l: QuickLink) => { setEditing(l.id); setName(l.name); setUrl(l.url); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const remove = async (l: QuickLink) => {
    if (!confirm(`Delete "${l.name}"?`)) return
    await api.deleteLink(l.id).catch((e) => setError(e.message))
    if (editing === l.id) reset()
    load()
  }

  return (
    <>
      <section className="card">
        <h2>{editing === null ? 'Add a link' : 'Edit link'}</h2>
        <form className="linkform" onSubmit={save}>
          <input required placeholder="Name (e.g. Timesheet)" value={name} onChange={(e) => setName(e.target.value)} />
          <input required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="primary">{editing === null ? 'Save' : 'Update'}</button>
          {editing !== null && <button type="button" className="ghost" onClick={reset}>Cancel</button>}
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      {links.length === 0 && <p className="card empty">No links yet. Save the sites you open every day for one-click launch.</p>}
      <div className="links">
        {links.map((l) => (
          <div key={l.id} className="card linkcard">
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              <SiteIcon link={l} allow={!!privacy?.favicons} />
              <span><b>{l.name}</b><small>{host(l.url)}</small></span>
            </a>
            <div className="actions">
              <button className="ghost" onClick={() => edit(l)}>Edit</button>
              <button className="ghost" onClick={() => remove(l)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
