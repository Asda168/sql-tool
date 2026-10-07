// MySQL Forge Studio local host.
// Gives the app window real database, filesystem and Git access when the native (Tauri) build is unavailable.
//
// Security model:
//  - listens on 127.0.0.1 only;
//  - every request needs the random per-launch token (X-Forge-Token);
//  - only requests from the app's own origin are accepted (CORS + Origin check), and the Host header must be loopback;
//  - database passwords are held in memory for the session and never written to disk.

import http from 'node:http'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import mysql from 'mysql2'
import pg from 'pg'
import Cursor from 'pg-cursor'
import { detect as detectStacks, startService } from './stacks.mjs'
import { getSecret, readSeeds, removeSecret, saveSecret, writeSeeds } from './secrets.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const run = promisify(execFile)
const PORT = Number(process.env.FORGE_HOST_PORT || 4174)
// The launcher passes a token; it is also kept in a per-user file so a restarted host accepts the token an already-open window holds.
const TOKEN_FILE = path.join(process.env.LOCALAPPDATA || os.homedir(), 'MySQLForgeStudio', 'host-token')
const TOKEN = process.env.FORGE_TOKEN || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '')
const ORIGIN = process.env.FORGE_ORIGIN || 'http://localhost:4173'
if (TOKEN.length < 24) {
  console.error('FORGE_TOKEN (>= 24 chars) is required.')
  process.exit(1)
}

/** @type {Map<string, any>} */
const sessions = new Map()
const fail = (msg) => Object.assign(new Error(msg), { expose: true })

