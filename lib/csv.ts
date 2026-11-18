/** One CSV cell. Values starting with = + - @ would run as formulas in spreadsheets; they are neutralised. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** Semicolon-separated CSV with a BOM, which Excel opens with the right encoding. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}
