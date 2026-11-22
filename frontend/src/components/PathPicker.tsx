import { useEffect, useState } from 'react'
import { Breadcrumb, Button, Input, List, Modal, Space, message } from 'antd'
import { ArrowUpOutlined, FileExcelOutlined, FolderOpenOutlined, FolderOutlined, HddOutlined } from '@ant-design/icons'
import { api } from '../api'
import type { BrowseResponse } from '../types'

interface Props {
  value?: string
  onChange?: (v: string) => void
}

/** Sunucu üzerindeki dizin / Excel dosyası seçimi (ağ yolları elle de yazılabilir). */
export default function PathPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<BrowseResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const go = async (path?: string) => {
    setLoading(true)
    try { setData(await api.browse(path)) } catch (e: any) { message.error(e.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!open) return
    const v = (value || '').trim()
    const dir = /\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(v) ? v.replace(/[\\/][^\\/]*$/, '') : v
    go(dir || undefined).catch(() => go())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const join = (dir: string, name: string) => (dir.endsWith('\\') || dir.endsWith('/') ? dir + name : `${dir}\\${name}`)

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={'Ör: \\\\sunucu\\uretim\\IsEmirleri  veya  D:\\Veriler\\Stok.xlsx'}
        />
        <Button icon={<FolderOpenOutlined />} onClick={() => setOpen(true)}>Gözat</Button>
      </Space.Compact>
      <Modal
        open={open}
        title="Dizin veya Dosya Seç"
        onCancel={() => setOpen(false)}
        width={640}
        footer={[
          <Button key="c" onClick={() => setOpen(false)}>Vazgeç</Button>,
          <Button key="s" type="primary" disabled={!data?.path} onClick={() => { onChange?.(data!.path); setOpen(false) }}>
            Bu Dizini Seç
          </Button>,
        ]}
      >
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" icon={<HddOutlined />} onClick={() => go()}>Sürücüler</Button>
          <Button size="small" icon={<ArrowUpOutlined />} disabled={!data?.parent} onClick={() => go(data?.parent || undefined)}>Üst dizin</Button>
        </Space>
        <Breadcrumb items={[{ title: data?.path || 'Sürücüler' }]} style={{ marginBottom: 8 }} />
        <Input.Search placeholder="Yol yazıp Enter'a basın (ağ yolu dahil)" onSearch={(v) => v && go(v)} style={{ marginBottom: 8 }} />
        <List
          size="small"
          bordered
          loading={loading}
          style={{ height: 360, overflow: 'auto' }}
          dataSource={[
            ...(data?.dirs ?? []).map((d) => ({ type: 'dir' as const, name: d })),
            ...(data?.files ?? []).map((f) => ({ type: 'file' as const, name: f })),
          ]}
          renderItem={(it) => (
            <List.Item
              className="browse-item"
              onClick={() => {
                if (it.type === 'dir') go(data?.path ? join(data.path, it.name) : it.name)
                else { onChange?.(join(data!.path, it.name)); setOpen(false) }
              }}
            >
              <Space>
                {it.type === 'dir' ? (data?.path ? <FolderOutlined style={{ color: '#d48806' }} /> : <HddOutlined />) : <FileExcelOutlined style={{ color: '#1d6f42' }} />}
                {it.name}
              </Space>
            </List.Item>
          )}
        />
      </Modal>
    </>
  )
}
