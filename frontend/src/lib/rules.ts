import type { CSSProperties } from 'react'
import type { FormatRule, Row } from '../types'
import { evaluate } from './values'

export interface RowStyles {
  row: CSSProperties
  cells: Record<string, CSSProperties>
}

const styleOf = (r: FormatRule): CSSProperties => {
  const s: CSSProperties = {}
  if (r.backColor) s.background = r.backColor
  if (r.foreColor) s.color = r.foreColor
  if (r.bold) s.fontWeight = 600
  return s
}

/** Önce gelen kural önceliklidir (Excel'deki gibi); "Doğruysa dur" sonraki kuralları atlar. */
const mergeMissing = (target: CSSProperties, add: CSSProperties) => {
  for (const [k, v] of Object.entries(add)) if ((target as any)[k] === undefined) (target as any)[k] = v
}

export function computeRowStyles(row: Row, rules: FormatRule[]): RowStyles {
  const result: RowStyles = { row: {}, cells: {} }
  for (const r of rules) {
    if (!r.enabled || !r.column) continue
    const cell = row[r.column]
    const compare = r.compareColumn ? row[r.compareColumn] : r.value
    if (!evaluate(cell, r.operator, compare, r.value2)) continue
    const st = styleOf(r)
    if (r.target === 'row') {
      mergeMissing(result.row, st)
    } else {
      const field = r.target === 'column' && r.applyColumn ? r.applyColumn : r.column
      result.cells[field] = result.cells[field] || {}
      mergeMissing(result.cells[field], st)
    }
    if (r.stopIfTrue) break
  }
  return result
}

export function cellStyle(styles: RowStyles | undefined, field: string): CSSProperties | undefined {
  if (!styles) return undefined
  const c = styles.cells[field]
  if (!c && !Object.keys(styles.row).length) return undefined
  return { ...styles.row, ...c }
}
