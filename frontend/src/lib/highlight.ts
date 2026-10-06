/** Character ranges of `text` that match `query`: a contiguous match if there is one, else the in-order letters. */
export function matchRanges(query: string, text: string): [number, number][] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const t = text.toLowerCase()
  const at = t.indexOf(q)
  if (at >= 0) return [[at, at + q.length]]
  const out: [number, number][] = []
  let from = 0
  for (const ch of q) {
    const i = t.indexOf(ch, from)
    if (i < 0) return [] // not a match: nothing to highlight
    const last = out[out.length - 1]
    if (last && last[1] === i) last[1] = i + 1; else out.push([i, i + 1])
    from = i + 1
  }
  return out
}

export interface Part { text: string; hit: boolean }
export function highlightParts(query: string, text: string): Part[] {
  const ranges = matchRanges(query, text)
  if (!ranges.length) return [{ text, hit: false }]
  const parts: Part[] = []
  let pos = 0
  for (const [a, b] of ranges) {
    if (a > pos) parts.push({ text: text.slice(pos, a), hit: false })
    parts.push({ text: text.slice(a, b), hit: true })
    pos = b
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false })
  return parts
}
