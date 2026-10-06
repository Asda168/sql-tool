import { describe, expect, it } from 'vitest'
import { highlightParts, matchRanges } from './highlight'

describe('highlight', () => {
  it('highlights a contiguous match case-insensitively', () => {
    expect(highlightParts('CRM', 'my_crm_deals')).toEqual([{ text: 'my_', hit: false }, { text: 'crm', hit: true }, { text: '_deals', hit: false }])
  })
  it('highlights subsequence letters and merges adjacent ones', () => {
    expect(matchRanges('cnt', 'account_contacts')).toEqual([[1, 2], [5, 7]])
    expect(matchRanges('uacc', 'user_account')).toEqual([[0, 1], [5, 8]])
    expect(highlightParts('uacc', 'user_account').filter((p) => p.hit).map((p) => p.text).join('')).toBe('uacc')
  })
  it('returns no highlight for non-matches and empty queries', () => {
    expect(highlightParts('zzz', 'users')).toEqual([{ text: 'users', hit: false }])
    expect(matchRanges('', 'users')).toEqual([])
  })
})
