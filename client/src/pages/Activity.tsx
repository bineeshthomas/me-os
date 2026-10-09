import { useCallback, useEffect, useState } from 'react'
import { api, type FocusPage } from '../api'
import { FocusTimer, fmtDuration, onFocusChanged, useElapsed, useFocusStatus } from '../focus'

const PAGE_SIZE = 10

const when = (s: { started_at: string; ended_at: string | null }) => {
  const a = new Date(s.started_at)
  const day = a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  const t = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${t(a)}${s.ended_at ? `–${t(new Date(s.ended_at))}` : ' – now'}`
}

// A short list of page numbers around the current one: 1 … 4 5 6 … 12
const pageList = (page: number, pages: number): (number | '…')[] => {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const sorted = [...want].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push('…'); out.push(n) })
  return out
}

function RunningSeconds({ startedAt }: { startedAt: string }) {
  const { offset } = useFocusStatus()
  return <>{fmtDuration(useElapsed(startedAt, offset))}</>
}

export default function Activity() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FocusPage | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api.focusSessions(page, PAGE_SIZE).then((d) => {
    // Deleting the last item on a page can leave it empty: step back to the page that now exists
    if (d.page !== page) setPage(d.page)
    setData(d)
  }).catch((e) => setError(e.message)), [page])

  useEffect(() => { load() }, [load])
  useEffect(() => onFocusChanged(load), [load])

  const rename = async (id: number, current: string) => {
    const next = prompt('Rename activity', current)?.trim()
    if (!next || next === current) return
    await api.renameFocus(id, next).catch((e) => setError(e.message))
    load()
  }
  const remove = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" from your log?`)) return
    await api.deleteFocus(id).catch((e) => setError(e.message))
    load()
  }

  return (
    <>
      <section className="card">
        <h2>⏱️ Focus time</h2>
        <FocusTimer />
      </section>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="head">
          <h2>Activity log</h2>
          {data && <small className="muted">{data.total} session{data.total === 1 ? '' : 's'}</small>}
        </div>
        {data && data.total === 0 && <p className="empty">No sessions yet. Start the timer above and focus on one thing.</p>}
        {data && data.items.length > 0 && (
          <table className="log">
            <thead><tr><th>Activity</th><th>When</th><th className="num">Time</th><th /></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className={s.running ? 'running' : ''}>
                  <td><button className="linklike" title="Rename" onClick={() => rename(s.id, s.activity)}>{s.activity}</button></td>
                  <td className="muted">{when(s)}</td>
                  <td className="num"><b>{s.running ? <>⏱ <RunningSeconds startedAt={s.started_at} /></> : fmtDuration(s.seconds)}</b></td>
                  <td className="num"><button className="ghost" aria-label={`Delete ${s.activity}`} onClick={() => remove(s.id, s.activity)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.pages > 1 && (
          <div className="pager" role="navigation" aria-label="Pagination">
            <button className="navbtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
            {pageList(data.page, data.pages).map((n, i) =>
              n === '…' ? <span key={`gap${i}`} className="muted">…</span> : (
                <button key={n} className={n === data.page ? 'navbtn cur' : 'navbtn'} aria-current={n === data.page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
              ),
            )}
            <button className="navbtn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next ›</button>
            <small className="muted">Page {data.page} of {data.pages}</small>
          </div>
        )}
      </section>
    </>
  )
}
