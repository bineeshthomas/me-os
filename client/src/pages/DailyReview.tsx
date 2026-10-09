import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, type CalEvent, type ReviewDay, type ReviewRow, type WeekSummary } from '../api'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}
const prettyDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

const relative = (date: string, today: string) =>
  date === today ? 'Today · ' : date === addDays(today, -1) ? 'Yesterday · ' : ''

// Collapsible sections: open/closed state is remembered between visits
const SECTION_IDS = ['checkins', 'wins', 'notfinished', 'goals', 'reflect', 'tomorrow', 'close', 'week']
const CollapseCtx = createContext<{ closed: Record<string, boolean>; toggle: (id: string) => void }>({ closed: {}, toggle: () => {} })

function Section({ id, title, hint, extra, children }: { id: string; title: string; hint?: string; extra?: ReactNode; children: ReactNode }) {
  const { closed, toggle } = useContext(CollapseCtx)
  const isClosed = !!closed[id]
  return (
    <section className={isClosed ? 'card rv-sec closed' : 'card rv-sec'}>
      <div className="sec-head">
        <h2>
          <button className="sec-toggle" aria-expanded={!isClosed} onClick={() => toggle(id)}>
            <span className="chev" aria-hidden>{isClosed ? '▸' : '▾'}</span>{title}
          </button>
        </h2>
        {isClosed && hint && <small className="muted sec-hint">{hint}</small>}
        {!isClosed && extra && <span className="sec-extra">{extra}</span>}
      </div>
      {!isClosed && <div className="sec-body">{children}</div>}
    </section>
  )
}

const KIND_ICON: Record<string, string> = { task: '✅', call: '📞', email: '✉️', message: '💬', reminder: '🔔' }
const MOODS = ['😞', '🙁', '😐', '🙂', '😄']
const STEPS = [1, 2, 5, 10]

type Fields = {
  wins: string; went_well: string; blocker: string; learned: string; brain_dump: string; gratitude: string
  priorities: string[]; rating: number | null; energy: number | null; stress: number
}

const toFields = (r: ReviewRow | null, stress: number): Fields => ({
  wins: r?.wins ?? '', went_well: r?.went_well ?? '', blocker: r?.blocker ?? '', learned: r?.learned ?? '',
  brain_dump: r?.brain_dump ?? '', gratitude: r?.gratitude ?? '',
  priorities: [0, 1, 2].map((i) => r?.priorities[i] ?? ''), rating: r?.rating ?? null, energy: r?.energy ?? null,
  stress: r?.stress ?? stress,
})

