export interface Step { id: number; title: string; done: boolean; position: number }
export interface Project { id: number; title: string; description: string | null; created_at: string; updated_at: string; steps: Step[] }
export interface Note { id: number; title: string; body: string; created_at: string; updated_at: string }
export type Kind = 'task' | 'call' | 'email' | 'message' | 'meeting' | 'reminder'
export type MessageApp = 'whatsapp' | 'teams'
export interface Item { id: number; kind: Kind; title: string; due_at: string | null; done: boolean; completed_at: string | null; app: MessageApp | null }
export interface SearchHit { type: 'project' | 'step' | 'note' | 'link' | Kind; id: number; title: string; snippet: string | null }
export interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null }
export interface CalendarStatus { connected: boolean; host?: string }
export interface QuickLink { id: number; name: string; url: string }
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
  createProject: (title: string, description: string, steps: string[]) =>
    req<Project>('POST', '/projects', { title, description, steps }),
  deleteProject: (id: number) => req<void>('DELETE', `/projects/${id}`),
  addStep: (projectId: number, title: string) => req<Step>('POST', `/projects/${projectId}/steps`, { title }),
  updateProject: (id: number, title: string, description: string) => req<Project>('PATCH', `/projects/${id}`, { title, description }),
  renameStep: (id: number, title: string) => req<Step>('PATCH', `/steps/${id}`, { title }),
  setStepDone: (id: number, done: boolean) => req<Step>('PATCH', `/steps/${id}`, { done }),
  deleteStep: (id: number) => req<void>('DELETE', `/steps/${id}`),
  items: () => req<Item[]>('GET', '/items'),
  createItem: (kind: Kind, title: string, due_at: string | null, app?: MessageApp) =>
    req<Item>('POST', '/items', { kind, title, due_at, app }),
  setItemDone: (id: number, done: boolean) => req<Item>('PATCH', `/items/${id}`, { done }),
  deleteItem: (id: number) => req<void>('DELETE', `/items/${id}`),
  search: (q: string) => req<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  settings: () => req<{ calendar: CalendarStatus; stress: number }>('GET', '/settings'),
  saveStress: (level: number) => req<{ stress: number }>('PUT', '/settings/stress', { level }),
  saveCalendar: (url: string) => req<{ calendar: CalendarStatus }>('PUT', '/settings/calendar', { url }),
  removeCalendar: () => req<void>('DELETE', '/settings/calendar'),
  calendarEvents: (from: Date, to: Date) =>
    req<{ connected: boolean; events: CalEvent[] }>('GET', `/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`),
  links: () => req<QuickLink[]>('GET', '/links'),
  createLink: (name: string, url: string) => req<QuickLink>('POST', '/links', { name, url }),
  updateLink: (id: number, name: string, url: string) => req<QuickLink>('PATCH', `/links/${id}`, { name, url }),
  deleteLink: (id: number) => req<void>('DELETE', `/links/${id}`),
  notes: () => req<Note[]>('GET', '/notes'),
  createNote: (title: string, body: string) => req<Note>('POST', '/notes', { title, body }),
  updateNote: (id: number, title: string, body: string) => req<Note>('PATCH', `/notes/${id}`, { title, body }),
  deleteNote: (id: number) => req<void>('DELETE', `/notes/${id}`),
}
