import { createDemoBridge } from './demo'
import { createHostBridge } from './http'
import { createTauriBridge } from './tauri'
import type { Bridge } from './types'

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** The launcher opens the app as /app?forgeHost=<url>&forgeToken=<token>. Keep them for this window only and clear them from the URL. */
function hostFromUrl(): { base: string; token: string } | null {
  try {
    const u = new URL(location.href)
    const base = u.searchParams.get('forgeHost'), token = u.searchParams.get('forgeToken')
    if (base && token && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
      sessionStorage.setItem('forge.host', JSON.stringify({ base, token }))
      u.searchParams.delete('forgeHost'); u.searchParams.delete('forgeToken')
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash)
    }
    const saved = sessionStorage.getItem('forge.host')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

let instance: Bridge | null = null
/** Native Rust services in the desktop app; the local host service when launched from the shortcut; a browser demo otherwise. */
export function bridge(): Bridge {
  if (!instance) {
    const host = isTauri() ? null : hostFromUrl()
    instance = isTauri() ? createTauriBridge() : host ? createHostBridge(host.base, host.token) : createDemoBridge()
  }
  return instance
}

export * from './types'
