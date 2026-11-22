import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Popconfirm, Result, Space, Tag, Tooltip, message } from 'antd'
import { CloseOutlined, HolderOutlined, SettingOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api'
import { useConfig } from '../lib/config'
import { formatValue, isEmpty } from '../lib/values'
import type { FormatRule, KittCell, KittDataResponse, Row } from '../types'
import DataTable, { type ExtraColumn } from '../components/DataTable'
import OrderSelector from '../components/OrderSelector'
import TopStrip from '../components/TopStrip'
import VirtualCell from '../components/VirtualCell'
import Clip from '../components/Clip'

const VC = (id: string) => `vc:${id}`
/** Seçenek rengi (antd adı veya #hex) -> satır zemin rengi (açık ton) */
const TINT: Record<string, string> = {
  default: '#f0f0f0', success: '#d9f7be', green: '#d9f7be', processing: '#bae0ff', blue: '#bae0ff', error: '#ffccc7', red: '#ffccc7',
  warning: '#ffe7ba', orange: '#ffd8bf', gold: '#fff1b8', lime: '#efffc2', cyan: '#b5f5ec', geekblue: '#d6e4ff',
  purple: '#efdbff', magenta: '#ffd6e7', volcano: '#ffd8bf',
}
const FINISH = 'calc:bitis'
const DONE = new Set(['bitti'])
const isDone = (v: unknown) => typeof v === 'string' && DONE.has(v.trim().toLocaleLowerCase('tr'))

/** Tablo kolon sırası: kaynak kolonları (src:...) ve seçim kolonları (vc:...). Listede olmayan seçim kolonları sona eklenir. */
const LAYOUT = [
  'lk:om_mk', 'lk:om_sorumlu', 'src:title', 'src:tbdk', 'lk:om_proje', 'src:order', 'src:qty',
  'vc:om_durum', 'calc:bitis', 'lk:om_elek', 'lk:om_tdp', 'lk:om_ozelacik', 'vc:om_kit', 'lk:om_ozel',
]

export default function OrdersPage() {
  const { config } = useConfig()
  const nav = useNavigate()
  const dragKey = useRef<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [data, setData] = useState<KittDataResponse | null>(null)
  const [values, setValues] = useState<Record<string, Record<string, KittCell>>>({})
  const [options, setOptions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const page = config?.orderPage
  const vcols = useMemo(() => page?.virtualColumns ?? [], [page?.virtualColumns])
  const source = config?.dataSources.find((d) => d.id === page?.sourceId)

  const load = useCallback(async (reload = false) => {
    setLoading(true)
    try {
      if (reload) await api.reload()
      const [res, opts] = await Promise.all([api.orderData(), api.orderVcOptions()])
      setData(res); setValues(res.values || {}); setOptions(opts); setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addOrders = async (list: string[]) => {
    if (!list.length) return
    try {
      await api.orderAdd(list)
      await load()
      message.success(`${list.length} sipariş tabloya eklendi`)
    } catch (e: any) { message.error(e.message) }
  }

  const deleteRow = async (key: string) => {
    const before = data
    setData((d) => (d ? { ...d, rows: d.rows.filter((r) => r.__key !== key) } : d))
    try { await api.orderDeleteRows([key]) } catch (e: any) { setData(before); message.error(e.message) }
  }

  const moveRow = async (from: string, to: string) => {
    if (!data || from === to) return
    const list = [...data.rows]
    const i = list.findIndex((r) => r.__key === from)
    const j = list.findIndex((r) => r.__key === to)
    if (i < 0 || j < 0) return
    const [item] = list.splice(i, 1)
    list.splice(j, 0, item)
    const before = data
    setData({ ...data, rows: list })
    try { await api.orderSetRowOrder(list.map((r) => r.__key)) } catch (e: any) { setData(before); message.error(e.message) }
  }

  const rows: Row[] = useMemo(() => {
    if (!data) return []
    return data.rows.map((r) => {
      const v = values[r.__key] || {}
      const o: Row = { ...r }
      for (const c of vcols) o[VC(c.id)] = v[c.id]?.value ?? null
      // Bitiş tarihi: Durum "Bitti" yapıldığı an (hücrenin son güncellenme zamanı)
      const dc = v.om_durum
      const auto = !!(dc && isDone(dc.value))
      o.__auto = auto
      // Otomatik tarih varsa o, yoksa elle yazılan metin
      o[FINISH] = auto ? dayjs(dc.at).format('DD.MM.YYYY') : (o[VC('om_bitis')] ?? null)
      return o
    })
  }, [data, values, vcols])

  const commit = async (key: string, colId: string, value: any) => {
    const before = values
    const apply = (by?: string | null) => setValues((prev) => {
      const cells = { ...(prev[key] || {}) }
      if (isEmpty(value)) delete cells[colId]; else cells[colId] = { value, by, at: new Date().toISOString() }
      return { ...prev, [key]: cells }
    })
    apply()
    try { apply((await api.orderSetValue([key], colId, value)).by) } catch (e: any) { setValues(before); message.error(`Kaydedilemedi: ${e.message}`) }
  }

  const extraColumns: ExtraColumn[] = useMemo(() => {
    if (!page) return []
    const text = (id: string, title: string, field: string | null | undefined, width: number, fmt?: 'number'): ExtraColumn => ({
      field: id, title, width, noFilter: false,
      render: (r: Row) => { const t = field ? formatValue(r[field], fmt ?? 'auto', fmt ? 0 : undefined) : ''; return <Clip text={t}>{t}</Clip> },
      exportValue: (r: Row) => (field ? r[field] : null),
    })
    const src: Record<string, ExtraColumn> = {
      'src:title': text('src:title', 'TANIM', page.titleColumn, 260),
      'src:tbdk': text('src:tbdk', 'TBDK', page.tbdkColumn, 130),
      'src:order': text('src:order', 'SİPARİŞ', page.orderColumn, 140),
      'src:qty': text('src:qty', 'Miktar', page.qtyColumn, 90, 'number'),
    }
    const vcExtra = (c: (typeof vcols)[number]): ExtraColumn => ({
      field: VC(c.id), title: c.name, width: c.width || 150,
      exportValue: (r: Row) => r[VC(c.id)],
      render: (r: Row) => (
        <VirtualCell def={c} value={r[VC(c.id)]} meta={values[r.__key]?.[c.id]} options={options[c.id] ?? c.options}
          onCommit={(v) => commit(r.__key, c.id, v)} onAddNote={async () => {}} onDeleteNote={async () => {}} />
      ),
    })
    for (const l of page.lookupColumns ?? []) {
      const k = 'lk:' + l.id
      src[k] = text(k, l.name, k, l.width || 150)
    }
    const bitisDef = vcols.find((c) => c.id === 'om_bitis')
    src['calc:bitis'] = {
      field: FINISH, title: 'Bitiş tarihi', width: 130,
      exportValue: (r: Row) => r[FINISH],
      render: (r: Row) => {
        if (r.__auto || !bitisDef) { const t = r[FINISH] ?? ''; return <Clip text={t}>{t}</Clip> }
        return (
          <VirtualCell def={bitisDef} value={r[VC('om_bitis')]} meta={values[r.__key]?.om_bitis} options={[]}
            onCommit={(v) => commit(r.__key, 'om_bitis', v)} onAddNote={async () => {}} onDeleteNote={async () => {}} />
        )
      },
    }
    const byId = new Map(vcols.map((c) => [VC(c.id).replace('vc:', 'vc:'), c]))
    const out: ExtraColumn[] = [{
      field: 'drag', title: '', width: 44, noFilter: true, exportValue: () => null,
      render: (r: Row) => (
        <span className="row-drag-handle" draggable title="Sıralamak için sürükleyin"
          onDragStart={(e) => { dragKey.current = r.__key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.__key) }}
          onDragEnd={() => { dragKey.current = null; setOverKey(null) }}><HolderOutlined /></span>
      ),
    }]
    const used = new Set<string>([VC('om_bitis')])
    for (const k of LAYOUT) {
      if (k.startsWith('src:') || k.startsWith('calc:') || k.startsWith('lk:')) { if (src[k]) out.push(src[k]) }
      else { const c = byId.get(k); if (c) { out.push(vcExtra(c)); used.add(k) } }
    }
    for (const l of page.lookupColumns ?? []) if (!LAYOUT.includes('lk:' + l.id)) out.push(src['lk:' + l.id])
    for (const c of vcols) if (!used.has(VC(c.id))) out.push(vcExtra(c))
    out.push({
      field: 'del', title: '', width: 52, noFilter: true, fixed: 'right', exportValue: () => null,
      render: (r: Row) => (
        <Popconfirm title="Satır tablodan silinsin mi?" okText="Sil" cancelText="Vazgeç" onConfirm={() => deleteRow(r.__key)}>
          <Button type="text" size="small" danger icon={<CloseOutlined />} title="Satırı sil" />
        </Popconfirm>
      ),
    })
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, vcols, values, options, data])

  // Durum seçeneğine verilen renk tüm satıra uygulanır
  const rules: FormatRule[] = useMemo(() => {
    // Mk. Sayı "Dizgisi Yok" olan satırın tamamı pembe (durum renginden önceliklidir)
    const dizgi: FormatRule = {
      id: 'row-dizgisi-yok', name: 'Dizgisi Yok', enabled: true, column: 'lk:om_mk', operator: 'contains', value: 'Dizgisi Yok',
      target: 'row', backColor: '#ffd6e7', bold: false, stopIfTrue: true,
    }
    const d = vcols.find((c) => c.id === 'om_durum')
    if (!d) return [dizgi]
    return [dizgi, ...Object.entries(d.optionColors ?? {}).filter(([, col]) => col).map(([opt, col]) => ({
      id: 'row-' + opt, name: opt, enabled: true, column: VC(d.id), operator: 'eq', value: opt, target: 'row' as const,
      backColor: col.startsWith('#') ? col + '33' : TINT[col] ?? null, bold: false, stopIfTrue: false,
    }))]
  }, [vcols])

  if (!config) return null

  if (!page?.sourceId || !page.orderColumn) {
    return (
      <Card>
        <Result status="info" title="Ön Montaj sayfası henüz yapılandırılmamış"
          subTitle="Ayarlar > Ön Montaj bölümünden veri kaynağını ve sipariş kolonunu seçin."
          extra={<Button type="primary" icon={<SettingOutlined />} onClick={() => nav('/ayarlar?tab=orders')}>Ayarlara Git</Button>} />
      </Card>
    )
  }

  return (
    <div className="page">
      <TopStrip
        icon={<ToolOutlined />}
        title={page.title || 'Ön Montaj'}
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
        <OrderSelector addMode value={[]} onChange={addOrders} onRefresh={() => load(true)} loading={loading} />
      </TopStrip>

      {error && <Alert type="error" showIcon message="Veri yüklenemedi" description={error} closable />}

      <Card size="small" className="table-card">
        {!rows.length && !loading ? (
          <Empty description="Tablo boş: yukarıdan iş emri seçerek veya Toplu Yapıştır ile sipariş ekleyin. Eklenen satırlar tabloda kalır." style={{ padding: 60 }} />
        ) : (
          <DataTable
            rows={rows}
            rowKey="__key"
            availableColumns={[]}
            columns={[]}
            rules={rules}
            extraColumns={extraColumns}
            loading={loading}
            pageSize={page.pageSize}
            exportName="On_Montaj"
            layoutKey="onmontaj-table"
            filterOneLine
            filterDefaults={['lk:om_mk', 'lk:om_sorumlu', 'src:title', 'src:tbdk', 'lk:om_proje', 'src:order', 'vc:om_durum']}
            rowProps={(r) => ({
              onDragOver: (e) => { if (dragKey.current) { e.preventDefault(); if (overKey !== r.__key) setOverKey(r.__key) } },
              onDrop: (e) => { e.preventDefault(); const from = dragKey.current; dragKey.current = null; setOverKey(null); if (from) moveRow(from, r.__key) },
              className: overKey === r.__key && dragKey.current && dragKey.current !== r.__key ? 'drag-over' : '',
            })}
          />
        )}
      </Card>
    </div>
  )
}
