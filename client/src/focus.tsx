import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type FocusStatus } from './api'

// Anything that starts or stops a session tells everyone else (the header pill, the dashboard card, the Activity page)
const CHANGED = 'focus-changed'
export const notifyFocusChanged = () => window.dispatchEvent(new Event(CHANGED))
export const onFocusChanged = (fn: () => void) => {
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}

export const fmtClock = (secs: number) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const fmtDuration = (secs: number) => {
  if (secs < 60) return `${secs}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function useFocusStatus() {
  const [status, setStatus] = useState<FocusStatus | null>(null)
  const [offset, setOffset] = useState(0) // server clock minus this machine's clock
  const reload = useCallback(
    () => api.focusStatus().then((s) => { setStatus(s); setOffset(new Date(s.now).getTime() - Date.now()) }).catch(() => {}),
    [],
  )
  useEffect(() => {
    reload()
    const off = onFocusChanged(reload)
    const t = setInterval(reload, 60_000)
    return () => { off(); clearInterval(t) }
  }, [reload])
  return { status, offset, reload }
}

// Seconds since the session started, ticking every second. Based on the start time, so a reload or a long absence is fine.
export function useElapsed(startedAt: string | undefined, offset: number) {
  const calc = () => (startedAt ? Math.max(0, Math.floor((Date.now() + offset - new Date(startedAt).getTime()) / 1000)) : 0)
  const [secs, setSecs] = useState(calc)
  useEffect(() => {
    setSecs(calc())
    if (!startedAt) return
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [startedAt, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  return secs
}

export function FocusTimer() {
  const { status, offset, reload } = useFocusStatus()
  const [activity, setActivity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const running = status?.running ?? null
  const elapsed = useElapsed(running?.started_at, offset)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await fn(); await reload(); notifyFocusChanged() } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const start = (e: FormEvent) => { e.preventDefault(); act(async () => { await api.focusStart(activity); setActivity('') }) }

  if (!status) return <p className="empty">Loading…</p>

  return (
    <div className="focus">
      {running ? (
        <div className="focus-run">
          <small className="muted">Focusing on</small>
          <b className="focus-activity">{running.activity}</b>
          <div className="focus-clock" role="timer" aria-live="off">{fmtClock(elapsed)}</div>
          <button className="stopbtn" disabled={busy} onClick={() => act(() => api.focusStop())}>■ Stop</button>
          <small className="muted">One task. Phone down.</small>
        </div>
      ) : (
        <form className="focus-start" onSubmit={start}>
          <input required maxLength={200} placeholder="What will you focus on?" value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="Activity" />
          <button className="primary" disabled={busy}>▶ Start</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <small className="muted focus-totals">
        Today {fmtDuration(status.today_seconds)} · {status.today_sessions} session{status.today_sessions === 1 ? '' : 's'} · This week {fmtDuration(status.week_seconds)}
      </small>
    </div>
  )
}

// Header pill: visible on every page while a session runs, links to the Activity page
export function FocusPill() {
  const { status, offset } = useFocusStatus()
  const running = status?.running ?? null
  const elapsed = useElapsed(running?.started_at, offset)

  useEffect(() => {
    if (!running) return
    const base = document.title
    document.title = `⏱ ${fmtClock(elapsed)} · ${running.activity}`
    return () => { document.title = base }
  }, [running, elapsed])

  if (!running) return null
  return (
    <a href="#activity" className="pill focus-pill" title={`Focusing on: ${running.activity}`}>
      <span className="dot" />⏱ {fmtClock(elapsed)} <span className="fp-name">{running.activity}</span>
    </a>
  )
}
