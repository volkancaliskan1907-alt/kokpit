import { useState } from 'react'
import { Button, Checkbox, Input, InputNumber, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, FunctionOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnView } from '../../types'

export const FORMAT_OPTIONS = [
  { value: 'auto', label: 'Otomatik' },
  { value: 'text', label: 'Metin' },
  { value: 'number', label: 'Sayı' },
  { value: 'integer', label: 'Tam sayı' },
  { value: 'percent', label: 'Yüzde' },
  { value: 'date', label: 'Tarih' },
  { value: 'datetime', label: 'Tarih + Saat' },
]

const AGG_OPTIONS = [
  { value: 'none', label: '—' },
  { value: 'sum', label: 'Toplam' },
  { value: 'avg', label: 'Ortalama' },
  { value: 'count', label: 'Adet' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Maks' },
]

interface Props {
  value: ColumnView[]
  onChange: (v: ColumnView[]) => void
  available: string[]
  computed?: string[]
}

const newView = (field: string): ColumnView => ({ field, label: null, width: null, format: 'auto', decimals: null, aggregate: 'none', fixed: false })

/** Tabloda gösterilecek kolonları seçme, sıralama ve biçimlendirme. */
export default function ColumnsEditor({ value, onChange, available, computed = [] }: Props) {
  const [toAdd, setToAdd] = useState<string[]>([])
  const used = new Set(value.map((v) => v.field))
  const remaining = available.filter((c) => !used.has(c))

  const update = (i: number, patch: Partial<ColumnView>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const copy = [...value];
    [copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }

  return (
    <div>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Select
          mode="multiple"
          allowClear
          style={{ flex: 1 }}
          placeholder={available.length ? 'Eklenecek kolonları seçin...' : 'Önce veri kaynağı seçin'}
          value={toAdd}
          onChange={setToAdd}
          maxTagCount="responsive"
          options={remaining.map((c) => ({ value: c, label: computed.includes(c) ? `ƒ ${c}` : c }))}
        />
        <Button type="primary" icon={<PlusOutlined />} disabled={!toAdd.length} onClick={() => { onChange([...value, ...toAdd.map(newView)]); setToAdd([]) }}>
          Ekle
        </Button>
        <Button disabled={!remaining.length} onClick={() => onChange([...value, ...remaining.map(newView)])}>Tümünü Ekle</Button>
        <Button danger disabled={!value.length} onClick={() => onChange([])}>Temizle</Button>
      </Space.Compact>

      {value.length === 0 && (
        <Typography.Paragraph type="secondary">
          Kolon seçilmezse kaynaktaki tüm kolonlar varsayılan biçimde gösterilir.
        </Typography.Paragraph>
      )}

      {value.length > 0 && (
        <Table<ColumnView>
          size="small"
          bordered
          pagination={false}
          rowKey={(r) => r.field}
          dataSource={value}
          scroll={{ x: 980 }}
          columns={[
            {
              title: 'Sıra', width: 70, align: 'center',
              render: (_, __, i) => (
                <Space size={0}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === value.length - 1} onClick={() => move(i, 1)} />
                </Space>
              ),
            },
            {
              title: 'Kaynak Kolon', dataIndex: 'field', width: 220,
              render: (f: string) => (
                <Space size={4}>
                  {computed.includes(f) && <Tooltip title="Hesaplanan kolon"><FunctionOutlined style={{ color: '#1677ff' }} /></Tooltip>}
                  <span>{f}</span>
                  {available.length > 0 && !available.includes(f) && <Tag color="error">Yok</Tag>}
                </Space>
              ),
            },
            {
              title: 'Görünen Başlık', width: 200,
              render: (_, r, i) => <Input size="small" placeholder={r.field} value={r.label ?? ''} onChange={(e) => update(i, { label: e.target.value || null })} />,
            },
            {
              title: 'Genişlik', width: 90,
              render: (_, r, i) => <InputNumber size="small" min={50} max={800} placeholder="140" value={r.width ?? null} onChange={(v) => update(i, { width: v })} style={{ width: '100%' }} />,
            },
            {
              title: 'Biçim', width: 130,
              render: (_, r, i) => <Select size="small" style={{ width: '100%' }} value={r.format} options={FORMAT_OPTIONS} onChange={(v) => update(i, { format: v })} />,
            },
            {
              title: 'Ondalık', width: 80,
              render: (_, r, i) => (
                <InputNumber size="small" min={0} max={6} value={r.decimals ?? null} style={{ width: '100%' }}
                  disabled={!['number', 'percent', 'auto'].includes(r.format)} onChange={(v) => update(i, { decimals: v })} />
              ),
            },
            {
              title: 'Alt Toplam', width: 110,
              render: (_, r, i) => <Select size="small" style={{ width: '100%' }} value={r.aggregate} options={AGG_OPTIONS} onChange={(v) => update(i, { aggregate: v })} />,
            },
            {
              title: <Tooltip title="Yatay kaydırmada solda sabit kalır">Sabit</Tooltip>, width: 60, align: 'center',
              render: (_, r, i) => <Checkbox checked={r.fixed} onChange={(e) => update(i, { fixed: e.target.checked })} />,
            },
            {
              title: '', width: 44, align: 'center',
              render: (_, __, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, j) => j !== i))} />,
            },
          ]}
        />
      )}
    </div>
  )
}
