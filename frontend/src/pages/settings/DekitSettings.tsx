import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Divider, Form, Input, InputNumber, Radio, Row, Select, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { useConfig } from '../../lib/config'
import { OPERATORS } from '../../lib/values'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'
import type { DekitConfig } from '../../types'
import ColumnsEditor from './ColumnsEditor'
import SaveBar from './SaveBar'
import { metaOf } from './sections'

interface Props {
  /** format | stock | decision | columns */
  section: string
  onDirtyChange?: (dirty: boolean) => void
}

/** Ayarlardaki formatla iş emrinden adres önizlemesi. */
function previewAddress(order: string, c: DekitConfig) {
  let s = order.trim()
  s = s.slice(Math.min(Math.max(c.stripLeft, 0), s.length))
  return s.slice(0, s.length - Math.min(Math.max(c.stripRight, 0), s.length))
}

export default function DekitSettings({ section, onDirtyChange }: Props) {
  const { config, setConfig } = useConfig()
  const [d, setD] = useState<DekitConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [example, setExample] = useState('225AF01KRT01')
  const lastSaved = useRef('')

  // Dışarıdan ayar değişirse, kaydedilmemiş düzenlemeyi ezme
  useEffect(() => {
    if (!config) return
    setD((p) => (p && JSON.stringify(p) !== lastSaved.current ? p : structuredClone(config.dekit)))
    lastSaved.current = JSON.stringify(config.dekit)
  }, [config])

  const stock = useSourceColumns(d?.stockSourceId)
  const bom = useSourceColumns(d?.bomSourceId)
  const dirty = !!d && !!config && JSON.stringify(d) !== JSON.stringify(config.dekit)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  if (!config || !d) return null
  const set = (p: Partial<DekitConfig>) => setD({ ...d, ...p })
  const srcOptions = config.dataSources.map((s) => ({ value: s.id, label: s.name }))
  const statusCols = config.kittPage.virtualColumns.filter((v) => v.type === 'select')
  const statusCol = statusCols.find((v) => v.id === d.statusColumnId) ?? statusCols[0]
  const statusKnown = !statusCol || statusCol.options.some((o) => o.toLocaleLowerCase('tr') === d.statusValue.trim().toLocaleLowerCase('tr'))
  const extTable = config.customTables.find((t) => t.id === d.externalTableId)
  const computed = config.dataSources.find((s) => s.id === d.stockSourceId)?.computedColumns.map((x) => x.name) ?? []

  const save = async () => {
    setSaving(true)
    try { setConfig(await api.saveDekit(d)); message.success('DEKIT ayarları kaydedildi') } catch (e: any) { message.error(e.message) } finally { setSaving(false) }
  }

  const addr = previewAddress(example, d)

  return (
    <div className="settings-section">
      <SaveBar meta={metaOf(`dekit.${section}`)} dirty={dirty} saving={saving} onSave={save} onUndo={() => setD(structuredClone(config.dekit))} />

      {section === 'format' && (
        <Card size="small">
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Sayfa başlığı (menüde görünür)"><Input value={d.title} onChange={(e) => set({ title: e.target.value })} /></Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Soldan silinecek karakter" extra="Ör: 225AF01KRT01 → 3">
                  <InputNumber min={0} max={50} value={d.stripLeft} onChange={(v) => set({ stripLeft: v ?? 0 })} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Sağdan silinecek karakter">
                  <InputNumber min={0} max={50} value={d.stripRight} onChange={(v) => set({ stripRight: v ?? 0 })} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Adres eşleşme biçimi">
                  <Radio.Group value={d.addressMatch} onChange={(e) => set({ addressMatch: e.target.value })}>
                    <Space direction="vertical">
                      <Radio value="eq">Adres, türetilen değere <b>eşit</b> olsun</Radio>
                      <Radio value="startsWith">Adres, türetilen değerle <b>başlasın</b></Radio>
                      <Radio value="contains">Adres, türetilen değeri <b>içersin</b></Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>
          </Form>
          <div className="format-tester">
            <Typography.Text strong>Deneme</Typography.Text>
            <Input style={{ width: 220 }} value={example} onChange={(e) => setExample(e.target.value)} placeholder="Örnek iş emri" />
            <span>→</span>
            {addr ? <Tag color="blue" style={{ fontSize: 14, padding: '2px 10px' }}>{addr}</Tag> : <Tag color="error">Adres elde edilemedi</Tag>}
            <Typography.Text type="secondary">Bu adres, LX02'de "{d.addressColumn || 'adres kolonu'}" ile eşleştirilir.</Typography.Text>
          </div>
        </Card>
      )}

      {section === 'stock' && (
        <Card size="small">
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Stok veri kaynağı (LX02)" validateStatus={stock.error ? 'error' : undefined} help={stock.error}>
                  <Select value={d.stockSourceId || undefined} options={srcOptions} placeholder="Seçiniz"
                    onChange={(v) => set({ stockSourceId: v, materialColumn: null, addressColumn: null, qtyColumn: null, depotColumn: null, columns: [], stockFilters: [] })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Adres kolonu" extra="İş emrinden türetilen adres bu kolonda aranır (ör. Depo adresi)">
                  <Select showSearch value={d.addressColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ addressColumn: v })} loading={stock.loading} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Malzeme kolonu">
                  <Select showSearch value={d.materialColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ materialColumn: v })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Miktar kolonu" extra="Adresteki toplam bu kolondan hesaplanır">
                  <Select showSearch allowClear value={d.qtyColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ qtyColumn: v ?? null })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Depo yeri kolonu" extra="Kart depo şartı için">
                  <Select showSearch allowClear value={d.depotColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ depotColumn: v ?? null })} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Kart depo yeri değeri"><Input value={d.kartDepotValue} onChange={(e) => set({ kartDepotValue: e.target.value })} placeholder="KART" /></Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Gösterilecek adres sayısı" extra="Fazlası '+N daha'">
                  <InputNumber min={1} max={20} value={d.maxKartAddresses} onChange={(v) => set({ maxKartAddresses: v || 3 })} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={<>"Kart Depo Adresleri" kolonunda, malzemenin LX02'de <b>{d.depotColumn || 'depo yeri'} = {d.kartDepotValue || 'KART'}</b> olan adresleri gösterilir (miktar gösterilmez).</>} />
            <Form.Item label="Stokta dikkate alınacak satırlar (isteğe bağlı filtre)" extra="Hem adres listesine hem KART adreslerine uygulanır">
              {d.stockFilters.map((f, j) => {
                const op = OPERATORS.find((o) => o.value === f.operator)
                const upd = (p: object) => set({ stockFilters: d.stockFilters.map((x, k) => (k === j ? { ...x, ...p } : x)) })
                return (
                  <Space key={j} style={{ marginBottom: 6, display: 'flex' }} wrap>
                    <Select showSearch style={{ width: 220 }} placeholder="Kolon" value={f.column || undefined} options={toOptions(stock.columns)} onChange={(v) => upd({ column: v })} />
                    <Select style={{ width: 170 }} value={f.operator} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => upd({ operator: v })} />
                    {!op?.noValue && <Input style={{ width: 160 }} placeholder="Değer" value={f.value ?? ''} onChange={(e) => upd({ value: e.target.value })} />}
                    {op?.twoValues && <Input style={{ width: 120 }} placeholder="ve" value={f.value2 ?? ''} onChange={(e) => upd({ value2: e.target.value })} />}
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => set({ stockFilters: d.stockFilters.filter((_, k) => k !== j) })} />
                  </Space>
                )
              })}
              <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => set({ stockFilters: [...d.stockFilters, { column: '', operator: 'empty', value: '' }] })}>Filtre ekle</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {section === 'decision' && (
        <Card size="small">
          <Alert type="info" showIcon style={{ marginBottom: 14 }}
            message={<>DEKIT'e eklediğiniz iş emirleri dışındaki iş emirlerine bakılır (KITT Hazırlama'da hazırlık durumu <b>"{d.statusValue}"</b> <u>olmayanlar</u>).
              Adresteki malzeme bu iş emirlerinden herhangi birinin COOIS listesinde geçiyorsa <Tag color="green">{d.keepLabel}</Tag>, hiçbirinde geçmiyorsa <Tag color="red">{d.goLabel}</Tag> yazılır.</>} />
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Hazırlık durumu kolonu (KITT)" extra="Durumu DEKIT olan iş emirleri karşılaştırma dışı bırakılır">
                  <Select value={statusCol?.id} options={statusCols.map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => set({ statusColumnId: v })}
                    placeholder="Seçim tipli kolon yok" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="DEKIT durumu (karşılaştırmaya katılmaz)" validateStatus={!statusKnown ? 'warning' : undefined}
                  help={!statusKnown ? `"${d.statusValue}" bu kolonun seçenekleri arasında yok; KITT ayarlarından seçenek olarak ekleyin.` : undefined}>
                  <Input value={d.statusValue} onChange={(e) => set({ statusValue: e.target.value })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item label="Hangi iş emirleriyle karşılaştırılsın?">
                  <Radio.Group value={d.compareScope} onChange={(e) => set({ compareScope: e.target.value })}>
                    <Space direction="vertical">
                      <Radio value="kitt">KITT Hazırlama sayfasında <b>eklenmiş</b> iş emirleri (DEKIT'tekiler ve durumu "{d.statusValue}" olanlar hariç)</Radio>
                      <Radio value="all">KITT kaynağındaki <b>tüm</b> iş emirleri (DEKIT'tekiler ve durumu "{d.statusValue}" olanlar hariç)</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="COOIS bileşen kaynağı" validateStatus={bom.error ? 'error' : undefined} help={bom.error}>
                  <Select value={d.bomSourceId || undefined} options={srcOptions} onChange={(v) => set({ bomSourceId: v, bomMatchColumn: null, bomMaterialColumn: null })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="İş emriyle eşleşecek kolon (COOIS)" extra="Ör: Sipariş">
                  <Select showSearch value={d.bomMatchColumn || undefined} options={toOptions(bom.columns)} onChange={(v) => set({ bomMatchColumn: v })} loading={bom.loading} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Malzeme kolonu">
                  <Select showSearch value={d.bomMaterialColumn || undefined} options={toOptions(bom.columns)} onChange={(v) => set({ bomMaterialColumn: v })} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Listede olanlar için yazı"><Input value={d.keepLabel} onChange={(e) => set({ keepLabel: e.target.value })} /></Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Olmayanlar için yazı (kırmızı)"><Input value={d.goLabel} onChange={(e) => set({ goLabel: e.target.value })} /></Form.Item>
              </Col>
            </Row>
            <Divider orientation="left" plain><b>Harici stoklar</b></Divider>
            <Typography.Paragraph type="secondary">
              Özel Tablolar'daki bir listede (ör. "Harici Malzemeler") geçen malzemelerde <Tag color="red">{d.goLabel}</Tag> / <Tag color="green">{d.keepLabel}</Tag> yerine
              aşağıdaki yazı gösterilir. Tablo seçilmezse bu kontrol yapılmaz.
            </Typography.Paragraph>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Harici stok tablosu (Özel Tablolar)">
                  <Select allowClear value={d.externalTableId || undefined} placeholder="Kontrol yapılmasın"
                    options={config.customTables.map((t) => ({ value: t.id, label: t.name }))}
                    onChange={(v) => set({ externalTableId: v ?? null, externalMatchColumnId: null })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Tabloda malzeme no kolonu" extra="Boşsa tablonun anahtar / ilk kolonu">
                  <Select allowClear disabled={!extTable} value={d.externalMatchColumnId || undefined}
                    options={(extTable?.columns ?? []).map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => set({ externalMatchColumnId: v ?? null })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Eşleşince yazılacak">
                  <Input value={d.externalLabel} onChange={(e) => set({ externalLabel: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="Hangi malzemelere bakılsın?">
                  <Radio.Group value={d.externalScope} onChange={(e) => set({ externalScope: e.target.value })}>
                    <Space direction="vertical">
                      <Radio value="outside">Yalnızca <b>diğer iş emirlerinin listesinde geçmeyenlere</b> bak (geçenler "{d.keepLabel}" kalır)</Radio>
                      <Radio value="all">Adresteki <b>tüm malzemelere</b> bak (diğer iş emirlerinde geçse bile harici stokta geçiyorsa "{d.externalLabel}" yazılır)</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {section === 'columns' && (
        <Card size="small">
          <Typography.Paragraph type="secondary">
            İş emrine tıklayınca açılan listede gösterilecek LX02 kolonları. Aynı malzemenin adresteki satırları tek satırda birleştirilir (miktar toplanır).
            Boş bırakılırsa malzeme, adres, depo yeri ve miktar gösterilir.
          </Typography.Paragraph>
          <ColumnsEditor value={d.columns} onChange={(v) => set({ columns: v })} available={stock.columns} computed={computed} />
        </Card>
      )}
    </div>
  )
}
