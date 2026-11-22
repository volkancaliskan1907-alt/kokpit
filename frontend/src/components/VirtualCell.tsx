import { useEffect, useState } from 'react'
import { Badge, Button, Checkbox, DatePicker, Empty, Input, InputNumber, List, Popconfirm, Popover, Select, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { KittCell, KittNote, VirtualColumnDef } from '../types'
import Clip from './Clip'

const PRESET = new Set(['default', 'success', 'processing', 'error', 'warning', 'magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'])

export const OptionTag = ({ def, value }: { def: VirtualColumnDef; value: string }) => {
  const c = def.optionColors?.[value]
  return <Tag color={c && (PRESET.has(c) || c.startsWith('#')) ? c : undefined} style={{ marginInlineEnd: 0 }}>{value}</Tag>
}

export const metaTitle = (meta?: KittCell) =>
  meta ? `Son güncelleyen: ${meta.by || 'bilinmiyor'} • ${dayjs(meta.at).format('DD.MM.YYYY HH:mm')}` : undefined

/** Sanal kolon tipine göre kontrollü giriş bileşeni (toplu düzenleme penceresinde de kullanılır). */
export function ValueInput({ def, value, options, onChange, autoFocus }: {
  def: VirtualColumnDef; value: any; options: string[]; onChange: (v: any) => void; autoFocus?: boolean
}) {
  switch (def.type) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} value={value ?? null} decimalSeparator="," onChange={(v) => onChange(v)} autoFocus={autoFocus} />
    case 'textarea':
    case 'notes':
      return <Input.TextArea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
    case 'date':
      return <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" value={value ? dayjs(value) : null} onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : null)} />
    case 'select':
      return (
        <Select allowClear showSearch style={{ width: '100%' }} value={value ?? undefined} onChange={(v) => onChange(v ?? null)}
          options={options.map((o) => ({ value: o, label: <OptionTag def={def} value={o} /> }))} />
      )
    case 'multiselect':
      return (
        <Select mode="multiple" allowClear style={{ width: '100%' }} value={value ?? []} onChange={(v) => onChange(v.length ? v : null)}
          options={options.map((o) => ({ value: o, label: o }))} />
      )
    case 'checkbox':
      return <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked ? true : null)}>İşaretli</Checkbox>
    default:
      return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
  }
}

interface CellProps {
  def: VirtualColumnDef
  value: any
  meta?: KittCell
  options: string[]
  onCommit: (v: any) => Promise<void> | void
  onAddNote: (text: string) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
}

