import { type EngineId, quoteIdent, sqlLiteral } from './engines'

type Rows = unknown[][]
const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export const toCsv = (cols: string[], rows: Rows) => {
  const esc = (v: unknown) => {
    const s = cell(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

export const toJson = (cols: string[], rows: Rows) =>
  JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null]))), (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)

export const toSqlInserts = (engine: EngineId, table: string, cols: string[], rows: Rows) =>
  rows.map((r) => `INSERT INTO ${quoteIdent(engine, table)} (${cols.map((c) => quoteIdent(engine, c)).join(', ')}) VALUES (${r.map((v) => sqlLiteral(engine, v)).join(', ')});`).join('\n')

export const toMarkdown = (cols: string[], rows: Rows) => {
  const esc = (v: unknown) => cell(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  return [`| ${cols.map(esc).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}

/** Excel opens an HTML table saved as .xls; this avoids shipping a large spreadsheet library. */
export const toExcelHtml = (cols: string[], rows: Rows) => {
  const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${cols.map((c) => `<th>${h(c)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((v) => `<td>${h(cell(v))}</td>`).join('')}</tr>`)
    .join('')}</table></body></html>`
}

export type ExportFormat = 'csv' | 'json' | 'sql' | 'xls' | 'md'
export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'csv', label: 'CSV', ext: 'csv' }, { id: 'json', label: 'JSON', ext: 'json' }, { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'xls', label: 'Excel', ext: 'xls' }, { id: 'md', label: 'Markdown', ext: 'md' },
]

export function exportData(fmt: ExportFormat, engine: EngineId, table: string, cols: string[], rows: Rows): string {
  switch (fmt) {
    case 'csv': return toCsv(cols, rows)
    case 'json': return toJson(cols, rows)
    case 'sql': return toSqlInserts(engine, table, cols, rows)
    case 'xls': return toExcelHtml(cols, rows)
    case 'md': return toMarkdown(cols, rows)
  }
}
