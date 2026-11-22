import { Button, Checkbox, Input, Popover, Select, Space, Typography } from 'antd'
import { ClearOutlined, FilterOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import type { Row } from '../types'
import { compareValues, toText } from '../lib/values'
import { useLocalState } from '../lib/useLocalState'

export interface FilterField {
  key: string
  label: string
  kind: 'select' | 'text'
  options?: string[]
}

export type FilterValues = Record<string, string[] | string | undefined>

const textOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && 'text' in x ? String((x as any).text) : toText(x)))
  return [toText(v)]
}

/** Satırlardan filtre alanlarını üretir: az sayıda farklı değeri olanlar açılır liste, diğerleri metin. */
export function buildFilterFields(
  rows: Row[],
  cols: { key: string; label: string; kind?: 'select' | 'text'; options?: string[] }[],
  get: (row: Row, key: string) => unknown,
  maxOptions = 40,
): FilterField[] {
  return cols.map((c) => {
    if (c.kind === 'text') return { key: c.key, label: c.label, kind: 'text' }
    if (c.options) return { key: c.key, label: c.label, kind: 'select', options: c.options }
    const set = new Set<string>()
    for (const r of rows) {
      for (const t of textOf(get(r, c.key))) set.add(t)
      if (set.size > maxOptions) break
    }
    if (set.size > maxOptions && c.kind !== 'select') return { key: c.key, label: c.label, kind: 'text' }
    return { key: c.key, label: c.label, kind: 'select', options: [...set].sort((a, b) => compareValues(a, b)) }
  })
}

const isActive = (v: string[] | string | undefined) => (Array.isArray(v) ? v.length > 0 : !!(v && v.trim()))

export function applyFilters(rows: Row[], fields: FilterField[], values: FilterValues, get: (row: Row, key: string) => unknown): Row[] {
  const active = fields.filter((f) => isActive(values[f.key]))
  if (!active.length) return rows
  return rows.filter((r) => active.every((f) => {
    const texts = textOf(get(r, f.key))
    const v = values[f.key]!
    if (Array.isArray(v)) return texts.some((t) => v.includes(t))
    const q = (v as string).trim().toLocaleLowerCase('tr')
    return texts.some((t) => t.toLocaleLowerCase('tr').includes(q))
  }))
}

export const activeFilterCount = (values: FilterValues) => Object.values(values).filter(isActive).length

const DEFAULT_VISIBLE = 6

interface Props {
  fields: FilterField[]
  value: FilterValues
  onChange: (v: FilterValues) => void
  /** Hangi filtrelerin görüneceği bu anahtarla kullanıcı bazında (sunucuda) saklanır */
  storageKey: string
  /** Varsayılan görünen filtreler (kullanıcı değiştirmediyse) */
  defaultKeys?: string[]
  /** Tüm filtreler tek satıra sığdırılır */
  oneLine?: boolean
}

/** Sabit filtre alanı. Hangi filtrelerin gösterileceği sağdaki ayar düğmesinden seçilir. */
export default function FilterBar({ fields, value, onChange, storageKey, defaultKeys, oneLine }: Props) {
  const [saved, setSaved] = useLocalState<string[] | null>(`kokpit.filters.${storageKey}`, null)
  const defaults = defaultKeys ? defaultKeys.filter((k) => fields.some((f) => f.key === k)) : fields.slice(0, DEFAULT_VISIBLE).map((f) => f.key)
  const visible = (saved ?? defaults).filter((k) => fields.some((f) => f.key === k))
  const shown = fields.filter((f) => visible.includes(f.key))
  const count = shown.filter((f) => isActive(value[f.key])).length

  const set = (k: string, v: string[] | string | undefined) => onChange({ ...value, [k]: v })
  const setVisible = (keys: string[]) => {
    setSaved(keys)
    // Gizlenen filtrenin değeri sonuçları etkilemeye devam etmesin
    const next = { ...value }
    for (const f of fields) if (!keys.includes(f.key)) delete next[f.key]
    onChange(next)
  }

  const picker = (
    <div style={{ width: 280 }}>
      <Space style={{ marginBottom: 8 }} wrap>
        <Button size="small" onClick={() => setVisible(fields.map((f) => f.key))}>Tümünü göster</Button>
        <Button size="small" onClick={() => setVisible([])}>Hiçbirini</Button>
        <Button size="small" onClick={() => setSaved(null)}>Varsayılan</Button>
      </Space>
      <div className="filter-picker-list">
        {fields.map((f) => (
          <Checkbox
            key={f.key}
            checked={visible.includes(f.key)}
            onChange={(e) => setVisible(e.target.checked ? [...visible, f.key] : visible.filter((k) => k !== f.key))}
          >
            {f.label}
          </Checkbox>
        ))}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>Seçiminiz hesabınıza kaydedilir.</Typography.Text>
    </div>
  )

  return (
    <div className={`filter-bar ${oneLine ? 'one-line' : ''}`}>
      <div className="filter-bar-label"><FilterOutlined /> Filtre</div>
      <div className="filter-bar-fields">
        {shown.length === 0 && <span className="muted">Gösterilen filtre yok — sağdaki ayar düğmesinden seçin</span>}
        {shown.map((f) => (
          <div key={f.key} className={`filter-item ${isActive(value[f.key]) ? 'active' : ''}`}>
            <label title={f.label}>{f.label}</label>
            {f.kind === 'select' ? (
              <Select
                mode="multiple"
                allowClear
                size="small"
                maxTagCount="responsive"
                placeholder="Tümü"
                value={(value[f.key] as string[]) ?? []}
                onChange={(v) => set(f.key, v)}
                options={(f.options ?? []).map((o) => ({ value: o, label: o === '' ? '(Boş)' : o }))}
                popupMatchSelectWidth={false}
                style={{ width: '100%' }}
              />
            ) : (
              <Input size="small" allowClear placeholder="içerir..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={(value[f.key] as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      <div className="filter-bar-actions">
        {count > 0 && <Button size="small" icon={<ClearOutlined />} onClick={() => onChange({})}>Temizle ({count})</Button>}
        <Popover trigger="click" placement="bottomRight" title="Gösterilecek filtreler" content={picker}>
          <Button size="small" icon={<SettingOutlined />} title="Filtre alanlarını düzenle" />
        </Popover>
      </div>
    </div>
  )
}
