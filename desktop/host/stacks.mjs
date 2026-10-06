// Detects local web stacks (Laragon, WAMP, XAMPP) and their MySQL/MariaDB servers, and can start a stopped one.
// Read-only by default: starting a server only happens when the user clicks Start in the app.

import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

const STACKS = [
  { id: 'laragon', name: 'Laragon', dirs: ['laragon'], manager: ['laragon.exe'], layouts: [['bin', 'mysql'], ['bin', 'mariadb']] },
  { id: 'wamp', name: 'WampServer', dirs: ['wamp64', 'wamp'], manager: ['wampmanager.exe'], layouts: [['bin', 'mysql'], ['bin', 'mariadb']] },
  { id: 'xampp', name: 'XAMPP', dirs: ['xampp'], manager: ['xampp-control.exe'], layouts: [['mysql']] },
]

const lower = (s) => String(s || '').toLowerCase()

async function powershellJson(script) {
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
    const t = stdout.trim()
    return t ? JSON.parse(t) : null
  } catch { return null }
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

/** Running database servers and stack managers, from the OS process table and listening ports. */
async function snapshot() {
  const r = await powershellJson(`
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'mysqld.exe','mariadbd.exe','laragon.exe','wampmanager.exe','xampp-control.exe' } | Select-Object ProcessId,Name,ExecutablePath,CommandLine
    $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess
    @{ procs = @($procs); ports = @($ports) } | ConvertTo-Json -Compress -Depth 4`)
  return { procs: asArray(r?.procs), ports: asArray(r?.ports) }
}

function fixedRoots() {
  // Windows drive letters that exist
  const out = []
  for (const l of 'CDEFGH') if (existsSync(`${l}:/`)) out.push(`${l}:/`)
  return out
}

