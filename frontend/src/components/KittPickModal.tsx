import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Empty, Input, Modal, Popover, Progress, Select, Space, Spin, Switch, Table, Tag, Tooltip, message } from 'antd'
import type { InputRef } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleFilled, CheckOutlined, CloseCircleFilled, ColumnWidthOutlined, EnvironmentOutlined, ExclamationCircleFilled, FileExcelOutlined,
  ScanOutlined, SearchOutlined, SelectOutlined, UndoOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import type { CustomTableDef, KittCell, KittDetailConfig, KittNote, PickDetailResponse, PickInfo, Row, StockAddress } from '../types'
import { compareValues, formatValue, toNumber, toText } from '../lib/values'
import { layoutComponents, useColumnLayout } from '../lib/columnLayout'
import FilterBar, { applyFilters, buildFilterFields, type FilterValues } from './FilterBar'
import VirtualCell from './VirtualCell'
import Clip from './Clip'
import { useFillHeight } from '../lib/useFillHeight'

interface Props {
  open: boolean
  orders: string[]
  /** Tek sipariş açıldığında başlıkta gösterilecek bilgiler */
  context?: { label: string; value: string }[]
  config: KittDetailConfig
  tables: CustomTableDef[]
  onClose: () => void
}

type Feedback = { type: 'success' | 'error' | 'warning'; text: string } | null

const PICK = 'pick:'
const NONE = '__none'
const norm = (s: unknown) => toText(s).trim().toUpperCase().replace(/^0+(?=.)/, '')
const fmtQty = (n: number) => formatValue(n, 'number', n % 1 === 0 ? 0 : 2)

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = ok ? 1250 : 300
    o.type = ok ? 'sine' : 'square'
    g.gain.value = 0.08
    o.connect(g); g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.35))
    o.onended = () => ctx.close()
  } catch { /* ses desteklenmiyor */ }
}

