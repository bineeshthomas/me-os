import { useEffect, useState } from 'react'
import { api, type HistoryData, type HistoryDay } from '../api'

type Metric = 'rating' | 'energy' | 'stress'

const MOODS = ['😞', '🙁', '😐', '🙂', '😄']
const METRICS: Record<Metric, { label: string; min: number; max: number; goodHigh: boolean; hint: string }> = {
  rating: { label: 'Day rating', min: 1, max: 5, goodHigh: true, hint: '1 = rough, 5 = great' },
  energy: { label: 'Energy', min: 1, max: 5, goodHigh: true, hint: '1 = drained, 5 = full' },
  stress: { label: 'Stress', min: 0, max: 100, goodHigh: false, hint: '0 = calm, 100 = high' },
}

// Red = a worse day, green = a better one. Stress is the other way round, so low stress is green.
const color = (metric: Metric, v: number) => {
  const m = METRICS[metric]
  let t = (v - m.min) / (m.max - m.min)
  if (!m.goodHigh) t = 1 - t
  return `hsl(${Math.round(Math.max(0, Math.min(1, t)) * 120)} 62% 76%)`
}
const show = (metric: Metric, v: number) => (metric === 'rating' ? MOODS[v - 1] : String(v))

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthOf = (d: Date) => ymd(d).slice(0, 7)
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  return monthOf(new Date(y, m - 1 + n, 1))
}
const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}
const dayTitle = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}
const weekdayShort = (dow: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
const hm = (secs: number) => (secs >= 3600 ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m` : `${Math.floor(secs / 60)}m`)

export default function History() {
  const thisMonth = monthOf(new Date())
  const today = ymd(new Date())
  const [month, setMonth] = useState(thisMonth)
  const [metric, setMetric] = useState<Metric>('rating')
  const [data, setData] = useState<HistoryData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null); setError('')
    api.reviewHistory(month).then((d) => {
      if (cancelled) return
      setData(d)
      // Open the most recent review of the month
      const last = [...d.days].reverse().find((x) => x.completed) ?? d.days[d.days.length - 1]
      setSelected(last?.date ?? null)
    }).catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [month])

  const m = METRICS[metric]
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]))
  const value = (d?: HistoryDay) => (d ? d[metric] : null)

  // Month grid, Sunday first (same as the calendar)
  const [y, mo] = month.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ]

  const withValue = (data?.days ?? []).filter((d) => d[metric] !== null)
  const avg = withValue.length ? withValue.reduce((a, d) => a + (d[metric] as number), 0) / withValue.length : null
  const sorted = [...withValue].sort((a, b) => (a[metric] as number) - (b[metric] as number))
  const best = sorted.length ? (m.goodHigh ? sorted[sorted.length - 1] : sorted[0]) : null
  const worst = sorted.length ? (m.goodHigh ? sorted[0] : sorted[sorted.length - 1]) : null
  const dateShort = (date: string) => { const [yy, mm, dd] = date.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString([], { day: 'numeric', month: 'short' }) }

  const sel = selected ? byDate.get(selected) : undefined
  const reviews = [...(data?.days ?? [])].reverse()

  return (
    <>
      <section className="card head">
        <div className="daynav">
          <button className="navbtn" onClick={() => setMonth(shiftMonth(month, -1))}>‹ Previous</button>
          <button className="navbtn" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>Next ›</button>
          {month !== thisMonth && <button className="navbtn" onClick={() => setMonth(thisMonth)}>This month</button>}
          <strong>{monthTitle(month)}</strong>
        </div>
        <a className="navbtn" href="#review">← Daily Review</a>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="head">
          <h2>🗓️ Heatmap</h2>
          <div className="seg" role="tablist" aria-label="Metric">
            {(Object.keys(METRICS) as Metric[]).map((k) => (
              <button key={k} role="tab" aria-selected={metric === k} className={metric === k ? 'sel' : ''} onClick={() => setMetric(k)}>{METRICS[k].label}</button>
            ))}
          </div>
        </div>
        {!data ? <p className="empty">Loading…</p> : (
          <>
            <div className="hm" role="grid" aria-label={`${m.label} by day`}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <b key={d} className="hm-dow">{d}</b>)}
              {cells.map((date, i) => {
                if (!date) return <span key={`pad${i}`} />
                const d = byDate.get(date)
                const v = value(d)
                const future = date > today
                return (
                  <button
                    key={date}
                    className={`hm-cell${v !== null && v !== undefined ? ' has' : ''}${date === today ? ' today' : ''}${date === selected ? ' sel' : ''}${future ? ' future' : ''}`}
                    style={v !== null && v !== undefined ? { background: color(metric, v) } : undefined}
                    title={v !== null && v !== undefined ? `${dateShort(date)}: ${m.label} ${v}` : `${dateShort(date)}: no ${m.label.toLowerCase()} recorded`}
                    onClick={() => setSelected(date)}
                  >
                    <small>{Number(date.slice(8))}</small>
                    <span>{v !== null && v !== undefined ? show(metric, v) : ''}</span>
                  </button>
                )
              })}
            </div>
            <div className="hm-legend">
              <small className="muted">{m.hint}</small>
              <span className="hm-scale"><small>worse</small><i style={{ background: `linear-gradient(90deg, ${color(metric, m.goodHigh ? m.min : m.max)}, ${color(metric, (m.min + m.max) / 2)}, ${color(metric, m.goodHigh ? m.max : m.min)})` }} /><small>better</small></span>
            </div>
          </>
        )}
      </section>

      {data && (
        <section className="card">
          <h2>🔎 Patterns</h2>
          {withValue.length === 0 ? <p className="empty">No {m.label.toLowerCase()} recorded in {monthTitle(month)} yet.</p> : (
            <div className="stats pstats">
              <div className="card stat"><b>{withValue.length}</b><span>Days recorded</span></div>
              <div className="card stat"><b>{avg !== null ? (metric === 'stress' ? Math.round(avg) : avg.toFixed(1)) : '–'}</b><span>Average</span></div>
              <div className="card stat"><b>{best ? show(metric, best[metric] as number) : '–'}</b><span>Best · {best ? dateShort(best.date) : ''}</span></div>
              <div className="card stat"><b>{worst ? show(metric, worst[metric] as number) : '–'}</b><span>Toughest · {worst ? dateShort(worst.date) : ''}</span></div>
            </div>
          )}
          <h3 className="sub">{m.label} by weekday <small className="muted">(all your reviews)</small></h3>
          {data.weekday.filter((w) => w[metric] !== null).length < 2 ? <p className="empty">Needs a few more reviews to show a weekday pattern.</p> : (
            <div className="wd">
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                const row = data.weekday.find((w) => w.dow === dow)
                const v = row ? row[metric] : null
                const pct = v === null || v === undefined ? 0 : Math.max(6, ((v - m.min) / (m.max - m.min)) * 100)
                return (
                  <div key={dow} className="wd-col" title={row ? `${weekdayShort(dow)}: ${v ?? '–'} over ${row.n} day${row.n === 1 ? '' : 's'}` : `${weekdayShort(dow)}: no data`}>
                    <small>{v ?? '–'}</small>
                    <div className="wd-bar"><i style={{ height: `${pct}%`, background: v === null || v === undefined ? 'transparent' : color(metric, v) }} /></div>
                    <small>{weekdayShort(dow)}</small>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {data && (
        <section className="card">
          <h2>📖 {sel ? dayTitle(sel.date) : selected ? dayTitle(selected) : 'Pick a day'}</h2>
          {selected && !sel && (
            <p className="empty">No review for this day.{selected <= today && <> <a className="more" href={`#review:${selected}`}>Write it now</a></>}</p>
          )}
          {sel && <DayDetail day={sel} />}
        </section>
      )}

      {data && (
        <section className="card">
          <h2>🗂️ Reviews in {monthTitle(month)}</h2>
          {reviews.length === 0 ? <p className="empty">No reviews this month.</p> : (
            <ul className="rlist">
              {reviews.map((d) => (
                <li key={d.date}>
                  <button className={d.date === selected ? 'sel' : ''} onClick={() => { setSelected(d.date); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                    <b>{dateShort(d.date)}</b>
                    <span className="mood">{d.rating ? MOODS[d.rating - 1] : '·'}</span>
                    <small className="muted">energy {d.energy ?? '–'} · stress {d.stress ?? '–'}{!d.completed && ' · not finished'}</small>
                    <small className="snippet">{d.went_well || d.wins || d.learned}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function DayDetail({ day }: { day: HistoryDay }) {
  const fields: [string, string][] = [
    ['🏆 Wins', day.wins], ['👍 Went well', day.went_well], ['🚧 Got in the way', day.blocker],
    ['💡 Learned', day.learned], ['🙏 Grateful for', day.gratitude], ['🧠 Brain dump', day.brain_dump],
  ]
  return (
    <>
      <div className="chips">
        <span className="chip">{day.rating ? `${MOODS[day.rating - 1]} Day ${day.rating}/5` : 'No rating'}</span>
        <span className="chip">⚡ Energy {day.energy ?? '–'}/5</span>
        <span className="chip">😮‍💨 Stress {day.stress ?? '–'}</span>
        {day.habits_done > 0 && <span className="chip">💪 {day.habits_done} check-in{day.habits_done === 1 ? '' : 's'}</span>}
        {day.focus_seconds > 0 && <span className="chip">⏱️ {hm(day.focus_seconds)} focused</span>}
        {!day.completed && <span className="chip warn">Review not finished</span>}
      </div>
      {fields.filter(([, v]) => v.trim()).map(([label, v]) => (
        <div key={label} className="dd"><small className="muted">{label}</small><p>{v}</p></div>
      ))}
      {day.priorities.length > 0 && (
        <div className="dd"><small className="muted">🎯 Planned for the next day</small><ol className="top3">{day.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol></div>
      )}
      <a className="navbtn" href={`#review:${day.date}`}>Open in Daily Review</a>
    </>
  )
}
