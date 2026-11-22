import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Form, Modal, Progress, Result, Select, Space, Tag, Tooltip, message } from 'antd'
import { ApartmentOutlined, CheckSquareOutlined, EditOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import KittPickModal from '../components/KittPickModal'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api'
import { useConfig } from '../lib/config'
import { formatValue, isEmpty, toText } from '../lib/values'
import type { KittCell, KittDataResponse, KittNote, Row, VirtualColumnDef } from '../types'
import DataTable, { type ExtraColumn } from '../components/DataTable'
import TopStrip from '../components/TopStrip'
import RuleSummary from '../components/RuleSummary'
import VirtualCell, { ValueInput } from '../components/VirtualCell'

export const VC = (id: string) => `vc:${id}`

/** Seçenek renginden (antd renk adı veya #hex) kart vurgu rengi üretir. */
const HEX: Record<string, string> = {
  default: '#8c8c8c', success: '#52c41a', processing: '#1677ff', error: '#f5222d', warning: '#faad14', blue: '#1677ff', cyan: '#13c2c2',
  green: '#52c41a', gold: '#faad14', orange: '#fa8c16', red: '#f5222d', magenta: '#eb2f96', purple: '#722ed1', geekblue: '#2f54eb',
  lime: '#a0d911', volcano: '#fa541c',
}
const tagHex = (c?: string) => (c?.startsWith('#') ? c : HEX[c ?? 'default'] ?? '#8c8c8c')
const TYPE_ICON: Record<string, string> = {
  text: 'Metin', textarea: 'Açıklama', number: 'Sayı', date: 'Tarih', select: 'Seçim', multiselect: 'Çoklu seçim', checkbox: 'Onay', notes: 'Notlar',
}

export default function KittPage() {
  const { config } = useConfig()
  const nav = useNavigate()
  // Siparişler yalnızca Ön Montaj sayfasından (durum "Sıraya Alındı") gelir
  const [orders, setOrders] = useState<string[]>([])
  const [data, setData] = useState<KittDataResponse | null>(null)
  const [values, setValues] = useState<Record<string, Record<string, KittCell>>>({})
  const [options, setOptions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [detail, setDetail] = useState<{ open: boolean; orders: string[]; row?: Row }>({ open: false, orders: [] })

  const page = config?.kittPage
  const vcols = page?.virtualColumns ?? []
  const source = config?.dataSources.find((d) => d.id === page?.sourceId)

  const load = useCallback(async (reload = false) => {
    setLoading(true)
    try {
      if (reload) await api.reload()
      const list = await api.kittOrders()
      setOrders(list)
      if (!list.length) { setData(null); setValues({}); setError(null); return }
      const [res, opts] = await Promise.all([api.kittData(list), api.kittOptions()])
      setData(res)
      setValues(res.values || {})
      setOptions(opts)
      setSelected([])
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Kaynak satırları + sanal kolon değerleri (kurallar, filtreler ve dışa aktarma için tek satır nesnesi)
  const rows: Row[] = useMemo(() => {
    if (!data) return []
    return data.rows.map((r) => {
      const v = values[r.__key] || {}
      const o: Row = { ...r }
      for (const c of vcols) o[VC(c.id)] = v[c.id]?.value ?? null
      return o
    })
  }, [data, values, vcols])

  const applyLocal = (keys: string[], colId: string, value: any, by?: string | null) => {
    setValues((prev) => {
      const next = { ...prev }
      for (const k of keys) {
        const cells = { ...(next[k] || {}) }
        if (isEmpty(value)) delete cells[colId]
        else cells[colId] = { value, by, at: new Date().toISOString() }
        next[k] = cells
      }
      return next
    })
  }

  const commit = async (keys: string[], colId: string, value: any) => {
    const before = values
    applyLocal(keys, colId, value)
    try {
      const res = await api.kittSetValue(keys, colId, value)
      applyLocal(keys, colId, value, res.by)
      for (const x of res.extra ?? []) applyLocal(keys, x.columnId, x.value, res.by)
    } catch (e: any) {
      setValues(before)
      message.error(`Kaydedilemedi: ${e.message}`)
    }
  }

  const setNotes = (key: string, colId: string, notes: KittNote[]) => applyLocal([key], colId, notes.length ? notes : null)

  const extraColumns: ExtraColumn[] = useMemo(() => vcols.map((c) => ({
    field: VC(c.id),
    title: c.name,
    width: c.width || (c.type === 'notes' ? 90 : c.type === 'checkbox' ? 80 : 160),
    exportValue: (r: Row) => {
      const v = r[VC(c.id)]
      if (c.type === 'notes' && Array.isArray(v)) return v.map((n: KittNote) => `[${dayjs(n.at).format('DD.MM.YYYY HH:mm')} ${n.by || ''}] ${n.text}`).join('\n')
      if (c.type === 'checkbox') return v ? 'Evet' : ''
      return v
    },
    render: (r: Row) => (
      <VirtualCell
        def={c}
        value={r[VC(c.id)]}
        meta={values[r.__key]?.[c.id]}
        options={options[c.id] ?? c.options}
        onCommit={(v) => commit([r.__key], c.id, v)}
        onAddNote={async (text) => {
          try { setNotes(r.__key, c.id, await api.kittAddNote(r.__key, c.id, text)) } catch (e: any) { message.error(e.message) }
        }}
        onDeleteNote={async (id) => {
          try { setNotes(r.__key, c.id, await api.kittDeleteNote(r.__key, c.id, id)) } catch (e: any) { message.error(e.message) }
        }}
      />
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [vcols, values, options])

  const detailCfg = page?.detail
  const detailOn = !!(detailCfg?.enabled && detailCfg.bomSourceId)
  const linkFields = useMemo(() => {
    if (!detailOn || !detailCfg?.triggerColumn) return undefined
    const col = detailCfg.triggerColumn
    return { [col]: (r: Row) => setDetail({ open: true, orders: [toText(r[col])], row: r }) }
  }, [detailOn, detailCfg?.triggerColumn])

  // Tabloda işaretlenen satırların siparişleri (çoklu toplama için)
  const selectedOrders = useMemo(() => {
    const col = detailCfg?.triggerColumn
    if (!col) return []
    const set = new Set(selected)
    return [...new Set(rows.filter((r) => set.has(r.__key)).map((r) => toText(r[col])).filter(Boolean))]
  }, [selected, rows, detailCfg?.triggerColumn])

  // İlk seçim tipindeki sanal kolona göre ilerleme özeti
  const statusCol = vcols.find((c) => c.type === 'select')
  const progress = useMemo(() => {
    if (!statusCol || !rows.length) return null
    const counts = new Map<string, number>()
    let filled = 0
    for (const r of rows) {
      const v = r[VC(statusCol.id)]
      if (!isEmpty(v)) { filled++; counts.set(toText(v), (counts.get(toText(v)) || 0) + 1) }
    }
    return { filled, counts, percent: Math.round((filled / rows.length) * 100) }
  }, [rows, statusCol])

  if (!config) return null

  if (!page?.sourceId || !page.orderColumn) {
    return (
      <Card>
        <Result
          status="info"
          title="KITT sayfası henüz yapılandırılmamış"
          subTitle="Ayarlar > KITT Hazırlama sekmesinden veri kaynağını, sipariş kolonunu, anahtar kolonları ve sanal kolonları tanımlayın."
          extra={<Button type="primary" icon={<SettingOutlined />} onClick={() => nav('/ayarlar?tab=kitt')}>Ayarlara Git</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="page">
      <TopStrip
        icon={<CheckSquareOutlined />}
        title={page.title || 'KITT Hazırlama'}
        subtitle={
          <Space split="•" size={6} wrap>
            <span>{source?.name ?? '-'}</span>
            {data && <span>{dayjs(data.loadedAt).format('DD.MM HH:mm:ss')}</span>}
            {data && data.warnings.length > 0 && (
              <Tooltip title={<ul className="warn-tip">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}>
                <Tag color="warning" style={{ margin: 0 }}>{data.warnings.length} uyarı</Tag>
              </Tooltip>
            )}
          </Space>
        }
      >
        <Tooltip title="Excel dosyalarındaki son değişiklikleri al"><Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>Yenile</Button></Tooltip>
      </TopStrip>

      {error && <Alert type="error" showIcon message="Veri yüklenemedi" description={error} closable />}

      {progress && statusCol && (
        <div className="stat-cards">
          <div className="stat-card" style={{ ['--c' as any]: '#0b2e59' }}>
            <div className="stat-num">{rows.length}</div>
            <div className="stat-label">Toplam satır</div>
          </div>
          <div className="stat-card wide" style={{ ['--c' as any]: '#389e0d' }}>
            <div className="stat-num">%{progress.percent}</div>
            <div className="stat-label">{statusCol.name} girilen · {progress.filled} / {rows.length}</div>
            <Progress percent={progress.percent} size={[null as any, 4]} showInfo={false} strokeColor="#389e0d" style={{ margin: 0, lineHeight: 0 }} />
          </div>
          {(options[statusCol.id] ?? statusCol.options).map((o) => (
            <div key={o} className="stat-card" style={{ ['--c' as any]: tagHex(statusCol.optionColors?.[o]) }}>
              <div className="stat-num">{progress.counts.get(o) || 0}</div>
              <div className="stat-label">{o}</div>
            </div>
          ))}
          <div className="stat-card" style={{ ['--c' as any]: '#bfbfbf' }}>
            <div className="stat-num">{rows.length - progress.filled}</div>
            <div className="stat-label">Girilmemiş</div>
          </div>
        </div>
      )}

      <Card size="small" className="table-card">
        {!orders.length ? (
          <Empty description="KITT listesi boş: Ön Montaj sayfasında durumu «Sıraya Alındı» yapılan siparişler buraya otomatik gelir" style={{ padding: 60 }} />
        ) : (
          <DataTable
            rows={rows}
            rowKey="__key"
            availableColumns={data?.columns ?? []}
            computedColumns={data?.computedColumns}
            columns={page.columns}
            rules={page.formatRules}
            extraColumns={extraColumns}
            loading={loading}
            pageSize={page.pageSize}
            exportName="KITT_Hazirlama"
            layoutKey="kitt-table"
            linkFields={linkFields}
            toolbarRight={detailOn ? (
              <Tooltip title={selectedOrders.length
                ? `${selectedOrders.join(', ')} birlikte toplanır; aynı malzemeler birleştirilir`
                : `Birden fazla iş emrini birlikte toplamak için satırları kutucuktan işaretleyin. Tek iş emri için "${detailCfg?.triggerColumn}" değerine tıklayın.`}>
                <Button type="primary" icon={<ApartmentOutlined />} disabled={!selectedOrders.length}
                  onClick={() => setDetail({ open: true, orders: selectedOrders, row: selectedOrders.length === 1 ? rows.find((r) => selected.includes(r.__key)) : undefined })}>
                  Seçilenleri Topla {selectedOrders.length > 0 && `(${selectedOrders.length})`}
                </Button>
              </Tooltip>
            ) : undefined}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (k) => setSelected(k as string[]),
              fixed: true,
              columnWidth: 40,
            }}
            toolbarLeft={
              <Space size={8} wrap>
                <Tooltip title="Seçili satırlara aynı değeri ata">
                  <Button icon={<EditOutlined />} disabled={!selected.length || !vcols.length} onClick={() => setBulkOpen(true)}>
                    Toplu Değer Ata {selected.length > 0 && `(${selected.length})`}
                  </Button>
                </Tooltip>
                <RuleSummary rows={rows} rules={page.formatRules} />
              </Space>
            }
          />
        )}
      </Card>

      {detailOn && detailCfg && (
        <KittPickModal
          open={detail.open}
          orders={detail.orders}
          config={detailCfg}
          tables={config.customTables ?? []}
          context={detail.row ? page.columns
            .filter((c) => c.field !== detailCfg.triggerColumn)
            .slice(0, 4)
            .map((c) => ({ label: c.label || c.field, value: formatValue(detail.row![c.field], c.format, c.decimals) }))
            .filter((x) => x.value) : undefined}
          onClose={() => setDetail({ open: false, orders: [] })}
        />
      )}

      <BulkEditModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        columns={vcols}
        options={options}
        count={selected.length}
        onApply={async (col, value) => {
          if (col.type === 'notes') {
            for (const k of selected) setNotes(k, col.id, await api.kittAddNote(k, col.id, String(value)))
          } else {
            await commit(selected, col.id, value)
          }
          message.success(`${selected.length} satır güncellendi`)
          setBulkOpen(false)
        }}
      />
    </div>
  )
}

function BulkEditModal({ open, onClose, columns, options, count, onApply }: {
  open: boolean
  onClose: () => void
  columns: VirtualColumnDef[]
  options: Record<string, string[]>
  count: number
  onApply: (col: VirtualColumnDef, value: any) => Promise<void>
}) {
  const [colId, setColId] = useState<string>()
  const [value, setValue] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const col = columns.find((c) => c.id === colId)

  useEffect(() => { if (open) { setValue(null) } }, [open])

  return (
    <Modal
      open={open}
      title={`Toplu Değer Ata — ${count} satır`}
      onCancel={onClose}
      okText="Uygula"
      cancelText="Vazgeç"
      confirmLoading={busy}
      okButtonProps={{ disabled: !col || (col.type === 'notes' && isEmpty(value)) }}
      onOk={async () => {
        if (!col) return
        setBusy(true)
        try { await onApply(col, value) } catch (e: any) { message.error(e.message) } finally { setBusy(false) }
      }}
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label="Kolon">
          <Select
            value={colId}
            onChange={(v) => { setColId(v); setValue(null) }}
            placeholder="Değer atanacak kolonu seçin"
            options={columns.map((c) => ({ value: c.id, label: `${c.name} (${TYPE_ICON[c.type] ?? c.type})` }))}
          />
        </Form.Item>
        {col && (
          <Form.Item
            label={col.type === 'notes' ? 'Eklenecek not' : 'Değer'}
            extra={col.type === 'notes' ? 'Not, seçili tüm satırların not geçmişine eklenir.' : 'Boş bırakılırsa seçili satırlardaki değer silinir.'}
          >
            <ValueInput def={col} value={value} options={options[col.id] ?? col.options} onChange={setValue} autoFocus />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