export default function DailyReview() {
  const today = ymd(new Date())
  const [date, setDate] = useState(today)
  const [day, setDay] = useState<ReviewDay | null>(null)
  const [week, setWeek] = useState<WeekSummary | null>(null)
  const [f, setF] = useState<Fields | null>(null)
  const [tomorrowMeetings, setTomorrowMeetings] = useState<CalEvent[]>([])
  const [error, setError] = useState('')
  const [rolledOver, setRolledOver] = useState<number | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('rv-closed') ?? '{}') } catch { return {} }
  })
  const updateClosed = (next: Record<string, boolean>) => {
    setClosed(next)
    try { localStorage.setItem('rv-closed', JSON.stringify(next)) } catch { /* ignore */ }
  }
  const toggle = (id: string) => updateClosed({ ...closed, [id]: !closed[id] })
  const setAll = (value: boolean) => updateClosed(Object.fromEntries(SECTION_IDS.map((id) => [id, value])))

  // Refetch what other cards depend on, without touching what's being typed
  const refresh = useCallback(async () => {
    try {
      const [d, w] = await Promise.all([api.reviewDay(date), api.weekSummary(date)])
      setDay(d); setWeek(w)
    } catch (e) { setError((e as Error).message) }
  }, [date])

  useEffect(() => {
    let cancelled = false
    setF(null); setRolledOver(null)
    ;(async () => {
      try {
        const [d, w, s] = await Promise.all([api.reviewDay(date), api.weekSummary(date), api.settings()])
        if (cancelled) return
        setDay(d); setWeek(w); setF(toFields(d.review, s.stress))
        const [y, m, dd] = addDays(date, 1).split('-').map(Number)
        const r = await api.calendarEvents(new Date(y, m - 1, dd), new Date(y, m - 1, dd + 1)).catch(() => ({ events: [] as CalEvent[] }))
        if (!cancelled) setTomorrowMeetings(r.events)
      } catch (e) { if (!cancelled) setError((e as Error).message) }
    })()
    return () => { cancelled = true }
  }, [date])

  if (!day || !f) return error ? <p className="error">{error}</p> : <p className="empty">Loading…</p>

  const completed = !!day.review?.completed_at
  const set = (patch: Partial<Fields>) => setF({ ...f, ...patch })
  const save = (patch: Partial<ReviewRow> & { complete?: boolean }) =>
    api.saveReview(date, patch).then((r) => {
      if (patch.complete === true) setRolledOver(r.rolled_over)
      if (patch.complete === false) setRolledOver(null)
      return refresh()
    }).catch((e) => setError(e.message))

  const textField = (key: 'wins' | 'went_well' | 'blocker' | 'learned' | 'brain_dump', placeholder: string, rows = 2) => (
    <textarea
      rows={rows} placeholder={placeholder} value={f[key]}
      onChange={(e) => set({ [key]: e.target.value })}
      onBlur={() => save({ [key]: f[key] })}
    />
  )

  return (
    <CollapseCtx.Provider value={{ closed, toggle }}>
      {error && <p className="error">{error}</p>}

      <section className="card rv-head">
        <div className="daynav">
          <button className="navbtn" onClick={() => setDate(addDays(date, -1))}>‹ Previous day</button>
          <button className="navbtn" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>Next day ›</button>
          {date !== today && <button className="navbtn" onClick={() => setDate(today)}>Today</button>}
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Review date" />
          <strong>{relative(date, today)}{prettyDate(date)}</strong>
        </div>
        <div className="badges">
          <span className="badge">🔥 {day.review_streak} night streak</span>
          <span className="badge">⭐ {day.points_today} pts today</span>
          {day.focus_seconds > 0 && <span className="badge">⏱️ {Math.floor(day.focus_seconds / 3600) > 0 ? `${Math.floor(day.focus_seconds / 3600)}h ` : ''}{Math.floor((day.focus_seconds % 3600) / 60)}m focused</span>}
          <button className="navbtn" onClick={() => setAll(true)}>Collapse all</button>
          <button className="navbtn" onClick={() => setAll(false)}>Expand all</button>
        </div>
      </section>

      <CheckIns day={day} date={date} refresh={refresh} setError={setError} />

      <Section id="wins" title="🏆 Today's wins" hint={`${day.wins.length} done`}>
        {day.wins.length > 0 && (
          <div className="chips">{day.wins.map((w, i) => <span key={i} className="chip">✓ {w}</span>)}</div>
        )}
        {textField('wins', day.wins.length ? 'Anything else you’re proud of?' : 'What did you get done or feel good about today?')}
      </Section>

      <OpenItems day={day} />

      <Goals day={day} date={date} refresh={refresh} setError={setError} />

      <Section id="reflect" title="🪞 Reflect">
        <label>What went well?{textField('went_well', 'One or two lines…')}</label>
        <label>What got in the way?{textField('blocker', 'The blocker, so you can fix it tomorrow…')}</label>
        <label>One thing I learned{textField('learned', 'A lesson or something to do differently…')}</label>
      </Section>

      <Section id="tomorrow" title="🎯 Tomorrow" hint={`${f.priorities.filter(Boolean).length} of 3 priorities set`}>
        <p className="muted">Pick your top 3. They show on the dashboard tomorrow. Make #1 your first task.</p>
        {f.priorities.map((p, i) => (
          <input
            key={i} placeholder={`Priority ${i + 1}`} value={p} aria-label={`Priority ${i + 1}`}
            onChange={(e) => set({ priorities: f.priorities.map((x, j) => (j === i ? e.target.value : x)) })}
            onBlur={() => save({ priorities: f.priorities })}
          />
        ))}
        <h3 className="sub">Tomorrow's meetings</h3>
        {tomorrowMeetings.length === 0 && <p className="empty">Nothing on the calendar (or Outlook isn't connected).</p>}
        <ul className="steps">
          {tomorrowMeetings.filter((e) => !e.allDay).map((e) => (
            <li key={e.id}><span><span className="outlook-tag">Outlook</span>{e.title} <small>· {new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span></li>
          ))}
        </ul>
      </Section>

      <Section id="close" title="🌙 Close the day" hint={completed ? 'Review complete ✓' : 'Not finished yet'}>
        <label>Brain dump <small className="muted">(get it out of your head so it doesn't keep you awake)</small>{textField('brain_dump', 'Anything on your mind…', 3)}</label>
        <div className="rv-row">
          <div>
            <small className="muted">How was the day?</small>
            <div className="scale" role="radiogroup" aria-label="Day rating">
              {MOODS.map((m, i) => (
                <button key={i} role="radio" aria-checked={f.rating === i + 1} className={f.rating === i + 1 ? 'sel' : ''}
                  onClick={() => { set({ rating: i + 1 }); save({ rating: i + 1 }) }}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <small className="muted">Energy</small>
            <div className="scale" role="radiogroup" aria-label="Energy">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={f.energy === n} className={f.energy === n ? 'sel' : ''}
                  onClick={() => { set({ energy: n }); save({ energy: n }) }}>{n}</button>
              ))}
            </div>
          </div>
          <div className="grow">
            <small className="muted">Stress: {f.stress}</small>
            <input type="range" min={0} max={100} value={f.stress} aria-label="Stress today"
              onChange={(e) => set({ stress: Number(e.target.value) })}
              onPointerUp={() => save({ stress: f.stress })} onKeyUp={() => save({ stress: f.stress })} />
          </div>
        </div>
        <label>One thing I'm grateful for
          <input placeholder="Optional" value={f.gratitude} onChange={(e) => set({ gratitude: e.target.value })}
            onBlur={() => save({ gratitude: f.gratitude })} />
        </label>

        {completed ? (
          <div className="done-banner">
            ✨ Review complete. {day.review_streak > 1 ? `${day.review_streak} nights in a row!` : 'Nice start.'}
            {rolledOver ? ` ${rolledOver} unfinished item${rolledOver > 1 ? 's' : ''} moved to tomorrow.` : ''} Sleep well 🌙
            <button className="ghost" onClick={() => save({ complete: false })}>Reopen</button>
          </div>
        ) : (
          <button className="primary finish" onClick={() => save({ complete: true })}>Finish review 🌙</button>
        )}
      </Section>

      {week && <WeekCard week={week} />}
    </CollapseCtx.Provider>
  )
}

function CheckIns({ day, date, refresh, setError }: { day: ReviewDay; date: string; refresh: () => void; setError: (m: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [points, setPoints] = useState('10')

  const toggle = (id: number, done: boolean) => api.setHabit(date, id, done).then(refresh).catch((e) => setError(e.message))
  const add = async (e: FormEvent) => {
    e.preventDefault()
    await api.createHabit(name, icon, Number(points) || 10).catch((er) => setError(er.message))
    setName(''); setIcon(''); setPoints('10'); setAdding(false); refresh()
  }

  return (
    <Section id="checkins" title="💪 Check-ins" hint={`${day.habits.filter((h) => h.done).length}/${day.habits.length} done`}
      extra={<button className="ghost" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add habit'}</button>}>
      <div className="habits">
        {day.habits.map((h) => (
          <div key={h.id} className="habit-wrap">
            <button className={h.done ? 'habit done' : 'habit'} aria-pressed={h.done} title={`${h.name} · +${h.points} pts${h.streak ? ` · ${h.streak}-day streak` : ''}`} onClick={() => toggle(h.id, !h.done)}>
              <span className="hicon">{h.done ? '✅' : h.icon}</span>
              <b>{h.name}</b>
              <small>{h.done ? 'Done!' : `+${h.points}`}{h.streak > 0 && <em title={`${h.streak}-day streak`}> 🔥{h.streak}</em>}</small>
            </button>
            <button className="habit-x ghost" aria-label={`Delete ${h.name}`}
              onClick={() => confirm(`Delete "${h.name}" and its history?`) && api.deleteHabit(h.id).then(refresh)}>✕</button>
          </div>
        ))}
      </div>
      {day.habits.length === 0 && !adding && <p className="empty">No check-ins yet. Add one, like "Meditated".</p>}
      {adding && (
        <form className="linkform" onSubmit={add}>
          <input className="emoji" placeholder="⭐" maxLength={4} value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Emoji" />
          <input required placeholder="Name (e.g. Meditated)" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" min={1} className="pts" value={points} onChange={(e) => setPoints(e.target.value)} aria-label="Points" />
          <button className="primary">Add</button>
        </form>
      )}
    </Section>
  )
}

function OpenItems({ day }: { day: ReviewDay }) {
  if (day.open_items.length === 0) return null
  return (
    <Section id="notfinished" title="📋 Not finished" hint={`${day.open_items.length} item${day.open_items.length === 1 ? '' : 's'}`}>
      <p className="muted">These carry over to tomorrow automatically when you finish the review.</p>
      <ul className="steps">
        {day.open_items.map((i) => (
          <li key={i.id}>
            <span>{KIND_ICON[i.kind]} {i.title}{i.due_at && <small> · due {new Date(i.due_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small>}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Goals({ day, date, refresh, setError }: { day: ReviewDay; date: string; refresh: () => void; setError: (m: string) => void }) {
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [target, setTarget] = useState('100')
  const [cheer, setCheer] = useState('')

  const addPoints = async (goalId: number, pts: number) => {
    try {
      const r = await api.addGoalEntry(goalId, date, pts, notes[goalId] ?? '')
      setNotes({ ...notes, [goalId]: '' })
      setCheer(r.achieved ? '🎉 Goal achieved! Amazing work.' : `+${pts} toward your goal. Every tiny step counts.`)
      refresh()
    } catch (e) { setError((e as Error).message) }
  }
  const create = async (e: FormEvent) => {
    e.preventDefault()
    await api.createGoal(title, why, Number(target) || 100).catch((er) => setError(er.message))
    setTitle(''); setWhy(''); setTarget('100'); setAdding(false); refresh()
  }

  return (
    <Section id="goals" title="🌱 Goals: a tiny step for a big goal" hint={`${day.goals.length} goal${day.goals.length === 1 ? '' : 's'}`}
      extra={<button className="ghost" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New goal'}</button>}>
      {cheer && <p className="ok" role="status">{cheer}</p>}
      {adding && (
        <form className="form" onSubmit={create}>
          <input required placeholder="Goal (e.g. Learn Spanish)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input placeholder="Why does it matter? (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <label className="inline">Points to reach it <input type="number" min={1} className="pts" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <button className="primary">Create goal</button>
        </form>
      )}
      {day.goals.length === 0 && !adding && <p className="empty">No goals yet. Add one big thing you want, then move it forward a little each night.</p>}
      {day.goals.map((g) => {
        const pct = Math.min(100, Math.round((g.total / g.target_points) * 100))
        const achieved = !!g.achieved_at
        return (
          <div key={g.id} className="goal">
            <div className="head">
              <b>{achieved && '🏅 '}{g.title}</b>
              <button className="ghost" aria-label={`Delete ${g.title}`}
                onClick={() => confirm(`Delete goal "${g.title}" and its history?`) && api.deleteGoal(g.id).then(refresh)}>✕</button>
            </div>
            {g.why && <small className="muted">Why: {g.why}</small>}
            <div className="pmeta"><div className="bar"><i style={{ width: `${pct}%` }} /></div><small>{g.total}/{g.target_points} pts · {pct}%</small></div>
            {achieved ? <p className="ok">🎉 Achieved!</p> : (
              <>
                <p className="ask">Anything to add toward this goal today?</p>
                <input placeholder="What did you do? (optional)" value={notes[g.id] ?? ''} onChange={(e) => setNotes({ ...notes, [g.id]: e.target.value })} />
                <div className="steps-row">
                  {STEPS.map((n) => <button key={n} className="app-btn" onClick={() => addPoints(g.id, n)}>+{n}</button>)}
                  <small className="muted">1 = tiny step · 5 = solid effort · 10 = big push</small>
                </div>
              </>
            )}
            {g.today.length > 0 && (
              <ul className="steps">
                {g.today.map((e) => (
                  <li key={e.id}><span>+{e.points} pts{e.note && <small> · {e.note}</small>}</span>
                    <button className="ghost" aria-label="Remove entry" onClick={() => api.deleteGoalEntry(e.id).then(refresh)}>✕</button></li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </Section>
  )
}

function WeekCard({ week }: { week: WeekSummary }) {
  const dow = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' }) }
  return (
    <Section id="week" title="📈 This week" hint={`${week.reviews_done}/7 reviews · ${week.points_total} pts`}>
      <div className="week">
        {week.days.map((d) => (
          <div key={d.date} className={d.reviewed ? 'wday ok' : 'wday'} title={`${d.date}: ${d.points} pts`}>
            <small>{dow(d.date)}</small>
            <span>{d.reviewed ? (d.rating ? ['😞', '🙁', '😐', '🙂', '😄'][d.rating - 1] : '✓') : '·'}</span>
            <small>{d.points} pts</small>
          </div>
        ))}
      </div>
      <div className="stats wstats">
        <div className="card stat"><b>{week.reviews_done}/7</b><span>Reviews done</span></div>
        <div className="card stat"><b>{week.avg_rating ?? '–'}</b><span>Avg day rating</span></div>
        <div className="card stat"><b>{week.avg_stress ?? '–'}</b><span>Avg stress</span></div>
        <div className="card stat"><b>{week.points_total}</b><span>Points</span></div>
      </div>
      {week.habits.length > 0 && (
        <div className="chips">{week.habits.map((h) => <span key={h.id} className="chip">{h.icon} {h.name}: {h.count}/7</span>)}</div>
      )}
      {week.goals.length > 0 && (
        <div className="chips">{week.goals.map((g) => <span key={g.id} className="chip">🌱 {g.title}: +{g.points} pts</span>)}</div>
      )}
    </Section>
  )
}
