import { describe, expect, it } from 'vitest'
import { timeAgo } from './time'

describe('timeAgo', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  it('formats ranges', () => {
    expect(timeAgo('2026-10-06T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-06T07:00:00Z', now)).toBe('5 hours ago')
    expect(timeAgo('2026-10-05T11:00:00Z', now)).toBe('1 day ago')
    expect(timeAgo('2026-09-15T12:00:00Z', now)).toBe('3 weeks ago')
    expect(timeAgo(undefined, now)).toBe('never')
  })
})
