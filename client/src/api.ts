export interface Step { id: number; title: string; done: boolean; position: number }
export interface Project { id: number; title: string; description: string | null; created_at: string; steps: Step[] }
export interface Note { id: number; title: string; body: string; created_at: string; updated_at: string }
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
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status})`)
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  dashboard: () => req<Dashboard>('GET', '/dashboard'),
  projects: () => req<Project[]>('GET', '/projects'),
  createProject: (title: string, description: string, steps: string[]) =>
    req<Project>('POST', '/projects', { title, description, steps }),
  deleteProject: (id: number) => req<void>('DELETE', `/projects/${id}`),
  addStep: (projectId: number, title: string) => req<Step>('POST', `/projects/${projectId}/steps`, { title }),
  setStepDone: (id: number, done: boolean) => req<Step>('PATCH', `/steps/${id}`, { done }),
  deleteStep: (id: number) => req<void>('DELETE', `/steps/${id}`),
  notes: () => req<Note[]>('GET', '/notes'),
  createNote: (title: string, body: string) => req<Note>('POST', '/notes', { title, body }),
  updateNote: (id: number, title: string, body: string) => req<Note>('PATCH', `/notes/${id}`, { title, body }),
  deleteNote: (id: number) => req<void>('DELETE', `/notes/${id}`),
}
