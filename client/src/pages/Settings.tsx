import { useEffect, useState, type FormEvent } from 'react'
import { api, type CalendarStatus } from '../api'

export default function Settings() {
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { api.settings().then((s) => setStatus(s.calendar)).catch((e) => setMsg({ ok: false, text: e.message })) }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const s = await api.saveCalendar(url)
      setStatus(s.calendar); setUrl('')
      setMsg({ ok: true, text: 'Outlook calendar connected.' })
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm('Disconnect the Outlook calendar?')) return
    await api.removeCalendar().catch((e) => setMsg({ ok: false, text: e.message }))
    setStatus({ connected: false }); setMsg(null)
  }

  return (
    <section className="card">
      <h2>Outlook calendar</h2>
      <p className="muted">
        Show your Outlook meetings in the calendar and the Meetings widget. In Outlook on the web go to
        Settings → Calendar → Shared calendars → Publish a calendar, choose "Can view all details", and paste the ICS link here.
      </p>
      {status?.connected && (
        <p className="ok">✓ Connected to <b>{status.host}</b> <button className="ghost" onClick={remove}>Disconnect</button></p>
      )}
      <form className="form" onSubmit={save}>
        <input
          required type="password" autoComplete="off" spellCheck={false}
          placeholder={status?.connected ? 'Paste a new ICS link to replace it' : 'Paste your ICS link (https:// or webcal://)'}
          value={url} onChange={(e) => setUrl(e.target.value)}
        />
        <button className="primary" disabled={busy}>{busy ? 'Checking…' : status?.connected ? 'Replace link' : 'Connect'}</button>
      </form>
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
      <p className="muted"><small>The link is stored on your server and never shown again. Treat it like a password: anyone with it can read your calendar.</small></p>
    </section>
  )
}