/** Tablo hücresi içinde satır bazında düzenleme. */
function VirtualCellInner({ def, value, meta, options, onCommit, onAddNote, onDeleteNote }: CellProps) {
  const [local, setLocal] = useState<any>(value)
  const [open, setOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setLocal(value), [value])

  const commitIfChanged = () => {
    const a = local === '' ? null : local
    const b = value === '' ? null : value
    if (a !== b) onCommit(a)
  }
  const title = metaTitle(meta)

  switch (def.type) {
    case 'text':
      return (
        <Input size="small" variant="borderless" placeholder="—" value={local ?? ''}
          onChange={(e) => setLocal(e.target.value)} onBlur={commitIfChanged}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()} />
      )

    case 'number':
      return (
        <InputNumber size="small" variant="borderless" placeholder="—" style={{ width: '100%' }} decimalSeparator=","
          value={local ?? null} onChange={(v) => setLocal(v)} onBlur={commitIfChanged}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()} />
      )

    case 'date':
      return (
        <DatePicker size="small" variant="borderless" placeholder="—" format="DD.MM.YYYY" style={{ width: '100%' }}
          value={value ? dayjs(value) : null} onChange={(d) => onCommit(d ? d.format('YYYY-MM-DD') : null)} />
      )

    case 'select':
      return (
        <Select size="small" variant="borderless" allowClear showSearch placeholder="Seçiniz" style={{ width: '100%' }}
          value={value ?? undefined} onChange={(v) => onCommit(v ?? null)} popupMatchSelectWidth={false}
          options={options.map((o) => ({ value: o, label: <OptionTag def={def} value={o} /> }))} />
      )

    case 'multiselect':
      return (
        <Select size="small" variant="borderless" mode="multiple" allowClear placeholder="Seçiniz" style={{ width: '100%' }}
          maxTagCount="responsive" value={value ?? []} onChange={(v) => onCommit(v.length ? v : null)} popupMatchSelectWidth={false}
          options={options.map((o) => ({ value: o, label: o }))} />
      )

    case 'checkbox':
      return (
        <div style={{ textAlign: 'center' }}>
          <Checkbox checked={!!value} onChange={(e) => onCommit(e.target.checked ? true : null)} />
        </div>
      )

    case 'textarea':
      return (
        <Popover
          trigger="click"
          open={open}
          onOpenChange={(o) => { setOpen(o); if (o) setLocal(value) }}
          title={<span>{def.name}{title && <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', fontWeight: 400 }}>{title}</Typography.Text>}</span>}
          content={
            <div style={{ width: 340 }}>
              <Input.TextArea rows={5} autoFocus value={local ?? ''} onChange={(e) => setLocal(e.target.value)} />
              <Space style={{ marginTop: 8, justifyContent: 'flex-end', width: '100%' }}>
                <Button size="small" onClick={() => setOpen(false)}>Vazgeç</Button>
                <Button size="small" type="primary" onClick={() => { commitIfChanged(); setOpen(false) }}>Kaydet</Button>
              </Space>
            </div>
          }
        >
          <div className="textarea-cell">
            {value ? <span className="textarea-cell-text">{value}</span> : <span className="placeholder"><EditOutlined /> Açıklama ekle</span>}
          </div>
        </Popover>
      )

    case 'notes': {
      const notes: KittNote[] = Array.isArray(value) ? value : []
      const add = async () => {
        if (!noteText.trim()) return
        setBusy(true)
        try { await onAddNote(noteText.trim()); setNoteText('') } finally { setBusy(false) }
      }
      return (
        <Popover
          trigger="click"
          placement="left"
          title={`${def.name} (${notes.length})`}
          content={
            <div style={{ width: 380 }}>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {notes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Henüz not yok" /> : (
                  <List
                    size="small"
                    dataSource={[...notes].reverse()}
                    renderItem={(n) => (
                      <List.Item
                        actions={[
                          <Popconfirm key="d" title="Not silinsin mi?" okText="Sil" cancelText="Vazgeç" onConfirm={() => onDeleteNote(n.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{n.by || 'Bilinmiyor'} • {dayjs(n.at).format('DD.MM.YYYY HH:mm')}</span>}
                          description={<span style={{ color: '#262626', whiteSpace: 'pre-wrap' }}>{n.text}</span>}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
              <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Yeni not yazın..." value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); add() } }} />
                <Button type="primary" icon={<SendOutlined />} loading={busy} onClick={add} />
              </Space.Compact>
            </div>
          }
        >
          <Button size="small" type={notes.length ? 'link' : 'text'} style={{ padding: 0 }}>
            <Badge count={notes.length} size="small" color="#0b2e59" offset={[8, -2]}>
              <MessageOutlined style={{ color: notes.length ? '#0b2e59' : '#bfbfbf' }} />
            </Badge>
          </Button>
        </Popover>
      )
    }
    default:
      return null
  }
}

/** Uzun içerik sütunu bozmaz: taşan kısım kırpılır, üzerine gelince tam değer (ve son güncelleyen) görünür. */
export default function VirtualCell(props: CellProps) {
  const { def, value, meta } = props
  if (def.type === 'notes') return <VirtualCellInner {...props} />
  const full = def.type === 'checkbox' ? '' : Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value)
  return (
    <Clip text={full} extra={metaTitle(meta)}>
      <VirtualCellInner {...props} />
    </Clip>
  )
}
