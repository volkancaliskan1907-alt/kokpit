import { useEffect, useState } from 'react'
import { Button, Card, Col, Form, Input, InputNumber, Row, Space, Typography, message } from 'antd'
import { ClearOutlined, SaveOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { useConfig } from '../../lib/config'
import { invalidateColumns } from '../../lib/useSourceColumns'
import type { GeneralSettings } from '../../types'

export default function GeneralSettingsTab() {
  const { config, setConfig } = useConfig()
  const [g, setG] = useState<GeneralSettings | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (config) setG({ ...config.general }) }, [config])
  if (!g || !config) return null

  return (
    <div className="settings-section">
      <Card title="Kurum Bilgileri" size="small">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}><Form.Item label="Şirket adı"><Input value={g.companyName} onChange={(e) => setG({ ...g, companyName: e.target.value })} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Birim"><Input value={g.departmentName} onChange={(e) => setG({ ...g, departmentName: e.target.value })} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Uygulama başlığı"><Input value={g.appTitle} onChange={(e) => setG({ ...g, appTitle: e.target.value })} /></Form.Item></Col>
            <Col xs={24} md={8}>
              <Form.Item label="Dosya değişikliği kontrol aralığı (sn)" extra="Excel dosyaları bu süreden sık kontrol edilmez; değişen dosya otomatik yeniden okunur.">
                <InputNumber min={1} max={3600} value={g.refreshSeconds} onChange={(v) => setG({ ...g, refreshSeconds: v || 5 })} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" icon={<SaveOutlined />} loading={saving}
            onClick={async () => {
              setSaving(true)
              try { setConfig(await api.saveGeneral(g)); message.success('Kaydedildi') } catch (e: any) { message.error(e.message) } finally { setSaving(false) }
            }}>
            Kaydet
          </Button>
        </Form>
      </Card>

      <Card title="Bakım" size="small">
        <Space direction="vertical">
          <Typography.Text type="secondary">Tüm veri kaynaklarının önbelleğini temizler; bir sonraki istekte Excel dosyaları yeniden okunur.</Typography.Text>
          <Button icon={<ClearOutlined />} onClick={async () => { await api.reload(); invalidateColumns(); message.success('Önbellek temizlendi') }}>
            Önbelleği Temizle
          </Button>
        </Space>
      </Card>
    </div>
  )
}
