import { useEffect, useState } from 'react'
import { Avatar, Button, Dropdown, Input, Layout, Menu, Modal, Result, Spin, Tooltip, Typography } from 'antd'
import {
  BarChartOutlined, CheckSquareOutlined, HomeOutlined, InboxOutlined, LeftOutlined, TableOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined,
  SettingOutlined, UserOutlined,
} from '@ant-design/icons'
import { useLocalState } from './lib/useLocalState'
import { flushPrefs } from './lib/prefs'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUserName, setUserName } from './api'
import { useConfig } from './lib/config'
import HomePage from './pages/HomePage'
import OrdersPage from './pages/OrdersPage'
import KittPage from './pages/KittPage'
import SettingsPage from './pages/settings/SettingsPage'
import CustomTablesPage from './pages/CustomTablesPage'
import DekitPage from './pages/DekitPage'

const { Sider, Header, Content, Footer } = Layout

function Clock() {
  const [now, setNow] = useState(dayjs())
  useEffect(() => { const t = setInterval(() => setNow(dayjs()), 30000); return () => clearInterval(t) }, [])
  return <span className="header-clock">{now.format('DD MMMM YYYY, dddd • HH:mm')}</span>
}

export default function App() {
  const { config, error } = useConfig()
  const nav = useNavigate()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useLocalState('kokpit.sider.collapsed', false)
  const [user] = useState(getUserName())
  const [userModal, setUserModal] = useState(!getUserName())
  const [userDraft, setUserDraft] = useState(getUserName())

  const g = config?.general
  useEffect(() => { if (g) document.title = `${g.companyName} | ${g.appTitle}` }, [g])

  const selected = '/' + (loc.pathname.split('/')[1] || '')
  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: 'Ana Sayfa' },
    { key: '/siparis', icon: <BarChartOutlined />, label: config?.orderPage.title || 'Ön Montaj' },
    { key: '/kitt', icon: <CheckSquareOutlined />, label: config?.kittPage.title || 'KITT Hazırlama' },
    { key: '/dekit', icon: <InboxOutlined />, label: config?.dekit?.title || 'DEKIT' },
    { key: '/ozel-tablolar', icon: <TableOutlined />, label: 'Özel Tablolar' },
    { type: 'divider' as const },
    { key: '/ayarlar', icon: <SettingOutlined />, label: 'Ayarlar' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} collapsedWidth={64} collapsed={collapsed} className="app-sider" trigger={null}>
        <div className="brand" onClick={() => nav('/')}>
          <div className="brand-logo">M</div>
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-name">{g?.companyName ?? 'MEOS Elektronik'}</div>
              <div className="brand-sub">{g?.departmentName ?? 'Üretim Müdürlüğü'}</div>
            </div>
          )}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuItems} onClick={(e) => nav(e.key)} className="app-menu" />
        {!collapsed && <div className="sider-footer">v1.0 • {g?.appTitle ?? 'Üretim Kokpiti'}</div>}
        <Tooltip title={collapsed ? 'Menüyü aç' : 'Menüyü gizle'} placement="right">
          <button className="sider-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Menüyü aç/kapat">
            {collapsed ? <RightOutlined /> : <LeftOutlined />}
          </button>
        </Tooltip>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
            <Typography.Text strong className="header-title">{g?.appTitle ?? 'Üretim Kokpiti'}</Typography.Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Clock />
            <Dropdown
              menu={{ items: [{ key: 'u', label: 'Kullanıcı adını değiştir', onClick: () => { setUserDraft(user); setUserModal(true) } }] }}
            >
              <Tooltip title="Girişlerde bu ad kaydedilir" placement="left">
                <div className="header-user">
                  <Avatar size="small" style={{ background: '#0b2e59' }} icon={<UserOutlined />} />
                  <span>{user || 'Kullanıcı'}</span>
                </div>
              </Tooltip>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content">
          {error ? (
            <Result status="error" title="Sunucuya bağlanılamadı" subTitle={error} />
          ) : !config ? (
            <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
          ) : (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/siparis" element={<OrdersPage />} />
              <Route path="/kitt" element={<KittPage />} />
              <Route path="/dekit" element={<DekitPage />} />
              <Route path="/ozel-tablolar" element={<CustomTablesPage />} />
              <Route path="/ayarlar" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </Content>
        <Footer className="app-footer">
          © {new Date().getFullYear()} {g?.companyName ?? 'MEOS Elektronik'} — {g?.departmentName ?? 'Üretim Müdürlüğü'}
        </Footer>
      </Layout>

      <Modal
        open={userModal}
        title="Kullanıcı Adı"
        okText="Kaydet"
        cancelText="Daha sonra"
        onCancel={() => setUserModal(false)}
        okButtonProps={{ disabled: !userDraft.trim() }}
        onOk={() => { flushPrefs(); setUserName(userDraft); window.location.reload() }}
      >
        <Typography.Paragraph type="secondary">
          KITT sayfasında girdiğiniz değer ve notlarda bu ad "son güncelleyen" olarak kaydedilir.
        </Typography.Paragraph>
        <Input autoFocus placeholder="Ad Soyad" value={userDraft} onChange={(e) => setUserDraft(e.target.value)}
          onPressEnter={() => { if (userDraft.trim()) { flushPrefs(); setUserName(userDraft); window.location.reload() } }} />
      </Modal>
    </Layout>
  )
}
