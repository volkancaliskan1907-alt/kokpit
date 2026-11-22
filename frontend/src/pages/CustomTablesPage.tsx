import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Badge, Button, Card, Checkbox, Col, Drawer, Dropdown, Empty, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row as GridRow, Select, Space, Spin,
  Table, Tag, Tooltip, Typography, Upload, message,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DownloadOutlined, DownOutlined, EditOutlined, FileExcelOutlined, KeyOutlined, PlusOutlined,
  SettingOutlined, TableOutlined, UploadOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, newId } from '../api'
import { useConfig } from '../lib/config'
import type { ColumnView, CustomColumnDef, CustomRow, CustomTableDef, ImportPreview, ImportResult, Row, VirtualColumnDef } from '../types'
import DataTable from '../components/DataTable'
import PageHeader from '../components/PageHeader'
import { ValueInput } from '../components/VirtualCell'

const TYPES = [
  { value: 'text', label: 'Metin' },
  { value: 'textarea', label: 'Uzun metin' },
  { value: 'number', label: 'Sayı' },
  { value: 'date', label: 'Tarih' },
  { value: 'select', label: 'Seçim listesi' },
  { value: 'checkbox', label: 'Evet / Hayır' },
]

const asVirtual = (c: CustomColumnDef): VirtualColumnDef =>
  ({ id: c.id, name: c.name, type: c.type, options: c.options, optionColors: {}, optionsSourceId: null, optionsColumn: null, width: c.width })

