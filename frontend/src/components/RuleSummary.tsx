import { useMemo } from 'react'
import { Space, Tag, Tooltip } from 'antd'
import type { FormatRule, Row } from '../types'
import { evaluate } from '../lib/values'

/** Her aktif koşullu biçim kuralına uyan satır sayısını rozet olarak gösterir. */
export default function RuleSummary({ rows, rules }: { rows: Row[]; rules: FormatRule[] }) {
  const items = useMemo(
    () =>
      rules
        .filter((r) => r.enabled && r.column)
        .map((r) => ({
          rule: r,
          count: rows.filter((row) => evaluate(row[r.column], r.operator, r.compareColumn ? row[r.compareColumn] : r.value, r.value2)).length,
        }))
        .filter((x) => x.count > 0),
    [rows, rules],
  )
  if (!items.length) return null
  return (
    <Space size={[6, 6]} wrap>
      {items.map(({ rule, count }) => (
        <Tooltip key={rule.id} title={`"${rule.name || rule.column}" koşuluna uyan satır sayısı`}>
          <Tag
            style={{
              background: rule.backColor || '#fafafa',
              color: rule.foreColor || undefined,
              borderColor: rule.foreColor || rule.backColor || '#d9d9d9',
              fontWeight: 500,
              margin: 0,
            }}
          >
            {rule.name || rule.column}: {count}
          </Tag>
        </Tooltip>
      ))}
    </Space>
  )
}
