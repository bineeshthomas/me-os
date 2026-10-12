import { useEffect, useState, type FormEvent } from 'react'
import { api, type CalendarStatus, type PrivacySettings } from '../api'
import { notifyPrivacyChanged } from '../privacy'

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'switch on' : 'switch'} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

// What is stored, who (if anyone) the app talks to, and the controls to export or erase everything
function PrivacyCard() {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null)
  const [erasing, setErasing] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { api.settings().then((s) => setPrivacy(s.privacy)).catch((e) => setError(e.message)) }, [])

  const toggle = async (patch: Partial<PrivacySettings>) => {
    setError('')
    try { setPrivacy(await api.savePrivacy(patch)); notifyPrivacyChanged() } catch (e) { setError((e as Error).message) }
  }

  const erase = async () => {
    setError('')
    try {
      await api.eraseEverything()
      try { localStorage.clear() } catch { /* ignore */ }
      window.location.hash = '#home'
      window.location.reload()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <section className="card privacy">
      <h2>🔒 Your data stays on this computer</h2>
      <p className="muted">
        Me-OS has no accounts, no analytics and no tracking. Everything you write is saved in a database on this computer, and
        the app only answers to this computer. Nothing is sent to the author or anyone else, except for the two optional
        features below, which are <b>off</b> until you turn them on.
      </p>

      <div className="prow">
        <div>
          <b>🌤️ Show the weather</b>
          <small className="muted">Sends the city you type, and its map position, to <i>open-meteo.com</i> (a free weather service) every time the page loads.</small>
        </div>
        {privacy && <Switch on={privacy.weather} onChange={(v) => toggle({ weather: v })} label="Show the weather" />}
      </div>
      <div className="prow">
        <div>
          <b>🖼️ Show website icons on Links</b>
          <small className="muted">Loads each saved site's own icon straight from that site. When off, you get a coloured letter instead and nothing is requested.</small>
        </div>
        {privacy && <Switch on={privacy.favicons} onChange={(v) => toggle({ favicons: v })} label="Show website icons" />}
      </div>
      <div className="prow">
        <div>
          <b>📅 Outlook calendar</b>
          <small className="muted">Only if you connect it below. This computer fetches your calendar link directly, and the link itself is never shown again or included in exports.</small>
        </div>
      </div>

      <h3 className="sub">Your copy of your data</h3>
      <div className="pactions">
        <a className="navbtn" href="/api/export" download>⬇ Export everything (JSON)</a>
        {!erasing && <button className="navbtn danger" onClick={() => setErasing(true)}>Erase everything…</button>}
      </div>
      {erasing && (
        <div className="erase">
          <p><b>This permanently deletes all your projects, notes, reviews, focus log, links and settings.</b> It can't be undone, so export first if you might want it back.</p>
          <div className="pactions">
            <input placeholder="Type DELETE to confirm" value={word} onChange={(e) => setWord(e.target.value)} aria-label="Type DELETE to confirm" />
            <button className="stopbtn" disabled={word !== 'DELETE'} onClick={erase}>Erase everything</button>
            <button className="ghost" onClick={() => { setErasing(false); setWord('') }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <small className="muted">
        Want to check this yourself? Open your browser's developer tools, go to the Network tab, and use the app. You will only see
        requests to this computer, plus the weather and icon requests if you switched those on. The code is open source (MIT).
      </small>
    </section>
  )
}

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
    <>
    <PrivacyCard />
    <section className="card">
      <h2>📅 Outlook calendar</h2>
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
      <p className="muted"><small>The link is stored in the database on this computer and never shown again. Treat it like a password: anyone with it can read your calendar.</small></p>
    </section>
    </>
  )
}
