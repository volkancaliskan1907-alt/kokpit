import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Popconfirm, Popover, Spin, Tag, Tooltip, message } from 'antd'
import type { InputRef } from 'antd'
import { CheckCircleFilled, InboxOutlined, ScanOutlined, UndoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import type { ColumnView, DekitConfig, DekitDetail, FormatRule, Row } from '../types'
import { formatValue, toText } from '../lib/values'
import { useAutoScan } from '../lib/useAutoScan'
import { useLocalState } from '../lib/useLocalState'
import DataTable, { type ExtraColumn } from './DataTable'

interface Props {
  open: boolean
  order: string | null
  /** DEKIT sayfasında eklenmiş tüm iş emirleri (karşılaştırmadan hariç tutulur) */
  orders: string[]
  /** KITT Hazırlama'da eklenmiş iş emirleri (karşılaştırılacaklar) */
  others: string[]
  config: DekitConfig
  onClose: () => void
}

type Kind = 'keep' | 'go' | 'external' | 'none' | 'unknown'

/** Büyük sonuç panelinde gösterilen son okutma. */
interface ScanResult {
  kind: Kind
  label: string
  material: string
  description?: string | null
  qty?: number | null
  kart: string[]
  needs: string[]
  inList: boolean
  note?: string | null
  at: number
}

const fmt = (n: number) => formatValue(n, 'number', n % 1 === 0 ? 0 : 2)
const normKey = (s: unknown) => {
  const t = toText(s).trim().toUpperCase()
  return /^\d+$/.test(t) ? t.replace(/^0+(?=.)/, '') : t
}

/** Sonuca göre ayırt edilebilir sesler: Kalsın tiz kısa, Gitsin pes uzun, Harici çift, bilinmeyen testere. */
function beep(kind: Kind) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = type; o.frequency.value = freq; g.gain.value = 0.09
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur)
    }
    if (kind === 'keep') tone(1250, 0, 0.12)
    else if (kind === 'go') tone(520, 0, 0.4, 'triangle')
    else if (kind === 'external') { tone(900, 0, 0.1); tone(900, 0.16, 0.1) }
    else tone(300, 0, 0.35, 'square')
    setTimeout(() => ctx.close(), 900)
  } catch { /* ses desteklenmiyor */ }
}

/** KART deposundaki adresler (yalnızca adres): ilk birkaçı, fazlası "+N" ile açılır. */
function KartCell({ list, max }: { list: string[]; max: number }) {
  if (!list.length) return <span className="muted">—</span>
  const shown = list.slice(0, max)
  const rest = list.slice(max)
  return (
    <div className="kart-cell">
      {shown.map((a) => <span key={a} className="addr-chip"><b>{a}</b></span>)}
      {rest.length > 0 && (
        <Popover trigger="click" placement="left" title={`${list.length} KART adresi`}
          content={<div className="kart-pop">{list.map((a) => <span key={a} className="addr-chip"><b>{a}</b></span>)}</div>}>
          <a className="addr-more" onClick={(e) => e.stopPropagation()}>+{rest.length} daha</a>
        </Popover>
      )}
    </div>
  )
}

export default function DekitModal({ open, order, orders, others, config: c, onClose }: Props) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width="min(1400px, 96vw)" style={{ top: 16 }} className="pick-modal" destroyOnClose>
      {open && order && <DekitBody key={order} order={order} orders={orders} others={others} config={c} />}
    </Modal>
  )
}

