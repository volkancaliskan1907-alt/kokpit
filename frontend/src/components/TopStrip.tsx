import type { ReactNode } from 'react'
import { Typography } from 'antd'

interface Props {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
}

/** Sayfa başlığı ve iş emri seçimini tek satırda toplayan kompakt üst alan. */
export default function TopStrip({ icon, title, subtitle, children }: Props) {
  return (
    <div className="top-strip">
      <div className="top-strip-title">
        <div className="top-strip-icon">{icon}</div>
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong className="top-strip-name">{title}</Typography.Text>
          {subtitle && <div className="top-strip-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="top-strip-body">{children}</div>
    </div>
  )
}
