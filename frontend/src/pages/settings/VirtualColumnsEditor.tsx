import { Button, Card, Empty, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, CalendarOutlined, CheckSquareOutlined, DeleteOutlined, EditOutlined, FieldNumberOutlined,
  FontSizeOutlined, MessageOutlined, OrderedListOutlined, PlusOutlined, UnorderedListOutlined,
} from '@ant-design/icons'
import type { DataSourceDef, VirtualColumnDef, VirtualType } from '../../types'
import { newId } from '../../api'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'

export const VIRTUAL_TYPES: { value: VirtualType; label: string; icon: JSX.Element; desc: string }[] = [
  { value: 'text', label: 'Metin', icon: <FontSizeOutlined />, desc: 'Tek satırlık serbest metin' },
  { value: 'textarea', label: 'Açıklama (çok satırlı)', icon: <EditOutlined />, desc: 'Uzun açıklama' },
  { value: 'number', label: 'Sayı', icon: <FieldNumberOutlined />, desc: 'Miktar vb.' },
  { value: 'date', label: 'Tarih', icon: <CalendarOutlined />, desc: 'Tarih seçici' },
  { value: 'select', label: 'Seçim listesi (tekli)', icon: <UnorderedListOutlined />, desc: 'Combobox - tek değer' },
  { value: 'multiselect', label: 'Seçim listesi (çoklu)', icon: <OrderedListOutlined />, desc: 'Combobox - birden fazla değer' },
  { value: 'checkbox', label: 'Onay kutusu', icon: <CheckSquareOutlined />, desc: 'Evet / hayır' },
  { value: 'notes', label: 'Not geçmişi (çoklu açıklama)', icon: <MessageOutlined />, desc: 'Her satıra kullanıcı ve tarih damgalı birden fazla not' },
]

const TAG_COLORS = ['default', 'processing', 'success', 'warning', 'error', 'blue', 'cyan', 'green', 'gold', 'orange', 'red', 'magenta', 'purple', 'geekblue', 'lime', 'volcano', 'pink', 'yellow',
  '#8c8c8c', '#434343', '#ff85c0', '#ffd666', '#95de64', '#5cdbd3', '#69b1ff', '#b37feb', '#ff9c6e', '#d4b106']

interface Props {
  value: VirtualColumnDef[]
  onChange: (v: VirtualColumnDef[]) => void
  sources: DataSourceDef[]
}

const newVirtual = (): VirtualColumnDef => ({
  id: newId('v'), name: '', type: 'text', options: [], optionsSourceId: null, optionsColumn: null, optionColors: {}, width: null,
})

export default function VirtualColumnsEditor({ value, onChange, sources }: Props) {
  const update = (i: number, patch: Partial<VirtualColumnDef>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const c = [...value];
    [c[i], c[j]] = [c[j], c[i]]
    onChange(c)
  }

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Sanal kolonlar Excel kaynağında bulunmaz; kullanıcılar KITT tablosunda her satır için değer girer.
        Değerler sipariş + anahtar kolonlar ile eşleştirilerek sunucuda saklanır, Excel dosyası yenilense de korunur.
      </Typography.Paragraph>
      {value.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Henüz sanal kolon yok" />}
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {value.map((c, i) => (
          <VirtualItem key={c.id} c={c} i={i} total={value.length} sources={sources}
            onChange={(p) => update(i, p)} onMove={(d) => move(i, d)} onDelete={() => onChange(value.filter((_, j) => j !== i))} />
        ))}
      </Space>
      <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => onChange([...value, newVirtual()])}>
        Sanal Kolon Ekle
      </Button>
    </div>
  )
}

