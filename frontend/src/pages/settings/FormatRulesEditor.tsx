import { Button, Card, Checkbox, ColorPicker, Empty, Input, Radio, Select, Space, Switch, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { FormatRule } from '../../types'
import { newId } from '../../api'
import { OPERATORS } from '../../lib/values'

interface Props {
  value: FormatRule[]
  onChange: (v: FormatRule[]) => void
  columnOptions: { value: string; label: string }[]
}

const PRESETS = [
  { label: 'Hazır renkler', colors: ['#fdecea', '#fff7e6', '#fffbe6', '#f0f9eb', '#e6f4ff', '#f9f0ff', '#cf1322', '#d46b08', '#d4b106', '#389e0d', '#0958d9', '#531dab', '#ffffff', '#262626'] },
]

const newRule = (): FormatRule => ({
  id: newId('r'), name: '', enabled: true, column: '', operator: 'eq', value: '', value2: null, compareColumn: null,
  target: 'cell', applyColumn: null, backColor: '#fdecea', foreColor: '#a8071a', bold: false, stopIfTrue: false,
})

/** Koşullu biçimlendirme kuralları (Excel'deki gibi üstteki kural önceliklidir). */
export default function FormatRulesEditor({ value, onChange, columnOptions }: Props) {
  const update = (i: number, patch: Partial<FormatRule>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const c = [...value];
    [c[i], c[j]] = [c[j], c[i]]
    onChange(c)
  }

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Kurallar yukarıdan aşağıya değerlendirilir; aynı hücre için üstteki kuralın biçimi önceliklidir.
        Tarih karşılaştırmalarında <code>BUGÜN</code>, <code>BUGÜN+7</code>, <code>BUGÜN-3</code> gibi göreli değerler kullanılabilir.
      </Typography.Paragraph>

      {value.length === 0 && <Empty description="Henüz kural yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />}

      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        {value.map((r, i) => {
          const op = OPERATORS.find((o) => o.value === r.operator)
          const useCol = r.compareColumn !== null && r.compareColumn !== undefined
          return (
            <Card
              key={r.id}
              size="small"
              className={`rule-card ${r.enabled ? '' : 'rule-disabled'}`}
              title={
                <Space>
                  <Switch size="small" checked={r.enabled} onChange={(v) => update(i, { enabled: v })} />
                  <Input size="small" variant="borderless" placeholder={`Kural ${i + 1} adı`} value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })} style={{ width: 260, fontWeight: 600 }} />
                </Space>
              }
              extra={
                <Space size={0}>
                  <span className="rule-preview" style={{ background: r.backColor || undefined, color: r.foreColor || undefined, fontWeight: r.bold ? 600 : 400 }}>
                    Örnek 123
                  </span>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === value.length - 1} onClick={() => move(i, 1)} />
                  <Tooltip title="Kopyala"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onChange([...value.slice(0, i + 1), { ...r, id: newId('r'), name: `${r.name} (kopya)` }, ...value.slice(i + 1)])} /></Tooltip>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, j) => j !== i))} />
                </Space>
              }
            >
              <div className="rule-grid">
                <div>
                  <label>Kolon</label>
                  <Select showSearch size="small" style={{ width: '100%' }} placeholder="Kolon" value={r.column || undefined}
                    options={columnOptions} onChange={(v) => update(i, { column: v })} optionFilterProp="label" />
                </div>
                <div>
                  <label>Koşul</label>
                  <Select size="small" style={{ width: '100%' }} value={r.operator} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
                    onChange={(v) => update(i, { operator: v })} />
                </div>
                {!op?.noValue && (
                  <div>
                    <label>
                      Karşılaştır:{' '}
                      <Radio.Group size="small" value={useCol ? 'col' : 'val'}
                        onChange={(e) => update(i, { compareColumn: e.target.value === 'col' ? '' : null })}>
                        <Radio value="val">Değer</Radio>
                        <Radio value="col">Kolon</Radio>
                      </Radio.Group>
                    </label>
                    {useCol ? (
                      <Select showSearch size="small" style={{ width: '100%' }} placeholder="Karşılaştırılacak kolon" value={r.compareColumn || undefined}
                        options={columnOptions} onChange={(v) => update(i, { compareColumn: v })} optionFilterProp="label" />
                    ) : (
                      <Space.Compact style={{ width: '100%' }}>
                        <Input size="small" placeholder="Değer" value={r.value ?? ''} onChange={(e) => update(i, { value: e.target.value })} />
                        {op?.twoValues && <Input size="small" placeholder="ve" value={r.value2 ?? ''} onChange={(e) => update(i, { value2: e.target.value })} />}
                      </Space.Compact>
                    )}
                  </div>
                )}
                <div>
                  <label>Uygulanacak yer</label>
                  <Select size="small" style={{ width: '100%' }} value={r.target}
                    options={[{ value: 'cell', label: 'Sadece bu hücre' }, { value: 'row', label: 'Tüm satır' }, { value: 'column', label: 'Başka bir kolon' }]}
                    onChange={(v) => update(i, { target: v })} />
                </div>
                {r.target === 'column' && (
                  <div>
                    <label>Biçimlenecek kolon</label>
                    <Select showSearch size="small" style={{ width: '100%' }} value={r.applyColumn || undefined}
                      options={columnOptions} onChange={(v) => update(i, { applyColumn: v })} optionFilterProp="label" />
                  </div>
                )}
                <div>
                  <label>Renkler / Stil</label>
                  <Space size={6} wrap>
                    <Tooltip title="Arka plan rengi">
                      <ColorPicker size="small" allowClear presets={PRESETS} value={r.backColor || undefined}
                        onChangeComplete={(c) => update(i, { backColor: c.toHexString() })} onClear={() => update(i, { backColor: null })} showText={() => 'Zemin'} />
                    </Tooltip>
                    <Tooltip title="Yazı rengi">
                      <ColorPicker size="small" allowClear presets={PRESETS} value={r.foreColor || undefined}
                        onChangeComplete={(c) => update(i, { foreColor: c.toHexString() })} onClear={() => update(i, { foreColor: null })} showText={() => 'Yazı'} />
                    </Tooltip>
                    <Checkbox checked={r.bold} onChange={(e) => update(i, { bold: e.target.checked })}>Kalın</Checkbox>
                    <Tooltip title="Bu kural sağlanırsa alttaki kurallar değerlendirilmez">
                      <Checkbox checked={r.stopIfTrue} onChange={(e) => update(i, { stopIfTrue: e.target.checked })}>Doğruysa dur</Checkbox>
                    </Tooltip>
                  </Space>
                </div>
              </div>
            </Card>
          )
        })}
      </Space>

      <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => onChange([...value, newRule()])}>
        Kural Ekle
      </Button>
    </div>
  )
}
