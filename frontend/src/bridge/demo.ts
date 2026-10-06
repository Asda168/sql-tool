import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { Bridge, DirEntry, GitBranch, GitCommit, GitStatus, ProjectInfo, QueryResult } from './types'

/**
 * Browser fallback used when the app runs outside Tauri (website preview, `npm run dev`).
 * SQL runs for real against an in-memory SQLite (sql.js) seeded with sample data.
 * Filesystem, Git and terminal are virtual. The real implementations live in desktop/src-tauri.
 */

let dbPromise: Promise<Database> | null = null
function getDb(): Promise<Database> {
  dbPromise ||= initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => {
    const db = new SQL.Database()
    db.run(`
      CREATE TABLE departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, department_id INTEGER REFERENCES departments(id), salary REAL, status TEXT DEFAULT 'active');
      CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER DEFAULT 0);
      CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), total REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER DEFAULT 1);
      CREATE VIEW active_users AS SELECT id, name, email FROM users WHERE status = 'active';
      CREATE INDEX idx_orders_user ON orders(user_id);
    `)
    db.run('BEGIN')
    ;['Engineering', 'Sales', 'Support', 'Finance'].forEach((d) => db.run('INSERT INTO departments(name) VALUES (?)', [d]))
    for (let i = 1; i <= 250; i++) {
      db.run('INSERT INTO users(name,email,status,created_at) VALUES (?,?,?,?)', [`User ${i}`, `user${i}@example.com`, i % 7 === 0 ? 'inactive' : 'active', `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')} 10:00:00`])
      db.run('INSERT INTO employees(name,department_id,salary) VALUES (?,?,?)', [`Employee ${i}`, (i % 4) + 1, 40000 + (i % 40) * 1500])
    }
    for (let i = 1; i <= 40; i++) db.run('INSERT INTO products(name,price,stock) VALUES (?,?,?)', [`Product ${i}`, 5 + i * 1.25, i * 3])
    for (let i = 1; i <= 600; i++) {
      db.run('INSERT INTO orders(user_id,total) VALUES (?,?)', [(i % 250) + 1, Math.round(i * 3.7 * 100) / 100])
      db.run('INSERT INTO order_items(order_id,product_id,quantity) VALUES (?,?,?)', [i, (i % 40) + 1, (i % 5) + 1])
    }
    db.run('COMMIT')
    return db
  })
  return dbPromise
}

function runQuery(db: Database, sql: string, maxRows: number): QueryResult {
  const t0 = performance.now()
  const stmt = db.prepare(sql)
  try {
    const columns = stmt.getColumnNames()
    const rows: unknown[][] = []
    let truncated = false
    while (stmt.step()) {
      if (rows.length >= maxRows) { truncated = true; break }
      rows.push(stmt.get() as unknown[])
    }
    const affected = columns.length ? 0 : db.getRowsModified()
    return { columns, rows, affected, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, truncated }
  } finally {
    stmt.free()
  }
}

/** sql.js `prepare` handles one statement; run multi-statement scripts one by one and return the last result. */
function execScript(db: Database, sql: string, maxRows: number): QueryResult {
  const parts = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)
  let last: QueryResult = { columns: [], rows: [], affected: 0, elapsedMs: 0, truncated: false }
  let total = 0
  for (const p of parts.length ? parts : [sql]) {
    last = runQuery(db, p, maxRows)
    total += last.elapsedMs
  }
  return { ...last, elapsedMs: total }
}

