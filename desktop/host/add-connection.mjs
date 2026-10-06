// Adds a saved connection for the app, with the password kept in encrypted per-user storage.
//
//   set FORGE_DB_PASSWORD=...                (never pass the password as an argument)
//   node add-connection.mjs --name Development --host db.example.com --port 3306 --user app_user --env development
//
// The app imports the connection the next time it starts. It does NOT connect; you click Connect yourself.

import { randomUUID } from 'node:crypto'
import { readSeeds, saveSecret, writeSeeds } from './secrets.mjs'

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []))
const password = process.env.FORGE_DB_PASSWORD
if (!a.name || !a.host || !a.user) { console.error('Required: --name --host --user (password via FORGE_DB_PASSWORD)'); process.exit(1) }

const id = randomUUID()
const cfg = {
  id, name: a.name, group: (a.group || a.env || 'development').toUpperCase(), environment: a.env || 'development', engine: a.engine || 'mysql',
  host: a.host, port: Number(a.port || 3306), username: a.user, database: a.database || '', filePath: '', ssl: a.ssl === 'true',
  sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: Number(a.timeout || 10),
}
if (password) await saveSecret(`conn:${id}`, password)
await writeSeeds([...(await readSeeds()).filter((s) => !(s.host === cfg.host && s.port === cfg.port && s.username === cfg.username)), cfg])
console.log(`Saved "${cfg.name}" (${cfg.username}@${cfg.host}:${cfg.port}, ${cfg.environment}). Password stored encrypted: ${password ? 'yes' : 'no'}.`)