function VirtualItem({ c, i, total, sources, onChange, onMove, onDelete }: {
  c: VirtualColumnDef; i: number; total: number; sources: DataSourceDef[]
  onChange: (p: Partial<VirtualColumnDef>) => void; onMove: (d: number) => void; onDelete: () => void
}) {
  const isSelect = c.type === 'select' || c.type === 'multiselect'
  const { columns } = useSourceColumns(isSelect ? c.optionsSourceId : null)
  const type = VIRTUAL_TYPES.find((t) => t.value === c.type)

  return (
    <Card
      size="small"
      className="virtual-card"
      title={
        <Space wrap>
          {type?.icon}
          <Input size="small" placeholder="Kolon adı" value={c.name} status={!c.name ? 'error' : undefined}
            onChange={(e) => onChange({ name: e.target.value })} style={{ width: 220, fontWeight: 600 }} />
          <Select size="small" style={{ width: 250 }} value={c.type} onChange={(v) => onChange({ type: v })}
            options={VIRTUAL_TYPES.map((t) => ({ value: t.value, label: <Space>{t.icon}{t.label}</Space> }))} />
          <InputNumber size="small" min={60} max={600} placeholder="Genişlik" value={c.width ?? null} onChange={(v) => onChange({ width: v })} style={{ width: 100 }} />
        </Space>
      }
      extra={
        <Space size={0}>
          <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>Kimlik: vc:{c.id}</Typography.Text>
          <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => onMove(-1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === total - 1} onClick={() => onMove(1)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} />
        </Space>
      }
    >
      {!isSelect ? (
        <Typography.Text type="secondary">{type?.desc}</Typography.Text>
      ) : (
        <div className="lookup-grid">
          <div className="lookup-row">
            <label>Sabit seçenekler</label>
            <Select mode="tags" style={{ flex: 1 }} placeholder="Seçenek yazıp Enter'a basın" value={c.options}
              tokenSeparators={[';']} onChange={(v) => onChange({ options: v })} />
          </div>
          <div className="lookup-row">
            <label>Seçenekleri kaynaktan al</label>
            <Space wrap>
              <Select allowClear style={{ width: 240 }} placeholder="Veri kaynağı (isteğe bağlı)" value={c.optionsSourceId || undefined}
                onChange={(v) => onChange({ optionsSourceId: v ?? null, optionsColumn: null })}
                options={sources.map((s) => ({ value: s.id, label: s.name }))} />
              <Select showSearch allowClear style={{ width: 240 }} placeholder="Kolon" value={c.optionsColumn || undefined}
                disabled={!c.optionsSourceId} onChange={(v) => onChange({ optionsColumn: v ?? null })} options={toOptions(columns)} />
            </Space>
          </div>
          {c.type === 'select' && c.options.length > 0 && (
            <div className="lookup-row">
              <label>Seçenek renkleri</label>
              <Space wrap size={[12, 8]}>
                {c.options.map((o, fi) => (
                  <Space key={o} size={4} draggable title="Sıralamak için sürükleyin"
                    style={{ cursor: 'grab', padding: '2px 6px', border: '1px dashed #d9d9d9', borderRadius: 6 }}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(fi)); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const from = Number(e.dataTransfer.getData('text/plain'))
                      if (Number.isNaN(from) || from === fi) return
                      const list = [...c.options]
                      const [m] = list.splice(from, 1)
                      list.splice(fi, 0, m)
                      onChange({ options: list })
                    }}>
                    <span style={{ color: '#8c8c8c', fontSize: 16, lineHeight: 1 }}>⠿</span>
                    <Tag color={c.optionColors[o] || undefined}>{o}</Tag>
                    <input type="color" title="Özel renk seç"
                      value={/^#[0-9a-f]{6}$/i.test(c.optionColors[o] || '') ? c.optionColors[o] : '#1677ff'}
                      onChange={(e) => onChange({ optionColors: { ...c.optionColors, [o]: e.target.value } })}
                      style={{ width: 28, height: 24, padding: 0, border: 0, background: 'none', cursor: 'pointer' }} />
                    <Select size="small" style={{ width: 120 }} value={c.optionColors[o] || 'default'}
                      onChange={(v) => onChange({ optionColors: { ...c.optionColors, [o]: v } })}
                      options={TAG_COLORS.map((t) => ({ value: t, label: <Tag color={t} style={{ margin: 0 }}>{t}</Tag> }))} />
                  </Space>
                ))}
              </Space>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
