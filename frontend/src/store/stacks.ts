import { create } from 'zustand'
import { bridge, type ConnectionConfig, type Stack, type StackService } from '../bridge'
import { useApp, uid } from './app'

interface StacksState { stacks: Stack[]; loaded: boolean; busy: Record<string, boolean> }
export const useStacks = create<StacksState>(() => ({ stacks: [], loaded: false, busy: {} }))

const wasRunning = new Map<string, boolean>() // service id -> running at last poll

const isLocalHost = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '::1'
export const connectionFor = (svc: StackService): ConnectionConfig | undefined =>
  useApp.getState().connections.find((c) => (c.engine === 'mysql' || c.engine === 'mariadb') && isLocalHost(c.host) && c.port === svc.port)

/** Find (or create) the saved connection for a running stack server and connect it. */
export async function connectService(stack: Stack, svc: StackService, announce = true): Promise<void> {
  const app = useApp.getState()
  let conn = connectionFor(svc)
  if (!conn) {
    conn = {
      id: uid() + uid(), name: `${stack.name} ${svc.name}`, group: 'LOCAL', environment: 'local', engine: svc.engine, host: '127.0.0.1', port: svc.port,
      username: 'root', database: '', filePath: '', ssl: false, sshEnabled: false, sshHost: '', sshPort: 22, sshUser: '', timeoutSeconds: 10,
    }
    await app.saveConnection(conn) // default stack credentials: root with an empty password; edit the connection if yours differs
  }
  if (useApp.getState().sessions[conn.id]) return
  try {
    await useApp.getState().connect(conn.id, undefined)
    if (announce) useApp.getState().toast('success', `${stack.name} is running: connected to ${conn.name}`)
  } catch (e) {
    useApp.getState().toast('error', `${stack.name} ${svc.name} is running but connecting failed: ${(e as Error).message ?? e}. Edit the connection "${conn.name}" to set its password.`)
  }
}

export async function startService(stack: Stack, svc: StackService): Promise<void> {
  const app = useApp.getState()
  const hb = bridge().host
  if (!hb) return
  const ok = await app.confirm({ title: `Start ${stack.name} ${svc.name}?`, body: `This starts the ${svc.name} server from ${stack.name} on port ${svc.port}.`, confirmLabel: 'Start' })
  if (!ok) return
  useStacks.setState((s) => ({ busy: { ...s.busy, [svc.id]: true } }))
  try {
    await hb.startService(svc.id)
    await refreshStacks()
  } catch (e) { useApp.getState().toast('error', (e as Error).message ?? String(e)) }
  useStacks.setState((s) => ({ busy: { ...s.busy, [svc.id]: false } }))
}

/** Poll the host for Laragon / WAMP / XAMPP servers. A server that newly starts is connected automatically. */
export async function refreshStacks(): Promise<void> {
  const hb = bridge().host
  if (!hb) return
  let stacks: Stack[]
  try { stacks = await hb.stacks() } catch { return }
  useStacks.setState({ stacks, loaded: true })
  const app = useApp.getState()
  for (const stack of stacks) {
    for (const svc of stack.services) {
      const before = wasRunning.get(svc.id)
      wasRunning.set(svc.id, svc.running)
      if (svc.running && !before) void connectService(stack, svc, true) // stopped -> running (or first sight): connect
      if (!svc.running && before) {
        const conn = connectionFor(svc)
        if (conn && app.sessions[conn.id]) { void app.disconnect(conn.id); app.toast('info', `${stack.name} ${svc.name} stopped`) }
      }
    }
  }
}
