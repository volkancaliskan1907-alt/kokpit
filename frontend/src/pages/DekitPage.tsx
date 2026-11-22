import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Popconfirm, Result, Tooltip, message } from 'antd'
import { CloseOutlined, InboxOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useConfig } from '../lib/config'
import type { ColumnView, DekitCompare, DekitConfig, DekitSummaryRow, FormatRule, Row } from '../types'
import DataTable, { type ExtraColumn } from '../components/DataTable'
import DekitModal from '../components/DekitModal'
import TopStrip from '../components/TopStrip'

/** Ayarlardaki iş emri formatına göre adres önizlemesi (sunucudaki mantıkla aynı). */
export function addressPreview(order: string, c: DekitConfig): string {
  let s = order.trim()
  s = s.slice(Math.min(Math.max(c.stripLeft, 0), s.length))
  s = s.slice(0, s.length - Math.min(Math.max(c.stripRight, 0), s.length))
  return s.toUpperCase()
}

const col = (field: string, p: Partial<ColumnView> = {}): ColumnView =>
  ({ field, label: null, width: null, format: 'auto', decimals: null, aggregate: 'none', fixed: false, ...p }) as ColumnView

export default function DekitPage() {
  const { config } = useConfig()
  const nav = useNavigate()
  // Liste otomatik: KITT'te hazırlık durumu "DEKIT Geldi" olan iş emirleri
  const [orders, setOrders] = useState<string[]>([])
  // KITT Hazırlama sayfasında eklenmiş iş emirleri: Kalsın / Gitsin karşılaştırması bunlarla yapılır
  const [kittOrders, setKittOrders] = useState<string[]>([])
  useEffect(() => { api.kittOrders().then(setKittOrders).catch(() => {}) }, [])
  const [compare, setCompare] = useState<DekitCompare | null>(null)
  const [summary, setSummary] = useState<DekitSummaryRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; order: string | null }>({ open: false, order: null })

  const c = config?.dekit
  const ready = !!(c?.stockSourceId && c.addressColumn && c.materialColumn)

  const load = useCallback(async (reload = false) => {
    if (!ready) { setSummary([]); setWarnings([]); return }
    setLoading(true)
    try {
      if (reload) await api.reload()
      const [arrived, kit] = await Promise.all([api.dekitArrived(), api.kittOrders()])
      setOrders(arrived.orders); setKittOrders(kit)
      if (!arrived.orders.length) { setSummary([]); setWarnings([]); setError(null); return }
      const r = await api.dekitSummary(arrived.orders, kit)
      setSummary(r.rows); setWarnings(r.warnings); setCompare(r.compare); setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [ready])

  useEffect(() => { load() }, [load])

  const rows: Row[] = useMemo(() => summary.map((s) => ({
    __key: s.order,
    'İş Emri': s.order,
    'Adres': s.address ?? '—',
    'Hazırlık Durumu': s.status ?? '',
    'Malzeme': s.materialCount,
    'Adreste Toplam': s.total,
    [c?.keepLabel ?? 'Kalsın']: s.decided ? s.keep : null,
    [c?.goLabel ?? 'Gitsin']: s.decided ? s.go : null,
    'Harici Stok': s.decided ? s.external : null,
    'Sonuç': !s.found ? 'Bu adreste malzeme yok' : s.decided ? 'Karar verildi' : (s.note ?? '—'),
  })), [summary, c])

  const views: ColumnView[] = useMemo(() => c ? [
    col('İş Emri', { width: 170, aggregate: 'count', fixed: true }),
    col('Adres', { width: 160 }),
    col('Hazırlık Durumu', { width: 160 }),
    col('Malzeme', { label: 'Adreste Malzeme', width: 130, format: 'integer', aggregate: 'sum' }),
    col('Adreste Toplam', { width: 140, format: 'number', decimals: 2, aggregate: 'sum' }),
    col(c.keepLabel, { width: 100, format: 'integer', aggregate: 'sum' }),
    col(c.goLabel, { width: 100, format: 'integer', aggregate: 'sum' }),
    ...(c.externalTableId ? [col('Harici Stok', { width: 110, format: 'integer', aggregate: 'sum' })] : []),
    col('Sonuç', { width: 260 }),
  ] : [], [c])

  const rules: FormatRule[] = useMemo(() => c ? [
    { id: 'g', name: c.goLabel, enabled: true, column: c.goLabel, operator: 'gt', value: '0', target: 'cell', backColor: '#fff1f0', foreColor: '#cf1322', bold: true, stopIfTrue: false },
    { id: 'k', name: c.keepLabel, enabled: true, column: c.keepLabel, operator: 'gt', value: '0', target: 'cell', backColor: '#f6ffed', foreColor: '#237804', bold: true, stopIfTrue: false },
    { id: 'e', name: 'Harici', enabled: true, column: 'Harici Stok', operator: 'gt', value: '0', target: 'cell', backColor: '#e6f4ff', foreColor: '#0958d9', bold: true, stopIfTrue: false },
    { id: 'n', name: 'Adreste yok', enabled: true, column: 'Sonuç', operator: 'eq', value: 'Bu adreste malzeme yok', target: 'row', backColor: '#fafafa', foreColor: '#8c8c8c', bold: false, stopIfTrue: false },
  ] : [], [c])

  const remove = async (order: string) => {
    try {
      await api.kittOrdersRemove([order])
      message.success(`${order} DEKIT ve KITT Hazırlama listesinden silindi`)
      await load()
    } catch (e: any) { message.error(e.message) }
  }

  const extra: ExtraColumn[] = [{
    field: '__remove', title: '', width: 52, noFilter: true, fixed: 'right', exportValue: () => null,
    render: (r) => (
      <Popconfirm title="Bu iş emri DEKIT ve KITT Hazırlama listesinden silinsin mi?" description="KITT'te girilen değerler ve toplama işaretleri de silinir." okText="Sil" cancelText="Vazgeç"
        onConfirm={() => remove(String(r.__key))}>
        <Button size="small" type="text" danger icon={<CloseOutlined />} title="Sil" />
      </Popconfirm>
    ),
  }]

  if (!config || !c) return null

  if (!ready) {
    return (
      <Card>
        <Result status="info" title="DEKIT sayfası henüz yapılandırılmamış"
          subTitle="Ayarlar > DEKIT bölümünden iş emri formatını, LX02 stok kaynağını ve adres kolonunu seçin."
          extra={<Button type="primary" icon={<SettingOutlined />} onClick={() => nav('/ayarlar?s=dekit.format')}>Ayarlara Git</Button>} />
      </Card>
    )
  }

  const arrivedCount = summary.filter((s) => s.arrived).length
  const foundCount = summary.filter((s) => s.found).length
  const keepSum = summary.reduce((a, s) => a + (s.decided ? s.keep : 0), 0)
  const goSum = summary.reduce((a, s) => a + (s.decided ? s.go : 0), 0)
  const extSum = summary.reduce((a, s) => a + (s.decided ? s.external : 0), 0)
  return (
    <div className="page">
      <TopStrip
        icon={<InboxOutlined />}
        title={c.title || 'DEKIT'}
        subtitle={<span>Adres = iş emri{c.stripLeft > 0 ? ` − soldan ${c.stripLeft}` : ''}{c.stripRight > 0 ? ` − sağdan ${c.stripRight}` : ''} karakter
          {compare && <> · <Tooltip title={compare.count ? `Karşılaştırılan iş emirleri: ${compare.orders.join(', ')}` : (compare.note ?? '')}><b style={{ color: compare.count ? undefined : '#cf1322' }}>{compare.count} iş emriyle karşılaştırılıyor</b></Tooltip></>}
        </span>}
      >
        <div className="dekit-add">
          <Tooltip title="Excel dosyalarındaki son değişiklikleri al"><Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>Yenile</Button></Tooltip>
        </div>
      </TopStrip>

      {error && <Alert type="error" showIcon message="Veri yüklenemedi" description={error} closable />}
      {warnings.length > 0 && <Alert type="warning" showIcon closable message={warnings.join(' • ')} />}

      {orders.length > 0 && (
        <div className="stat-cards">
          <div className="stat-card" style={{ ['--c' as any]: '#0b2e59' }}><div className="stat-num">{orders.length}</div><div className="stat-label">Eklenen iş emri</div></div>
          <div className="stat-card" style={{ ['--c' as any]: '#1d5fa8' }}><div className="stat-num">{foundCount}</div><div className="stat-label">Adreste malzeme bulunan</div></div>
          <div className="stat-card" style={{ ['--c' as any]: '#722ed1' }}><div className="stat-num">{arrivedCount}</div><div className="stat-label">"{c.statusValue}"</div></div>
          <div className="stat-card" style={{ ['--c' as any]: '#389e0d' }}><div className="stat-num">{keepSum}</div><div className="stat-label">{c.keepLabel} (malzeme)</div></div>
          <div className="stat-card" style={{ ['--c' as any]: '#cf1322' }}><div className="stat-num" style={{ color: '#cf1322' }}>{goSum}</div><div className="stat-label">{c.goLabel} (malzeme)</div></div>
          {c.externalTableId && <div className="stat-card" style={{ ['--c' as any]: '#1677ff' }}><div className="stat-num">{extSum}</div><div className="stat-label">Harici stokta geçen</div></div>}
        </div>
      )}

      <Card size="small" className="table-card">
        {!orders.length ? (
          <div className="dekit-empty">
            <InboxOutlined />
            <div>Listede iş emri yok</div>
            <span>KITT Hazırlama sayfasında hazırlık durumu <b>{c.statusValue}</b> yapılan iş emirleri buraya otomatik gelir. İş emrinin <b>{c.stripLeft > 0 ? `soldan ${c.stripLeft} karakteri silinerek` : 'olduğu gibi'}</b> adres elde edilir ve LX02'deki o adreste duran malzemeler listelenir.</span>
          </div>
        ) : (
          <DataTable
            rows={rows}
            rowKey="__key"
            availableColumns={views.map((v) => v.field)}
            columns={views}
            extraColumns={extra}
            rules={rules}
            loading={loading}
            exportName="DEKIT"
            layoutKey="dekit-table"
            pageSize={100}
            linkFields={{ 'İş Emri': (r) => setModal({ open: true, order: String(r.__key) }) }}
          />
        )}
      </Card>

      <DekitModal open={modal.open} order={modal.order} orders={orders} others={kittOrders} config={c} onClose={() => setModal({ open: false, order: null })} />
    </div>
  )
}
