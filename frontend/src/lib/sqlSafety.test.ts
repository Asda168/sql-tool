import { describe, expect, it } from 'vitest'
import { analyse, classify, splitStatements, statementAt } from './sqlSafety'

describe('sqlSafety', () => {
  it('splits ignoring quotes and comments', () => {
    expect(splitStatements("SELECT 'a;b'; -- c;d\nSELECT 2 /* ; */; # x;\nSELECT `t;`")).toHaveLength(3)
  })
  it('flags destructive statements', () => {
    expect(classify('DELETE FROM users').destructive).toBe(true)
    expect(classify('DELETE FROM users WHERE id = 1').destructive).toBe(false)
    expect(classify('UPDATE users SET a=1').destructive).toBe(true)
    expect(classify('drop table x').destructive).toBe(true)
    expect(classify('TRUNCATE x').destructive).toBe(true)
    expect(classify('ALTER TABLE x ADD y INT').destructive).toBe(true)
    expect(classify('SELECT * FROM t').destructive).toBe(false)
  })
  it('ignores WHERE in comments and strings', () => {
    expect(classify('DELETE FROM t /* WHERE */').destructive).toBe(true)
    expect(classify("UPDATE t SET note = 'where x'").destructive).toBe(true)
  })
  it('analyses multiple statements', () => {
    const a = analyse('SELECT 1; DROP TABLE t')
    expect(a.requiresConfirmation).toBe(true)
    expect(a.readOnly).toBe(false)
    expect(analyse('SELECT 1').readOnly).toBe(true)
  })
  it('finds statement at cursor', () => {
    const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3'
    expect(statementAt(sql, 12)).toBe('SELECT 2')
    expect(statementAt(sql, sql.length)).toBe('SELECT 3')
  })
})