export default function CustomTablesPage() {
  const { config, setConfig } = useConfig()
  const [params, setParams] = useSearchParams()
  const tables = config?.customTables ?? []
  const selectedId = params.get('t') || tables[0]?.id
  const table = tables.find((t) => t.id === selectedId)

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<CustomRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [editRow, setEditRow] = useState<{ row: CustomRow | null; values: Record<string, any> } | null>(null)
  const [savingRow, setSavingRow] = useState(false)
  const [editTable, setEditTable] = useState<CustomTableDef | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const loadCounts = () => api.tablesSummary().then(setCounts).catch(() => {})
  const loadRows = useCallback(async () => {
    if (!table) { setRows([]); return }
    setLoading(true)
    try { setRows(await api.tableRows(table.id)); setSelected([]) } catch (e: any) { message.error(e.message) } finally { setLoading(false) }
  }, [table?.id])

  useEffect(() => { loadCounts() }, [tables.length])
  useEffect(() => { loadRows() }, [loadRows])

  const saveTables = async (list: CustomTableDef[]) => {
    const cfg = await api.saveTables(list)
    setConfig(cfg)
  }

  // ---------------------------------------------------------------- Tablo görünümü
  const dataRows: Row[] = useMemo(() => rows.map((r) => ({
    ...r.values, __id: r.id, __by: r.updatedBy || r.createdBy, __at: r.updatedAt || r.createdAt,
  })), [rows])

  const views: ColumnView[] = useMemo(() => table ? [
    ...table.columns.map((c) => ({
      field: c.id, label: c.name, width: c.width || (c.type === 'textarea' ? 260 : 150),
      format: c.type === 'date' ? 'date' : c.type === 'number' ? 'auto' : 'auto',
      aggregate: c.type === 'number' ? 'sum' : 'none', fixed: c.id === table.keyColumnId, decimals: null,
    }) as ColumnView),
    { field: '__by', label: 'Son işlem yapan', width: 140, format: 'text', aggregate: 'none', fixed: false },
    { field: '__at', label: 'Tarih', width: 140, format: 'datetime', aggregate: 'none', fixed: false },
  ] : [], [table])

  const openRow = (r: CustomRow | null) => setEditRow({ row: r, values: r ? { ...r.values } : {} })

  const saveRow = async () => {
    if (!table || !editRow) return
    setSavingRow(true)
    try {
      if (editRow.row) await api.updateTableRow(table.id, editRow.row.id, editRow.values)
      else await api.addTableRow(table.id, editRow.values)
      message.success(editRow.row ? 'Kayıt güncellendi' : 'Kayıt eklendi')
      setEditRow(null)
      loadRows(); loadCounts()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSavingRow(false)
    }
  }

  const deleteRows = async (ids: string[]) => {
    if (!table) return
    try {
      const r = await api.deleteTableRows(table.id, ids)
      message.success(`${r.deleted} kayıt silindi`)
      loadRows(); loadCounts()
    } catch (e: any) { message.error(e.message) }
  }

  if (!config) return null

  return (
    <div className="page">
      <PageHeader icon={<TableOutlined />} title="Özel Tablolar" subtitle="Kanban stok listesi, delik içi malzeme listesi gibi kendi tablolarınız" />

      <GridRow gutter={16}>
        <Col xs={24} lg={6} xxl={5}>
          <Card
            title="Tablolar"
            size="small"
            extra={<Button size="small" type="primary" icon={<PlusOutlined />}
              onClick={() => setEditTable({ id: newId('t'), name: '', description: '', keyColumnId: null, columns: [] })}>Yeni</Button>}
          >
            {tables.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Henüz tablo yok" />}
            <div className="table-list">
              {tables.map((t) => (
                <div key={t.id} className={`table-list-item ${t.id === selectedId ? 'active' : ''}`} onClick={() => setParams({ t: t.id })}>
                  <TableOutlined />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="table-list-name">{t.name}</div>
                    {t.description && <div className="table-list-desc">{t.description}</div>}
                  </div>
                  <Badge count={counts[t.id] ?? 0} showZero color={t.id === selectedId ? '#0b2e59' : '#bfbfbf'} overflowCount={99999} />
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={18} xxl={19}>
          {!table ? (
            <Card><Empty description="Soldan bir tablo seçin veya yeni tablo oluşturun" style={{ padding: 60 }} /></Card>
          ) : (
            <Card
              className="table-card"
              title={<Space><TableOutlined />{table.name}{table.keyColumnId && <Tooltip title="Bu kolonda aynı değerle ikinci kayıt eklenemez"><Tag icon={<KeyOutlined />} color="gold">{table.columns.find((c) => c.id === table.keyColumnId)?.name}</Tag></Tooltip>}</Space>}
              extra={
                <Space wrap>
                  <Button type="primary" icon={<PlusOutlined />} disabled={!table.columns.length} onClick={() => openRow(null)}>Kayıt Ekle</Button>
                  <Dropdown
                    disabled={!table.columns.length}
                    menu={{
                      items: [
                        { key: 'empty', icon: <FileExcelOutlined />, label: 'Boş şablon' },
                        { key: 'data', icon: <FileExcelOutlined />, label: 'Mevcut kayıtlarla birlikte' },
                      ],
                      onClick: async ({ key }) => {
                        try { await api.downloadTemplate(table.id, key === 'data') } catch (e: any) { message.error(e.message) }
                      },
                    }}
                  >
                    <Button icon={<DownloadOutlined />}>Şablon İndir <DownOutlined /></Button>
                  </Dropdown>
                  <Button icon={<UploadOutlined />} disabled={!table.columns.length} onClick={() => setImportOpen(true)}>Excel'den Yükle</Button>
                  <Button icon={<SettingOutlined />} onClick={() => setEditTable(structuredClone(table))}>Tabloyu Düzenle</Button>
                  <Popconfirm
                    title="Tablo silinsin mi?"
                    description="Tablo tanımı kaldırılır. Bu tabloya bağlı işlem tipi seçenekleri çalışmaz."
                    okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      try { await saveTables(tables.filter((t) => t.id !== table.id)); setParams({}); message.success('Tablo silindi') } catch (e: any) { message.error(e.message) }
                    }}
                  >
                    <Button danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            >
              {table.columns.length === 0 ? (
                <Empty description="Bu tabloda kolon yok. 'Tabloyu Düzenle' ile kolon ekleyin." />
              ) : (
                <DataTable
                  rows={dataRows}
                  rowKey="__id"
                  availableColumns={views.map((v) => v.field)}
                  columns={views}
                  rules={[]}
                  loading={loading}
                  pageSize={50}
                  exportName={table.name}
                  offsetHeight={360}
                  rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]), columnWidth: 40 }}
                  toolbarLeft={selected.length > 0 && (
                    <Popconfirm title={`${selected.length} kayıt silinsin mi?`} okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={() => deleteRows(selected)}>
                      <Button danger icon={<DeleteOutlined />}>Seçilenleri Sil ({selected.length})</Button>
                    </Popconfirm>
                  )}
                  extraColumns={[{
                    field: '__actions', title: 'İşlem', width: 90,
                    render: (r) => (
                      <Space size={0}>
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openRow(rows.find((x) => x.id === r.__id)!)} />
                        <Popconfirm title="Kayıt silinsin mi?" okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }} onConfirm={() => deleteRows([r.__id])}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    ),
                    exportValue: () => null,
                  }]}
                />
              )}
            </Card>
          )}
        </Col>
      </GridRow>

      {/* ---------------- Kayıt ekle / düzenle */}
      <Modal
        open={!!editRow}
        title={editRow?.row ? 'Kaydı Düzenle' : `${table?.name ?? ''} — Yeni Kayıt`}
        onCancel={() => setEditRow(null)}
        onOk={saveRow}
        okText="Kaydet"
        cancelText="Vazgeç"
        confirmLoading={savingRow}
        destroyOnClose
      >
        {editRow && table && (
          <Form layout="vertical">
            {table.columns.map((c, i) => (
              <Form.Item key={c.id} label={<span>{c.name} {c.id === table.keyColumnId && <Tag color="gold" icon={<KeyOutlined />}>anahtar</Tag>}</span>} required={c.required || c.id === table.keyColumnId}>
                <ValueInput def={asVirtual(c)} value={editRow.values[c.id] ?? null} options={c.options} autoFocus={i === 0}
                  onChange={(v) => setEditRow((e) => e && ({ ...e, values: { ...e.values, [c.id]: v } }))} />
              </Form.Item>
            ))}
            {editRow.row && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Ekleyen: {editRow.row.createdBy || '—'} • {dayjs(editRow.row.createdAt).format('DD.MM.YYYY HH:mm')}
                {editRow.row.updatedAt && <> — Son güncelleyen: {editRow.row.updatedBy || '—'} • {dayjs(editRow.row.updatedAt).format('DD.MM.YYYY HH:mm')}</>}
              </Typography.Text>
            )}
          </Form>
        )}
      </Modal>

      {/* ---------------- Excel'den toplu yükleme */}
      {table && (
        <ImportModal
          open={importOpen}
          table={table}
          onClose={() => setImportOpen(false)}
          onDone={() => { loadRows(); loadCounts() }}
        />
      )}

      {/* ---------------- Tablo tanımı */}
      <TableEditor
        value={editTable}
        isNew={!!editTable && !tables.some((t) => t.id === editTable.id)}
        onClose={() => setEditTable(null)}
        onSave={async (t) => {
          try {
            const exists = tables.some((x) => x.id === t.id)
            await saveTables(exists ? tables.map((x) => (x.id === t.id ? t : x)) : [...tables, t])
            setParams({ t: t.id })
            setEditTable(null)
            message.success('Tablo kaydedildi')
          } catch (e: any) { message.error(e.message) }
        }}
      />
    </div>
  )
}

