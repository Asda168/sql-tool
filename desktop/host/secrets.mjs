// Per-user encrypted secret storage for the local host.
// Windows: DPAPI (ConvertFrom-SecureString) — bound to this Windows user, unreadable by other accounts or machines.
// Secrets are passed to PowerShell through stdin (never on a command line) and are never written in plain text.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DATA_DIR = process.env.FORGE_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'MySQLForgeStudio')
const SECRET_DIR = path.join(DATA_DIR, 'secrets')
const file = (ref) => path.join(SECRET_DIR, createHash('sha256').update(String(ref)).digest('hex') + '.bin')

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    let out = '', err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(out.replace(/\r?\n$/, '')) : reject(new Error(err.trim() || 'powershell failed'))))
    p.stdin.end(input)
  })
}

const PROTECT = '$s=[Console]::In.ReadToEnd(); ConvertTo-SecureString $s -AsPlainText -Force | ConvertFrom-SecureString'
const UNPROTECT = '$t=[Console]::In.ReadToEnd().Trim(); $s=ConvertTo-SecureString $t; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))'

export async function saveSecret(ref, secret) {
  if (process.platform !== 'win32') throw new Error('Secret storage is only implemented for Windows in the local host. Use the native app on other systems.')
  await fs.mkdir(SECRET_DIR, { recursive: true })
  await fs.writeFile(file(ref), await powershell(PROTECT, String(secret)), 'utf8')
}

export async function getSecret(ref) {
  try {
    const protectedText = await fs.readFile(file(ref), 'utf8')
    return await powershell(UNPROTECT, protectedText)
  } catch (e) {
    if (e?.code === 'ENOENT') return null
    throw e
  }
}

export async function removeSecret(ref) { await fs.rm(file(ref), { force: true }) }

// ---- connection seeds: metadata only (no secrets) that the app imports once, then acknowledges
const SEED_FILE = path.join(DATA_DIR, 'seed-connections.json')

export async function readSeeds() {
  try { return JSON.parse(await fs.readFile(SEED_FILE, 'utf8')) } catch { return [] }
}
export async function writeSeeds(list) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(SEED_FILE, JSON.stringify(list, null, 2), 'utf8')
}
