export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  const f = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'} ago`
  if (s < 60) return 'just now'
  if (s < 3600) return f(Math.floor(s / 60), 'minute')
  if (s < 86400) return f(Math.floor(s / 3600), 'hour')
  if (s < 86400 * 7) return f(Math.floor(s / 86400), 'day')
  if (s < 86400 * 30) return f(Math.floor(s / 604800), 'week')
  if (s < 86400 * 365) return f(Math.floor(s / 2592000), 'month')
  return f(Math.floor(s / 31536000), 'year')
}
