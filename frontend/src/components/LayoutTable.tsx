import { Table } from 'antd'
import type { TableProps } from 'antd'
import { layoutComponents, useColumnLayout } from '../lib/columnLayout'

type Props<T> = TableProps<T> & { layoutKey: string }

/**
 * Kolon sürükleyerek yer değiştirme ve kenardan çekerek genişletme özelliği olan tablo.
 * Kolonlara `key` verilmelidir; düzen kullanıcı bazında sunucuda saklanır.
 */
export default function LayoutTable<T extends object>({ layoutKey, columns, components, ...rest }: Props<T>) {
  const layout = useColumnLayout(layoutKey)
  return (
    <Table<T>
      {...rest}
      columns={columns ? layout.apply(columns) : columns}
      components={{ ...layoutComponents, ...components }}
    />
  )
}
