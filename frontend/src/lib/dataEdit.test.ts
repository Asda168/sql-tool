import { describe, expect, it } from 'vitest'
import { buildStatements } from './dataEdit'
import { singleTableOf } from './sqlTable'

const base = { engine: 'mysql' as const, ns: 'crm', table: 'users', columns: ['id', 'name', 'email'], pkCols: ['id'], rows: [[1, 'Ada', 'a@x.io'], [2, 'Bob', null], [3, 'Eve', 'e@x.io']], loadedCount: 3, edits: new Map(), deleted: new Set<number>() }

describe('buildStatements', () => {
  it('builds UPDATE by primary key', () => {
    const edits = new Map([[0, new Map<number, unknown>([[1, "O'Neil"]])]])
    expect(buildStatements({ ...base, edits })).toEqual(["UPDATE `crm`.`users` SET `name` = 'O''Neil' WHERE `id` = 1"])
  })
  it('handles NULL keys, deletes and inserts', () => {
    const rows = [...base.rows, [null, 'New', '']]
    const out = buildStatements({ ...base, rows, deleted: new Set([1]) })
    expect(out).toEqual(['DELETE FROM `crm`.`users` WHERE `id` = 2', "INSERT INTO `crm`.`users` (`name`) VALUES ('New')"])
  })
  it('does not update a row that is also deleted', () => {
    const edits = new Map([[1, new Map<number, unknown>([[1, 'x']])]])
    expect(buildStatements({ ...base, edits, deleted: new Set([1]) })).toEqual(['DELETE FROM `crm`.`users` WHERE `id` = 2'])
  })
  it('refuses without a usable primary key', () => {
    expect(() => buildStatements({ ...base, pkCols: [] })).toThrow(/primary key/)
    expect(() => buildStatements({ ...base, columns: ['name'], rows: [['a']], pkCols: ['id'], edits: new Map([[0, new Map([[0, 'b']])]]) })).toThrow(/not part of the result/)
  })
  it('quotes per engine', () => {
    expect(buildStatements({ ...base, engine: 'postgres', ns: undefined, edits: new Map([[0, new Map<number, unknown>([[1, 'z']])]]) })[0]).toBe('UPDATE "users" SET "name" = \'z\' WHERE "id" = 1')
  })
})

describe('singleTableOf', () => {
  it('accepts plain single-table selects', () => {
    expect(singleTableOf('SELECT * FROM users')).toEqual({ table: 'users', ns: undefined })
    expect(singleTableOf('select id, name from `crm`.`users` u where u.id > 3 order by id limit 10;')).toEqual({ table: 'users', ns: 'crm' })
    expect(singleTableOf("SELECT * FROM users WHERE name = 'from x join y'")).toEqual({ table: 'users', ns: undefined })
  })
  it('rejects anything that is not one table', () => {
    for (const sql of ['SELECT * FROM a JOIN b ON a.id = b.id', 'SELECT * FROM a, b', 'SELECT COUNT(*) FROM a', 'SELECT DISTINCT x FROM a', 'SELECT x FROM a GROUP BY x',
      'SELECT * FROM a UNION SELECT * FROM b', 'SELECT * FROM (SELECT 1) t', 'UPDATE a SET x = 1', 'SELECT 1', 'SELECT * FROM a; SELECT * FROM b', 'SELECT * FROM a LEFT JOIN b ON 1']) {
      expect(singleTableOf(sql), sql).toBeNull()
    }
  })
})
