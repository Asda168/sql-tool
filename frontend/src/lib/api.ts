/** Django REST client. The server holds accounts, releases and optional sync; it never touches local files, Git or databases. */

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export interface Release {
  id: number; version: string; platform: 'windows' | 'macos' | 'linux'; architecture: 'x64' | 'arm64' | 'universal'
  package_type: 'exe' | 'portable' | 'dmg' | 'appimage' | 'deb' | 'rpm'; download_url: string
  file_size: number; checksum: string; release_notes: string; published_at: string; is_latest: boolean
}

let access: string | null = null
let refresh: string | null = null
try { refresh = localStorage.getItem('forge.refresh') } catch { /* storage unavailable */ }

async function raw(path: string, init: RequestInit = {}, auth = false): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (auth && access) headers.set('Authorization', `Bearer ${access}`)
  return fetch(API_BASE + path, { ...init, headers })
}

async function json<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  let res = await raw(path, init, auth)
  if (res.status === 401 && auth && refresh) {
    const r = await raw('/auth/refresh/', { method: 'POST', body: JSON.stringify({ refresh }) })
    if (r.ok) {
      const d = await r.json()
      access = d.access
      if (d.refresh) setRefresh(d.refresh)
      res = await raw(path, init, auth)
    }
  }
  if (!res.ok) {
    let msg = res.statusText
    try { const d = await res.json(); msg = d.detail ?? JSON.stringify(d) } catch { /* not json */ }
    throw new Error(msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

function setRefresh(t: string | null) {
  refresh = t
  try { t ? localStorage.setItem('forge.refresh', t) : localStorage.removeItem('forge.refresh') } catch { /* ignore */ }
}

export const api = {
  signedIn: () => !!access || !!refresh,
  async login(username: string, password: string) {
    const d = await json<{ access: string; refresh: string }>('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) })
    access = d.access
    setRefresh(d.refresh)
  },
  register: (username: string, email: string, password: string) => json('/auth/register/', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  logout() { access = null; setRefresh(null) },
  me: () => json<{ username: string; email: string }>('/auth/me/', {}, true),
  releases: async (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString()
    const d = await json<{ results: Release[] }>(`/releases/${q ? '?' + q : ''}`)
    return d.results
  },
  latestReleases: () => json<Release[]>('/releases/latest/'),
  requestDownload: (platform: string, architecture: string, package_type?: string) =>
    json<Release>('/downloads/', { method: 'POST', body: JSON.stringify({ platform, architecture, ...(package_type ? { package_type } : {}) }) }),
  getEditorSettings: () => json<Record<string, unknown>>('/editor/settings/', {}, true),
  saveEditorSettings: (s: Record<string, unknown>) => json('/editor/settings/', { method: 'PATCH', body: JSON.stringify(s) }, true),
  analyseSql: (sql: string) => json<{ requires_confirmation: boolean }>('/database/query/', { method: 'POST', body: JSON.stringify({ sql }) }, true),
}
