import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, message } from 'antd'
import { api, newId } from '../../api'
import { useConfig } from '../../lib/config'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'
import type { OrderLookupColumn, OrderPageConfig } from '../../types'
import VirtualColumnsEditor from './VirtualColumnsEditor'
import SaveBar from './SaveBar'
import { metaOf } from './sections'

interface Props {
  /** source | list | columns | rules */
  section: string
  onDirtyChange?: (dirty: boolean) => void
}

export default function OrderPageSettings({ section, onDirtyChange }: Props) {
  const { config, setConfig } = useConfig()
  const [page, setPage] = useState<OrderPageConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [distinct, setDistinct] = useState<string[]>([])
  const [loadingDistinct, setLoadingDistinct] = useState(false)
  const lastSaved = useRef<string>('')

  // Dışarıdan ayar değişirse, kullanıcının kaydedilmemiş düzenlemesi varsa onu ezme
  useEffect(() => {
    if (!config) return
    const incoming = JSON.stringify(config.orderPage)
    setPage((p) => (p && JSON.stringify(p) !== lastSaved.current ? p : structuredClone(config.orderPage)))
    lastSaved.current = incoming
  }, [config])

  const { columns, error } = useSourceColumns(page?.sourceId)
  const dirty = !!page && !!config && JSON.stringify(page) !== JSON.stringify(config.orderPage)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!page?.sourceId || !page.orderColumn) { setDistinct([]); return }
    setLoadingDistinct(true)
    api.distinct(page.sourceId, page.orderColumn).then(setDistinct).catch(() => setDistinct([])).finally(() => setLoadingDistinct(false))
  }, [page?.sourceId, page?.orderColumn])

  if (!config || !page) return null
  const set = (patch: Partial<OrderPageConfig>) => setPage({ ...page, ...patch })
  const allCols = [...columns, ...(config.dataSources.find((d) => d.id === page.sourceId)?.computedColumns.map((c) => c.name) ?? [])]

  const save = async () => {
    setSaving(true)
    try { setConfig(await api.saveOrderPage(page)); message.success('Sipariş analizi ayarları kaydedildi') } catch (e: any) { message.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="settings-section">
      <SaveBar meta={metaOf(`orders.${section}`)} dirty={dirty} saving={saving} onSave={save} onUndo={() => setPage(structuredClone(config.orderPage))} />

      {section === 'source' && (
        <Card size="small">
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Sayfa başlığı (menüde görünür)"><Input value={page.title} onChange={(e) => set({ title: e.target.value })} /></Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Veri kaynağı" validateStatus={error ? 'error' : undefined} help={error}>
                  <Select value={page.sourceId || undefined} placeholder="Seçiniz" onChange={(v) => set({ sourceId: v, orderColumn: null, orderDescriptionColumn: null })}
                    options={config.dataSources.map((d) => ({ value: d.id, label: d.name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Sipariş numarası kolonu">
                  <Select showSearch value={page.orderColumn || undefined} placeholder="Seçiniz" options={toOptions(columns)} onChange={(v) => set({ orderColumn: v })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Seçim listesinde açıklama kolonu" extra="Numaranın yanında gösterilir ve aramada kullanılır (ör. Tanım)">
                  <Select showSearch allowClear value={page.orderDescriptionColumn || undefined} placeholder="İsteğe bağlı" options={toOptions(columns)}
                    onChange={(v) => set({ orderDescriptionColumn: v ?? null })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="TANIM kolonu"><Select showSearch allowClear value={page.titleColumn || undefined} options={toOptions(allCols)} onChange={(v) => set({ titleColumn: v ?? null })} /></Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="TBDK kolonu"><Select showSearch allowClear value={page.tbdkColumn || undefined} options={toOptions(allCols)} onChange={(v) => set({ tbdkColumn: v ?? null })} /></Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Miktar kolonu"><Select showSearch allowClear value={page.qtyColumn || undefined} options={toOptions(allCols)} onChange={(v) => set({ qtyColumn: v ?? null })} /></Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item label="Satır anahtar kolonları" extra="Sipariş no ile birlikte satırı tanımlar; girilen seçimler bu anahtarla saklanır.">
                  <Select mode="multiple" value={page.keyColumns} onChange={(v) => set({ keyColumns: v })} options={toOptions(columns.filter((c) => c !== page.orderColumn))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Tablo sayfa boyutu">
                  <InputNumber min={10} max={1000} value={page.pageSize} onChange={(v) => set({ pageSize: v || 50 })} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {section === 'list' && (
        <Card size="small"
          title={`Tanımlı sipariş sayısı: ${page.orders.length}`}
          extra={
            <Space>
              <Button size="small" disabled={!distinct.length} onClick={() => set({ orders: Array.from(new Set([...page.orders, ...distinct])) })}>
                Kaynaktaki tümünü ekle ({distinct.length})
              </Button>
              <Button size="small" danger disabled={!page.orders.length} onClick={() => set({ orders: [] })}>Temizle</Button>
            </Space>
          }
        >
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="Sipariş numarası seçin veya yazıp Enter'a basın (virgül / noktalı virgül ile toplu yapıştırılabilir)"
            value={page.orders}
            onChange={(v) => set({ orders: v })}
            tokenSeparators={[',', ';', '\n', '\t']}
            loading={loadingDistinct}
            options={toOptions(distinct)}
          />
          {!page.orders.length && (
            <Alert style={{ marginTop: 8 }} type="info" showIcon message="Liste boş: kaynaktaki tüm sipariş numaraları kullanıcıya listelenir." />
          )}
        </Card>
      )}

      {section === 'lookup' && (
        <Card size="small">
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Bu kolonların değeri Tablolar bölümündeki özel tablolardan gelir: satırın TBDK (Malzeme) değeri tablodaki eşleşme kolonuyla karşılaştırılır. Tablo verisini Tablolar sayfasından şablon indir / yükle veya elle ekleyerek yönetin." />
          {page.lookupColumns.map((l, i) => {
            const def = (config.customTables ?? []).find((t) => t.id === l.tableId)
            const upd = (patch: Partial<OrderLookupColumn>) => set({ lookupColumns: page.lookupColumns.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            const colOpts = (def?.columns ?? []).map((c) => ({ value: c.id, label: c.name }))
            return (
              <Row key={l.id} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col xs={24} md={5}><Input placeholder="Kolon başlığı" value={l.name} onChange={(e) => upd({ name: e.target.value })} /></Col>
                <Col xs={24} md={6}><Select style={{ width: "100%" }} placeholder="Özel tablo" value={l.tableId || undefined} options={(config.customTables ?? []).map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(v) => upd({ tableId: v, matchColumnId: null, valueColumnId: null })} /></Col>
                <Col xs={24} md={5}><Select style={{ width: "100%" }} placeholder="Eşleşme kolonu (Malzeme)" value={l.matchColumnId || undefined} options={colOpts} onChange={(v) => upd({ matchColumnId: v })} /></Col>
                <Col xs={24} md={5}><Select style={{ width: "100%" }} placeholder="Getirilecek kolon" value={l.valueColumnId || undefined} options={colOpts} onChange={(v) => upd({ valueColumnId: v })} /></Col>
                <Col xs={24} md={3}><Button danger onClick={() => set({ lookupColumns: page.lookupColumns.filter((_, j) => j !== i) })}>Sil</Button></Col>
              </Row>
            )
          })}
          <Button onClick={() => set({ lookupColumns: [...page.lookupColumns, { id: newId("om"), name: "", tableId: null, matchColumnId: null, valueColumnId: null, width: null }] })}>+ Kolon ekle</Button>
        </Card>
      )}

      {section === 'sync' && (() => {
        const kv = config.kittPage.virtualColumns.filter((v) => v.type === 'select')
        const kitCol = kv.find((v) => v.id === page.kitSync?.kitColumnId)
        const omOpts = (page.virtualColumns.find((v) => v.id === 'om_durum')?.options ?? []).map((o) => ({ value: o, label: o }))
        const sync = page.kitSync ?? { kitColumnId: null, map: [] }
        const setSync = (patch: Partial<typeof sync>) => set({ kitSync: { ...sync, ...patch } })
        return (
          <Card size="small">
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="KITT Hazırlama sayfasında seçilen kolonun değeri değişince, o siparişin Ön Montaj satırlarındaki Durum aşağıdaki eşleştirmeye göre otomatik güncellenir." />
            <Form layout="vertical">
              <Form.Item label="KITT sayfasında izlenen kolon (seçim listesi)">
                <Select allowClear style={{ maxWidth: 360 }} value={sync.kitColumnId || undefined} placeholder="Örn. Hazırlık Durumu"
                  options={kv.map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => setSync({ kitColumnId: v ?? null, map: [] })} />
              </Form.Item>
            </Form>
            {sync.map.map((m, i) => (
              <Row key={i} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col xs={24} md={9}><Select style={{ width: "100%" }} placeholder="KITT değeri" value={m.kit || undefined} disabled={!kitCol}
                  options={(kitCol?.options ?? []).map((o) => ({ value: o, label: o }))}
                  onChange={(v) => setSync({ map: sync.map.map((x, j) => (j === i ? { ...x, kit: v } : x)) })} /></Col>
                <Col xs={24} md={1} style={{ textAlign: "center" }}>→</Col>
                <Col xs={24} md={9}><Select style={{ width: "100%" }} placeholder="Ön Montaj Durum değeri" value={m.onMontaj || undefined} options={omOpts}
                  onChange={(v) => setSync({ map: sync.map.map((x, j) => (j === i ? { ...x, onMontaj: v } : x)) })} /></Col>
                <Col xs={24} md={3}><Button danger onClick={() => setSync({ map: sync.map.filter((_, j) => j !== i) })}>Sil</Button></Col>
              </Row>
            ))}
            <Button disabled={!kitCol} onClick={() => setSync({ map: [...sync.map, { kit: "", onMontaj: "" }] })}>+ Eşleştirme ekle</Button>
          </Card>
        )
      })()}

      {section === 'virtual' && (
        <Card size="small"><VirtualColumnsEditor value={page.virtualColumns} onChange={(v) => set({ virtualColumns: v })} sources={config.dataSources} /></Card>
      )}
    </div>
  )
}