// ---------- virtual filesystem ----------
const files = new Map<string, string>()
const dirs = new Set<string>()
const ROOT = '/demo-project'
function seedFs() {
  const f: Record<string, string> = {
    'README.md': '# Demo project\n\nThis is a virtual project used when MySQL Forge Studio runs in the browser.\nInstall the desktop app to open real folders.\n',
    'manage.py': "#!/usr/bin/env python\nprint('django')\n",
    'requirements.txt': 'Django>=5.2\n',
    'database/users.sql': "SELECT\n    id,\n    name,\n    email\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC;\n",
    'database/orders.sql': 'SELECT u.name, COUNT(o.id) AS orders, SUM(o.total) AS revenue\nFROM users u\nJOIN orders o ON o.user_id = u.id\nGROUP BY u.id\nORDER BY revenue DESC\nLIMIT 20;\n',
    'src/app.py': 'def main():\n    print("hello")\n',
    'src/index.ts': 'export const hello = (n: string) => `Hello ${n}`\n',
    'config/settings.json': '{\n  "debug": true\n}\n',
  }
  dirs.add(ROOT)
  for (const [p, c] of Object.entries(f)) {
    const full = `${ROOT}/${p}`
    files.set(full, c)
    let d = full.slice(0, full.lastIndexOf('/'))
    while (d.length >= ROOT.length) { dirs.add(d); d = d.slice(0, d.lastIndexOf('/')) }
  }
  ;['app', 'public', 'tests', 'resources', 'routes'].forEach((d) => dirs.add(`${ROOT}/${d}`))
}
seedFs()
const parent = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

// ---------- virtual git ----------
let committed = new Map(files)
let staged = new Set<string>()
let branch = 'main'
const branchList = ['main', 'development', 'feature/mysql-editor']
const commits: GitCommit[] = [{ hash: 'a1b2c3d', author: 'Demo User', date: new Date().toISOString(), message: 'Initial commit' }]
const changedPaths = () => {
  const out: Record<string, string> = {}
  for (const [p, c] of files) { if (!committed.has(p)) out[p] = 'A'; else if (committed.get(p) !== c) out[p] = 'M' }
  for (const p of committed.keys()) if (!files.has(p)) out[p] = 'D'
  return out
}
const rel = (p: string) => p.replace(ROOT + '/', '')

function demoStatus(): GitStatus {
  const ch = changedPaths()
  return {
    isRepo: true, branch, ahead: 0, behind: 0,
    changes: Object.entries(ch).map(([p, k]) => ({ path: rel(p), index: staged.has(rel(p)) ? k : ' ', worktree: staged.has(rel(p)) ? ' ' : k === 'A' ? '?' : k })),
  }
}

