import { Button, Space, Tag } from 'antd'
import { SaveOutlined, UndoOutlined } from '@ant-design/icons'
import type { SectionMeta } from './sections'

interface Props {
  meta: SectionMeta
  dirty: boolean
  saving: boolean
  onSave: () => void
  onUndo: () => void
  /** Kendi kaydet düğmeleri olan bölümlerde (Veri Kaynakları, Genel) düğmeler gizlenir */
  hideButtons?: boolean
}

/** Bölüm başlığı + açıklama + kaydet düğmeleri (sayfa kaydırılsa da üstte kalır). */
export default function SaveBar({ meta, dirty, saving, onSave, onUndo, hideButtons }: Props) {
  return (
    <div className={`settings-head ${dirty ? 'dirty' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <div className="settings-head-title">{meta.icon} {meta.label}</div>
        <div className="settings-head-desc">{meta.desc}</div>
      </div>
      {!hideButtons && <Space>
        {dirty && <Tag color="warning" style={{ margin: 0 }}>Kaydedilmemiş değişiklik</Tag>}
        <Button icon={<UndoOutlined />} disabled={!dirty} onClick={onUndo}>Geri Al</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={onSave}>Kaydet</Button>
      </Space>}
    </div>
  )
}
