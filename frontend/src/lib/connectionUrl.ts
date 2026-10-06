import type { ConnectionConfig } from '../bridge/types'
import { ENGINES, type EngineId } from './engines'

const SCHEMES: Record<string, EngineId> = { mysql: 'mysql', mariadb: 'mariadb', postgres: 'postgres', postgresql: 'postgres', sqlite: 'sqlite', mssql: 'mssql', sqlserver: 'mssql' }

/** Parse mysql://user:pass@host:3306/db?ssl=true into a connection draft. Returns null when it is not a usable URL. */
export function parseConnectionUrl(input: string): (Partial<ConnectionConfig> & { password?: string }) | null {
  const text = input.trim()
  const m = /^([a-z]+):\/\//i.exec(text)
  if (!m) return null
  const engine = SCHEMES[m[1].toLowerCase()]
  if (!engine) return null
  if (engine === 'sqlite') {
    const file = decodeURIComponent(text.slice(m[0].length)).replace(/^\/(?=[A-Za-z]:)/, '')
    return file ? { engine, filePath: file, name: file.split(/[\/]/).pop() } : null
  }
  let u: URL
  try { u = new URL(text.replace(/^[a-z]+:/i, 'http:')) } catch { return null }
  if (!u.hostname) return null
  const info = ENGINES[engine]
  const ssl = /^(1|true|required|require|verify[-_]?(ca|full|identity))$/i.test(u.searchParams.get('ssl') ?? u.searchParams.get('sslmode') ?? '')
  return {
    engine, host: u.hostname, port: u.port ? Number(u.port) : info.defaultPort,
    username: decodeURIComponent(u.username) || info.defaultUser, password: decodeURIComponent(u.password) || undefined,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')), ssl,
    name: `${u.hostname}${u.port ? ':' + u.port : ''}`,
  }
}
