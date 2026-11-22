import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Col, List, Row, Skeleton, Statistic, Tag, Tooltip, Typography } from 'antd'
import {
  ArrowRightOutlined, BarChartOutlined, CheckSquareOutlined, DatabaseOutlined, FileExcelOutlined,
  FunctionOutlined, ReloadOutlined, SettingOutlined, ShoppingCartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api'
import type { DashboardResponse } from '../types'

export default function HomePage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nav = useNavigate()

  const load = async (reload = false) => {
    setLoading(true)
    try {
      if (reload) await api.reload()
      setData(await api.dashboard())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const totalRows = data?.sources.reduce((a, s) => a + s.rowCount, 0) ?? 0
  const errorCount = data?.sources.filter((s) => !s.ok).length ?? 0

  return (
    <div className="page">
      <div className="hero">
        <div>
          <div className="hero-overline">{data?.general.companyName ?? 'MEOS Elektronik'} • {data?.general.departmentName ?? 'Üretim Müdürlüğü'}</div>
          <h1>{data?.general.appTitle ?? 'Üretim Kokpiti'}</h1>
          <p>Sipariş, malzeme ve KITT hazırlık durumunu Excel veri kaynaklarından anlık olarak izleyin.</p>
        </div>
        <div className="hero-actions">
          <Button size="large" type="primary" ghost icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>
            Verileri Yenile
          </Button>
        </div>
      </div>

      {error && <Alert type="error" showIcon message="Kokpit verileri alınamadı" description={error} />}

      <Row gutter={[16, 16]}>
        {[
          { title: 'Veri Kaynağı', value: data?.sources.length, icon: <DatabaseOutlined />, color: '#0b2e59', suffix: errorCount ? <Tag color="error">{errorCount} hatalı</Tag> : null },
          { title: 'Toplam Kayıt', value: totalRows, icon: <FileExcelOutlined />, color: '#1d6f42' },
          { title: 'Tanımlı Sipariş', value: data?.orderCount, icon: <ShoppingCartOutlined />, color: '#d46b08' },
          { title: 'KITT Girişi Olan Satır', value: data?.kittRowCount, icon: <CheckSquareOutlined />, color: '#531dab' },
        ].map((k) => (
          <Col xs={24} sm={12} xl={6} key={k.title}>
            <Card className="kpi-card" loading={!data && loading}>
              <div className="kpi-icon" style={{ background: k.color }}>{k.icon}</div>
              <Statistic title={k.title} value={k.value ?? 0} groupSeparator="." />
              {k.suffix}
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Hızlı Erişim" className="section-card">
            {[
              { to: '/siparis', icon: <BarChartOutlined />, title: 'Sipariş Analizi', desc: 'Siparişe göre malzeme ihtiyaç ve stok analizi' },
              { to: '/kitt', icon: <CheckSquareOutlined />, title: 'KITT Hazırlama', desc: 'Satır bazında hazırlık durumu ve açıklama girişi' },
              { to: '/ayarlar', icon: <SettingOutlined />, title: 'Ayarlar', desc: 'Veri kaynakları, bağlantılar, kolonlar ve kurallar' },
            ].map((q) => (
              <div key={q.to} className="quick-link" onClick={() => nav(q.to)}>
                <div className="quick-link-icon">{q.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="quick-link-title">{q.title}</div>
                  <div className="quick-link-desc">{q.desc}</div>
                </div>
                <ArrowRightOutlined />
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Veri Kaynakları Durumu" className="section-card"
            extra={<Button type="link" onClick={() => nav('/ayarlar?tab=sources')}>Yönet</Button>}>
            {!data ? <Skeleton active /> : (
              <List
                dataSource={data.sources}
                locale={{ emptyText: 'Henüz veri kaynağı tanımlanmamış' }}
                renderItem={(s) => (
                  <List.Item
                    extra={
                      <div style={{ textAlign: 'right', minWidth: 160 }}>
                        <Typography.Text strong>{s.rowCount.toLocaleString('tr-TR')}</Typography.Text>
                        <Typography.Text type="secondary"> satır</Typography.Text>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {s.lastWrite ? `Dosya: ${dayjs(s.lastWrite).format('DD.MM.YYYY HH:mm')}` : ''}
                        </div>
                      </div>
                    }
                  >
                    <List.Item.Meta
                      avatar={<Badge status={!s.ok ? 'error' : s.warnings.length ? 'warning' : 'success'} />}
                      title={
                        <span>
                          {s.name}{' '}
                          {s.computedCount > 0 && (
                            <Tooltip title="Hesaplanan kolon sayısı">
                              <Tag color="blue" icon={<FunctionOutlined />}>{s.computedCount}</Tag>
                            </Tooltip>
                          )}
                          {s.fileCount > 1 && <Tag>{s.fileCount} dosya</Tag>}
                        </span>
                      }
                      description={
                        !s.ok ? <Typography.Text type="danger">{s.error}</Typography.Text>
                          : s.warnings.length ? <Typography.Text type="warning">{s.warnings[0]}</Typography.Text>
                            : s.description || `${s.columnCount} kolon`
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {data && data.orderSummary.length > 0 && (
        <Card title="Tanımlı Siparişler" className="section-card">
          <div className="order-grid">
            {data.orderSummary.map((o) => (
              <div key={o.order} className="order-tile">
                <ShoppingCartOutlined />
                <div>
                  <div className="order-tile-no">{o.order}</div>
                  <div className="order-tile-sub">{o.rowCount ? `${o.rowCount} kalem` : <span style={{ color: '#cf1322' }}>kaynakta yok</span>}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
