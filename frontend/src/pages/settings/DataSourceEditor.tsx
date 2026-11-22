import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Badge, Button, Checkbox, Col, Drawer, Form, Input, InputNumber, List, Radio, Row, Select, Space, Tabs, Tag, Typography,
} from 'antd'
import { ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, FileExcelOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../../api'
import type { DataSourceDef, SourceTestResult } from '../../types'
import { formatValue } from '../../lib/values'
import { useSourceColumns } from '../../lib/useSourceColumns'
import PathPicker from '../../components/PathPicker'
import LayoutTable from '../../components/LayoutTable'
import ComputedColumnsEditor from './ComputedColumnsEditor'

interface Props {
  open: boolean
  source: DataSourceDef | null
  allSources: DataSourceDef[]
  onClose: () => void
  onSave: (def: DataSourceDef) => Promise<void>
}

const FILE_COL = 'Kaynak Dosya'

export default function DataSourceEditor({ open, source, allSources, onClose, onSave }: Props) {
  const [def, setDef] = useState<DataSourceDef | null>(source)
  const [test, setTest] = useState<SourceTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('conn')

  const isNew = !allSources.some((s) => s.id === source?.id)
  const saved = useSourceColumns(!isNew && open ? source?.id : null)

  useEffect(() => {
    setDef(source ? JSON.parse(JSON.stringify(source)) : null)
    setTest(null)
    setTab('conn')
    if (source?.path) runTest(source)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, open])

  const runTest = async (d: DataSourceDef) => {
    setTesting(true)
    try { setTest(await api.testSource(d)) } catch (e: any) { setTest({ ok: false, error: e.message, files: [], sheets: [], columns: [], sampleRows: [], rowCount: 0 }) } finally { setTesting(false) }
  }

  const set = (patch: Partial<DataSourceDef>) => setDef((d) => (d ? { ...d, ...patch } : d))

  // Hesaplanan kolon editörü için bu kaynağın ham kolonları
  const localColumns = useMemo(() => {
    if (!def) return []
    let cols: string[] = []
    if (test?.ok) cols = [...test.columns]
    else if (saved.columns.length) {
      const computed = new Set(source?.computedColumns.map((c) => c.name))
      cols = saved.columns.filter((c) => !computed.has(c))
    }
    if (def.addFileNameColumn && !cols.includes(FILE_COL)) cols.push(FILE_COL)
    if (!def.addFileNameColumn) cols = cols.filter((c) => c !== FILE_COL)
    return cols
  }, [test, saved.columns, def, source])

  if (!def) return null
  const isDir = !/\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(def.path.trim())

  const sampleCols = test?.columns ?? []

  return (
    <Drawer
      open={open}
      width={Math.min(1100, window.innerWidth - 40)}
      title={<Space><ApiOutlined />{isNew ? 'Yeni Veri Kaynağı' : `Veri Kaynağı: ${source?.name}`}</Space>}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!def.name.trim() || !def.path.trim() || def.computedColumns.some((c) => !c.name.trim())}
            onClick={async () => { setSaving(true); try { await onSave(def) } finally { setSaving(false) } }}
          >
            Kaydet
          </Button>
        </Space>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'conn',
            label: 'Bağlantı Ayarları',
            children: (
              <Row gutter={24}>
                <Col xs={24} lg={13}>
                  <Form layout="vertical">
                    <Form.Item label="Kaynak adı" required>
                      <Input value={def.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ör: İş Emri Listesi" />
                    </Form.Item>
                    <Form.Item label="Açıklama">
                      <Input value={def.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
                    </Form.Item>
                    <Form.Item label="Dosya veya dizin yolu" required extra="Bir Excel dosyası ya da Excel dosyalarının bulunduğu dizin seçilebilir. Ağ yolları (\\sunucu\paylaşım) desteklenir.">
                      <PathPicker value={def.path} onChange={(v) => set({ path: v })} />
                    </Form.Item>
                    {isDir && (
                      <>
                        <Form.Item label="Dizindeki dosyalar">
                          <Radio.Group value={def.mode} onChange={(e) => set({ mode: e.target.value })}>
                            <Space direction="vertical">
                              <Radio value="latest">En son değiştirilen dosyayı kullan</Radio>
                              <Radio value="merge">Tüm dosyaları alt alta birleştir</Radio>
                            </Space>
                          </Radio.Group>
                        </Form.Item>
                        <Row gutter={12}>
                          <Col span={14}>
                            <Form.Item label="Dosya deseni" extra="Birden fazla desen ; ile ayrılır">
                              <Input value={def.filePattern} onChange={(e) => set({ filePattern: e.target.value })} placeholder="*.xlsx;*.xls" />
                            </Form.Item>
                          </Col>
                          <Col span={10}>
                            <Form.Item label=" ">
                              <Checkbox checked={def.includeSubfolders} onChange={(e) => set({ includeSubfolders: e.target.checked })}>Alt dizinleri dahil et</Checkbox>
                            </Form.Item>
                          </Col>
                        </Row>
                      </>
                    )}
                    <Row gutter={12}>
                      <Col span={14}>
                        <Form.Item label="Sayfa (sheet)" extra="Boş bırakılırsa ilk sayfa okunur">
                          <Select
                            allowClear
                            showSearch
                            value={def.sheetName || undefined}
                            onChange={(v) => set({ sheetName: v ?? null })}
                            placeholder="İlk sayfa"
                            options={(test?.sheets ?? []).map((s) => ({ value: s, label: s }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item label="Başlık satırı">
                          <InputNumber min={1} max={100} value={def.headerRow} onChange={(v) => set({ headerRow: v || 1 })} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item>
                      <Checkbox checked={def.addFileNameColumn} onChange={(e) => set({ addFileNameColumn: e.target.checked })}>
                        Satırın geldiği dosya adını "{FILE_COL}" kolonu olarak ekle
                      </Checkbox>
                    </Form.Item>
                    <Button type="primary" ghost icon={<ApiOutlined />} loading={testing} onClick={() => runTest(def)} disabled={!def.path.trim()}>
                      Bağlantıyı Test Et
                    </Button>
                  </Form>
                </Col>
                <Col xs={24} lg={11}>
                  <div className="test-panel">
                    <Typography.Title level={5} style={{ marginTop: 0 }}>Test Sonucu</Typography.Title>
                    {!test && !testing && <Typography.Text type="secondary">Yol girip "Bağlantıyı Test Et" butonuna basın.</Typography.Text>}
                    {test && !test.ok && <Alert type="error" showIcon icon={<CloseCircleOutlined />} message="Okunamadı" description={test.error} />}
                    {test?.ok && (
                      <>
                        <Alert type="success" showIcon icon={<CheckCircleOutlined />}
                          message={`${test.columns.length} kolon, ${test.rowCount.toLocaleString('tr-TR')} satır okundu (ilk dosya)`} />
                        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>
                          Dosyalar {def.mode === 'merge' && isDir ? '(birleştirilecek)' : ''}
                        </Typography.Text>
                        <List
                          size="small"
                          dataSource={test.files.slice(0, 8)}
                          renderItem={(f) => (
                            <List.Item>
                              <Space><FileExcelOutlined style={{ color: '#1d6f42' }} />{f.name}</Space>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(f.lastWriteTime).format('DD.MM.YYYY HH:mm')}</Typography.Text>
                            </List.Item>
                          )}
                        />
                        {test.files.length > 8 && <Typography.Text type="secondary">+{test.files.length - 8} dosya daha</Typography.Text>}
                        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>Kolonlar</Typography.Text>
                        <div className="col-tags">{test.columns.map((c) => <Tag key={c}>{c}</Tag>)}</div>
                      </>
                    )}
                  </div>
                </Col>
              </Row>
            ),
          },
          {
            key: 'computed',
            label: <Badge count={def.computedColumns.length} size="small" offset={[10, -2]} color="#1677ff">Hesaplanan Kolonlar (DÜŞEYARA / ETOPLA...)</Badge>,
            children: (
              <ComputedColumnsEditor
                value={def.computedColumns}
                onChange={(v) => set({ computedColumns: v })}
                localColumns={localColumns}
                sources={allSources}
                currentSourceId={def.id}
              />
            ),
          },
          {
            key: 'preview',
            label: 'Örnek Veri',
            disabled: !test?.ok,
            children: test?.ok ? (
              <LayoutTable
                layoutKey="datasource-sample"
                size="small"
                bordered
                scroll={{ x: 'max-content', y: 520 }}
                pagination={false}
                rowKey={(_, i) => String(i)}
                dataSource={test.sampleRows}
                columns={sampleCols.map((c) => ({ title: c, key: c, ellipsis: true, width: 140, render: (_: unknown, r: any) => formatValue(r[c]) }))}
              />
            ) : null,
          },
        ]}
      />
    </Drawer>
  )
}
