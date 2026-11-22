import { Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { CustomTableDef, DataSourceDef, KanbanConfig, KittDetailConfig, ProcessOption } from '../../types'
import { OPERATORS } from '../../lib/values'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'
import ColumnsEditor from './ColumnsEditor'
import VirtualColumnsEditor from './VirtualColumnsEditor'

export type DetailSection = 'general' | 'stock' | 'scan' | 'process' | 'kanban' | 'markers' | 'virtual'

interface Props {
  section: DetailSection
  value: KittDetailConfig
  onChange: (v: KittDetailConfig) => void
  sources: DataSourceDef[]
  tables: CustomTableDef[]
  /** KITT tablosunun kolonları (tıklanacak kolon seçimi için) */
  kittColumns: string[]
}

export const emptyDetail = (): KittDetailConfig => ({
  enabled: false, title: 'KITT Toplama', triggerColumn: null,
  bomSourceId: null, bomMatchColumn: null, bomMaterialColumn: null, bomColumns: [],
  stockSourceId: null, stockMaterialColumn: null, stockAddressColumn: null, stockQtyColumn: null, stockInfoColumns: [], maxAddresses: 3, stockFilters: [],
  scanEnabled: true, scanMatchColumn: null, processTitle: 'İşlem Tipi', processOptions: [], markerColumns: [],
  kanban: { enabled: false, excludeFromCount: false, label: 'Kanban', color: 'cyan', tableId: null, matchColumnId: null, stockSourceId: null, stockMaterialColumn: null, stockDepotColumn: null, stockDepotValue: '6010', stockQtyColumn: null },
  virtualColumns: [],
})

const TAG_COLORS = ['blue', 'geekblue', 'purple', 'magenta', 'red', 'volcano', 'orange', 'gold', 'green', 'cyan']
const SPECIAL_SOURCES = [
  { value: '@siparis', label: '⟨Sipariş no⟩' },
  { value: '@tarih', label: '⟨Kayıt tarihi⟩' },
  { value: '@kullanici', label: '⟨Kullanıcı⟩' },
  { value: '@islem', label: '⟨İşlem tipi⟩' },
]

export default function DetailSettings({ section, value, onChange, sources, tables, kittColumns }: Props) {
  const empty = emptyDetail()
  const d = { ...empty, ...value, kanban: { ...empty.kanban, ...(value.kanban ?? {}) }, virtualColumns: value.virtualColumns ?? [], markerColumns: value.markerColumns ?? [] }
  const set = (p: Partial<KittDetailConfig>) => onChange({ ...d, ...p })
  const setKanban = (p: Partial<KanbanConfig>) => set({ kanban: { ...d.kanban, ...p } })
  const bom = useSourceColumns(d.bomSourceId)
  const stock = useSourceColumns(d.stockSourceId)
  const kstock = useSourceColumns(d.kanban.stockSourceId)
  const srcOptions = sources.map((s) => ({ value: s.id, label: s.name }))
  const computedOf = (id?: string | null) => sources.find((s) => s.id === id)?.computedColumns.map((c) => c.name) ?? []
  const setOption = (i: number, p: Partial<ProcessOption>) => set({ processOptions: d.processOptions.map((o, j) => (j === i ? { ...o, ...p } : o)) })

  return (
    <div>
      {section !== 'general' && !d.enabled && (
        <Alert style={{ marginBottom: 12 }} type="warning" showIcon
          message="KITT toplama penceresi şu an kapalı. 'Açılış ve Bileşenler' bölümünden açabilirsiniz." />
      )}

      {/* ====================================================== Açılış ve bileşenler */}
      {section === 'general' && (
        <Form layout="vertical">
          <Space style={{ marginBottom: 12 }} wrap>
            <Switch checked={d.enabled} onChange={(v) => set({ enabled: v })} />
            <Typography.Text strong>Siparişe tıklanınca KITT toplama penceresi açılsın</Typography.Text>
          </Space>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Pencere başlığı"><Input value={d.title} onChange={(e) => set({ title: e.target.value })} /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Tıklanacak kolon (KITT tablosu)" extra="Ör: Üretim Siparişi">
                <Select showSearch allowClear value={d.triggerColumn || undefined} options={toOptions(kittColumns)} onChange={(v) => set({ triggerColumn: v ?? null })} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Bileşen veri kaynağı" validateStatus={bom.error ? 'error' : undefined} help={bom.error}>
                <Select value={d.bomSourceId || undefined} options={srcOptions}
                  onChange={(v) => set({ bomSourceId: v, bomMatchColumn: null, bomMaterialColumn: null, bomColumns: [], scanMatchColumn: null })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Tıklanan siparişle eşleşecek kolon" extra="Ör: Sipariş">
                <Select showSearch value={d.bomMatchColumn || undefined} options={toOptions(bom.columns)} onChange={(v) => set({ bomMatchColumn: v })} loading={bom.loading} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Malzeme kolonu" extra="Depo adresi ve özel tablo eşleşmesi için">
                <Select showSearch value={d.bomMaterialColumn || undefined} options={toOptions(bom.columns)} onChange={(v) => set({ bomMaterialColumn: v })} />
              </Form.Item>
            </Col>
          </Row>
          <Typography.Text strong>Pencerede gösterilecek kolonlar</Typography.Text>
          <div style={{ margin: '8px 0 4px' }}>
            <ColumnsEditor value={d.bomColumns} onChange={(v) => set({ bomColumns: v })} available={bom.columns} computed={computedOf(d.bomSourceId)} />
          </div>
          {d.enabled && (!d.bomSourceId || !d.bomMatchColumn || !d.triggerColumn) && (
            <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Pencerenin çalışması için tıklanacak kolon, bileşen kaynağı ve eşleşme kolonu seçilmeli." />
          )}
        </Form>
      )}

      {/* ====================================================== Depo adresleri */}
      {section === 'stock' && (
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label="Stok veri kaynağı" validateStatus={stock.error ? 'error' : undefined} help={stock.error}>
                <Select allowClear value={d.stockSourceId || undefined} options={srcOptions}
                  onChange={(v) => set({ stockSourceId: v ?? null, stockMaterialColumn: null, stockAddressColumn: null, stockQtyColumn: null, stockInfoColumns: [], stockFilters: [] })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Malzeme kolonu (stok)">
                <Select showSearch value={d.stockMaterialColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ stockMaterialColumn: v })} loading={stock.loading} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Adres kolonu" extra="Ör: Depo adresi">
                <Select showSearch value={d.stockAddressColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ stockAddressColumn: v })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Miktar kolonu" extra="Ör: Kullanılabilir stok">
                <Select showSearch allowClear value={d.stockQtyColumn || undefined} options={toOptions(stock.columns)} onChange={(v) => set({ stockQtyColumn: v ?? null })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Adresin yanında gösterilecek bilgiler" extra="Ör: Depo yeri">
                <Select mode="multiple" value={d.stockInfoColumns} options={toOptions(stock.columns)} onChange={(v) => set({ stockInfoColumns: v })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Hücrede gösterilecek adres sayısı" extra="Fazlası 'devamını gör' ile açılır">
                <InputNumber min={1} max={20} value={d.maxAddresses} onChange={(v) => set({ maxAddresses: v || 3 })} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Stokta dikkate alınacak satırlar (isteğe bağlı filtre)" extra="Ör: Depolama blokajı boş olanlar veya belirli depo yerleri (Listede: K005;A002)">
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
            <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => set({ stockFilters: [...d.stockFilters, { column: '', operator: 'empty', value: '' }] })}>
              Filtre ekle
            </Button>
          </Form.Item>
        </Form>
      )}

      {/* ====================================================== Barkod */}
      {section === 'scan' && (
        <Form layout="vertical">
          <Row gutter={16} align="middle">
            <Col xs={24} md={8}>
              <Form.Item label="Okutma alanı">
                <Space><Switch checked={d.scanEnabled} onChange={(v) => set({ scanEnabled: v })} /> Pencerenin başlığında göster</Space>
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item label="Okutulan kod hangi kolonla eşleşsin" extra="Boşsa malzeme kolonu. Baştaki sıfırlar ve karekod içindeki ek alanlar dikkate alınmaz.">
                <Select showSearch allowClear placeholder={d.bomMaterialColumn || 'Malzeme kolonu'} value={d.scanMatchColumn || undefined}
                  options={toOptions(bom.columns)} onChange={(v) => set({ scanMatchColumn: v ?? null })} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}

      {/* ====================================================== İşlem tipi */}
      {section === 'process' && (
        <div>
          <Typography.Paragraph type="secondary">
            Her seçenek bir özel tabloya bağlanabilir. Kullanıcı bir malzeme için seçenek seçtiğinde malzeme o tabloya <b>bir kez</b> yazılır
            (tekrar kayıt oluşmaz); sonraki siparişlerde aynı malzeme otomatik seçili gelir. Tabloya bağlanmayan seçenekler de kalıcı saklanır.
          </Typography.Paragraph>
          <Form.Item label="Kolon başlığı" style={{ maxWidth: 300 }}>
            <Input value={d.processTitle} onChange={(e) => set({ processTitle: e.target.value })} />
          </Form.Item>
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {d.processOptions.map((o, i) => {
              const table = tables.find((t) => t.id === o.tableId)
              return (
                <Card key={i} size="small" className="computed-card"
                  title={
                    <Space wrap>
                      <Input size="small" placeholder="Seçenek (ör. Delik içi)" value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} style={{ width: 200, fontWeight: 600 }} />
                      <Select size="small" style={{ width: 130 }} value={o.color || 'blue'} onChange={(v) => setOption(i, { color: v })}
                        options={TAG_COLORS.map((c) => ({ value: c, label: <Tag color={c} style={{ margin: 0 }}>{o.label || c}</Tag> }))} />
                      <Select size="small" allowClear style={{ width: 260 }} placeholder="Bağlı özel tablo (isteğe bağlı)" value={o.tableId || undefined}
                        onChange={(v) => setOption(i, { tableId: v ?? null, map: [], matchColumnId: null })} options={tables.map((t) => ({ value: t.id, label: t.name }))} />
                    </Space>
                  }
                  extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => set({ processOptions: d.processOptions.filter((_, j) => j !== i) })} />}
                >
                  <div style={{ marginBottom: 10 }}>
                    <Checkbox checked={o.excludeFromCount !== false} onChange={(e) => setOption(i, { excludeFromCount: e.target.checked })}>
                      Bu işlem tipindeki malzemeler toplama ilerlemesine <b>dahil edilmesin</b> (ör. 26 kalemden 2'si delik içiyse 24 sayılır)
                    </Checkbox>
                  </div>
                  {!table ? (
                    <Typography.Text type="secondary">Tabloya bağlı değil; seçim kalıcı olarak saklanır ve aynı malzeme sonraki siparişlerde seçili gelir.</Typography.Text>
                  ) : (() => {
                    const matchCol = (o.matchColumnId && table.columns.some((c) => c.id === o.matchColumnId)) ? o.matchColumnId : table.keyColumnId
                    return (
                      <div className="lookup-grid">
                        <div className="lookup-row">
                          <label><b>Malzeme no yazılacak kolon</b></label>
                          <Select style={{ width: 320 }} placeholder="Kolon seçin" value={matchCol || undefined} status={!matchCol ? 'error' : undefined}
                            onChange={(v) => setOption(i, { matchColumnId: v })}
                            options={table.columns.map((c) => ({ value: c.id, label: c.name }))} />
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Aynı malzeme bu kolonda varsa tekrar eklenmez</Typography.Text>
                        </div>
                        {table.columns.filter((tc) => tc.id !== matchCol).map((tc) => {
                          const m = o.map.find((x) => x.tableColumnId === tc.id)
                          return (
                            <div className="lookup-row" key={tc.id}>
                              <label>{tc.name}</label>
                              <Select allowClear showSearch style={{ width: 320 }} placeholder="Boş bırak" value={m?.source || undefined}
                                options={[...SPECIAL_SOURCES, ...toOptions(bom.columns)]}
                                onChange={(v) => setOption(i, { map: [...o.map.filter((x) => x.tableColumnId !== tc.id), ...(v ? [{ tableColumnId: tc.id, source: v }] : [])] })} />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </Card>
              )
            })}
          </Space>
          <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 10 }}
            onClick={() => set({ processOptions: [...d.processOptions, { label: '', color: 'blue', tableId: null, matchColumnId: null, excludeFromCount: true, map: [] }] })}>
            Seçenek Ekle
          </Button>
        </div>
      )}

      {/* ====================================================== Kanban */}
      {section === 'kanban' && (
        <Form layout="vertical">
          <Typography.Paragraph type="secondary">
            Kanban tablosunda kayıtlı malzemelerde <b>Depo Adresleri</b> "-" olarak gösterilir; <b>{d.processTitle || 'İşlem Tipi'}</b> kolonunda seçim kutusu yerine
            kanban etiketi ve belirtilen depo yerindeki miktar (ör. ZMB52'de 6010) gösterilir.
          </Typography.Paragraph>
          <Space size={20} style={{ marginBottom: 12 }} wrap>
            <Space><Switch checked={d.kanban.enabled} onChange={(v) => setKanban({ enabled: v })} /> Kanban kuralını uygula</Space>
            <Checkbox checked={!!d.kanban.excludeFromCount} onChange={(e) => setKanban({ excludeFromCount: e.target.checked })}>Kanban malzemelerini ilerleme sayımına dahil etme</Checkbox>
          </Space>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label="Kanban tablosu (Özel Tablolar)">
                <Select value={d.kanban.tableId || undefined} options={tables.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(v) => setKanban({ tableId: v, matchColumnId: null })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Tabloda malzeme no kolonu" extra="Boşsa tablonun anahtar kolonu">
                <Select allowClear value={d.kanban.matchColumnId || undefined}
                  options={(tables.find((t) => t.id === d.kanban.tableId)?.columns ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(v) => setKanban({ matchColumnId: v ?? null })} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Etiket yazısı"><Input value={d.kanban.label} onChange={(e) => setKanban({ label: e.target.value })} /></Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Renk">
                <Select value={d.kanban.color || 'cyan'} onChange={(v) => setKanban({ color: v })}
                  options={TAG_COLORS.map((c) => ({ value: c, label: <Tag color={c} style={{ margin: 0 }}>{d.kanban.label || c}</Tag> }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Kanban miktarı kaynağı" extra="Ör: ZMB52" validateStatus={kstock.error ? 'error' : undefined} help={kstock.error}>
                <Select allowClear value={d.kanban.stockSourceId || undefined} options={srcOptions}
                  onChange={(v) => setKanban({ stockSourceId: v ?? null, stockMaterialColumn: null, stockDepotColumn: null, stockQtyColumn: null })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="Malzeme kolonu">
                <Select showSearch value={d.kanban.stockMaterialColumn || undefined} options={toOptions(kstock.columns)} onChange={(v) => setKanban({ stockMaterialColumn: v })} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item label="Depo yeri kolonu">
                <Select showSearch allowClear value={d.kanban.stockDepotColumn || undefined} options={toOptions(kstock.columns)} onChange={(v) => setKanban({ stockDepotColumn: v ?? null })} />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Depo yeri"><Input value={d.kanban.stockDepotValue ?? ''} placeholder="6010" onChange={(e) => setKanban({ stockDepotValue: e.target.value })} /></Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="Miktar kolonu">
                <Select showSearch value={d.kanban.stockQtyColumn || undefined} options={toOptions(kstock.columns)} onChange={(v) => setKanban({ stockQtyColumn: v })} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}

      {/* ====================================================== Etiket kolonları */}
      {section === 'markers' && (
        <div>
          <Typography.Paragraph type="secondary">
            Pencereye, malzemenin seçilen özel tabloda kayıtlı olup olmadığını gösteren bir kolon ekler. Kayıtlıysa "Varsa" yazısı, değilse "Yoksa" yazısı görünür
            (ör. PAP Kontrol: Var / Yok); üzerine gelince tablodaki kayıt bilgileri gösterilir.
          </Typography.Paragraph>
          {d.markerColumns.map((m, i) => {
            const upd = (p: object) => set({ markerColumns: d.markerColumns.map((x, j) => (j === i ? { ...x, ...p } : x)) })
            return (
              <Space key={i} style={{ display: 'flex', marginBottom: 8 }} wrap>
                <Input style={{ width: 160 }} addonBefore="Başlık" value={m.title} onChange={(e) => upd({ title: e.target.value })} />
                <Select style={{ width: 240 }} placeholder="Özel tablo" value={m.tableId || undefined} onChange={(v) => upd({ tableId: v, matchColumnId: null })}
                  options={tables.map((t) => ({ value: t.id, label: t.name }))} />
                <Select style={{ width: 220 }} placeholder="Malzeme no hangi kolonda?" allowClear value={m.matchColumnId || undefined}
                  onChange={(v) => upd({ matchColumnId: v ?? null })}
                  options={(tables.find((t) => t.id === m.tableId)?.columns ?? []).map((c) => ({ value: c.id, label: `Eşleşme: ${c.name}` }))} />
                <Input style={{ width: 170 }} addonBefore="Varsa" value={m.label} onChange={(e) => upd({ label: e.target.value })} />
                <Select style={{ width: 120 }} value={m.color || 'cyan'} onChange={(v) => upd({ color: v })}
                  options={TAG_COLORS.map((c) => ({ value: c, label: <Tag color={c} style={{ margin: 0 }}>{m.label || c}</Tag> }))} />
                <Input style={{ width: 170 }} addonBefore="Yoksa" placeholder="boş = hiçbir şey" value={m.absentLabel ?? ''} onChange={(e) => upd({ absentLabel: e.target.value || null })} />
                <Select style={{ width: 120 }} value={m.absentColor || 'red'} disabled={!m.absentLabel} onChange={(v) => upd({ absentColor: v })}
                  options={TAG_COLORS.map((c) => ({ value: c, label: <Tag color={c} style={{ margin: 0 }}>{m.absentLabel || c}</Tag> }))} />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => set({ markerColumns: d.markerColumns.filter((_, j) => j !== i) })} />
              </Space>
            )
          })}
          <Button type="dashed" icon={<PlusOutlined />}
            onClick={() => set({ markerColumns: [...d.markerColumns, { title: 'Kontrol', label: 'Var', color: 'green', absentLabel: 'Yok', absentColor: 'red', tableId: null }] })}>
            Etiket Kolonu Ekle
          </Button>
        </div>
      )}

      {/* ====================================================== Giriş kolonları */}
      {section === 'virtual' && (
        <VirtualColumnsEditor value={d.virtualColumns} onChange={(v) => set({ virtualColumns: v })} sources={sources} />
      )}
    </div>
  )
}
