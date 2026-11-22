import { useCallback, useRef, useState } from 'react'
import { Badge, Menu } from 'antd'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { SettingOutlined } from '@ant-design/icons'
import DataSourcesTab from './DataSourcesTab'
import OrderPageSettings from './OrderPageSettings'
import KittPageSettings from './KittPageSettings'
import DekitSettings from './DekitSettings'
import GeneralSettingsTab from './GeneralSettingsTab'
import SaveBar from './SaveBar'
import { ALL_SECTIONS, LEGACY_TABS, NAV, metaOf } from './sections'

const FALLBACK = 'sources'

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('s') || LEGACY_TABS[params.get('tab') || ''] || FALLBACK
  const active = ALL_SECTIONS.some((s) => s.key === raw) ? raw : FALLBACK
  const page = metaOf(active).page

  // Sayfa bileşenleri gizlenince bile bellekte kalır; böylece kaydedilmemiş düzenlemeler bölümler arası geçişte kaybolmaz
  const last = useRef<{ orders: string; kitt: string; dekit: string }>({ orders: 'source', kitt: 'source', dekit: 'format' })
  if (page === 'orders') last.current.orders = active.slice('orders.'.length)
  if (page === 'dekit') last.current.dekit = active.slice('dekit.'.length)
  if (page === 'kitt') last.current.kitt = active.startsWith('pick.') ? active : active.slice('kitt.'.length)

  const [dirty, setDirty] = useState({ orders: false, kitt: false, dekit: false })
  const onOrdersDirty = useCallback((v: boolean) => setDirty((d) => (d.orders === v ? d : { ...d, orders: v })), [])
  const onKittDirty = useCallback((v: boolean) => setDirty((d) => (d.kitt === v ? d : { ...d, kitt: v })), [])
  const onDekitDirty = useCallback((v: boolean) => setDirty((d) => (d.dekit === v ? d : { ...d, dekit: v })), [])

  const dot = (p: string) => ((p === 'orders' && dirty.orders) || (p === 'kitt' && dirty.kitt) || (p === 'dekit' && dirty.dekit)) && <Badge status="warning" style={{ marginLeft: 6 }} />

  const items = NAV.map((g) => ({
    type: 'group' as const,
    key: g.title,
    label: <span className="settings-nav-group">{g.icon} {g.title}</span>,
    children: g.items.map((i) => ({ key: i.key, icon: i.icon, label: <span>{i.label}{dot(g.page)}</span> })),
  }))

  const meta = metaOf(active)

  return (
    <div className="page">
      <PageHeader icon={<SettingOutlined />} title="Ayarlar" subtitle="Soldaki listeden bir başlık seçin" />
      <div className="settings-layout">
        <div className="settings-nav">
          <Menu mode="inline" selectedKeys={[active]} items={items} onClick={(e) => setParams({ s: e.key })} />
        </div>

        <div className="settings-content">
          {page === 'general' && (
            <div className="settings-section">
              <SaveBar meta={meta} dirty={false} saving={false} onSave={() => {}} onUndo={() => {}} hideButtons />
              <GeneralSettingsTab />
            </div>
          )}

          {page === 'sources' && (
            <div className="settings-section">
              <SaveBar meta={meta} dirty={false} saving={false} onSave={() => {}} onUndo={() => {}} hideButtons />
              <DataSourcesTab />
            </div>
          )}

          <div style={{ display: page === 'orders' ? 'block' : 'none' }}>
            <OrderPageSettings section={last.current.orders} onDirtyChange={onOrdersDirty} />
          </div>
          <div style={{ display: page === 'dekit' ? 'block' : 'none' }}>
            <DekitSettings section={last.current.dekit} onDirtyChange={onDekitDirty} />
          </div>
          <div style={{ display: page === 'kitt' ? 'block' : 'none' }}>
            <KittPageSettings section={last.current.kitt} onDirtyChange={onKittDirty} />
          </div>
        </div>
      </div>
    </div>
  )
}
