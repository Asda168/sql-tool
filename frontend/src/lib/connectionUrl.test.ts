import { describe, expect, it } from 'vitest'
import { parseConnectionUrl } from './connectionUrl'

describe('parseConnectionUrl', () => {
  it('parses a full MySQL URL', () => {
    expect(parseConnectionUrl('mysql://root:p%40ss@db.example.com:3307/crm?ssl=true')).toMatchObject({ engine: 'mysql', host: 'db.example.com', port: 3307, username: 'root', password: 'p@ss', database: 'crm', ssl: true })
  })
  it('applies engine defaults', () => {
    expect(parseConnectionUrl('postgresql://db.example.com/app')).toMatchObject({ engine: 'postgres', port: 5432, username: 'postgres', database: 'app' })
    expect(parseConnectionUrl('mysql://127.0.0.1')).toMatchObject({ port: 3306, username: 'root' })
  })
  it('rejects junk', () => {
    expect(parseConnectionUrl('hello')).toBeNull()
    expect(parseConnectionUrl('ftp://x.y')).toBeNull()
  })
})
