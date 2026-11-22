import type { ReactNode } from 'react'
import { Typography } from 'antd'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ title, subtitle, icon, extra }: Props) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {icon && <div className="page-header-icon">{icon}</div>}
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
          {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
        </div>
      </div>
      {extra && <div className="page-header-extra">{extra}</div>}
    </div>
  )
}
