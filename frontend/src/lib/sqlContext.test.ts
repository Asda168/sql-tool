import { describe, expect, it } from 'vitest'
import { afterTableRef, clauseAt, fuzzyScore, tablesInStatement, wordBefore } from './sqlContext'

describe('fuzzyScore', () => {
  it('ranks exact > prefix > word-start > contains > subsequence', () => {
    const s = (q: string, c: string) => fuzzyScore(q, c)
    expect(s('users', 'users')).toBeGreaterThan(s('users', 'users_archive'))
    expect(s('us', 'users')).toBeGreaterThan(s('ac', 'user_account'))
    expect(s('ac', 'user_account')).toBeGreaterThan(s('ser', 'users'))
    expect(s('ser', 'users')).toBeGreaterThan(s('uacc', 'user_account'))
    expect(s('uacc', 'user_account')).toBeGreaterThan(0)
    expect(s('zzz', 'users')).toBe(-1)
  })
  it('matches camelCase word starts and is case-insensitive', () => {
    expect(fuzzyScore('ac', 'userAccount')).toBeGreaterThan(fuzzyScore('cc', 'userAccount'))
    expect(fuzzyScore('USER', 'users')).toBeGreaterThan(0)
  })
})

describe('clauseAt', () => {
  it('detects clauses', () => {
    expect(clauseAt('')).toBe('start')
    expect(clauseAt('SELECT ')).toBe('select')
    expect(clauseAt('SELECT * FROM ')).toBe('from')
    expect(clauseAt('SELECT * FROM users u LEFT JOIN ')).toBe('join')
    expect(clauseAt('SELECT * FROM users u JOIN orders o ON ')).toBe('on')
    expect(clauseAt('SELECT * FROM users WHERE status = 1 AND ')).toBe('where')
    expect(clauseAt('SELECT * FROM users ORDER   BY ')).toBe('orderby')
    expect(clauseAt('UPDATE users SET ')).toBe('set')
    expect(clauseAt('SELECT 1; ')).toBe('start')
  })
  it('ignores keywords inside strings and comments', () => {
    expect(clauseAt("SELECT 'from where' -- join\n")).toBe('select')
  })
})

describe('afterTableRef', () => {
  it('is true after a complete table reference', () => {
    expect(afterTableRef('SELECT * FROM users ')).toBe(true)
    expect(afterTableRef('SELECT * FROM users u ')).toBe(true)
    expect(afterTableRef('SELECT * FROM db.users AS u ')).toBe(true)
    expect(afterTableRef('SELECT * FROM ')).toBe(false)
    expect(afterTableRef('SELECT * FROM us')).toBe(false)
    // keywords are not aliases: these are expression positions, not "after a table"
    expect(afterTableRef('SELECT * FROM users WHERE ')).toBe(false)
    expect(afterTableRef('SELECT * FROM users u JOIN orders o ON ')).toBe(false)
    expect(afterTableRef('SELECT * FROM users LEFT ')).toBe(false)
    expect(afterTableRef('SELECT * FROM users u WHERE ')).toBe(false)
  })
})

describe('tablesInStatement', () => {
  const known = (n: string) => ['users', 'orders', 'products'].find((t) => t === n.toLowerCase())
  it('finds tables and aliases, joins and comma lists', () => {
    const r = tablesInStatement('SELECT * FROM users u, products p JOIN orders AS o ON o.user_id = u.id WHERE 1', known)
    expect(r).toEqual(expect.arrayContaining([{ table: 'users', alias: 'u', ns: undefined }, { table: 'orders', alias: 'o', ns: undefined }, { table: 'products', alias: 'p', ns: undefined }]))
  })
  it('does not treat keywords as aliases and skips unknown tables', () => {
    expect(tablesInStatement('SELECT * FROM users WHERE id = 1', known)).toEqual([{ table: 'users', alias: undefined, ns: undefined }])
    expect(tablesInStatement('SELECT * FROM nope n', known)).toEqual([])
  })
  it('keeps the database qualifier', () => {
    expect(tablesInStatement('SELECT * FROM crm.users', known)[0].ns).toBe('crm')
  })
})

describe('wordBefore', () => {
  it('splits qualifier and word', () => {
    expect(wordBefore('SELECT u.na')).toEqual({ qualifier: 'u', word: 'na' })
    expect(wordBefore('SELECT na')).toEqual({ qualifier: undefined, word: 'na' })
    expect(wordBefore('FROM crm.')).toEqual({ qualifier: 'crm', word: '' })
  })
})
