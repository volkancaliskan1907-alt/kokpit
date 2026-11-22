import { useState, type ReactNode } from 'react'
import { Tooltip } from 'antd'

interface Props {
  /** Üzerine gelince, yalnızca içerik kırpılmışsa tam gösterilecek metin */
  text?: string
  /** Her zaman gösterilecek ek bilgi (ör. son güncelleyen) */
  extra?: string
  children: ReactNode
  className?: string
}

/** Kendisi veya içindeki giriş / metin öğeleri taşıyor mu? */
function isClipped(el: HTMLElement) {
  if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return true
  return [...el.querySelectorAll<HTMLElement>('input, textarea, .textarea-cell-text, .ant-select-selection-item, .ant-select-selection-overflow')]
    .some((n) => n.scrollWidth > n.clientWidth + 1)
}

/**
 * İçeriği sütun genişliğiyle sınırlar (taşan kısım "…" olur, sütun uzamaz).
 * Yalnızca gerçekten kırpılmışsa, üzerine gelince tam metin balonda görünür.
 */
export default function Clip({ text, extra, children, className }: Props) {
  const [clipped, setClipped] = useState(false)
  return (
    <Tooltip
      title={(clipped && text) || extra ? (
        <div>
          {clipped && text && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>}
          {extra && <div style={{ opacity: 0.7, fontSize: 11, marginTop: clipped && text ? 6 : 0 }}>{extra}</div>}
        </div>
      ) : undefined}
      placement="topLeft"
      mouseEnterDelay={0.35}
      overlayStyle={{ maxWidth: 520 }}
    >
      <div
        className={`cell-clip ${className ?? ''}`}
        onMouseEnter={(e) => { const el = e.currentTarget; setClipped(isClipped(el)) }}
      >
        {children}
      </div>
    </Tooltip>
  )
}