// ---------------------------------------------------------------- databases
const isRows = (sql) => /^\s*\(?\s*(select|with|show|describe|desc|explain|values|table)\b/i.test(sql)
const hex = (b) => '0x' + Buffer.from(b).subarray(0, 64).toString('hex') + (b.length > 64 ? '…' : '')
const norm = (v) => (Buffer.isBuffer(v) ? hex(v) : typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v)

function mysqlConn(cfg) {
  return new Promise((resolve, reject) => {
    const c = mysql.createConnection({
      host: cfg.host || '127.0.0.1', port: cfg.port || 3306, user: cfg.username, password: cfg.password || '',
      database: cfg.database || undefined, ssl: cfg.ssl ? {} : undefined, connectTimeout: (cfg.timeoutSeconds || 10) * 1000,
      dateStrings: true, supportBigNumbers: true, bigNumberStrings: false, multipleStatements: false,
    })
    c.on('error', () => { c.__dead = true }) // never let a connection error crash the host
    c.connect((err) => (err ? reject(fail(err.sqlMessage || err.message)) : resolve(c)))
  })
}

function pgClient(cfg) {
  const c = new pg.Client({
    host: cfg.host || '127.0.0.1', port: cfg.port || 5432, user: cfg.username, password: cfg.password || undefined,
    database: cfg.database || 'postgres', ssl: cfg.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: (cfg.timeoutSeconds || 10) * 1000,
  })
  return c.connect().then(() => c, (e) => { throw fail(e.message) })
}

async function dbConnect(cfg) {
  if (cfg.sshEnabled) throw fail('SSH tunnels need the native app. Use a direct host/port here.')
  if (cfg.engine === 'mysql' || cfg.engine === 'mariadb') return { engine: 'mysql', conn: await mysqlConn(cfg), cfg }
  if (cfg.engine === 'postgres') return { engine: 'pg', conn: await pgClient(cfg), cfg }
  throw fail(`${cfg.engine} is not supported by the local host yet (MySQL, MariaDB and PostgreSQL are). SQLite/SQL Server need the native app.`)
}

function mysqlRun(sess, sql, maxRows) {
  const conn = sess.conn ?? sess
  const cfg = sess.cfg
  const t0 = performance.now()
  return new Promise((resolve, reject) => {
    const q = conn.query({ sql, rowsAsArray: true })
    let columns = [], rows = [], affected = 0, truncated = false, done = false
    const finish = () => { if (!done) { done = true; resolve({ columns, rows, affected, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, truncated }) } }
    q.on('fields', (f) => { if (f && !columns.length) columns = f.map((x) => x.name) })
    q.on('result', (r) => {
      if (done) return
      if (Array.isArray(r)) {
        if (truncated) return // already cancelling: discard the rest
        if (rows.length >= maxRows) {
          truncated = true
          // stop the server-side query but keep this session usable
          if (cfg) mysqlConn(cfg).then((k) => mysqlRun(k, `KILL QUERY ${Number(conn.threadId)}`, 1).finally(() => k.destroy())).catch(() => {})
          return
        }
        rows.push(r.map(norm))
      } else if (r && typeof r.affectedRows === 'number') {
        affected = r.affectedRows
        finish() // an OK packet is the final reply (no 'end' event is emitted for it)
      }
    })
    q.on('error', (e) => { if (done) return; if (truncated) return finish(); done = true; reject(fail(e.sqlMessage || e.message)) })
    q.on('end', finish)
  })
}

async function pgRun(client, sql, maxRows) {
  const t0 = performance.now()
  if (!isRows(sql)) {
    const r = await client.query(sql).catch((e) => { throw fail(e.message) })
    return { columns: [], rows: [], affected: r.rowCount ?? 0, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, truncated: false }
  }
  const cur = client.query(new Cursor(sql, [], { rowMode: 'array' }))
  try {
    const rows = await cur.read(maxRows + 1).catch((e) => { throw fail(e.message) })
    const columns = (cur._result?.fields ?? []).map((f) => f.name)
    const truncated = rows.length > maxRows
    return { columns, rows: rows.slice(0, maxRows).map((r) => r.map(norm)), affected: 0, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, truncated }
  } finally { await cur.close().catch(() => {}) }
}

/** Switch the session's current database (MySQL) or schema (PostgreSQL). Remembered per session. */
async function useDatabase(s, name) {
  if (s.engine === 'mysql') await mysqlRun(s, 'USE `' + name.replace(/`/g, '``') + '`', 1)
  else await pgRun(s.conn, 'SET search_path TO "' + name.replace(/"/g, '""') + '"', 1)
  s.currentDb = name
}

async function ensure(s) {
  if (s.engine === 'mysql' && (s.conn.__dead || s.conn._closing || s.conn._fatalError)) {
    try { s.conn.destroy() } catch { /* ignore */ }
    s.conn = await mysqlConn(s.cfg)
    s.currentDb = undefined // a fresh connection starts in the default database
  }
  return s
}

const sessionOf = (id) => sessions.get(id) ?? (() => { throw fail('Session closed. Reconnect and try again.') })()

const db = {
  async test(cfg) {
    try {
      const s = await dbConnect(cfg)
      const v = await (s.engine === 'mysql' ? mysqlRun(s, 'SELECT VERSION()', 1) : pgRun(s.conn, 'SHOW server_version', 1))
      await close(s)
      return { ok: true, message: 'Connection successful', serverVersion: String(v.rows[0]?.[0] ?? '') }
    } catch (e) { return { ok: false, message: e.message } }
  },
  async connect(cfg) { const s = await dbConnect(cfg); const id = randomUUID(); sessions.set(id, s); return id },
  async disconnect(id) { const s = sessions.get(id); sessions.delete(id); if (s) await close(s) },
  async query(id, sql, opts = {}) {
    const s = await ensure(sessionOf(id))
    if (opts.database && s.currentDb !== opts.database) await useDatabase(s, String(opts.database))
    const max = Math.min(Math.max(Number(opts.maxRows) || 1000, 1), 200000)
    return s.engine === 'mysql' ? mysqlRun(s, sql, max) : pgRun(s.conn, sql, max)
  },
  async cancel(id) {
    const s = sessionOf(id)
    if (s.engine === 'mysql') {
      const killer = await mysqlConn(s.cfg)
      try { await mysqlRun(killer, `KILL QUERY ${Number(s.conn.threadId)}`, 1) } finally { killer.destroy() }
    } else {
      const killer = await pgClient(s.cfg)
      try { await killer.query('SELECT pg_cancel_backend($1)', [s.conn.processID]) } finally { await killer.end() }
    }
  },
  async transaction(id, statements) {
    const s = await ensure(sessionOf(id))
    let affected = 0
    const exec = (sql) => (s.engine === 'mysql' ? mysqlRun(s, sql, 1) : pgRun(s.conn, sql, 1))
    await exec(s.engine === 'mysql' ? 'START TRANSACTION' : 'BEGIN')
    try {
      for (const st of statements) affected += (await exec(st)).affected
      await exec('COMMIT')
    } catch (e) {
      await exec('ROLLBACK').catch(() => {})
      throw fail(`${e.message} (transaction rolled back)`)
    }
    return { affected }
  },
}
async function close(s) { try { s.engine === 'mysql' ? s.conn.destroy() : await s.conn.end() } catch { /* already closed */ } }

// ---------------------------------------------------------------- filesystem
const ps = (script) => run('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-Command', script], { windowsHide: true }).then((r) => r.stdout.trim())
const SKIP = new Set(['.git', 'node_modules', 'target', 'dist', '__pycache__', '.venv', 'vendor'])

async function copyRec(from, to) {
  await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false })
}

const fsApi = {
  async homeDir() { return os.homedir() },
  async pickFolder() {
    const r = await ps(`Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton=$true; if($d.ShowDialog() -eq 'OK'){$d.SelectedPath}`)
    return r || null
  },
  async pickFile() {
    const r = await ps(`Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; if($d.ShowDialog() -eq 'OK'){$d.FileName}`)
    return r || null
  },
  async list(p) {
    const out = []
    for (const e of await fs.readdir(p, { withFileTypes: true })) {
      if (e.name === '.git') continue
      const full = path.join(p, e.name)
      let size = 0
      if (!e.isDirectory()) size = (await fs.stat(full).catch(() => ({ size: 0 }))).size
      out.push({ name: e.name, path: full, isDir: e.isDirectory(), size })
    }
    return out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  },
  async read(p) {
    const st = await fs.stat(p)
    if (st.size > 20 * 1024 * 1024) throw fail('File is larger than 20 MB.')
    const buf = await fs.readFile(p)
    if (buf.includes(0)) throw fail('This looks like a binary file.')
    return buf.toString('utf8')
  },
  async write(p, content) { await fs.writeFile(p, content, 'utf8') },
  async createFile(p) { if (existsSync(p)) throw fail('A file or folder with that name already exists.'); await fs.writeFile(p, '', { flag: 'wx' }) },
  async createDir(p) { if (existsSync(p)) throw fail('A file or folder with that name already exists.'); await fs.mkdir(p, { recursive: true }) },
  async rename(a, b) { if (existsSync(b)) throw fail('The target already exists.'); await fs.rename(a, b) },
  async remove(p) {
    // Recycle Bin on Windows so a mistaken delete is recoverable
    const esc = p.replace(/'/g, "''")
    await ps(`Add-Type -AssemblyName Microsoft.VisualBasic; $p='${esc}'; if(Test-Path -LiteralPath $p -PathType Container){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')}else{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')}`)
  },
  async copy(a, b) { if (existsSync(b)) throw fail('The target already exists.'); await copyRec(a, b) },
  async reveal(p) { spawn('explorer.exe', [`/select,${p.replace(/\//g, '\\')}`], { detached: true, stdio: 'ignore' }).unref() },
  async detectProject(p) {
    const has = (n) => existsSync(path.join(p, n))
    if (has('artisan') && has('composer.json')) return { kind: 'laravel', label: 'Laravel Project', commands: ['php artisan serve', 'php artisan migrate', 'php artisan route:list', 'php artisan queue:work'] }
    if (has('manage.py')) return { kind: 'django', label: 'Django Project', commands: ['python manage.py runserver', 'python manage.py migrate', 'python manage.py makemigrations'] }
    if (has('package.json')) return { kind: 'node', label: 'Node Project', commands: ['npm install', 'npm run dev', 'npm test'] }
    if (has('requirements.txt') || has('pyproject.toml')) return { kind: 'python', label: 'Python Project', commands: ['pip install -r requirements.txt'] }
    if (has('composer.json')) return { kind: 'php', label: 'PHP Project', commands: ['composer install'] }
    return { kind: 'generic', label: 'Project', commands: [] }
  },
  async search(root, text) {
    const needle = String(text).toLowerCase(), out = []
    const walk = async (dir, depth) => {
      if (depth > 12 || out.length >= 500) return
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (SKIP.has(e.name)) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await walk(full, depth + 1)
        else {
          const st = await fs.stat(full).catch(() => null)
          if (!st || st.size > 1_000_000) continue
          const buf = await fs.readFile(full).catch(() => null)
          if (!buf || buf.includes(0)) continue
          buf.toString('utf8').split(/\r?\n/).forEach((l, i) => { if (out.length < 500 && l.toLowerCase().includes(needle)) out.push({ path: full, line: i + 1, preview: l.trim().slice(0, 200) }) })
        }
      }
    }
    if (needle) await walk(root, 0)
    return out
  },
  async saveDialog(defaultName, content) {
    const esc = defaultName.replace(/'/g, "''")
    const r = await ps(`Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.SaveFileDialog; $d.FileName='${esc}'; if($d.ShowDialog() -eq 'OK'){$d.FileName}`)
    if (!r) return false
    await fs.writeFile(r, content, 'utf8')
    return true
  },
}

// ---------------------------------------------------------------- git (system git, prompts disabled)
async function git(cwd, args) {
  try {
    const { stdout } = await run('git', args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } })
    return stdout
  } catch (e) { throw fail((e.stderr || e.stdout || e.message || '').toString().trim() || 'git failed') }
}
const safeRef = (v) => { if (!v || v.startsWith('-') || v.includes('..') || /[\s~^:?*[\\\x00-\x1f]/.test(v)) throw fail(`Invalid name: ${v}`); return v }

const gitApi = {
  async status(cwd) {
    try { if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).trim() !== 'true') throw 0 } catch { return { isRepo: false, branch: '', ahead: 0, behind: 0, changes: [] } }
    const out = await git(cwd, ['status', '--porcelain=v1', '-b', '-uall'])
    let branch = '', ahead = 0, behind = 0
    const changes = []
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('## ')) {
        const h = line.slice(3)
        branch = h.replace(/^No commits yet on /, '').split(/[. ]/)[0]
        const m = /\[(.*)\]/.exec(h)
        if (m) for (const p of m[1].split(', ')) { if (p.startsWith('ahead ')) ahead = +p.slice(6); if (p.startsWith('behind ')) behind = +p.slice(7) }
      } else if (line.length > 3) {
        let p = line.slice(3); const i = p.indexOf(' -> '); if (i >= 0) p = p.slice(i + 4)
        changes.push({ path: p.replace(/^"|"$/g, ''), index: line[0], worktree: line[1] })
      }
    }
    return { isRepo: true, branch, ahead, behind, changes }
  },
  async stage(cwd, paths) { await git(cwd, ['add', '-A', '--', ...paths]) },
  async unstage(cwd, paths) { await git(cwd, ['restore', '--staged', '--', ...paths]).catch(() => git(cwd, ['rm', '--cached', '-r', '-q', '--', ...paths])) },
  async commit(cwd, message) { if (!message.trim()) throw fail('Commit message is empty'); await git(cwd, ['commit', '-m', message]) },
  async branches(cwd) {
    const out = await git(cwd, ['branch', '-a', '--format=%(HEAD)|%(refname:short)'])
    return out.split(/\r?\n/).filter(Boolean).map((l) => { const [h, n] = l.split('|'); return { name: n, current: h === '*', remote: n.startsWith('origin/') } }).filter((b) => !b.name.endsWith('/HEAD') && !b.name.includes('HEAD detached'))
  },
  async checkout(cwd, b) { await git(cwd, ['checkout', safeRef(b)]) },
  async createBranch(cwd, n) { await git(cwd, ['checkout', '-b', safeRef(n)]) },
  async log(cwd, limit, p) {
    const args = ['log', `-n${Math.min(Math.max(limit | 0, 1), 500)}`, '--format=%H%x1f%an%x1f%aI%x1f%s', ...(p ? ['--', p] : [])]
    const out = await git(cwd, args).catch(() => '')
    return out.split(/\r?\n/).filter(Boolean).map((l) => { const [hash, author, date, message] = l.split('\x1f'); return { hash, author, date, message } })
  },
  async diff(cwd, p, staged) {
    const d = await git(cwd, ['diff', '--no-color', ...(staged ? ['--cached'] : []), '--', p])
    if (!d.trim() && !staged) { try { const t = await fs.readFile(path.join(cwd, p), 'utf8'); return `--- /dev/null\n+++ b/${p}\n` + t.split(/\r?\n/).map((l) => '+' + l).join('\n') } catch { /* not a file */ } }
    return d
  },
  async remotes(cwd) {
    const seen = new Map()
    for (const l of (await git(cwd, ['remote', '-v'])).split(/\r?\n/)) { const [n, u] = l.split(/\s+/); if (n && u && !seen.has(n)) seen.set(n, u) }
    return [...seen].map(([name, url]) => ({ name, url }))
  },
  async run(cwd, op, arg) {
    const map = { pull: ['pull', '--ff-only'], push: ['push'], fetch: ['fetch', '--all', '--prune'], stash: ['stash', 'push', '-u'], 'stash-pop': ['stash', 'pop'], merge: ['merge', safeRef(arg)], rebase: ['rebase', safeRef(arg)] }
    if (!map[op]) throw fail(`Unsupported git operation: ${op}`)
    return (await git(cwd, map[op])).trim()
  },
  async clone(url, dest) {
    if (url.startsWith('-') || !/^(https:\/\/|git@|ssh:\/\/)/.test(url)) throw fail('Use an https://, ssh:// or git@host:path URL.')
    if (existsSync(dest)) throw fail('The destination folder already exists.')
    await fs.mkdir(path.dirname(dest), { recursive: true })
    return (await git(path.dirname(dest), ['clone', '--', url, dest])).trim()
  },
  async init(cwd) { await git(cwd, ['init', '-b', 'main']).catch(() => git(cwd, ['init'])) },
}


