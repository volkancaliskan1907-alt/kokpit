import { useCallback } from 'react'
import type { ColumnsType } from 'antd/es/table'
import { useLocalState } from './useLocalState'

interface Layout {
  order: string[]
  widths: Record<string, number>
}

let dragKey: string | null = null
let resizedAt = 0

/**
 * Tablo başlık hücresi: sağ kenardan sürükleyerek genişlik ayarı,
 * başlığı sürükleyip başka başlığın üzerine bırakarak kolon yer değiştirme.
 */
export function LayoutHeaderCell(props: any) {
  const { colKey, onResize, onMove, movable, children, onClick, className, ...rest } = props
  if (!colKey) return <th className={className} onClick={onClick} {...rest}>{children}</th>

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement!
    const startX = e.clientX
    const startW = th.getBoundingClientRect().width
    let frame = 0
    const move = (ev: MouseEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => onResize(Math.max(50, Math.round(startW + ev.clientX - startX))))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
      resizedAt = Date.now()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    document.body.classList.add('col-resizing')
  }

  return (
    <th
      {...rest}
      className={`${className ?? ''} layout-th ${movable ? 'movable' : ''}`}
      // Sıralama tıklaması, genişlik ayarından hemen sonra tetiklenmesin
      onClick={(e: React.MouseEvent) => { if (Date.now() - resizedAt > 250) onClick?.(e) }}
      draggable={movable}
      onDragStart={(e: React.DragEvent) => {
        if (!movable) return
        dragKey = colKey
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', colKey)
      }}
      onDragEnd={() => { dragKey = null }}
      onDragOver={(e: React.DragEvent) => {
        if (!dragKey || !movable || dragKey === colKey) return
        e.preventDefault()
        e.currentTarget.classList.add('drag-over')
      }}
      onDragLeave={(e: React.DragEvent) => e.currentTarget.classList.remove('drag-over')}
      onDrop={(e: React.DragEvent) => {
        e.currentTarget.classList.remove('drag-over')
        if (dragKey && dragKey !== colKey) onMove(dragKey, colKey)
        dragKey = null
      }}
    >
      {children}
      <span className="col-resizer" onMouseDown={startResize} onClick={(e) => e.stopPropagation()} draggable={false}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }} />
    </th>
  )
}

export const layoutComponents = { header: { cell: LayoutHeaderCell } }

/** Kolon sırası ve genişliklerini kullanıcı bazında (tarayıcıda) saklar. */
export function useColumnLayout(storageKey: string) {
  const [layout, setLayout] = useLocalState<Layout>(`kokpit.layout.${storageKey}`, { order: [], widths: {} })

  const apply = useCallback(<T,>(cols: ColumnsType<T>): ColumnsType<T> => {
    const items = cols.map((c, i) => ({ c, k: String(c.key ?? i), i }))
    const rank = (x: { c: any; k: string; i: number }) => {
      if (x.c.fixed === 'left' || x.c.fixed === true) return -100000 + x.i
      if (x.c.fixed === 'right') return 100000 + x.i
      const o = layout.order.indexOf(x.k)
      return o >= 0 ? o : 10000 + x.i
    }
    const sorted = [...items].sort((a, b) => rank(a) - rank(b))
    const keys = sorted.map((x) => x.k)
    return sorted.map(({ c, k }) => {
      const width = layout.widths[k] ?? (c.width as number | undefined)
      const movable = !(c.fixed === 'left' || c.fixed === true || c.fixed === 'right')
      const orig = c.onHeaderCell
      return {
        ...c,
        width,
        onHeaderCell: (col: any) => ({
          ...(orig ? orig(col) : {}),
          colKey: k,
          movable,
          onResize: (w: number) => setLayout((l) => ({ ...l, widths: { ...l.widths, [k]: w } })),
          onMove: (from: string, to: string) => {
            const arr = keys.filter((x) => x !== from)
            const idx = arr.indexOf(to)
            const fromIdx = keys.indexOf(from), toIdx = keys.indexOf(to)
            arr.splice(fromIdx < toIdx ? idx + 1 : idx, 0, from)
            setLayout((l) => ({ ...l, order: arr }))
          },
        }),
      } as any
    })
  }, [layout, setLayout])

  const reset = () => setLayout({ order: [], widths: {} })
  const customized = layout.order.length > 0 || Object.keys(layout.widths).length > 0
  return { apply, reset, customized }
}
