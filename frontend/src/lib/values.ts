import dayjs from 'dayjs'
import type { ColumnFormat } from '../types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)?)?$/
const TR_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/
const TODAY_TOKEN = /^\s*(bugün|bugun|today)\s*(([+-])\s*(\d+))?\s*$/i

export const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && ISO_DATE.test(v)

/** "BUGÜN", "BUGÜN+14", "BUGÜN-3" gibi göreli tarih ifadeleri. */
export function resolveToken(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const m = TODAY_TOKEN.exec(v)
  if (!m) return v
  let d = dayjs().startOf('day')
  if (m[2]) d = d.add((m[3] === '-' ? -1 : 1) * Number(m[4]), 'day')
  return d.format('YYYY-MM-DD')
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    let s = v.trim().replace(/\s/g, '')
    if (!s) return null
    let pct = false
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1) }
    if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
    if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null
    const n = Number(s)
    return Number.isNaN(n) ? null : pct ? n / 100 : n
  }
  return null
}

/** Excel seri tarihini Date'e çevirir. */
const fromOADate = (n: number) => new Date(Math.round((n - 25569) * 86400 * 1000) + new Date().getTimezoneOffset() * 60000)

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (typeof v === 'number' && v > 0 && v < 2958465) return fromOADate(v)
  if (typeof v === 'string') {
    const r = resolveToken(v) as string
    if (ISO_DATE.test(r)) {
      const d = dayjs(r)
      return d.isValid() ? d.toDate() : null
    }
    const m = TR_DATE.exec(r.trim())
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  }
  return null
}

export function toText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x && 'text' in x ? (x as any).text : toText(x))).join(', ')
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır'
  if (isIsoDate(v)) return formatDate(v)
  return String(v)
}

function formatDate(v: unknown, withTime = false): string {
  const d = toDate(v)
  if (!d) return toText(v)
  const dj = dayjs(d)
  const hasTime = dj.hour() !== 0 || dj.minute() !== 0
  return dj.format(withTime || hasTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY')
}

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max })

export function formatValue(v: unknown, format: ColumnFormat = 'auto', decimals?: number | null): string {
  if (isEmpty(v)) return ''
  switch (format) {
    case 'text':
      return toText(v)
    case 'number': {
      const n = toNumber(v)
      const d = decimals ?? 2
      return n === null ? toText(v) : nf(d, d).format(n)
    }
    case 'integer': {
      const n = toNumber(v)
      return n === null ? toText(v) : nf(0, 0).format(n)
    }
    case 'percent': {
      const n = toNumber(v)
      const d = decimals ?? 1
      return n === null ? toText(v) : `%${nf(d, d).format(n * 100)}`
    }
    case 'date':
      return formatDate(v).slice(0, 10)
    case 'datetime':
      return formatDate(v, true)
    default:
      if (typeof v === 'number') return nf(0, decimals ?? 4).format(v)
      return toText(v)
  }
}

/** Sayı > tarih > metin sırasıyla karşılaştırma (Türkçe sıralama). */
export function compareValues(a: unknown, b: unknown): number {
  const ea = isEmpty(a), eb = isEmpty(b)
  if (ea && eb) return 0
  if (ea) return -1
  if (eb) return 1
  a = resolveToken(a); b = resolveToken(b)
  if (isIsoDate(a) || isIsoDate(b) || a instanceof Date || b instanceof Date) {
    const da = toDate(a), db = toDate(b)
    if (da && db) return da.getTime() - db.getTime()
  }
  const na = toNumber(a), nb = toNumber(b)
  if (na !== null && nb !== null) return na - nb
  return toText(a).localeCompare(toText(b), 'tr', { sensitivity: 'base', numeric: true })
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true
  if (isEmpty(a) || isEmpty(b)) return false
  if (Array.isArray(a)) return a.some((x) => valuesEqual(x, b))
  return compareValues(a, b) === 0
}

export const OPERATORS: { value: string; label: string; noValue?: boolean; twoValues?: boolean }[] = [
  { value: 'eq', label: 'Eşittir (=)' },
  { value: 'neq', label: 'Eşit değil (≠)' },
  { value: 'gt', label: 'Büyüktür (>)' },
  { value: 'gte', label: 'Büyük veya eşit (≥)' },
  { value: 'lt', label: 'Küçüktür (<)' },
  { value: 'lte', label: 'Küçük veya eşit (≤)' },
  { value: 'between', label: 'Arasında', twoValues: true },
  { value: 'contains', label: 'İçerir' },
  { value: 'notContains', label: 'İçermez' },
  { value: 'startsWith', label: 'İle başlar' },
  { value: 'endsWith', label: 'İle biter' },
  { value: 'in', label: 'Listede (a;b;c)' },
  { value: 'empty', label: 'Boş', noValue: true },
  { value: 'notEmpty', label: 'Dolu', noValue: true },
]

export function evaluate(cell: unknown, op: string, value: unknown, value2?: unknown): boolean {
  const text = toText(cell).toLocaleLowerCase('tr')
  const vText = toText(value).toLocaleLowerCase('tr')
  switch (op) {
    case 'eq': return valuesEqual(cell, resolveToken(value))
    case 'neq': return !valuesEqual(cell, resolveToken(value))
    case 'gt': return !isEmpty(cell) && compareValues(cell, value) > 0
    case 'gte': return !isEmpty(cell) && compareValues(cell, value) >= 0
    case 'lt': return !isEmpty(cell) && compareValues(cell, value) < 0
    case 'lte': return !isEmpty(cell) && compareValues(cell, value) <= 0
    case 'between': return !isEmpty(cell) && compareValues(cell, value) >= 0 && compareValues(cell, value2) <= 0
    case 'contains': return text.includes(vText)
    case 'notContains': return !text.includes(vText)
    case 'startsWith': return text.startsWith(vText)
    case 'endsWith': return text.endsWith(vText)
    case 'empty': return isEmpty(cell)
    case 'notEmpty': return !isEmpty(cell)
    case 'in': return vText.split(/[;,]/).map((s) => s.trim()).filter(Boolean).some((x) => valuesEqual(cell, x))
    default: return false
  }
}
