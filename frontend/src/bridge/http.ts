import type { Bridge } from './types'

/**
 * Bridge to the local host service (desktop/host/server.mjs): real MySQL/MariaDB/PostgreSQL, files and Git
 * for the app window when the native Tauri build is not available.
 * The terminal is a real PTY (node-pty) polled over RPC. Passwords are kept in per-user encrypted storage (Windows DPAPI) by the host.
 */
export function createHostBridge(base: string, token: string): Bridge {
  const rpc = async <T>(method: string, ...params: unknown[]): Promise<T> => {
    let res: Response
    try {
      res = await fetch(`${base}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forge-Token': token }, body: JSON.stringify({ method, params }) })
    } catch {
      throw new Error('The local host service is not running. Start MySQL Forge Studio from its shortcut.')
    }
    if (!res.ok) throw new Error(res.status === 401 ? 'Local host rejected the access token. Restart the app from its shortcut.' : `Local host error (${res.status})`)
    const body = (await res.json()) as { result?: T; error?: string }
    if (body.error) throw new Error(body.error)
    return body.result as T
  }
  const pollers = new Map<string, () => void>()

  return {
    kind: 'host',
    db: {
      testConnection: (cfg) => rpc('db.test', cfg),
      connect: (cfg) => rpc('db.connect', cfg),
      disconnect: (s) => rpc('db.disconnect', s),
      query: (s, sql, o) => rpc('db.query', s, sql, { maxRows: o?.maxRows ?? 1000, database: o?.database }),
      cancel: (s) => rpc('db.cancel', s),
      transaction: (s, st) => rpc('db.transaction', s, st),
    },
    secrets: {
      save: (ref, v) => rpc('secret.save', ref, v),
      get: (ref) => rpc('secret.get', ref),
      remove: (ref) => rpc('secret.remove', ref),
    },
    host: {
      seeds: () => rpc('app.seeds'),
      ackSeeds: (ids) => rpc('app.ackSeeds', ids),
      stacks: () => rpc('stacks.detect'),
      startService: (id) => rpc('stacks.start', id),
    },
    fs: {
      homeDir: () => rpc('fs.homeDir'),
      pickFolder: () => rpc('fs.pickFolder'),
      pickFile: () => rpc('fs.pickFile'),
      list: (p) => rpc('fs.list', p),
      read: (p) => rpc('fs.read', p),
      write: (p, c) => rpc('fs.write', p, c),
      createFile: (p) => rpc('fs.createFile', p),
      createDir: (p) => rpc('fs.createDir', p),
      rename: (a, b) => rpc('fs.rename', a, b),
      remove: (p) => rpc('fs.remove', p),
      copy: (a, b) => rpc('fs.copy', a, b),
      reveal: (p) => rpc('fs.reveal', p),
      detectProject: (p) => rpc('fs.detectProject', p),
      search: (r, t) => rpc('fs.search', r, t),
      saveDialog: (n, c) => rpc('fs.saveDialog', n, c),
    },
    term: {
      shells: () => rpc('term.shells'),
      spawn: async (shell, cwd, onData, onExit) => {
        const id = await rpc<string>('term.spawn', shell, cwd)
        let alive = true
        const tick = async () => {
          if (!alive) return
          try {
            const r = await rpc<{ data: string; exit: boolean }>('term.read', id)
            if (r.data) onData(r.data)
            if (r.exit) { alive = false; onExit(); return }
          } catch { alive = false; onExit(); return }
          setTimeout(tick, 30)
        }
        void tick()
        pollers.set(id, () => { alive = false })
        return id
      },
      write: (id, d) => rpc('term.write', id, d),
      resize: (id, c, r) => rpc('term.resize', id, c, r),
      kill: async (id) => { pollers.get(id)?.(); pollers.delete(id); await rpc('term.kill', id) },
    },
    git: {
      status: (c) => rpc('git.status', c),
      stage: (c, p) => rpc('git.stage', c, p),
      unstage: (c, p) => rpc('git.unstage', c, p),
      commit: (c, m) => rpc('git.commit', c, m),
      branches: (c) => rpc('git.branches', c),
      checkout: (c, b) => rpc('git.checkout', c, b),
      createBranch: (c, n) => rpc('git.createBranch', c, n),
      log: (c, l, p) => rpc('git.log', c, l, p ?? null),
      diff: (c, p, s) => rpc('git.diff', c, p, s),
      remotes: (c) => rpc('git.remotes', c),
      run: (c, op, a) => rpc('git.run', c, op, a ?? null),
      clone: (u, d) => rpc('git.clone', u, d),
      init: (c) => rpc('git.init', c),
    },
  }
}
