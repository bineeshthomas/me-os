export interface Step { id: number; title: string; done: boolean; position: number; due_date: string | null }
export type Category = 'work' | 'personal'
export interface Project { id: number; title: string; description: string | null; category: Category; due_date: string | null; created_at: string; updated_at: string; steps: Step[]; notes: ProjectNote[] }
export interface Note {
  id: number; title: string; body: string; tags: string[]; pinned: boolean; created_at: string; updated_at: string
  project_id: number | null; project_title: string | null; project_category: Category | null
}
export interface NotePatch { title?: string; body?: string; tags?: string[]; pinned?: boolean; touch?: boolean; project_id?: number | null }
export interface NoteDraft { title: string; body: string; tags: string[]; pinned: boolean; project_id: number | null }
export interface ProjectNote { id: number; title: string; pinned: boolean; updated_at: string }
export type Kind = 'task' | 'call' | 'email' | 'message' | 'meeting' | 'reminder'
export type MessageApp = 'whatsapp' | 'teams'
export interface Item { id: number; kind: Kind; title: string; due_at: string | null; done: boolean; completed_at: string | null; app: MessageApp | null }
export interface SearchHit { type: 'project' | 'step' | 'note' | 'link' | Kind; id: number; title: string; snippet: string | null }
export interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null }
export interface PrivacySettings { weather: boolean; favicons: boolean }
export interface CalendarStatus { connected: boolean; host?: string }
export interface QuickLink { id: number; name: string; url: string }
export interface Habit { id: number; name: string; icon: string; points: number; done: boolean; streak: number }
export interface GoalEntry { id: number; goal_id: number; points: number; note: string }
export interface Goal { id: number; title: string; why: string; target_points: number; total: number; achieved_at: string | null; today: GoalEntry[] }
export interface ReviewRow {
  date: string; wins: string; went_well: string; blocker: string; learned: string; priorities: string[]
  brain_dump: string; gratitude: string; rating: number | null; energy: number | null; stress: number | null; completed_at: string | null
}
export interface OpenItem { id: number; kind: Kind; title: string; due_at: string | null; app: MessageApp | null }
export interface ReviewDay {
  date: string; review: ReviewRow | null; habits: Habit[]; goals: Goal[]; wins: string[]
  open_items: OpenItem[]; points_today: number; focus_seconds: number; review_streak: number
}
export interface WeekSummary {
  start: string; end: string; reviews_done: number; review_streak: number; avg_rating: number | null; avg_energy: number | null
  avg_stress: number | null; points_total: number
  days: { date: string; reviewed: boolean; rating: number | null; habits_done: number; points: number }[]
  habits: { id: number; name: string; icon: string; count: number }[]
  goals: { id: number; title: string; points: number }[]
}
export interface Focus { priorities: string[] }
export interface Deadline {
  type: 'project' | 'step'; id: number; project_id: number; title: string; project_title: string
  category: Category; due_date: string; done: boolean
}
export interface FocusRunning { id: number; activity: string; started_at: string }
export interface FocusStatus { now: string; running: FocusRunning | null; today_seconds: number; today_sessions: number; week_seconds: number }
export interface FocusSession { id: number; activity: string; started_at: string; ended_at: string | null; running: boolean; seconds: number }
export interface FocusPage { items: FocusSession[]; total: number; page: number; pages: number; page_size: number }
export interface HistoryDay {
  date: string; rating: number | null; energy: number | null; stress: number | null; completed: boolean
  wins: string; went_well: string; blocker: string; learned: string; gratitude: string; brain_dump: string
  priorities: string[]; habits_done: number; focus_seconds: number
}
export interface HistoryData {
  month: string; days: HistoryDay[]; months_with_data: string[]
  weekday: { dow: number; n: number; rating: number | null; energy: number | null; stress: number | null }[]
}
export interface Dashboard {
  counts: { projects: number; notes: number; open_steps: number; done_steps: number }
  projects: Project[]
  notes: Note[]
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().then((b) => b?.error as string | undefined, () => undefined)
    throw new Error(msg ?? `${method} ${path} failed (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  dashboard: () => req<Dashboard>('GET', '/dashboard'),
  projects: () => req<Project[]>('GET', '/projects'),
  createProject: (title: string, description: string, steps: string[], category: Category, due_date: string | null) =>
    req<Project>('POST', '/projects', { title, description, steps, category, due_date }),
  deleteProject: (id: number) => req<void>('DELETE', `/projects/${id}`),
  addStep: (projectId: number, title: string) => req<Step>('POST', `/projects/${projectId}/steps`, { title }),
  updateProject: (id: number, patch: { title?: string; description?: string; category?: Category; due_date?: string | null }) =>
    req<Project>('PATCH', `/projects/${id}`, patch),
  renameStep: (id: number, title: string) => req<Step>('PATCH', `/steps/${id}`, { title }),
  setStepDue: (id: number, due_date: string | null) => req<Step>('PATCH', `/steps/${id}`, { due_date }),
  reorderSteps: (projectId: number, ids: number[]) => req<void>('PUT', `/projects/${projectId}/steps/order`, { ids }),
  deadlines: (from: string, to: string) => req<Deadline[]>('GET', `/deadlines?from=${from}&to=${to}`),
  setStepDone: (id: number, done: boolean) => req<Step>('PATCH', `/steps/${id}`, { done }),
  deleteStep: (id: number) => req<void>('DELETE', `/steps/${id}`),
  items: () => req<Item[]>('GET', '/items'),
  createItem: (kind: Kind, title: string, due_at: string | null, app?: MessageApp) =>
    req<Item>('POST', '/items', { kind, title, due_at, app }),
  setItemDone: (id: number, done: boolean) => req<Item>('PATCH', `/items/${id}`, { done }),
  deleteItem: (id: number) => req<void>('DELETE', `/items/${id}`),
  search: (q: string) => req<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  settings: () => req<{ calendar: CalendarStatus; stress: number; privacy: PrivacySettings }>('GET', '/settings'),
  savePrivacy: (patch: Partial<PrivacySettings>) => req<PrivacySettings>('PUT', '/settings/privacy', patch),
  eraseEverything: () => req<{ erased: boolean }>('POST', '/erase', { confirm: 'DELETE' }),
  saveStress: (level: number) => req<{ stress: number }>('PUT', '/settings/stress', { level }),
  saveCalendar: (url: string) => req<{ calendar: CalendarStatus }>('PUT', '/settings/calendar', { url }),
  removeCalendar: () => req<void>('DELETE', '/settings/calendar'),
  calendarEvents: (from: Date, to: Date) =>
    req<{ connected: boolean; events: CalEvent[] }>('GET', `/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`),
  links: () => req<QuickLink[]>('GET', '/links'),
  createLink: (name: string, url: string) => req<QuickLink>('POST', '/links', { name, url }),
  updateLink: (id: number, name: string, url: string) => req<QuickLink>('PATCH', `/links/${id}`, { name, url }),
  deleteLink: (id: number) => req<void>('DELETE', `/links/${id}`),
  reviewDay: (date: string) => req<ReviewDay>('GET', `/review/${date}`),
  saveReview: (date: string, patch: Partial<ReviewRow> & { complete?: boolean }) =>
    req<ReviewRow & { rolled_over: number }>('PUT', `/review/${date}`, patch),
  reviewHistory: (month: string) => req<HistoryData>('GET', `/review-history?month=${month}`),
  weekSummary: (date: string) => req<WeekSummary>('GET', `/review-summary/${date}`),
  focus: () => req<Focus>('GET', '/focus'),
  setHabit: (date: string, id: number, done: boolean) => req<void>('PUT', `/review/${date}/habits/${id}`, { done }),
  createHabit: (name: string, icon: string, points: number) => req<unknown>('POST', '/habits', { name, icon, points }),
  deleteHabit: (id: number) => req<void>('DELETE', `/habits/${id}`),
  createGoal: (title: string, why: string, target_points: number) => req<unknown>('POST', '/goals', { title, why, target_points }),
  deleteGoal: (id: number) => req<void>('DELETE', `/goals/${id}`),
  addGoalEntry: (id: number, date: string, points: number, note: string) =>
    req<{ achieved: boolean }>('POST', `/goals/${id}/entries`, { date, points, note }),
  deleteGoalEntry: (id: number) => req<void>('DELETE', `/goal-entries/${id}`),
  todaySummary: (tz: string, h12: boolean) =>
    req<{ date: string; text: string; sections: number }>('GET', `/summary/today?tz=${encodeURIComponent(tz)}&h12=${h12 ? 1 : 0}`),
  focusStatus: () => req<FocusStatus>('GET', '/focus/status'),
  focusStart: (activity: string) => req<FocusRunning>('POST', '/focus/start', { activity }),
  focusStop: () => req<FocusSession>('POST', '/focus/stop'),
  focusSessions: (page: number, pageSize = 10) => req<FocusPage>('GET', `/focus/sessions?page=${page}&page_size=${pageSize}`),
  renameFocus: (id: number, activity: string) => req<void>('PATCH', `/focus/sessions/${id}`, { activity }),
  deleteFocus: (id: number) => req<void>('DELETE', `/focus/sessions/${id}`),
  notes: () => req<Note[]>('GET', '/notes'),
  note: (id: number) => req<Note>('GET', `/notes/${id}`),
  createNote: (note: NoteDraft) => req<Note>('POST', '/notes', note),
  updateNote: (id: number, patch: NotePatch) => req<Note>('PATCH', `/notes/${id}`, patch),
  deleteNote: (id: number) => req<void>('DELETE', `/notes/${id}`),
}