// ---------------------------------------------------------------- terminal (real PTY via node-pty)
const terms = new Map()
const GIT_BASH = [
  'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs/Git/bin/bash.exe'),
  path.join(process.env.ProgramFiles || '', 'Git/bin/bash.exe'),
].find((p) => p && existsSync(p))

const termApi = {
  async shells() {
    const out = []
    if (process.platform === 'win32') {
      if (GIT_BASH) out.push({ id: 'git-bash', label: 'Git Bash' })
      out.push({ id: 'powershell', label: 'PowerShell' }, { id: 'cmd', label: 'CMD' })
    } else out.push({ id: 'zsh', label: 'zsh' }, { id: 'bash', label: 'bash' })
    return out
  },
  async spawn(shell, cwd) {
    const pty = require('node-pty')
    let file, args = []
    if (process.platform === 'win32') {
      const want = shell === 'default' || !shell ? (GIT_BASH ? 'git-bash' : 'powershell') : shell
      if ((want === 'git-bash' || want === 'bash') && GIT_BASH) { file = GIT_BASH; args = ['--login', '-i'] }
      else if (want === 'cmd') file = 'cmd.exe'
      else { file = 'powershell.exe'; args = ['-NoLogo'] }
    } else { file = shell === 'zsh' ? 'zsh' : shell === 'bash' ? 'bash' : process.env.SHELL || '/bin/bash'; args = ['-l'] }
    const dir = cwd && existsSync(cwd) ? cwd : os.homedir()
    const p = pty.spawn(file, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: dir, env: process.env })
    const t = { p, buf: '', exited: false }
    p.onData((d) => { t.buf += d; if (t.buf.length > 4_000_000) t.buf = t.buf.slice(-2_000_000) })
    p.onExit(() => { t.exited = true })
    const id = randomUUID()
    terms.set(id, t)
    return id
  },
  async write(id, data) { terms.get(id)?.p.write(String(data)) },
  async resize(id, cols, rows) { try { terms.get(id)?.p.resize(Math.max(2, cols | 0), Math.max(1, rows | 0)) } catch { /* exited */ } },
  /** Returns output buffered since the last read; the UI polls this a few times per second. */
  async read(id) {
    const t = terms.get(id)
    if (!t) return { data: '', exit: true }
    const data = t.buf; t.buf = ''
    if (t.exited && !data) terms.delete(id)
    return { data, exit: t.exited }
  },
  async kill(id) { const t = terms.get(id); terms.delete(id); try { t?.p.kill() } catch { /* already gone */ } },
}