const NO_MAP = ''

function ImportModal({ open, table, onClose, onDone }: { open: boolean; table: CustomTableDef; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [headerRow, setHeaderRow] = useState(1)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [update, setUpdate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const keyName = table.columns.find((c) => c.id === table.keyColumnId)?.name

  useEffect(() => {
    if (open) { setFile(null); setPreview(null); setMapping({}); setResult(null); setUpdate(false); setHeaderRow(1) }
  }, [open])

  /** Başlık adlarına göre otomatik eşleşme önerisi; anahtar / malzeme kolonu için ilk kolon (A). */
  const suggest = (p: ImportPreview): Record<string, string> => {
    const norm = (s: string) => s.trim().toLocaleUpperCase('tr')
    const out: Record<string, string> = {}
    const used = new Set<string>()
    for (const c of table.columns) {
      let hit = p.columns.find((f) => f.header && !used.has(f.letter) && norm(f.header) === norm(c.name))
      if (!hit && /stok|malzeme/i.test(c.name)) hit = p.columns.find((f) => f.header && !used.has(f.letter) && /stok|malzeme/i.test(f.header))
      if (hit) { out[c.id] = hit.letter; used.add(hit.letter) }
    }
    const keyId = table.keyColumnId ?? table.columns[0]?.id
    if (keyId && !out[keyId] && p.columns.length && !used.has(p.columns[0].letter)) out[keyId] = p.columns[0].letter
    return out
  }

  const read = async (f: File, hr: number, keepMapping = false) => {
    setReading(true)
    try {
      const p = await api.previewImport(table.id, f, hr)
      setPreview(p)
      if (!keepMapping) setMapping(suggest(p))
    } catch (e: any) {
      message.error(e.message)
      setPreview(null)
    } finally {
      setReading(false)
    }
  }

  const run = async () => {
    if (!file) return
    setBusy(true)
    try {
      const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== NO_MAP))
      const r = await api.importTable(table.id, file, update, headerRow, clean)
      setResult(r)
      onDone()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const mappedCount = Object.values(mapping).filter((v) => v !== NO_MAP).length
  const keyMissing = !!table.keyColumnId && !mapping[table.keyColumnId]
  const colOptions = (preview?.columns ?? []).map((f) => ({
    value: f.letter,
    label: (
      <div className="map-option">
        <b>{f.letter}</b>
        <span>{f.header ?? '(başlıksız)'}</span>
        {f.samples.length > 0 && <em>{f.samples.join(' · ')}</em>}
      </div>
    ),
  }))
  const specialFor = (type: string) => [
    ...(type === 'date' || type === 'text' ? [{ value: '@tarih', label: '⟨Yükleme tarihi (bugün)⟩' }] : []),
    ...(type === 'text' ? [{ value: '@kullanici', label: '⟨Yükleyen kullanıcı⟩' }] : []),
  ]

  return (
    <Modal
      open={open}
      title={`Excel'den Yükle — ${table.name}`}
      onCancel={onClose}
      width={760}
      footer={result
        ? [<Button key="c" type="primary" onClick={onClose}>Kapat</Button>]
        : [
          <Button key="t" icon={<DownloadOutlined />} onClick={() => api.downloadTemplate(table.id, false).catch((e) => message.error(e.message))}>Şablon İndir</Button>,
          <Button key="c" onClick={onClose}>Vazgeç</Button>,
          <Button key="o" type="primary" icon={<UploadOutlined />} disabled={!file || !preview || mappedCount === 0 || keyMissing} loading={busy} onClick={run}>
            Yükle{preview ? ` (${preview.rowCount} satır)` : ''}
          </Button>,
        ]}
      destroyOnClose
    >
      {!result ? (
        <>
          <Upload.Dragger
            accept=".xlsx,.xls,.xlsm,.csv"
            maxCount={1}
            beforeUpload={(f) => { setFile(f); read(f, headerRow); return false }}
            onRemove={() => { setFile(null); setPreview(null); setMapping({}) }}
            fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}
          >
            <p className="ant-upload-drag-icon"><FileExcelOutlined style={{ color: '#1d6f42' }} /></p>
            <p className="ant-upload-text">Excel dosyasını buraya sürükleyin veya tıklayıp seçin</p>
            <p className="ant-upload-hint">Dosyadaki hangi kolonun hangi tablo kolonuna yazılacağını bir sonraki adımda siz seçersiniz.</p>
          </Upload.Dragger>

          {file && (
            <div style={{ marginTop: 14 }}>
              <Space wrap size={14} style={{ marginBottom: 10 }}>
                <span>Başlık satırı:</span>
                <InputNumber min={0} max={50} value={headerRow} style={{ width: 80 }}
                  onChange={(v) => { const n = v ?? 1; setHeaderRow(n); read(file, n, true) }} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {headerRow === 0 ? 'Dosyada başlık yok: veri 1. satırdan başlar.' : `Veri ${headerRow + 1}. satırdan başlar. (0 = başlık satırı yok)`}
                </Typography.Text>
              </Space>

              {reading && <div style={{ padding: 20, textAlign: 'center' }}><Spin /></div>}
              {preview && !reading && (
                <>
                  <Typography.Text strong style={{ display: 'block' }}>Kolon eşleştirme</Typography.Text>
                  <Table
                    size="small"
                    pagination={false}
                    bordered
                    style={{ marginTop: 6 }}
                    rowKey="id"
                    dataSource={table.columns}
                    columns={[
                      {
                        title: 'Tablo kolonu', width: 220,
                        render: (_, c) => (
                          <Space size={4}>
                            {c.name}
                            {c.id === table.keyColumnId && <Tag color="gold" icon={<KeyOutlined />}>anahtar</Tag>}
                            {c.required && <Tag color="red">zorunlu</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: 'Dosyadaki kolon',
                        render: (_, c) => (
                          <Select
                            allowClear
                            size="small"
                            style={{ width: '100%' }}
                            placeholder="— aktarma —"
                            value={mapping[c.id] || undefined}
                            status={c.id === table.keyColumnId && !mapping[c.id] ? 'error' : undefined}
                            onChange={(v) => setMapping((m) => ({ ...m, [c.id]: v ?? NO_MAP }))}
                            options={[...colOptions, ...specialFor(c.type)]}
                            optionLabelProp="label"
                            popupMatchSelectWidth={false}
                            dropdownStyle={{ minWidth: 380 }}
                          />
                        ),
                      },
                    ]}
                  />
                  {keyMissing && <Alert style={{ marginTop: 8 }} type="warning" showIcon message={`Anahtar kolon (${keyName}) için dosyadan bir kolon seçilmeli.`} />}
                  <div style={{ marginTop: 10 }}>
                    {keyName ? (
                      <Checkbox checked={update} onChange={(e) => setUpdate(e.target.checked)}>
                        Aynı <b>{keyName}</b> ile kayıt varsa güncelle <Typography.Text type="secondary">(işaretlenmezse atlanır)</Typography.Text>
                      </Checkbox>
                    ) : (
                      <Typography.Text type="secondary">Bu tabloda anahtar kolon yok; tüm satırlar yeni kayıt olarak eklenir.</Typography.Text>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <GridRow gutter={12} style={{ marginBottom: 12 }}>
            {[
              { t: 'Eklendi', v: result.added, c: '#389e0d' },
              { t: 'Güncellendi', v: result.updated, c: '#1d5fa8' },
              { t: 'Atlandı (zaten var)', v: result.skipped, c: '#8c8c8c' },
              { t: 'Hatalı', v: result.errors.length, c: '#cf1322' },
            ].map((x) => (
              <Col span={6} key={x.t}>
                <div className="import-stat" style={{ borderTopColor: x.c }}>
                  <div className="import-stat-num" style={{ color: x.c }}>{x.v}</div>
                  <div className="import-stat-label">{x.t}</div>
                </div>
              </Col>
            ))}
          </GridRow>
          <Typography.Text type="secondary">Dosyada {result.totalRows} satır okundu.</Typography.Text>
          {result.errors.length > 0 && (
            <Alert style={{ marginTop: 10 }} type="error" showIcon message="Yüklenemeyen satırlar"
              description={<div style={{ maxHeight: 200, overflow: 'auto' }}><ul className="warn-list">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>} />
          )}
        </div>
      )}
    </Modal>
  )
}

function TableEditor({ value, isNew, onClose, onSave }: {
  value: CustomTableDef | null; isNew: boolean; onClose: () => void; onSave: (t: CustomTableDef) => Promise<void>
}) {
  const [t, setT] = useState<CustomTableDef | null>(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => setT(value), [value])
  if (!t) return <Drawer open={false} />

  const setCol = (i: number, p: Partial<CustomColumnDef>) => setT({ ...t, columns: t.columns.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= t.columns.length) return
    const c = [...t.columns];
    [c[i], c[j]] = [c[j], c[i]]
    setT({ ...t, columns: c })
  }
  const invalid = !t.name.trim() || t.columns.some((c) => !c.name.trim())

  return (
    <Drawer
      open={!!value}
      width={Math.min(900, window.innerWidth - 40)}
      title={isNew ? 'Yeni Özel Tablo' : `Tabloyu Düzenle: ${value?.name}`}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="primary" loading={saving} disabled={invalid} onClick={async () => { setSaving(true); try { await onSave(t) } finally { setSaving(false) } }}>Kaydet</Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <GridRow gutter={16}>
          <Col span={10}><Form.Item label="Tablo adı" required><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Ör: Delik İçi Malzeme Listesi" /></Form.Item></Col>
          <Col span={14}><Form.Item label="Açıklama"><Input value={t.description ?? ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></Form.Item></Col>
        </GridRow>
      </Form>
      <Typography.Title level={5}>Kolonlar</Typography.Title>
      <Typography.Paragraph type="secondary">
        <KeyOutlined /> <b>Anahtar</b> kolonda aynı değerle ikinci kayıt eklenemez (ör. Malzeme No). İşlem tipi seçimiyle bu tabloya yazılırken anahtar kolona malzeme numarası yazılır.
      </Typography.Paragraph>
      <Table<CustomColumnDef>
        size="small"
        bordered
        pagination={false}
        rowKey="id"
        dataSource={t.columns}
        columns={[
          {
            title: 'Sıra', width: 70, align: 'center',
            render: (_, __, i) => (
              <Space size={0}>
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === t.columns.length - 1} onClick={() => move(i, 1)} />
              </Space>
            ),
          },
          { title: 'Kolon adı', render: (_, c, i) => <Input size="small" value={c.name} status={!c.name ? 'error' : undefined} onChange={(e) => setCol(i, { name: e.target.value })} /> },
          { title: 'Tip', width: 140, render: (_, c, i) => <Select size="small" style={{ width: '100%' }} value={c.type} options={TYPES} onChange={(v) => setCol(i, { type: v })} /> },
          {
            title: 'Seçenekler', width: 220,
            render: (_, c, i) => c.type === 'select'
              ? <Select size="small" mode="tags" style={{ width: '100%' }} value={c.options} tokenSeparators={[';']} onChange={(v) => setCol(i, { options: v })} placeholder="Yazıp Enter" />
              : <span className="muted">—</span>,
          },
          { title: 'Genişlik', width: 90, render: (_, c, i) => <InputNumber size="small" min={60} max={600} value={c.width ?? null} onChange={(v) => setCol(i, { width: v })} style={{ width: '100%' }} /> },
          { title: 'Zorunlu', width: 70, align: 'center', render: (_, c, i) => <Checkbox checked={c.required} onChange={(e) => setCol(i, { required: e.target.checked })} /> },
          {
            title: <Tooltip title="Benzersiz anahtar kolon"><KeyOutlined /> Anahtar</Tooltip>, width: 80, align: 'center',
            render: (_, c) => <Radio checked={t.keyColumnId === c.id} onClick={() => setT({ ...t, keyColumnId: t.keyColumnId === c.id ? null : c.id })} />,
          },
          {
            title: '', width: 44, align: 'center',
            render: (_, c, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />}
              onClick={() => setT({ ...t, keyColumnId: t.keyColumnId === c.id ? null : t.keyColumnId, columns: t.columns.filter((_, j) => j !== i) })} />,
          },
        ]}
      />
      <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 10 }}
        onClick={() => setT({ ...t, columns: [...t.columns, { id: newId('c'), name: '', type: 'text', options: [], required: false, width: null }] })}>
        Kolon Ekle
      </Button>
    </Drawer>
  )
}
