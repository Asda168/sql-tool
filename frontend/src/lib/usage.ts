/** Remembers which tables/columns you query most so autocomplete can rank them first. Local to this computer. */
const KEY = 'forge.usage'
let counts: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } })()
let timer: number | undefined

export const usageOf = (connId: string | undefined, name: string): number => counts[`${connId ?? ''}:${name.toLowerCase()}`] ?? 0

/** Count every identifier in an executed statement that is a known table/column name. */
export function noteUsage(connId: string, sql: string, known: (word: string) => boolean): void {
  const seen = new Set<string>()
  for (const w of sql.match(/[A-Za-z_][\w$]*/g) ?? []) {
    const l = w.toLowerCase()
    if (seen.has(l) || !known(w)) continue
    seen.add(l)
    counts[`${connId}:${l}`] = (counts[`${connId}:${l}`] ?? 0) + 1
  }
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3000) // keep it bounded
    counts = Object.fromEntries(top)
    try { localStorage.setItem(KEY, JSON.stringify(counts)) } catch { /* storage unavailable */ }
  }, 1500)
}