function DekitBody({ order, orders, others, config: c }: { order: string; orders: string[]; others: string[]; config: DekitConfig }) {
  const [data, setData] = useState<DekitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Okutulan (ayrıştırılan) malzemeler: iş emri bazında kullanıcı tercihi olarak sunucuda saklanır
  const [scanned, setScanned] = useLocalState<Record<string, string>>(`kokpit.dekit.scanned.${order}`, {})
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    api.dekitDetail(order, orders, others).then(setData).catch((e) => setError(e.message)).finally(() => { setLoading(false); setTimeout(() => inputRef.current?.focus(), 60) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const descCol = useMemo(() => data?.columns.find((f) => /kısa metni|tanım|açıklama/i.test(f) && f !== c.materialColumn), [data, c.materialColumn])

  const show = (r: ScanResult) => {
    setResult(r)
    setHistory((h) => [r, ...h.filter((x) => x.material !== r.material)].slice(0, 12))
    beep(r.kind)
  }
  const markScanned = (mk: string) => setScanned((s) => ({ ...s, [mk]: new Date().toISOString() }))

  const scan = useAutoScan(async (raw, definite) => {
    if (!data) return false
    const cands = new Set([normKey(raw), ...raw.split(/[\s;,|\t]+/).map(normKey)].filter(Boolean))
    const row = data.rows.find((r) => cands.has(String(r.__mk)))
    if (row) {
      const kind: Kind = row.__decision ?? 'none'
      markScanned(String(row.__mk))
      show({
        kind, label: row.__karar || 'KARAR YOK', material: toText(row[c.materialColumn ?? '']) || String(row.__mk),
        description: descCol ? toText(row[descCol]) : null, qty: c.qtyColumn ? Number(row[c.qtyColumn] ?? 0) : null,
        kart: row.__kart ?? [], needs: row.__needs ?? [], inList: true, note: null, at: Date.now(),
      })
      return true
    }
    // Adres listesinde yok: elle yazılıyorsa beklemeye devam et; okuyucu / Enter ise sistemde ara
    if (!definite) return false
    try {
      const res = await api.dekitLookup(order, raw, orders, others)
      if (!res.known) {
        show({ kind: 'unknown', label: 'TANINMIYOR', material: res.code, kart: [], needs: [], inList: false, note: res.note, at: Date.now() })
      } else {
        if (res.mk) markScanned(res.mk)
        show({
          kind: res.decision ?? 'none', label: res.label || 'KARAR YOK', material: res.material, description: res.description,
          qty: res.qtyAtAddress, kart: res.kart, needs: res.needs, inList: res.inList,
          note: res.inList ? res.note : `Bu malzeme ${data.address} adresinde listede değil${res.note ? ` · ${res.note}` : ''}`, at: Date.now(),
        })
      }
    } catch (e: any) {
      message.error(e.message)
    }
    return true
  })

  const views: ColumnView[] = useMemo(() => {
    if (!data) return []
    if (c.columns.length) return c.columns.filter((v) => data.columns.includes(v.field))
    return data.columns.map((f) => ({
      field: f, format: f === c.qtyColumn ? 'number' : 'auto', decimals: f === c.qtyColumn ? 2 : null,
      aggregate: f === c.qtyColumn ? 'sum' : f === c.materialColumn ? 'count' : 'none', fixed: false, label: null, width: null,
    }) as ColumnView)
  }, [data, c])

  const rules: FormatRule[] = useMemo(() => [
    { id: 'go', name: c.goLabel, enabled: true, column: '__karar', operator: 'eq', value: c.goLabel, target: 'row', backColor: '#fff1f0', foreColor: '#a8071a', bold: false, stopIfTrue: false },
    { id: 'ext', name: c.externalLabel, enabled: true, column: '__karar', operator: 'eq', value: c.externalLabel, target: 'row', backColor: '#e6f4ff', foreColor: '#0958d9', bold: false, stopIfTrue: false },
  ], [c.goLabel, c.externalLabel])

  const rows: Row[] = useMemo(() => (data?.rows ?? []).map((r) => ({ ...r, __okut: scanned[String(r.__mk)] ? 'Okutuldu' : 'Bekliyor' })), [data, scanned])
  const scannedCount = rows.filter((r) => r.__okut === 'Okutuldu').length

  const extra: ExtraColumn[] = useMemo(() => [
    {
      field: '__kart', title: 'Kart Depo Adresleri', width: 260,
      render: (r: Row) => <KartCell list={r.__kart ?? []} max={c.maxKartAddresses || 3} />,
      exportValue: (r: Row) => (r.__kart ?? []).join(', '),
    },
    {
      field: '__karar', title: 'Karar', width: 190,
      render: (r: Row) => r.__decision === 'go'
        ? <Tooltip title="Başka hiçbir iş emrinin COOIS listesinde geçmiyor"><Tag color="red" className="decision-tag go">{r.__karar}</Tag></Tooltip>
        : r.__decision === 'keep'
          ? <Tooltip title={`İhtiyaç duyan iş emri: ${(r.__needs ?? []).join(', ')}`}><Tag color="green" className="decision-tag">{r.__karar}</Tag></Tooltip>
          : r.__decision === 'external'
            ? <Tag color="blue" className="decision-tag ext">{r.__karar}</Tag>
            : <span className="muted">—</span>,
      exportValue: (r: Row) => r.__karar,
    },
    {
      field: '__okut', title: 'Okutuldu', width: 130,
      render: (r: Row) => r.__okut === 'Okutuldu'
        ? <Tooltip title={dayjs(scanned[String(r.__mk)]).format('DD.MM.YYYY HH:mm:ss')}><Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0 }}>{dayjs(scanned[String(r.__mk)]).format('HH:mm')}</Tag></Tooltip>
        : <Tag style={{ margin: 0 }}>Bekliyor</Tag>,
      exportValue: (r: Row) => r.__okut,
    },
  ], [c.maxKartAddresses, scanned])

  return (
    <>
      <div className="pick-header">
        <div className="pick-title">
          <div className="pick-overline">{c.title || 'DEKIT'}</div>
          <div className="pick-order">{order}</div>
          {data && <div className="pick-context"><span><em>Adres</em> {data.address}</span><span><em>Satır</em> {data.rowCount}</span></div>}
        </div>

        <div className="pick-scan">
          <div className="scan-box">
            <ScanOutlined className="scan-icon" />
            <Input ref={inputRef} variant="borderless" className="scan-input" placeholder="Gelen malzemeyi okutun" disabled={!data} autoFocus
              value={scan.value} onChange={(e) => scan.onChange(e.target.value)} onPressEnter={scan.onEnter} />
            <span className="scan-auto" title="Okutunca Enter'a basmaya gerek yok">otomatik</span>
          </div>
          <div className="scan-feedback idle"><span>Okutunca aşağıda büyük sonuç görünür; listede olmayan malzemeler için de karar verilir</span></div>
        </div>

        {data && (
          <div className="dekit-head-stats">
            <div><b>{fmt(data.total)}</b><span>Adreste toplam</span></div>
            <div><b>{scannedCount} / {data.materialCount}</b><span>Okutulan</span></div>
            {data.decided && <div className="keep"><b>{data.keep}</b><span>{c.keepLabel}</span></div>}
            {data.decided && <div className="go"><b>{data.go}</b><span>{c.goLabel}</span></div>}
            {data.decided && data.external > 0 && <div className="ext"><b>{data.external}</b><span>Harici stok</span></div>}
          </div>
        )}
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {loading && <div style={{ padding: 80, textAlign: 'center' }}><Spin size="large" /></div>}

      {data && (
        <>
          {/* ---------------- Okutulan malzemenin büyük sonucu */}
          <div className={`scan-result ${result?.kind ?? 'idle'}`} lang="tr">
            {result ? (
              <>
                <div className="scan-result-label">{result.label}</div>
                <div className="scan-result-main">
                  <div className="scan-result-material">{result.material}{result.description && <span>{result.description}</span>}</div>
                  <div className="scan-result-details">
                    {result.qty !== null && result.qty !== undefined && result.inList && <span>Adreste: <b>{fmt(result.qty)}</b></span>}
                    {result.kind === 'keep' && result.needs.length > 0 && <span>İhtiyaç duyan: <b>{result.needs.slice(0, 4).join(', ')}{result.needs.length > 4 ? '…' : ''}</b></span>}
                    {result.kind === 'go' && <span>Başka iş emrinin listesinde geçmiyor</span>}
                    {result.kart.length > 0 && <span>KART: <b>{result.kart.slice(0, 4).join(', ')}{result.kart.length > 4 ? ` +${result.kart.length - 4}` : ''}</b></span>}
                    {result.note && <span className="note">{result.note}</span>}
                  </div>
                </div>
                <div className="scan-result-time">{dayjs(result.at).format('HH:mm:ss')}</div>
              </>
            ) : (
              <div className="scan-result-empty"><ScanOutlined /> Malzemeyi okutun — {c.keepLabel} / {c.goLabel} sonucu burada büyük görünür</div>
            )}
          </div>

          {history.length > 1 && (
            <div className="scan-history">
              <span className="muted">Son okutulanlar:</span>
              {history.slice(1).map((h) => (
                <Tooltip key={h.material} title={`${h.label}${h.description ? ' · ' + h.description : ''}`}>
                  <span className={`hist-chip ${h.kind}`}>{h.material}</span>
                </Tooltip>
              ))}
              <Popconfirm title="Okutulan işaretleri sıfırla?" description="Bu iş emri için tüm 'Okutuldu' kayıtları silinir." okText="Sıfırla" cancelText="Vazgeç"
                onConfirm={() => { setScanned({}); setHistory([]); setResult(null) }}>
                <Button size="small" type="text" icon={<UndoOutlined />}>Sıfırla</Button>
              </Popconfirm>
            </div>
          )}

          {data.decided && (
            <div className="compare-note">
              <b>{c.keepLabel}</b>: malzeme, KITT Hazırlama'da eklenmiş ve durumu "{c.statusValue}" olmayan <b>{data.compare.count}</b> başka iş emrinin COOIS listesinde geçiyor ·{' '}
              <b style={{ color: '#cf1322' }}>{c.goLabel}</b>: hiçbirinde geçmiyor
              <Tooltip title={data.compare.orders.join(', ')}><a style={{ marginLeft: 8 }}>iş emirleri</a></Tooltip>
            </div>
          )}
          {data.warnings.map((w, i) => <Alert key={i} type="warning" showIcon style={{ marginBottom: 8 }} message={w} />)}
          {data.rows.length === 0 ? (
            <Empty description={<>"<b>{data.address}</b>" adresinde malzeme bulunamadı</>} style={{ padding: 30 }}
              image={<InboxOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />} />
          ) : (
            <DataTable
              rows={rows}
              rowKey="__id"
              availableColumns={data.columns}
              columns={views}
              rules={rules}
              extraColumns={extra}
              exportName={`DEKIT_${order}`}
              layoutKey="dekit-modal"
              pageSize={200}
              bottomReserve={140}
              toolbarRight={<Tooltip title="Adreste bulunan malzemelerin toplam miktarı"><Tag color="blue" style={{ margin: 0 }}>Toplam: {fmt(data.total)}</Tag></Tooltip>}
            />
          )}
        </>
      )}
    </>
  )
}
