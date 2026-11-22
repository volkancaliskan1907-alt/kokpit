import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Input, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import type { ColumnsType, TableProps } from 'antd/es/table'
import type { TableRowSelection } from 'antd/es/table/interface'
import { ColumnWidthOutlined, FileExcelOutlined, FunctionOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnView, FormatRule, Row } from '../types'
import { cellStyle, computeRowStyles, type RowStyles } from '../lib/rules'
import { compareValues, formatValue, isEmpty, toNumber, toText } from '../lib/values'
import { layoutComponents, useColumnLayout } from '../lib/columnLayout'
import FilterBar, { applyFilters, buildFilterFields, type FilterValues } from './FilterBar'
import { useFillHeight } from '../lib/useFillHeight'
import Clip from './Clip'
import { api } from '../api'

export interface ExtraColumn {
  field: string
  title: string
  width?: number
  render: (row: Row) => ReactNode
  /** Excel'e aktarımda kullanılacak değer (varsayılan: row[field]) */
  exportValue?: (row: Row) => unknown
  /** Filtre çubuğunda gösterilmesin */
  noFilter?: boolean
  /** Kolonu sola / sağa sabitle */
  fixed?: 'left' | 'right'
}

interface Props {
  rows: Row[]
  rowKey: string
  availableColumns: string[]
  computedColumns?: string[]
  columns: ColumnView[]
  rules: FormatRule[]
  extraColumns?: ExtraColumn[]
  loading?: boolean
  pageSize?: number
  exportName: string
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
  rowSelection?: TableRowSelection<Row>
  /** Tablo dışındaki dikey alan (px) - kaydırma yüksekliği hesabı için */
  offsetHeight?: number
  /** Tıklanabilir (bağlantı) olarak gösterilecek kolonlar */
  linkFields?: Record<string, (row: Row) => void>
  expandable?: TableProps<Row>['expandable']
  /** Kolon sırası / genişliği bu anahtarla saklanır (varsayılan: exportName) */
  layoutKey?: string
  /** Tablonun altında bırakılacak boşluk (px); pencere içinde küçültülebilir */
  bottomReserve?: number
  /** Az kayıtta da tablo alanı ekranı doldursun */
  fillHeight?: boolean
  /** Her satıra eklenecek ek özellikler (ör. sürükle-bırak) */
  rowProps?: (row: Row) => React.HTMLAttributes<HTMLElement>
  /** Filtre çubuğu: varsayılan görünen filtreler ve tek satıra sığdırma */
  filterDefaults?: string[]
  filterOneLine?: boolean
}

const AGG_LABEL: Record<string, string> = { sum: 'Toplam', avg: 'Ort.', count: 'Adet', min: 'Min', max: 'Maks' }
const NUMERIC = new Set(['number', 'integer', 'percent'])