const secretApi = {
  async save(ref, value) { await saveSecret(ref, value) },
  async get(ref) { return getSecret(ref) },
  async remove(ref) { await removeSecret(ref) },
}
const appApi = {
  /** Connection metadata queued by add-connection.mjs (no secrets). The app imports it, then calls ackSeeds. */
  async seeds() { return readSeeds() },
  async ackSeeds(ids) { await writeSeeds((await readSeeds()).filter((s) => !ids.includes(s.id))) },
}

let stackCache = { at: 0, value: [] }
const stackApi = {
  /** Laragon / WAMP / XAMPP and their database servers (cached for 2s so polling stays cheap). */
  async detect() {
    if (Date.now() - stackCache.at > 2000) stackCache = { at: Date.now(), value: await detectStacks() }
    return stackCache.value
  },
  /** Starts a stopped stack database server. Only called when the user clicks Start. */
  async start(serviceId) { const r = await startService(String(serviceId)); stackCache.at = 0; return r },
}

const api = { db, fs: fsApi, git: gitApi, term: termApi, secret: secretApi, app: appApi, stacks: stackApi }

// ---------------------------------------------------------------- http
const send = (res, code, body, origin) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || ORIGIN, Vary: 'Origin', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin
  const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')
  if (!hostOk || (origin && origin !== ORIGIN)) return send(res, 403, { error: 'Forbidden' })
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, X-Forge-Token', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' })
    return res.end()
  }
  if (req.headers['x-forge-token'] !== TOKEN) return send(res, 401, { error: 'Invalid token' })
  lastRpc = Date.now()
  if (req.method === 'GET' && req.url === '/ping') return send(res, 200, { ok: true, host: 'forge-local-host', version: '1.0.0' })
  if (req.method !== 'POST' || req.url !== '/rpc') return send(res, 404, { error: 'Not found' })
  let body = ''
  for await (const c of req) { body += c; if (body.length > 64 * 1024 * 1024) return send(res, 413, { error: 'Too large' }) }
  try {
    const { method, params = [] } = JSON.parse(body)
    const [ns, fn] = String(method).split('.')
    const impl = api[ns]?.[fn]
    if (typeof impl !== 'function') return send(res, 404, { error: `Unknown method ${method}` })
    send(res, 200, { result: (await impl(...params)) ?? null })
  } catch (e) {
    send(res, 200, { error: e?.expose ? e.message : String(e?.message ?? e) })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`MySQL Forge Studio host listening on http://127.0.0.1:${PORT}`))

// Background service: exit when the app window has been gone for a while (the UI polls every few seconds while open)
let lastRpc = Date.now()
const IDLE_MS = Number(process.env.FORGE_IDLE_MINUTES || 30) * 60_000
setInterval(async () => {
  if (Date.now() - lastRpc < IDLE_MS) return
  // Keep serving while Laragon/WAMP/XAMPP (or any local MySQL/MariaDB) is still running, so an open app window never loses its host
  const stacks = await detectStacks().catch(() => [])
  if (stacks.some((s) => s.services?.some((x) => x.running))) { lastRpc = Date.now() - IDLE_MS + 5 * 60_000; return }
  const ui = Number(process.env.FORGE_UI_PORT || 0)
  if (ui) await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-NetTCPConnection -LocalPort ${ui} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], { windowsHide: true }).catch(() => {})
  process.exit(0)
}, 30_000).unref?.()

process.on('SIGINT', () => process.exit(0))
process.on('uncaughtException', (e) => console.error('uncaught:', e?.message ?? e))
process.on('unhandledRejection', (e) => console.error('unhandled:', e?.message ?? e))
