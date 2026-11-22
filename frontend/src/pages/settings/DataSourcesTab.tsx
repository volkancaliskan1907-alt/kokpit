import { useState } from 'react'
import { Alert, Button, Modal, Popconfirm, Space, Tag, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, FolderOutlined, FileExcelOutlined, FunctionOutlined, PlusOutlined } from '@ant-design/icons'
import { api, newId } from '../../api'
import { useConfig } from '../../lib/config'
import { invalidateColumns } from '../../lib/useSourceColumns'
import type { DataSourceDef, PreviewResponse } from '../../types'
import DataTable from '../../components/DataTable'
import LayoutTable from '../../components/LayoutTable'
import DataSourceEditor from './DataSourceEditor'

const emptySource = (): DataSourceDef => ({
  id: newId('ds'), name: '', description: '', path: '', filePattern: '*.xlsx;*.xls;*.xlsm;*.csv', mode: 'latest',
  includeSubfolders: false, sheetName: null, headerRow: 1, addFileNameColumn: false, computedColumns: [],
})

export default function DataSourcesTab() {
  const { config, setConfig } = useConfig()
  const [editing, setEditing] = useState<DataSourceDef | null>(null)
  const [preview, setPreview] = useState<{ def: DataSourceDef; data: PreviewResponse | null; error?: string } | null>(null)

  if (!config) return null
  const sources = config.dataSources

  const saveList = async (list: DataSourceDef[]) => {
    const cfg = await api.saveDataSources(list)
    invalidateColumns()
    setConfig(cfg)
  }

  const usages = (id: string) => {
    const u: string[] = []
    if (config.orderPage.sourceId === id) u.push('Ön Montaj sayfası')
    if (config.kittPage.sourceId === id) u.push('KITT sayfası')
    for (const s of sources) if (s.id !== id && s.computedColumns.some((c) => c.targetSourceId === id)) u.push(`"${s.name}" hesaplanan kolonları`)
    for (const v of config.kittPage.virtualColumns) if (v.optionsSourceId === id) u.push(`KITT "${v.name}" seçenekleri`)
    return u
  }

  const openPreview = async (def: DataSourceDef) => {
    setPreview({ def, data: null })
    try { setPreview({ def, data: await api.preview(def.id, 5000) }) } catch (e: any) { setPreview({ def, data: null, error: e.message }) }
  }

  return (
    <div>
      <div className="tab-toolbar">
        <Typography.Text type="secondary">
          Tüm sayfalar bu veri kaynaklarını kullanır. Kaynaklar arasında DÜŞEYARA / ETOPLA / EĞERSAY benzeri bağlantılar "Hesaplanan Kolonlar" ile kurulur.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptySource())}>Yeni Veri Kaynağı</Button>
      </div>

      <LayoutTable<DataSourceDef>
        layoutKey="datasources-list"
        rowKey="id"
        dataSource={sources}
        pagination={false}
        bordered
        size="middle"
        locale={{ emptyText: 'Henüz veri kaynağı yok' }}
        columns={[
          {
            title: 'Kaynak', key: 'name', dataIndex: 'name', width: 240,
            render: (n, r) => (
              <div>
                <Typography.Text strong>{n}</Typography.Text>
                {r.description && <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.description}</div>}
              </div>
            ),
          },
          {
            title: 'Yol', key: 'path', dataIndex: 'path', width: 420,
            render: (p: string, r) => {
              const isFile = /\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(p)
              return (
                <Space direction="vertical" size={2}>
                  <Typography.Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    {isFile ? <FileExcelOutlined /> : <FolderOutlined />} {p}
                  </Typography.Text>
                  {!isFile && (
                    <Space size={4}>
                      <Tag>{r.filePattern}</Tag>
                      <Tag color={r.mode === 'merge' ? 'purple' : 'cyan'}>{r.mode === 'merge' ? 'Tümünü birleştir' : 'En son dosya'}</Tag>
                      {r.includeSubfolders && <Tag>Alt dizinler</Tag>}
                    </Space>
                  )}
                </Space>
              )
            },
          },
          { title: 'Sayfa', key: 'sheet', dataIndex: 'sheetName', width: 120, render: (s) => s || <Typography.Text type="secondary">İlk sayfa</Typography.Text> },
          {
            title: 'Hesaplanan', key: 'computed', width: 260,
            render: (_, r) => r.computedColumns.length
              ? <div className="col-tags">{r.computedColumns.map((c) => <Tag key={c.id} icon={<FunctionOutlined />} color="blue">{c.name}</Tag>)}</div>
              : <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'İşlemler', key: 'actions', width: 150, align: 'center', fixed: 'left' as const,
            render: (_, r) => (
              <Space size={0}>
                <Tooltip title="Düzenle"><Button type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} /></Tooltip>
                <Tooltip title="Veriyi önizle"><Button type="text" icon={<EyeOutlined />} onClick={() => openPreview(r)} /></Tooltip>
                <Popconfirm
                  title="Veri kaynağı silinsin mi?"
                  description={usages(r.id).length ? <div style={{ maxWidth: 280 }}>Bu kaynak şurada kullanılıyor: <b>{usages(r.id).join(', ')}</b></div> : undefined}
                  okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try { await saveList(sources.filter((s) => s.id !== r.id)); message.success('Silindi') } catch (e: any) { message.error(e.message) }
                  }}
                >
                  <Tooltip title="Sil"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <DataSourceEditor
        open={!!editing}
        source={editing}
        allSources={sources}
        onClose={() => setEditing(null)}
        onSave={async (def) => {
          try {
            const exists = sources.some((s) => s.id === def.id)
            await saveList(exists ? sources.map((s) => (s.id === def.id ? def : s)) : [...sources, def])
            message.success('Veri kaynağı kaydedildi')
            setEditing(null)
          } catch (e: any) {
            message.error(e.message)
          }
        }}
      />

      <Modal
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={null}
        width="95vw"
        style={{ top: 20 }}
        title={`Önizleme: ${preview?.def.name ?? ''}`}
        destroyOnClose
      >
        {preview?.error && <Alert type="error" showIcon message={preview.error} />}
        {preview?.data && (
          <>
            {preview.data.warnings.length > 0 && (
              <Alert type="warning" showIcon style={{ marginBottom: 8 }} message="Uyarılar"
                description={<ul className="warn-list">{preview.data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />
            )}
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {preview.data.files.length} dosya • {preview.data.totalRows.toLocaleString('tr-TR')} satır
              {preview.data.totalRows > preview.data.rows.length && ` (ilk ${preview.data.rows.length} gösteriliyor)`}
            </Typography.Paragraph>
            <DataTable
              rows={preview.data.rows.map((r, i) => ({ ...r, __pk: i }))}
              rowKey="__pk"
              availableColumns={preview.data.columns}
              computedColumns={preview.data.computedColumns}
              columns={[]}
              rules={[]}
              exportName={preview.def.name}
              offsetHeight={300}
            />
          </>
        )}
        {!preview?.data && !preview?.error && <div style={{ padding: 40, textAlign: 'center' }}>Yükleniyor...</div>}
      </Modal>
    </div>
  )
}
