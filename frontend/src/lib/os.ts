export type Platform = 'windows' | 'macos' | 'linux'

export function detectPlatform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): Platform | null {
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos'
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return 'linux'
  return null
}

export const PLATFORM_LABEL: Record<Platform, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }
export const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
export const mod = () => (isMac() ? 'Cmd' : 'Ctrl')

export function formatBytes(n: number): string {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}
