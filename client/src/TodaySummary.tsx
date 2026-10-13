import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Works where the modern clipboard API isn't available (older browsers, some non-secure pages)
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const uses12h = () => !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12

// "Today's summary": one click puts a short plain-text briefing on the clipboard, to paste into a phone note or chat
export function TodaySummary() {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const canShare = typeof navigator.share === 'function'

  const fetchText = useCallback(async () => (await api.todaySummary(zone(), uses12h())).text, [])

  // Keep a fresh copy ready (for the preview and for Share, which must run straight from the click)
  const refresh = useCallback(() => { fetchText().then(setText).catch(() => {}) }, [fetchText])
  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const t = setInterval(refresh, 120_000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [refresh])

  const flash = (s: 'copied' | 'error') => {
    setStatus(s)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 3500)
  }

  const copy = async () => {
    try {
      const pending = fetchText() // always the latest data, not what was loaded a while ago
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': pending.then((t) => new Blob([t], { type: 'text/plain' })) })])
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(await pending)
      } else if (!legacyCopy(await pending)) {
        throw new Error('copy failed')
      }
      setText(await pending)
      flash('copied')
    } catch {
      // Last resort: show the text so it can be selected by hand
      try { setText(await fetchText()); setOpen(true) } catch { /* ignore */ }
      flash('error')
    }
  }

  const share = async () => {
    try { await navigator.share({ title: "Today's summary", text }) } catch { /* cancelled, or not allowed */ }
  }

  return (
    <section className="card sumcard">
      <div className="sumrow">
        <div className="sumtitle">
          <b>☀️ Today's summary</b>
          <small className="muted">Copy it, then paste it into your phone's notes or a chat</small>
        </div>
        <div className="sumbtns">
          <button className="primary" onClick={copy}>{status === 'copied' ? '✓ Copied' : '📋 Copy'}</button>
          {canShare && text && <button className="navbtn" onClick={share}>Share…</button>}
          <button className="navbtn" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) refresh() }}>{open ? 'Hide' : 'Preview'}</button>
        </div>
      </div>
      <p className="sumstatus" role="status" aria-live="polite">
        {status === 'copied' && 'Copied to your clipboard.'}
        {status === 'error' && "Couldn't copy automatically. The text is shown below: select it and copy."}
      </p>
      {open && <pre className="sumtext">{text || 'Loading…'}</pre>}
    </section>
  )
}
