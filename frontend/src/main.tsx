import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider as AntConfig } from 'antd'
import trTR from 'antd/locale/tr_TR'
import dayjs from 'dayjs'
import 'dayjs/locale/tr'
import App from './App'
import { ConfigProvider } from './lib/config'
import './index.css'

dayjs.locale('tr')

const theme = {
  token: {
    colorPrimary: '#0b2e59',
    colorInfo: '#1d5fa8',
    colorLink: '#1d5fa8',
    borderRadius: 6,
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 13,
    colorBgLayout: '#f2f4f7',
  },
  components: {
    Layout: { siderBg: '#0b2e59', headerBg: '#ffffff', headerHeight: 56, headerPadding: '0 20px' },
    Menu: { darkItemBg: '#0b2e59', darkSubMenuItemBg: '#082447', darkItemSelectedBg: '#1d5fa8', itemHeight: 44 },
    Table: { headerBg: '#eef2f7', headerColor: '#1f2d3d', rowHoverBg: '#f5f8fc', cellPaddingBlockSM: 5 },
    Card: { headerFontSize: 14 },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AntConfig locale={trTR} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <ConfigProvider>
            <App />
          </ConfigProvider>
        </BrowserRouter>
      </AntApp>
    </AntConfig>
  </React.StrictMode>,
)
