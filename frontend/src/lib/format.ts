import { format } from 'sql-formatter'
import { ENGINES, type EngineId } from './engines'

export function formatSql(sql: string, engine: EngineId = 'mysql', tabWidth = 4): string {
  try {
    return format(sql, { language: ENGINES[engine].dialect, tabWidth, keywordCase: 'upper', dataTypeCase: 'upper', functionCase: 'upper' })
  } catch {
    return sql // unparseable input is left untouched rather than mangled
  }
}
