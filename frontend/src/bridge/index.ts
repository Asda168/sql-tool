import { createDemoBridge } from './demo'
import { createTauriBridge } from './tauri'
import type { Bridge } from './types'

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let instance: Bridge | null = null
/** The local-machine bridge: Rust services in the desktop app, a browser demo elsewhere. */
export function bridge(): Bridge {
  instance ||= isTauri() ? createTauriBridge() : createDemoBridge()
  return instance
}

export * from './types'