export default function DataTable(props: Props) {
  const {
    rows, rowKey, availableColumns, computedColumns = [], columns, rules, extraColumns = [], loading,
    pageSize = 50, exportName, toolbarLeft, toolbarRight, rowSelection, linkFields, expandable,
    layoutKey, fillHeight = true, bottomReserve = 122, rowProps, filterDefaults, filterOneLine,
  } = props

  const [search, setSearch] = useState('')
  const [current, setCurrent] = useState<Row[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [pg, setPg] = useState({ current: 1, pageSize })
  const [filters, setFilters] = useState<FilterValues>({})
  const layout = useColumnLayout(layoutKey || exportName)
  const fill = useFillHeight(bottomReserve)

  useEffect(() => setPg((p) => ({ ...p, pageSize })), [pageSize])

  const views: ColumnView[] = useMemo(() => {
    if (columns.length) return columns.filter((c) => availableColumns.includes(c.field))
    return availableColumns.map((f) => ({ field: f, format: 'auto', aggregate: 'none', fixed: false }) as ColumnView)
  }, [columns, availableColumns])

  const missing = useMemo(
    () => columns.filter((c) => availableColumns.length && !availableColumns.includes(c.field)).map((c) => c.field),
    [columns, availableColumns],
  )

  const filterFields = useMemo(() => buildFilterFields(rows, [
    ...views.map((v) => ({ key: v.field, label: v.label || v.field })),
    ...extraColumns.filter((e) => !e.noFilter).map((e) => ({ key: e.field, label: e.title })),
  ], (r, k) => r[k]), [rows, views, extraColumns])

  const searched = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    let list = applyFilters(rows, filterFields, filters, (r, k) => r[k])
    if (q) {
      const fields = [...views.map((v) => v.field), ...extraColumns.map((e) => e.field)]
      list = list.filter((r) => fields.some((f) => toText(r[f]).toLocaleLowerCase('tr').includes(q)))
    }
    return list
  }, [rows, search, views, extraColumns, filters, filterFields])

  useEffect(() => { setCurrent(null); setPg((p) => ({ ...p, current: 1 })) }, [searched])

  const styles = useMemo(() => {
    const m = new Map<string, RowStyles>()
    const active = rules.filter((r) => r.enabled)
    if (active.length) for (const r of rows) m.set(r[rowKey], computeRowStyles(r, active))
    return m
  }, [rows, rules, rowKey])

  const filterOptions = (field: string) => {
    const set = new Map<string, string>()
    for (const r of rows) {
      const v = r[field]
      if (Array.isArray(v)) v.forEach((x) => { const t = toText(x); if (t) set.set(t, t) })
      else { const t = toText(v); set.set(t, t) }
      if (set.size > 500) break
    }
    return [...set.keys()]
      .sort((a, b) => compareValues(a, b))
      .map((t) => ({ text: t === '' ? '(Boş)' : t, value: t }))
  }

  const onFilter = (field: string) => (value: any, record: Row) => {
    const v = record[field]
    if (Array.isArray(v)) return value === '' ? v.length === 0 : v.some((x) => toText(x) === value)
    return toText(v) === value
  }

  const tableColumns: ColumnsType<Row> = useMemo(() => {
    const cols: ColumnsType<Row> = views.map((v) => {
      const isComputed = computedColumns.includes(v.field)
      const title = v.label || v.field
      return {
        key: v.field,
        title: isComputed ? (
          <Tooltip title="Hesaplanan kolon">
            <span>{title} <FunctionOutlined style={{ color: '#1677ff', fontSize: 11 }} /></span>
          </Tooltip>
        ) : title,
        width: v.width || 140,
        fixed: v.fixed ? 'left' : undefined,
        ellipsis: { showTitle: false },
        align: NUMERIC.has(v.format) ? 'right' : undefined,
        sorter: (a: Row, b: Row) => compareValues(a[v.field], b[v.field]),
        filters: filterOptions(v.field),
        filterSearch: true,
        onFilter: onFilter(v.field),
        onCell: (r: Row) => ({ style: cellStyle(styles.get(r[rowKey]), v.field) }),
        render: (_: unknown, r: Row) => {
          const txt = formatValue(r[v.field], v.format, v.decimals)
          const link = linkFields?.[v.field]
          if (link && txt) {
            return <Clip text={txt}><a className="cell-link" title="Detay için tıklayın" onClick={(e) => { e.stopPropagation(); link(r) }}>{txt}</a></Clip>
          }
          return <Clip text={txt}>{txt}</Clip>
        },
      }
    })
    for (const e of extraColumns) {
      cols.push({
        key: e.field,
        title: e.title,
        width: e.width || 160,
        fixed: e.fixed,
        sorter: (a: Row, b: Row) => compareValues(a[e.field], b[e.field]),
        filters: e.noFilter ? undefined : filterOptions(e.field),
        filterSearch: true,
        onFilter: e.noFilter ? undefined : onFilter(e.field),
        onCell: (r: Row) => ({ style: cellStyle(styles.get(r[rowKey]), e.field), className: 'virtual-cell' }),
        render: (_: unknown, r: Row) => <div className="cell-clip">{e.render(r)}</div>,
      })
    }
    return layout.apply(cols)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, extraColumns, styles, computedColumns, rows, linkFields, layout.apply])

  const data = current ?? searched
  const hasAgg = views.some((v) => v.aggregate && v.aggregate !== 'none')

  const aggregate = (v: ColumnView): string => {
    const vals = data.map((r) => r[v.field])
    if (v.aggregate === 'count') return formatValue(vals.filter((x) => !isEmpty(x)).length, 'integer')
    const nums = vals.map(toNumber).filter((n): n is number => n !== null)
    if (!nums.length) return ''
    let res = 0
    switch (v.aggregate) {
      case 'sum': res = nums.reduce((a, b) => a + b, 0); break
      case 'avg': res = nums.reduce((a, b) => a + b, 0) / nums.length; break
      case 'min': res = Math.min(...nums); break
      case 'max': res = Math.max(...nums); break
    }
    return formatValue(res, NUMERIC.has(v.format) ? v.format : 'number', v.decimals)
  }

  // Özet satırı: kolonların güncel (kullanıcının düzenlediği) sırasına göre
  const lead = (rowSelection ? 1 : 0) + (expandable ? 1 : 0)
  const summary = hasAgg
    ? () => (
      <Table.Summary fixed>
        <Table.Summary.Row className="summary-row">
          {Array.from({ length: lead }, (_, i) => <Table.Summary.Cell key={`lead${i}`} index={i} />)}
          {tableColumns.map((c, i) => {
            const v = views.find((x) => x.field === c.key)
            const agg = v && v.aggregate !== 'none'
            return (
              <Table.Summary.Cell key={String(c.key)} index={i + lead} align={agg ? 'right' : undefined}>
                {agg ? (
                  <Tooltip title={AGG_LABEL[v!.aggregate]}>
                    <span className="agg-label">{AGG_LABEL[v!.aggregate]}:</span> <b>{aggregate(v!)}</b>
                  </Tooltip>
                ) : i === 0 ? <b>Genel</b> : null}
              </Table.Summary.Cell>
            )
          })}
        </Table.Summary.Row>
      </Table.Summary>
    )
    : undefined

  const onChange: TableProps<Row>['onChange'] = (pagination, _f, _s, extra) => {
    setPg({ current: pagination.current || 1, pageSize: pagination.pageSize || pageSize })
    if (extra.action === 'filter' || extra.action === 'sort') setCurrent(extra.currentDataSource)
  }

  const doExport = async () => {
    try {
      setExporting(true)
      const cols = tableColumns.map((c) => {
        const v = views.find((x) => x.field === c.key)
        const e = extraColumns.find((x) => x.field === c.key)
        return { field: String(c.key), label: v ? (v.label || v.field) : e?.title ?? String(c.key), format: v?.format ?? 'auto' }
      })
      const out = data.map((r) => {
        const o: Record<string, unknown> = {}
        for (const v of views) o[v.field] = r[v.field] ?? null
        for (const e of extraColumns) {
          const val = e.exportValue ? e.exportValue(r) : r[e.field]
          o[e.field] = Array.isArray(val) ? toText(val) : val ?? null
        }
        return o
      })
      await api.exportExcel(exportName, cols, out)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  const scrollY = fill.height
  // "max-content" tarayıcıyı sabit düzeni bırakıp sütunları içeriğe göre genişletmeye zorlar (uzun metinde tablo bozulur).
  // Bu yüzden toplam genişlik kesin piksel olarak verilir; sütun daraltılınca tablo da daralır.
  const sumWidth = tableColumns.reduce((a, c) => a + (typeof c.width === 'number' ? c.width : 140), 0) + (rowSelection ? 40 : 0) + (expandable ? 48 : 0)
  const scrollX = Math.max(sumWidth, fill.width)

  return (
    <div className={`data-table ${fillHeight ? 'fill' : ''}`} style={{ ['--tbl-h' as any]: `${scrollY}px` }}>
      <div className="table-toolbar">
        <Space wrap size={8}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tabloda ara..."
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {toolbarLeft}
          {missing.length > 0 && (
            <Tooltip title={missing.join(', ')}>
              <Tag color="warning">{missing.length} kolon kaynakta bulunamadı</Tag>
            </Tooltip>
          )}
        </Space>
        <Space wrap size={8}>
          <Typography.Text type="secondary">
            {data.length !== rows.length ? `${data.length} / ${rows.length}` : rows.length} kayıt
          </Typography.Text>
          {toolbarRight}
          {layout.customized && (
            <Tooltip title="Kolon sırası ve genişliklerini varsayılana döndür">
              <Button icon={<ColumnWidthOutlined />} onClick={layout.reset}>Sütunları sıfırla</Button>
            </Tooltip>
          )}
          <Button icon={<FileExcelOutlined />} onClick={doExport} loading={exporting} disabled={!data.length}>
            Excel'e Aktar
          </Button>
        </Space>
      </div>
      {filterFields.length > 0 && <FilterBar fields={filterFields} value={filters} onChange={setFilters} storageKey={layoutKey || exportName} defaultKeys={filterDefaults} oneLine={filterOneLine} />}
      <div ref={fill.ref}>
      <Table<Row>
        size="small"
        bordered
        rowKey={rowKey}
        columns={tableColumns}
        components={layoutComponents}
        tableLayout="fixed"
        dataSource={searched}
        loading={loading}
        rowSelection={rowSelection}
        expandable={expandable}
        onChange={onChange}
        onRow={(r) => {
          const st = styles.get(r[rowKey])
          const base = st && Object.keys(st.row).length ? { style: st.row, className: 'styled-row' } : {}
          if (!rowProps) return base
          const rp = rowProps(r)
          return { ...base, ...rp, className: [base.className, rp.className].filter(Boolean).join(' ') }
        }}
        scroll={{ x: scrollX, y: scrollY }}
        summary={summary}
        pagination={{
          ...pg,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 250, 500, 1000],
          showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
          size: 'small',
        }}
        locale={{ emptyText: 'Gösterilecek kayıt yok' }}
      />
      </div>
    </div>
  )
}