function findInstall(stack) {
  for (const drive of fixedRoots()) {
    for (const d of stack.dirs) {
      const root = path.join(drive, d)
      if (!existsSync(root)) continue
      for (const layout of stack.layouts) {
        const base = path.join(root, ...layout)
        if (!existsSync(base)) continue
        // XAMPP has bin/ directly; Laragon/WAMP have one folder per version
        const direct = path.join(base, 'bin', 'mysqld.exe')
        if (existsSync(direct)) return { root, home: base, exe: direct, version: undefined }
        let versions = []
        try { versions = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch { /* unreadable */ }
        for (const v of versions.reverse()) {
          for (const exe of ['mysqld.exe', 'mariadbd.exe']) {
            const p = path.join(base, v, 'bin', exe)
            if (existsSync(p)) return { root, home: path.join(base, v), exe: p, version: v }
          }
        }
      }
    }
  }
  return null
}

function iniPort(home) {
  for (const f of [path.join(home, 'my.ini'), path.join(home, 'bin', 'my.ini'), path.join(home, 'data', 'my.ini')]) {
    try {
      const m = /^\s*port\s*=\s*(\d+)/im.exec(readFileSync(f, 'utf8'))
      if (m) return Number(m[1])
    } catch { /* no file */ }
  }
  return 3306
}

const versionFromPath = (p) => /(?:mysql|mariadb)[-_ ]?(\d+\.\d+(?:\.\d+)?)/i.exec(p || '')?.[1]
const engineFromPath = (p) => (/mariadb/i.test(p || '') ? 'mariadb' : 'mysql')

export async function detect() {
  const snap = await snapshot()
  const stacks = []
  const claimed = new Set()

  for (const s of STACKS) {
    const install = findInstall(s)
    const manager = snap.procs.find((p) => s.manager.includes(lower(p.Name)))
    const running = snap.procs.filter((p) => /^(mysqld|mariadbd)\.exe$/i.test(p.Name) && s.dirs.some((d) => lower(p.ExecutablePath).includes('\\' + d + '\\')))
    if (!install && !manager && !running.length) continue
    const services = []
    // a server may run as a launcher + child process; the one that owns the listening socket is the real server
    const proc = running.find((p) => snap.ports.some((x) => x.OwningProcess === p.ProcessId)) ?? running[0]
    running.forEach((p) => claimed.add(p.ProcessId))
    if (proc) {
      const cmdPort = /--port[= ](\d+)/.exec(proc.CommandLine || '')?.[1]
      const listening = snap.ports.filter((p) => p.OwningProcess === proc.ProcessId).map((p) => p.LocalPort).filter((p) => p !== 33060 && p !== 33061)
      const port = Number(cmdPort) || listening.sort((a, b) => a - b)[0] || iniPort(install?.home ?? path.dirname(path.dirname(proc.ExecutablePath || '')))
      services.push({ id: `${s.id}-mysql`, name: /mariadb/i.test(proc.Name) ? 'MariaDB' : 'MySQL', engine: engineFromPath(proc.ExecutablePath), running: true, port, version: versionFromPath(proc.ExecutablePath) ?? install?.version, canStart: false })
    } else if (install) {
      services.push({ id: `${s.id}-mysql`, name: /mariadb/i.test(install.exe) ? 'MariaDB' : 'MySQL', engine: engineFromPath(install.exe), running: false, port: iniPort(install.home), version: versionFromPath(install.home) ?? install.version, canStart: true })
    }
    stacks.push({ id: s.id, name: s.name, root: install?.root ?? '', managerRunning: !!manager, services })
  }

  // a database server that no known stack owns (standalone MySQL service etc.)
  for (const p of snap.procs.filter((x) => /^(mysqld|mariadbd)\.exe$/i.test(x.Name) && !claimed.has(x.ProcessId))) {
    const listening = snap.ports.filter((x) => x.OwningProcess === p.ProcessId).map((x) => x.LocalPort).filter((x) => x !== 33060 && x !== 33061)
    if (!listening.length) continue // not serving connections (e.g. a launcher process)
    const port = Number(/--port[= ](\d+)/.exec(p.CommandLine || '')?.[1]) || listening.sort((a, b) => a - b)[0]
    stacks.push({ id: `local-${p.ProcessId}`, name: 'Local server', root: '', managerRunning: false, services: [{ id: `local-${p.ProcessId}-mysql`, name: /mariadb/i.test(p.Name) ? 'MariaDB' : 'MySQL', engine: engineFromPath(p.ExecutablePath), running: true, port, version: versionFromPath(p.ExecutablePath), canStart: false }] })
  }
  return stacks
}

const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect({ port, host: '127.0.0.1' })
  s.setTimeout(500)
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false) })
})

/** Starts a stopped stack database server (user-initiated). Returns once it accepts connections. */
export async function startService(serviceId) {
  const stack = STACKS.find((s) => serviceId.startsWith(s.id + '-'))
  if (!stack) throw Object.assign(new Error('Unknown service'), { expose: true })
  const install = findInstall(stack)
  if (!install) throw Object.assign(new Error(`${stack.name} database server was not found.`), { expose: true })
  const port = iniPort(install.home)
  if (await portOpen(port)) return { port, alreadyRunning: true }
  const iniCandidates = [path.join(install.home, 'my.ini'), path.join(install.home, 'bin', 'my.ini')]
  const ini = iniCandidates.find((f) => existsSync(f))
  const args = [...(ini ? [`--defaults-file=${ini}`] : []), '--standalone']
  const child = spawn(install.exe, args, { cwd: path.dirname(install.exe), detached: true, stdio: 'ignore', windowsHide: true })
  let early = null
  child.on('error', (e) => { early = e })
  child.on('exit', (code) => { if (code) early = new Error(`${path.basename(install.exe)} exited with code ${code}. Start it once from ${stack.name} to check its configuration.`) })
  child.unref()
  for (let i = 0; i < 40; i++) {
    if (early) throw Object.assign(early, { expose: true })
    if (await portOpen(port)) return { port, alreadyRunning: false }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw Object.assign(new Error(`${stack.name} MySQL did not start within 20 seconds.`), { expose: true })
}
