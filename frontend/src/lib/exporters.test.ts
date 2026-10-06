import { describe, expect, it } from 'vitest'
import { quoteIdent, pageSql, sqlLiteral } from './engines'
import { toCsv, toMarkdown, toSqlInserts } from './exporters'
import { generateCreateTable } from './codegen'

describe('exporters', () => {
  it('escapes CSV', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'q"z'], [null, 1]])).toBe('a,b\r\n"x,y","q""z"\r\n,1')
  })
  it('markdown escapes pipes', () => {
    expect(toMarkdown(['a'], [['x|y']])).toContain('x\\|y')
  })
  it('SQL inserts per engine', () => {
    expect(toSqlInserts('mysql', 't', ['a'], [["it's"]])).toBe("INSERT INTO `t` (`a`) VALUES ('it''s');")
    expect(toSqlInserts('postgres', 't', ['a'], [[null]])).toBe('INSERT INTO "t" ("a") VALUES (NULL);')
  })
})

describe('engines', () => {
  it('quotes identifiers', () => {
    expect(quoteIdent('mssql', 'a]b')).toBe('[a]]b]')
    expect(quoteIdent('sqlite', 'a"b')).toBe('"a""b"')
  })
  it('escapes backslashes only on MySQL family', () => {
    expect(sqlLiteral('mysql', 'a\\b')).toBe("'a\\\\b'")
    expect(sqlLiteral('postgres', 'a\\b')).toBe("'a\\b'")
  })
  it('pages differently on SQL Server', () => {
    expect(pageSql('mssql', 't', 10, 20)).toContain('OFFSET 20 ROWS FETCH NEXT 10')
    expect(pageSql('mysql', 't', 10, 20)).toContain('LIMIT 10 OFFSET 20')
  })
})

describe('codegen', () => {
  it('generates MySQL CREATE TABLE', () => {
    const sql = generateCreateTable('mysql', {
      name: 'users',
      columns: [
        { name: 'id', type: 'INT', length: '', nullable: false, primaryKey: true, autoIncrement: true, unique: false, default: '' },
        { name: 'email', type: 'VARCHAR', length: '255', nullable: true, primaryKey: false, autoIncrement: false, unique: true, default: '' },
        { name: 'created_at', type: 'TIMESTAMP', length: '', nullable: false, primaryKey: false, autoIncrement: false, unique: false, default: 'CURRENT_TIMESTAMP' },
      ],
      indexes: [], foreignKeys: [],
    })
    expect(sql).toContain('`id` INT NOT NULL AUTO_INCREMENT')
    expect(sql).toContain('PRIMARY KEY (`id`)')
    expect(sql).toContain('`email` VARCHAR(255) NULL')
    expect(sql).toContain('UNIQUE (`email`)')
    expect(sql).toContain('DEFAULT CURRENT_TIMESTAMP')
  })
  it('uses SERIAL on PostgreSQL and IDENTITY on SQL Server', () => {
    const t = { name: 't', columns: [{ name: 'id', type: 'INT', length: '', nullable: false, primaryKey: true, autoIncrement: true, unique: false, default: '' }], indexes: [], foreignKeys: [] }
    expect(generateCreateTable('postgres', t)).toContain('"id" SERIAL')
    expect(generateCreateTable('mssql', t)).toContain('IDENTITY(1,1)')
    expect(generateCreateTable('sqlite', t)).toContain('INTEGER PRIMARY KEY AUTOINCREMENT')
  })
})