export default function KittPickModal({ open, orders, context, config: d, tables, onClose }: Props) {
  const [data, setData] = useState<PickDetailResponse | null>(null)
  const [picks, setPicks] = useState<Record<string, PickInfo>>({})
  const [process, setProcess] = useState<Record<string, string>>({})
  const [values, setValues] = useState<Record<string, Record<string, KittCell>>>({})
  const [vcOptions, setVcOptions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scan, setScan] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [rowClick, setRowClick] = useState(false)
  const [groupSame, setGroupSame] = useState(true)
  const [filters, setFilters] = useState<FilterValues>({})
  const [busy, setBusy] = useState(false)
  const scanRef = useRef<InputRef>(null)
  const layout = useColumnLayout('kitt-pick-modal')
  const fill = useFillHeight(40, 160)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, opts] = await Promise.all([api.kittDetail(orders), api.kittOptions().catch(() => ({}))])
      setData(res)
      setPicks(res.picks || {})
      setProcess(res.process || {})
      setValues(res.values || {})
      setVcOptions(opts)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
      setTimeout(() => scanRef.current?.focus(), 50)
    }
  }

  useEffect(() => {
    if (!open) return
    setFeedback(null); setSearch(''); setOnlyOpen(false); setScan(''); setFilters({})
    if (orders.length) load()
    else { setData(null); setError(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orders.join('|')])

  const multi = (data?.orders.length ?? 0) > 1
  const grouped = multi && groupSame
  const matCol = d.bomMaterialColumn || ''
  const vcols = d.virtualColumns ?? []
  const kanban = data?.kanban ?? {}
  const isKanban = (mk: string) => mk in kanban
  const descCol = useMemo(() => data?.columns.find((c) => /kısa metni|tanım|açıklama/i.test(c) && c !== matCol), [data, matCol])

  const views = useMemo(() => {
    if (!data) return []
    const avail = data.columns
    return d.bomColumns.length
      ? d.bomColumns.filter((c) => avail.includes(c.field))
      : avail.map((f) => ({ field: f, format: 'auto' as const, aggregate: 'none' as const, fixed: false, label: null, width: null, decimals: null }))
  }, [data, d.bomColumns])

  // ---------------------------------------------------------------- Satırlar (çoklu siparişte aynı malzemeler birleştirilir)
  const baseRows: Row[] = useMemo(() => {
    if (!data) return []
    if (!grouped) return data.rows.map((r) => ({ ...r, __keys: [r.__key], __orders: [r.__order] }))
    const numeric = new Set(views.filter((v) => ['number', 'integer', 'percent'].includes(v.format)).map((v) => v.field))
    const map = new Map<string, Row>()
    for (const r of data.rows) {
      const g = r.__mk || r.__key
      const ex = map.get(g)
      if (!ex) {
        map.set(g, { ...r, __key: `g:${g}`, __keys: [r.__key], __orders: [r.__order] })
        continue
      }
      ex.__keys.push(r.__key)
      if (!ex.__orders.includes(r.__order)) ex.__orders.push(r.__order)
      for (const f of numeric) {
        const a = toNumber(ex[f]), b = toNumber(r[f])
        if (a !== null || b !== null) ex[f] = (a ?? 0) + (b ?? 0)
      }
    }
    return [...map.values()]
  }, [data, grouped, views])

  const pickState = (r: Row) => {
    const n = r.__keys.filter((k: string) => picks[k]).length
    return n === 0 ? 'none' : n === r.__keys.length ? 'all' : 'some'
  }
  const lastPick = (r: Row): PickInfo | undefined =>
    r.__keys.map((k: string) => picks[k]).filter(Boolean).sort((a: PickInfo, b: PickInfo) => b.at.localeCompare(a.at))[0]
  const vcValue = (r: Row, id: string) => values[r.__keys[0]]?.[id]?.value ?? null
  const procText = (r: Row) => (isKanban(r.__mk) ? (d.kanban?.label || 'Kanban') : process[r.__mk] ?? '')
  const addrText = (r: Row) => (isKanban(r.__mk) ? '-' : (data?.addresses[r.__mk] ?? []).map((a) => a.address).join(', '))
  // İşlem tipi (Delik içi / Özel işlem...) veya Kanban nedeniyle ilerleme sayımı dışında kalan malzemeler
  const excludedMats = useMemo(() => {
    const s = new Set<string>()
    if (d.kanban?.excludeFromCount) for (const mk of Object.keys(kanban)) s.add(mk)
    for (const [mk, label] of Object.entries(process)) {
      const o = d.processOptions.find((x) => x.label === label)
      if (o && o.excludeFromCount !== false) s.add(mk)
    }
    return s
  }, [kanban, process, d.kanban?.excludeFromCount, d.processOptions])
  const isExcluded = (r: Row) => excludedMats.has(r.__mk)
  const statusText = (r: Row) => (isExcluded(r) && pickState(r) === 'none' ? 'Sayım dışı' : ({ all: 'Alındı', some: 'Kısmen', none: 'Bekliyor' } as const)[pickState(r)])

  /** Filtre / arama / Excel için kolon değeri */
  const getValue = (r: Row, key: string): unknown => {
    switch (key) {
      case '__orders': return r.__orders
      case '__addr': return addrText(r)
      case '__proc': return procText(r)
      case '__status': return statusText(r)
      default: {
        if (key.startsWith('__marker')) {
          const mi = Number(key.slice(8))
          const m = d.markerColumns?.[mi]
          return data?.markers?.[mi]?.[r.__mk] ? (m?.label || m?.title || '') : (m?.absentLabel ?? '')
        }
        return key.startsWith('vc:') ? vcValue(r, key.slice(3)) : r[key]
      }
    }
  }

  const filterFields = useMemo(() => buildFilterFields(baseRows, [
    ...(multi ? [{ key: '__orders', label: 'Sipariş', kind: 'select' as const, options: data?.orders ?? [] }] : []),
    ...views.map((v) => ({ key: v.field, label: v.label || v.field })),
    ...(d.stockAddressColumn ? [{ key: '__addr', label: 'Depo Adresi', kind: 'text' as const }] : []),
    { key: '__proc', label: d.processTitle || 'İşlem Tipi', kind: 'select' as const },
    ...(d.markerColumns ?? []).map((m, mi) => ({ key: `__marker${mi}`, label: m.title || m.label, kind: 'select' as const, options: [m.label, m.absentLabel || ''] })),
    ...vcols.filter((c) => c.type !== 'notes').map((c) => ({ key: `vc:${c.id}`, label: c.name })),
    { key: '__status', label: 'Durum', kind: 'select' as const, options: ['Alındı', 'Kısmen', 'Bekliyor', 'Sayım dışı'] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], getValue), [baseRows, views, multi, vcols, process, picks, values, data])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    let list = applyFilters(baseRows, filterFields, filters, getValue)
    if (onlyOpen) list = list.filter((r) => pickState(r) !== 'all' && !isExcluded(r))
    if (q) list = list.filter((r) => [...views.map((v) => r[v.field]), addrText(r), procText(r), r.__orders.join(' ')]
      .some((x) => toText(x).toLocaleLowerCase('tr').includes(q)))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, search, onlyOpen, picks, filters, filterFields, views, process, excludedMats])

  const counted = data ? data.rows.filter((r) => !excludedMats.has(r.__mk)) : []
  const excludedCount = (data?.rows.length ?? 0) - counted.length
  const total = counted.length
  const pickedCount = counted.filter((r) => picks[r.__key]).length
  const percent = total ? Math.round((pickedCount / total) * 100) : 0

  // ---------------------------------------------------------------- İşlemler
  const setPicked = async (keys: string[], picked: boolean, method: 'scan' | 'manual') => {
    if (!keys.length) return true
    setBusy(true)
    try {
      const res = await api.kittPicks(keys, picked, method)
      setPicks((p) => {
        const n = { ...p }
        for (const k of keys) { if (res[k]) n[k] = res[k]; else delete n[k] }
        return n
      })
      return true
    } catch (e: any) {
      message.error(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const togglePick = (r: Row) => setPicked(r.__keys, pickState(r) !== 'all', 'manual')

  const flashRows = (keys: string[]) => {
    setFlash(new Set(keys))
    setTimeout(() => setFlash(new Set()), 1600)
    setTimeout(() => document.querySelector(`.pick-table tr[data-row-key="${CSS.escape(keys[0])}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }

  // Okutma: Enter gerekmez. Okuyucunun hızlı yazışı (veya yapıştırma) algılanınca kısa bir duraklamadan sonra otomatik işlenir;
  // elle yavaş yazılıyorsa tam eşleşme olunca (veya Enter ile) işlenir.
  const scanTimer = useRef<number | undefined>(undefined)
  const scanLast = useRef(0)
  const scanGap = useRef(0)
  const scanFn = useRef<(raw: string, fast: boolean) => void>(() => {})

  const onScanChange = (v: string) => {
    const now = performance.now()
    const added = v.length - scan.length
    // Okuyucu tuşları 70 ms'den kısa aralıklarla gönderir; elle yazarken en az bir duraklama olur
    scanGap.current = !scan ? 0 : Math.max(scanGap.current, now - scanLast.current)
    scanLast.current = now
    setScan(v)
    window.clearTimeout(scanTimer.current)
    if (!v.trim()) return
    const fast = added >= 4 || (v.length >= 4 && scanGap.current < 70)
    scanTimer.current = window.setTimeout(() => scanFn.current(v, fast), fast ? 90 : 700)
  }

  const onScan = async (rawValue = scan, explicit = true) => {
    const raw = rawValue.trim()
    if (!raw || !data) return
    const candidates = new Set([norm(raw), ...raw.split(/[\s;,|\t]+/).map(norm)].filter(Boolean))
    const matched = baseRows.filter((r) => candidates.has(norm(r.__scan)))
    // Elle yazılırken henüz eşleşme yoksa sessiz kal (yazmaya devam edebilsin)
    if (!matched.length && !explicit) return
    window.clearTimeout(scanTimer.current)
    scanGap.current = 0
    setScan('')
    if (!matched.length) {
      beep(false)
      setFeedback({ type: 'error', text: `"${raw}" bu ${multi ? 'siparişlerin' : 'siparişin'} bileşenlerinde yok` })
      return
    }
    const name = `${toText(matched[0][matCol] ?? matched[0].__scan)}${descCol ? ' · ' + toText(matched[0][descCol]) : ''}`
    const keys: string[] = matched.flatMap((r) => r.__keys).filter((k: string) => !picks[k])
    if (!keys.length) {
      beep(false)
      const p = lastPick(matched[0])!
      setFeedback({ type: 'warning', text: `${name} zaten alındı (${dayjs(p.at).format('DD.MM HH:mm')})` })
    } else if (await setPicked(keys, true, 'scan')) {
      beep(true)
      setFeedback({ type: 'success', text: `${name} alındı${keys.length > 1 ? ` (${keys.length} satır)` : ''}` })
    }
    flashRows(matched.map((r) => r.__key))
    scanRef.current?.focus()
  }
  scanFn.current = (raw, fast) => { onScan(raw, fast) }

  const bulkPick = (picked: boolean) => {
    const keys: string[] = visibleRows.filter((r) => !isExcluded(r)).flatMap((r) => r.__keys).filter((k: string) => (picked ? !picks[k] : !!picks[k]))
    if (!keys.length) { message.info(picked ? 'Görünen satırların hepsi zaten alındı' : 'Görünen satırlarda alınmış kayıt yok'); return }
    Modal.confirm({
      title: picked ? `${keys.length} satır "Alındı" olarak işaretlensin mi?` : `${keys.length} satırın "Alındı" işareti kaldırılsın mı?`,
      content: 'İşlem, şu an filtrelenmiş / görünen satırlara uygulanır (sayım dışı satırlar hariç).',
      okText: 'Evet', cancelText: 'Vazgeç',
      onOk: async () => { if (await setPicked(keys, picked, 'manual')) message.success(picked ? 'İşaretlendi' : 'İşaretler kaldırıldı') },
    })
  }

  const changeProcess = async (r: Row, option: string | null) => {
    const prev = process[r.__mk]
    const prevOpt = d.processOptions.find((o) => o.label === prev)
    const prevTable = tables.find((t) => t.id === prevOpt?.tableId)
    const apply = async () => {
      try {
        // Birleştirilmiş satırda ilk alt satırın siparişi/anahtarı kullanılır (işlem tipi malzeme bazındadır)
        const res = await api.kittProcess(r.__order, r.__keys[0], option)
        setProcess((p) => { const n = { ...p }; if (option) n[r.__mk] = option; else delete n[r.__mk]; return n })
        if (res.table) message.success(res.added ? `"${res.table}" tablosuna eklendi` : `Zaten "${res.table}" tablosunda kayıtlı`)
        else if (prevTable) message.info(`"${prevTable.name}" tablosundan çıkarıldı`)
      } catch (e: any) {
        message.error(e.message)
      }
    }
    if (prevTable && option !== prev) {
      Modal.confirm({
        title: 'Özel tablodan çıkarılsın mı?',
        content: `${toText(r[matCol])} malzemesi "${prevTable.name}" tablosundan çıkarılacak.`,
        okText: 'Evet', cancelText: 'Vazgeç', onOk: apply,
      })
    } else await apply()
  }

  // Sanal kolon: birleştirilmiş satırda değer tüm alt satırlara yazılır
  const commitVc = async (r: Row, id: string, v: unknown) => {
    const keys = r.__keys.map((k: string) => PICK + k)
    const before = values
    setValues((p) => {
      const n = { ...p }
      for (const k of r.__keys) {
        const cells = { ...(n[k] || {}) }
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete cells[id]
        else cells[id] = { value: v, at: new Date().toISOString() }
        n[k] = cells
      }
      return n
    })
    try { await api.kittSetValue(keys, id, v) } catch (e: any) { setValues(before); message.error(e.message) }
  }
  const setNotes = (r: Row, id: string, notes: KittNote[]) =>
    setValues((p) => ({ ...p, [r.__keys[0]]: { ...(p[r.__keys[0]] || {}), [id]: { value: notes.length ? notes : null, at: new Date().toISOString() } } }))

  const exportExcel = async () => {
    if (!data) return
    const cols = tableColumns.filter((c) => c.key !== '__pick').map((c) => ({ field: String(c.key), label: colTitle(String(c.key)), format: 'auto' }))
    cols.push({ field: '__by', label: 'Alan', format: 'text' })
    const out = visibleRows.map((r) => {
      const o: Record<string, unknown> = {}
      for (const c of cols) {
        if (c.field === '__at') { const p = lastPick(r); o[c.field] = p ? dayjs(p.at).format('YYYY-MM-DDTHH:mm:ss') : null }
        else if (c.field === '__by') o[c.field] = lastPick(r)?.by ?? ''
        else if (c.field === '__proc') o[c.field] = isKanban(r.__mk) ? `${procText(r)}${kanban[r.__mk] !== null ? ` (${d.kanban?.stockDepotValue}: ${fmtQty(kanban[r.__mk]!)})` : ''}` : procText(r)
        else {
          const v = getValue(r, c.field)
          o[c.field] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && 'text' in x ? x.text : toText(x))).join(', ') : v ?? null
        }
      }
      return o
    })
    try { await api.exportExcel(`KITT_${data.orders.length > 1 ? 'Coklu' : data.orders[0]}`, cols, out) } catch (e: any) { message.error(e.message) }
  }

  const colTitle = (key: string) => {
    if (key === '__orders') return 'Sipariş'
    if (key === '__addr') return 'Depo Adresleri'
    if (key === '__proc') return d.processTitle || 'İşlem Tipi'
    if (key === '__status') return 'Durum'
    if (key.startsWith('__marker')) { const m = d.markerColumns?.[Number(key.slice(8))]; return m?.title || m?.label || key }
    if (key === '__at') return 'Alınma Zamanı'
    if (key.startsWith('vc:')) return vcols.find((c) => `vc:${c.id}` === key)?.name ?? key
    const v = views.find((x) => x.field === key)
    return v?.label || v?.field || key
  }

  // ---------------------------------------------------------------- Kolonlar
  const sorter = (key: string) => (a: Row, b: Row) => compareValues(getValue(a, key), getValue(b, key))

  const tableColumns: ColumnsType<Row> = layout.apply([
    {
      title: 'Alındı', key: '__pick', width: 72, align: 'center', fixed: 'left',
      render: (_, r) => {
        const st = pickState(r)
        return <Checkbox checked={st === 'all'} indeterminate={st === 'some'} disabled={busy} onChange={() => togglePick(r)} className="pick-check" />
      },
    },
    ...(multi ? [{
      title: 'Sipariş', key: '__orders', width: 160, sorter: sorter('__orders'),
      render: (_: unknown, r: Row) => (
        <div className="order-chips">{r.__orders.map((o: string) => <Tag key={o} className="order-chip">{o}</Tag>)}</div>
      ),
    }] : []),
    ...views.map((v) => ({
      title: v.label || v.field,
      key: v.field,
      width: v.width || 140,
      ellipsis: true,
      sorter: sorter(v.field),
      align: (['number', 'integer', 'percent'].includes(v.format) ? 'right' : undefined) as any,
      render: (_: unknown, r: Row) => {
        const txt = formatValue(r[v.field], v.format, v.decimals)
        return grouped && r.__keys.length > 1 && ['number', 'integer', 'percent'].includes(v.format)
          ? <Tooltip title={`${r.__keys.length} satırın toplamı`}><b>{txt}</b></Tooltip> : <Clip text={txt}>{txt}</Clip>
      },
    })),
    ...(d.stockAddressColumn ? [{
      title: <span><EnvironmentOutlined /> Depo Adresleri</span>,
      key: '__addr',
      width: 300,
      render: (_: unknown, r: Row) => isKanban(r.__mk)
        ? <span className="kanban-dash">-</span>
        : <AddressCell list={data?.addresses[r.__mk] ?? []} max={d.maxAddresses || 3} infoCols={d.stockInfoColumns} material={toText(r[matCol])} />,
    }] : []),
    ...(d.markerColumns ?? []).map((m, mi) => ({
      title: m.title || m.label,
      key: `__marker${mi}`,
      width: 120,
      align: 'center' as const,
      sorter: sorter(`__marker${mi}`),
      render: (_: unknown, r: Row) => {
        const info = data?.markers?.[mi]?.[r.__mk]
        if (!info) {
          return m.absentLabel
            ? <Tag color={m.absentColor || 'red'} className="marker-tag">{m.absentLabel}</Tag>
            : <span className="muted">—</span>
        }
        const entries = Object.entries(info)
        return (
          <Tooltip title={entries.length ? <div className="marker-tip">{entries.map(([k, v]) => <div key={k}><span>{k}:</span> <b>{toText(v)}</b></div>)}</div> : undefined}>
            <Tag color={m.color || 'cyan'} className="marker-tag">{m.label || m.title}</Tag>
          </Tooltip>
        )
      },
    })),
    ...(d.processOptions.length || d.kanban?.enabled ? [{
      title: d.processTitle || 'İşlem Tipi',
      key: '__proc',
      width: 170,
      sorter: sorter('__proc'),
      render: (_: unknown, r: Row) => {
        if (isKanban(r.__mk)) {
          const q = kanban[r.__mk]
          return (
            <div className="kanban-cell">
              <Tag color={d.kanban?.color || 'cyan'} className="kanban-tag">{d.kanban?.label || 'Kanban'}</Tag>
              {q !== null && q !== undefined && (
                <Tooltip title={`${d.kanban?.stockDepotValue || ''} depo yerindeki miktar`}>
                  <span className={`kanban-qty ${q > 0 ? '' : 'zero'}`}><b>{fmtQty(q)}</b></span>
                </Tooltip>
              )}
            </div>
          )
        }
        if (!d.processOptions.length) return <span className="muted">—</span>
        return (
          <Select
            size="small" allowClear placeholder="Seçiniz" style={{ width: '100%' }}
            value={process[r.__mk] ?? undefined}
            onChange={(v) => changeProcess(r, !v || v === NONE ? null : v)}
            options={[{ value: NONE, label: <span className="muted">— Seçiniz —</span> }, ...d.processOptions].map((o: any) => o.value === NONE ? o : ({ value: o.label, label: <Tag color={o.color || 'blue'} style={{ margin: 0 }}>{o.label}</Tag> }))}
          />
        )
      },
    }] : []),
    ...vcols.map((c) => ({
      title: c.name,
      key: `vc:${c.id}`,
      width: c.width || (c.type === 'notes' ? 90 : c.type === 'checkbox' ? 80 : 160),
      sorter: c.type === 'notes' ? undefined : sorter(`vc:${c.id}`),
      onCell: () => ({ className: 'virtual-cell' }),
      render: (_: unknown, r: Row) => (
        <VirtualCell
          def={c}
          value={vcValue(r, c.id)}
          meta={values[r.__keys[0]]?.[c.id]}
          options={vcOptions[c.id] ?? c.options}
          onCommit={(v) => commitVc(r, c.id, v)}
          onAddNote={async (text) => { try { setNotes(r, c.id, await api.kittAddNote(PICK + r.__keys[0], c.id, text)) } catch (e: any) { message.error(e.message) } }}
          onDeleteNote={async (id) => { try { setNotes(r, c.id, await api.kittDeleteNote(PICK + r.__keys[0], c.id, id)) } catch (e: any) { message.error(e.message) } }}
        />
      ),
    })),
    {
      title: 'Durum', key: '__status', width: 110, align: 'center', sorter: sorter('__status'),
      render: (_, r) => {
        const st = pickState(r)
        if (st === 'all') return <Tag color="success" icon={<CheckCircleFilled />} className="status-tag">Alındı</Tag>
        if (st === 'some') return <Tag color="processing" className="status-tag">Kısmen</Tag>
        if (isExcluded(r)) return <Tooltip title="İşlem tipi nedeniyle ilerleme sayımına dahil değil"><Tag className="status-tag excluded-tag">Sayım dışı</Tag></Tooltip>
        return <Tag className="status-tag">Bekliyor</Tag>
      },
    },
    {
      title: 'Alınma Zamanı', key: '__at', width: 150,
      sorter: (a, b) => (lastPick(a)?.at ?? '').localeCompare(lastPick(b)?.at ?? ''),
      render: (_, r) => {
        const p = lastPick(r)
        if (!p) return <span className="muted">—</span>
        return (
          <div className="pick-time">
            <div>{dayjs(p.at).format('DD.MM.YYYY HH:mm')}</div>
            <div className="muted">{p.method === 'scan' ? <ScanOutlined /> : <CheckOutlined />} {p.by || '—'}</div>
          </div>
        )
      },
    },
  ])


  return (
    <Modal open={open} onCancel={onClose} footer={null} width="min(1680px, 97vw)" style={{ top: 12 }} className="pick-modal" destroyOnClose>
      {/* ---------------- Başlık: sipariş bilgisi | barkod | ilerleme */}
      <div className="pick-header">
        <div className="pick-title">
          <div className="pick-overline">{d.title || 'KITT Toplama'}{multi && ` · ${data?.orders.length} sipariş`}</div>
          {multi ? (
            <div className="pick-orders">{data!.orders.map((o) => <span key={o}>{o}</span>)}</div>
          ) : (
            <div className="pick-order">{orders[0] ?? ''}</div>
          )}
          {!multi && context && context.length > 0 && (
            <div className="pick-context">{context.map((c) => <span key={c.label}><em>{c.label}</em> {c.value}</span>)}</div>
          )}
        </div>

        {d.scanEnabled && (
          <div className="pick-scan">
            <div className={`scan-box ${feedback?.type ?? ''}`}>
              <ScanOutlined className="scan-icon" />
              <Input
                ref={scanRef}
                variant="borderless"
                className="scan-input"
                placeholder="Barkod / karekod okutun"
                value={scan}
                onChange={(e) => onScanChange(e.target.value)}
                onPressEnter={() => onScan(scan, true)}
                disabled={!data}
                autoFocus
              />
              <span className="scan-auto" title="Okutunca Enter'a basmaya gerek yok">otomatik</span>
            </div>
            <div className={`scan-feedback ${feedback?.type ?? 'idle'}`}>
              {feedback ? (
                <>
                  {feedback.type === 'success' ? <CheckCircleFilled /> : feedback.type === 'error' ? <CloseCircleFilled /> : <ExclamationCircleFilled />}
                  <span>{feedback.text}</span>
                </>
              ) : <span>Okutunca otomatik işaretlenir (Enter gerekmez). Okuyucu yoksa malzeme no yazın veya satırdaki kutuyu işaretleyin</span>}
            </div>
          </div>
        )}

        <div className="pick-progress">
          <Progress type="circle" percent={percent} size={58} strokeColor="#52c41a" format={() => `${percent}%`} />
          <div>
            <div className="pick-progress-num">{pickedCount} / {total}</div>
            <div className="muted">kalem alındı{excludedCount > 0 && <Tooltip title="Delik içi / özel işlem / kanban gibi sayım dışı bırakılan kalemler"><span> · {excludedCount} hariç</span></Tooltip>}</div>
          </div>
        </div>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {loading && !data && <div style={{ padding: 80, textAlign: 'center' }}><Spin size="large" /></div>}

      {data && (
        data.rows.length === 0 ? (
          <Empty description="Seçilen sipariş(ler) için bileşen kaydı bulunamadı" style={{ padding: 50 }} />
        ) : (
          <>
            <div className="pick-toolbar">
              <Space size={10} wrap>
                <Input allowClear prefix={<SearchOutlined />} placeholder="Ara (malzeme, tanım, adres...)" style={{ width: 250 }}
                  value={search} onChange={(e) => setSearch(e.target.value)} />
                <Space size={6}><Switch size="small" checked={onlyOpen} onChange={setOnlyOpen} /> Sadece bekleyenler</Space>
                {multi && <Space size={6}><Switch size="small" checked={groupSame} onChange={setGroupSame} /> Aynı malzemeleri birleştir</Space>}
              </Space>
              <Space size={8} wrap>
                <Tooltip title="Açıkken satırın herhangi bir yerine tıklamak Alındı işaretini değiştirir (barkod okuyucu yoksa)">
                  <Space size={6} className="manual-switch"><Switch size="small" checked={rowClick} onChange={setRowClick} /> Satıra tıklayarak işaretle</Space>
                </Tooltip>
                <Button icon={<SelectOutlined />} onClick={() => bulkPick(true)} disabled={busy}>Görünenleri Alındı Yap</Button>
                <Tooltip title="Görünen satırlardaki Alındı işaretlerini kaldır"><Button icon={<UndoOutlined />} onClick={() => bulkPick(false)} disabled={busy} /></Tooltip>
                {layout.customized && <Tooltip title="Sütunları sıfırla"><Button icon={<ColumnWidthOutlined />} onClick={layout.reset} /></Tooltip>}
                {data.warnings.length > 0 && <Tooltip title={data.warnings.join(' • ')}><Tag color="warning">{data.warnings.length} uyarı</Tag></Tooltip>}
                <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Excel</Button>
              </Space>
            </div>
            <FilterBar fields={filterFields} value={filters} onChange={setFilters} storageKey="kitt-pick" />
            <div ref={fill.ref}>
            <Table<Row>
              className={`pick-table ${rowClick ? 'row-clickable' : ''}`}
              size="middle"
              rowKey="__key"
              columns={tableColumns}
              components={layoutComponents}
              tableLayout="fixed"
              dataSource={visibleRows}
              pagination={false}
              loading={loading}
              scroll={{ x: Math.max(tableColumns.reduce((a, c) => a + (typeof c.width === 'number' ? c.width : 140), 0), fill.width), y: fill.height }}
              rowClassName={(r) => `${pickState(r) === 'all' ? 'row-picked' : pickState(r) === 'some' ? 'row-partial' : ''} ${flash.has(r.__key) ? 'row-flash' : ''}`}
              onRow={(r) => ({
                onClick: (e) => {
                  if (!rowClick || busy) return
                  if ((e.target as HTMLElement).closest('input,button,a,textarea,.ant-select,.ant-picker,.ant-checkbox-wrapper,.ant-popover,.virtual-cell,.ant-input-number')) return
                  togglePick(r)
                },
              })}
              locale={{ emptyText: onlyOpen ? 'Bekleyen kalem kalmadı 🎉' : 'Kayıt yok' }}
            />
            </div>
          </>
        )
      )}
    </Modal>
  )
}

function AddressCell({ list, max, infoCols, material }: { list: StockAddress[]; max: number; infoCols: string[]; material: string }) {
  if (!list.length) return <span className="no-stock">Stokta yok</span>
  const shown = list.slice(0, max)
  const rest = list.length - shown.length
  const total = list.reduce((a, x) => a + x.qty, 0)
  const chip = (a: StockAddress) => (
    <span className="addr-chip" key={a.address}>
      <b>{a.address}</b>
      {infoCols.map((c) => a.info[c] ? <span key={c} className="addr-info">{a.info[c]}</span> : null)}
      <span className="addr-qty">{fmtQty(a.qty)}</span>
    </span>
  )
  return (
    <div className="addr-cell">
      {shown.map(chip)}
      {rest > 0 && (
        <Popover
          trigger="click"
          placement="left"
          title={`${material} — ${list.length} adres, toplam ${fmtQty(total)}`}
          content={
            <Table
              size="small"
              pagination={false}
              rowKey="address"
              dataSource={list}
              scroll={{ y: 320 }}
              style={{ width: 300 + infoCols.length * 90 }}
              columns={[
                { title: 'Adres', dataIndex: 'address', render: (v) => <b>{v}</b> },
                ...infoCols.map((c) => ({ title: c, key: c, render: (_: unknown, a: StockAddress) => a.info[c] })),
                { title: 'Miktar', dataIndex: 'qty', align: 'right' as const, render: (v: number) => fmtQty(v) },
              ]}
            />
          }
        >
          <a className="addr-more" onClick={(e) => e.stopPropagation()}>+{rest} adres daha · devamını gör</a>
        </Popover>
      )}
    </div>
  )
}