export function createDemoBridge(): Bridge {
  const sessions = new Set<string>()
  const terms = new Map<string, { cwd: string; line: string; out: (d: string) => void; exit: () => void }>()
  let seq = 0

  const prompt = (t: { cwd: string }) => `\x1b[36m${t.cwd}\x1b[0m $ `
  const sh = (t: { cwd: string; out: (d: string) => void }, cmdline: string) => {
    const [cmd, ...args] = cmdline.trim().split(/\s+/)
    const w = (s: string) => t.out(s.replace(/\n/g, '\r\n') + '\r\n')
    switch (cmd) {
      case '': break
      case 'help': w('Demo terminal. Commands: ls, cd, pwd, cat, echo, clear, whoami, git status|log|branch. The desktop app gives you a real shell (Git Bash, PowerShell, CMD, zsh, bash).'); break
      case 'pwd': w(t.cwd); break
      case 'whoami': w('demo'); break
      case 'echo': w(args.join(' ')); break
      case 'clear': t.out('\x1b[2J\x1b[H'); break
      case 'ls': {
        const d = args[0] ? (args[0].startsWith('/') ? args[0] : `${t.cwd}/${args[0]}`) : t.cwd
        const names = new Set<string>()
        for (const p of [...dirs, ...files.keys()]) if (parent(p) === d && p !== d) names.add(base(p) + (dirs.has(p) ? '/' : ''))
        w([...names].sort().join('  '))
        break
      }
      case 'cd': {
        const target = !args[0] || args[0] === '~' ? ROOT : args[0] === '..' ? parent(t.cwd) : args[0].startsWith('/') ? args[0] : `${t.cwd}/${args[0]}`
        if (dirs.has(target)) t.cwd = target; else w(`cd: no such directory: ${args[0]}`)
        break
      }
      case 'cat': { const p = args[0]?.startsWith('/') ? args[0] : `${t.cwd}/${args[0]}`; const c = files.get(p); w(c ?? `cat: ${args[0]}: No such file`); break }
      case 'git': {
        if (args[0] === 'status') { const s = demoStatus(); w(`On branch ${s.branch}\n` + (s.changes.length ? s.changes.map((c) => ` ${c.index}${c.worktree} ${c.path}`).join('\n') : 'nothing to commit, working tree clean')) }
        else if (args[0] === 'log') w(commits.map((c) => `${c.hash} ${c.message}`).join('\n'))
        else if (args[0] === 'branch') w(branchList.map((b) => (b === branch ? '* ' : '  ') + b).join('\n'))
        else w('git: only status, log and branch are available in the demo terminal')
        break
      }
      default: w(`${cmd}: command not found (demo terminal)`)
    }
  }

  return {
    kind: 'demo',
    db: {
      async testConnection() { await getDb(); return { ok: true, message: 'Connected to the built-in demo database (SQLite in your browser).', serverVersion: 'SQLite (sql.js)' } },
      async connect() { await getDb(); const id = `demo-${++seq}`; sessions.add(id); return id },
      async disconnect(s) { sessions.delete(s) },
      async query(_s, sql, opts) { return execScript(await getDb(), sql, opts?.maxRows ?? 1000) },
      async cancel() {},
      async transaction(_s, statements) {
        const db = await getDb()
        db.run('BEGIN')
        try {
          let affected = 0
          for (const s of statements) { db.run(s); affected += db.getRowsModified() }
          db.run('COMMIT')
          return { affected }
        } catch (e) { db.run('ROLLBACK'); throw e }
      },
    },
    secrets: {
      // Demo only. The desktop build uses the OS keychain; nothing is ever persisted in the browser.
      async save() {}, async get() { return null }, async remove() {},
    },
    fs: {
      async homeDir() { return ROOT },
      async pickFolder() { return ROOT },
      async pickFile() { return null },
      async list(path): Promise<DirEntry[]> {
        const out: DirEntry[] = []
        for (const d of dirs) if (parent(d) === path && d !== path) out.push({ name: base(d), path: d, isDir: true, size: 0 })
        for (const [p, c] of files) if (parent(p) === path) out.push({ name: base(p), path: p, isDir: false, size: c.length })
        return out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
      },
      async read(p) { const c = files.get(p); if (c === undefined) throw new Error('File not found'); return c },
      async write(p, c) { files.set(p, c) },
      async createFile(p) { if (files.has(p) || dirs.has(p)) throw new Error('Already exists'); files.set(p, '') },
      async createDir(p) { if (files.has(p) || dirs.has(p)) throw new Error('Already exists'); dirs.add(p) },
      async rename(from, to) {
        if (files.has(to) || dirs.has(to)) throw new Error('Target already exists')
        if (files.has(from)) { files.set(to, files.get(from)!); files.delete(from) }
        else if (dirs.has(from)) {
          for (const d of [...dirs]) if (d === from || d.startsWith(from + '/')) { dirs.delete(d); dirs.add(to + d.slice(from.length)) }
          for (const [p, c] of [...files]) if (p.startsWith(from + '/')) { files.delete(p); files.set(to + p.slice(from.length), c) }
        }
      },
      async remove(p) {
        files.delete(p)
        for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d)
        for (const f of [...files.keys()]) if (f.startsWith(p + '/')) files.delete(f)
      },
      async copy(from, to) {
        if (files.has(from)) files.set(to, files.get(from)!)
        else for (const d of dirs) if (d === from || d.startsWith(from + '/')) dirs.add(to + d.slice(from.length))
        for (const [p, c] of [...files]) if (p.startsWith(from + '/')) files.set(to + p.slice(from.length), c)
      },
      async reveal() {},
      async detectProject(path): Promise<ProjectInfo> {
        const has = (n: string) => files.has(`${path}/${n}`)
        if (has('artisan') && has('composer.json')) return { kind: 'laravel', label: 'Laravel Project', commands: ['php artisan serve', 'php artisan migrate', 'php artisan route:list', 'php artisan queue:work'] }
        if (has('manage.py')) return { kind: 'django', label: 'Django Project', commands: ['python manage.py runserver', 'python manage.py migrate', 'python manage.py makemigrations'] }
        if (has('package.json')) return { kind: 'node', label: 'Node Project', commands: ['npm install', 'npm run dev', 'npm test'] }
        if (has('requirements.txt') || has('pyproject.toml')) return { kind: 'python', label: 'Python Project', commands: ['python -m venv .venv', 'pip install -r requirements.txt'] }
        if (has('composer.json')) return { kind: 'php', label: 'PHP Project', commands: ['composer install'] }
        return { kind: 'generic', label: 'Project', commands: [] }
      },
      async search(root, text) {
        const out: { path: string; line: number; preview: string }[] = []
        const needle = text.toLowerCase()
        for (const [p, c] of files) {
          if (!p.startsWith(root)) continue
          c.split('\n').forEach((l, i) => { if (needle && l.toLowerCase().includes(needle) && out.length < 500) out.push({ path: p, line: i + 1, preview: l.trim().slice(0, 200) }) })
        }
        return out
      },
      async saveDialog(name, content) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([content]))
        a.download = name
        a.click()
        URL.revokeObjectURL(a.href)
        return true
      },
    },
    term: {
      async shells() { return [{ id: 'bash' as const, label: 'Demo shell' }] },
      async spawn(_shell, cwd, onData, onExit) {
        const id = `t${++seq}`
        const t = { cwd: dirs.has(cwd) ? cwd : ROOT, line: '', out: onData, exit: onExit }
        terms.set(id, t)
        setTimeout(() => { onData('MySQL Forge Studio demo terminal. Type "help".\r\n' + prompt(t)) }, 0)
        return id
      },
      async write(id, data) {
        const t = terms.get(id)
        if (!t) return
        for (const ch of data) {
          if (ch === '\r') { t.out('\r\n'); const l = t.line; t.line = ''; sh(t, l); t.out(prompt(t)) }
          else if (ch === '\x7f') { if (t.line) { t.line = t.line.slice(0, -1); t.out('\b \b') } }
          else if (ch >= ' ') { t.line += ch; t.out(ch) }
        }
      },
      async resize() {},
      async kill(id) { terms.get(id)?.exit(); terms.delete(id) },
    },
    git: {
      async status() { return demoStatus() },
      async stage(_c, paths) { paths.forEach((p) => staged.add(p)) },
      async unstage(_c, paths) { paths.forEach((p) => staged.delete(p)) },
      async commit(_c, message) {
        if (!staged.size) throw new Error('Nothing staged')
        for (const p of staged) { const full = `${ROOT}/${p}`; if (files.has(full)) committed.set(full, files.get(full)!); else committed.delete(full) }
        staged = new Set()
        commits.unshift({ hash: Math.random().toString(16).slice(2, 9), author: 'Demo User', date: new Date().toISOString(), message })
      },
      async branches(): Promise<GitBranch[]> { return branchList.map((name) => ({ name, current: name === branch, remote: false })) },
      async checkout(_c, b) { if (!branchList.includes(b)) throw new Error('Unknown branch'); branch = b },
      async createBranch(_c, name) { if (branchList.includes(name)) throw new Error('Branch exists'); branchList.push(name); branch = name },
      async log(_c, limit) { return commits.slice(0, limit) },
      async diff(_c, path) {
        const full = `${ROOT}/${path}`
        const a = (committed.get(full) ?? '').split('\n'), b = (files.get(full) ?? '').split('\n')
        const out = [`--- a/${path}`, `+++ b/${path}`]
        const max = Math.max(a.length, b.length)
        for (let i = 0; i < max; i++) { if (a[i] !== b[i]) { if (a[i] !== undefined) out.push('-' + a[i]); if (b[i] !== undefined) out.push('+' + b[i]) } }
        return out.join('\n')
      },
      async remotes() { return [{ name: 'origin', url: 'https://github.com/user/project.git' }] },
      async run(_c, op) { return `Demo mode: "${op}" is simulated. Install the desktop app for real Git.` },
      async clone() { throw new Error('Cloning requires the desktop app.') },
      async init() {},
    },
  }
}
