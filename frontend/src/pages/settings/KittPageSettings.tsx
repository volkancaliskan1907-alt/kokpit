import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, message } from 'antd'
import { api } from '../../api'
import { useConfig } from '../../lib/config'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'
import type { KittPageConfig } from '../../types'
import ColumnsEditor from './ColumnsEditor'
import FormatRulesEditor from './FormatRulesEditor'
import VirtualColumnsEditor from './VirtualColumnsEditor'
import DetailSettings, { emptyDetail, type DetailSection } from './DetailSettings'
import SaveBar from './SaveBar'
import { metaOf } from './sections'

interface Props {
  /** source | columns | virtual | rules  veya  pick.general | pick.stock | ... */
  section: string
  onDirtyChange?: (dirty: boolean) => void
}

export default function KittPageSettings({ section, onDirtyChange }: Props) {
  const { config, setConfig } = useConfig()
  const [page, setPage] = useState<KittPageConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const lastSaved = useRef<string>('')

  // Dışarıdan ayar değişirse, kullanıcının kaydedilmemiş düzenlemesi varsa onu ezme
  useEffect(() => {
    if (!config) return
    const incoming = JSON.stringify(config.kittPage)
    setPage((p) => (p && JSON.stringify(p) !== lastSaved.current ? p : structuredClone(config.kittPage)))
    lastSaved.current = incoming
  }, [config])

  const { columns, error } = useSourceColumns(page?.sourceId)
  const dirty = !!page && !!config && JSON.stringify(page) !== JSON.stringify(config.kittPage)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  if (!config || !page) return null
  const set = (patch: Partial<KittPageConfig>) => setPage({ ...page, ...patch })
  const computed = config.dataSources.find((d) => d.id === page.sourceId)?.computedColumns.map((c) => c.name) ?? []
  const orderSrc = config.dataSources.find((d) => d.id === config.orderPage.sourceId)
  const isPick = section.startsWith('pick.')
  const meta = metaOf(isPick ? section : `kitt.${section}`)

  const ruleColumns = [
    ...toOptions(columns),
    ...page.virtualColumns.filter((v) => v.name).map((v) => ({ value: `vc:${v.id}`, label: `✎ ${v.name} (sanal)` })),
  ]

  const save = async () => {
    if (page.virtualColumns.some((v) => !v.name.trim()) || (page.detail?.virtualColumns ?? []).some((v) => !v.name.trim())) {
      message.error('Tüm giriş kolonlarının adı olmalı'); return
    }
    setSaving(true)
    try { setConfig(await api.saveKittPage(page)); message.success('KITT ayarları kaydedildi') } catch (e: any) { message.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="settings-section">
      <SaveBar meta={meta} dirty={dirty} saving={saving} onSave={save} onUndo={() => setPage(structuredClone(config.kittPage))} />

      {section === 'source' && (
        <Card size="small">
          <Alert
            type="info" showIcon style={{ marginBottom: 12 }}
            message={<>Kullanıcılar KITT sayfasında <b>Ön Montaj sayfasında tanımlı siparişlerden</b> seçim yapar{orderSrc ? <> (kaynak: <b>{orderSrc.name}</b>)</> : null}. KITT tablosu farklı bir kaynaktan da beslenebilir.</>}
          />
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item label="Sayfa başlığı (menüde görünür)"><Input value={page.title} onChange={(e) => set({ title: e.target.value })} /></Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Veri kaynağı" validateStatus={error ? 'error' : undefined} help={error}>
                  <Select value={page.sourceId || undefined} placeholder="Seçiniz" onChange={(v) => set({ sourceId: v, orderColumn: null, keyColumns: [] })}
                    options={config.dataSources.map((d) => ({ value: d.id, label: d.name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Sipariş numarası kolonu">
                  <Select showSearch value={page.orderColumn || undefined} placeholder="Seçiniz" options={toOptions(columns)} onChange={(v) => set({ orderColumn: v })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Tablo sayfa boyutu">
                  <InputNumber min={10} max={1000} value={page.pageSize} onChange={(v) => set({ pageSize: v || 50 })} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item
                  label="Satır anahtar kolonları"
                  extra="Sipariş no ile birlikte satırı benzersiz tanımlayan kolonlar (ör. Üretim Siparişi + Malzeme). Girilen değerler bu anahtarla saklanır; Excel'de satır sırası değişse de doğru satırla eşleşir."
                >
                  <Select mode="multiple" value={page.keyColumns} onChange={(v) => set({ keyColumns: v })} options={toOptions(columns.filter((c) => c !== page.orderColumn))}
                    placeholder="Anahtar kolon(lar) seçin" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
          {page.keyColumns.length === 0 && page.sourceId && (
            <Alert type="warning" showIcon message="Anahtar kolon seçilmemiş. Değerler satır sırasına göre saklanır; Excel'de satır sırası değişirse girilen değerler kayabilir." />
          )}
        </Card>
      )}

      {section === 'columns' && (
        <Card size="small"><ColumnsEditor value={page.columns} onChange={(v) => set({ columns: v })} available={columns} computed={computed} /></Card>
      )}

      {section === 'virtual' && (
        <>
          <Card size="small"><VirtualColumnsEditor value={page.virtualColumns} onChange={(v) => set({ virtualColumns: v })} sources={config.dataSources} /></Card>
          <Card size="small" style={{ marginTop: 12 }} title="Otomatik tarih doldurma"
            extra={<Button size="small" onClick={() => set({ autoDates: [...(page.autoDates ?? []), { statusColumnId: "", statusValue: "", dateColumnId: "" }] })}>+ Kural ekle</Button>}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Seçilen seçim kolonu belirtilen değere gelince, tarih kolonu o günün tarihiyle otomatik doldurulur (ör. Hazırlık Durumu = Hazırlandı → Hazırlık Tarihi)." />
            {(page.autoDates ?? []).map((a, i) => {
              const sc = page.virtualColumns.find((v) => v.id === a.statusColumnId)
              const upd = (patch: Partial<typeof a>) => set({ autoDates: page.autoDates.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
              return (
                <Row key={i} gutter={8} style={{ marginBottom: 8 }} align="middle">
                  <Col xs={24} md={7}><Select style={{ width: "100%" }} placeholder="Seçim kolonu" value={a.statusColumnId || undefined}
                    options={page.virtualColumns.filter((v) => v.type === "select").map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => upd({ statusColumnId: v, statusValue: "" })} /></Col>
                  <Col xs={24} md={7}><Select style={{ width: "100%" }} placeholder="Değer" value={a.statusValue || undefined} disabled={!sc}
                    options={(sc?.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(v) => upd({ statusValue: v })} /></Col>
                  <Col xs={24} md={7}><Select style={{ width: "100%" }} placeholder="Doldurulacak tarih kolonu" value={a.dateColumnId || undefined}
                    options={page.virtualColumns.filter((v) => v.type === "date").map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => upd({ dateColumnId: v })} /></Col>
                  <Col xs={24} md={3}><Button danger onClick={() => set({ autoDates: page.autoDates.filter((_, j) => j !== i) })}>Sil</Button></Col>
                </Row>
              )
            })}
          </Card>
        </>
      )}

      {section === 'rules' && (
        <Card size="small"><FormatRulesEditor value={page.formatRules} onChange={(v) => set({ formatRules: v })} columnOptions={ruleColumns} /></Card>
      )}

      {isPick && (
        <Card size="small">
          <DetailSettings
            section={section.slice(5) as DetailSection}
            value={page.detail ?? emptyDetail()}
            onChange={(v) => set({ detail: v })}
            sources={config.dataSources}
            tables={config.customTables ?? []}
            kittColumns={columns}
          />
        </Card>
      )}
    </div>
  )
}
