import { Alert, Button, Card, Collapse, Empty, Input, Select, Space, Tag, Typography } from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, FunctionOutlined, LinkOutlined, PlusOutlined, SwapOutlined,
} from '@ant-design/icons'
import type { ComputedColumnDef, ComputedType, DataSourceDef } from '../../types'
import { newId } from '../../api'
import { OPERATORS } from '../../lib/values'
import { toOptions, useSourceColumns } from '../../lib/useSourceColumns'

export const COMPUTED_TYPES: { value: ComputedType; label: string; excel: string; agg: string }[] = [
  { value: 'lookup', label: 'Değer getir (ilk eşleşen)', excel: 'DÜŞEYARA', agg: 'ilk eşleşen değeri' },
  { value: 'lookupLast', label: 'Değer getir (son eşleşen)', excel: 'DÜŞEYARA', agg: 'son eşleşen değeri' },
  { value: 'join', label: 'Eşleşenleri birleştir', excel: 'METİNBİRLEŞTİR', agg: 'farklı değerlerini virgülle birleştirerek' },
  { value: 'sumif', label: 'Toplam', excel: 'ETOPLA / ÇOKETOPLA', agg: 'TOPLAMINI' },
  { value: 'countif', label: 'Adet say', excel: 'EĞERSAY / ÇOKEĞERSAY', agg: 'SAYISINI' },
  { value: 'avgif', label: 'Ortalama', excel: 'EĞERORTALAMA', agg: 'ORTALAMASINI' },
  { value: 'minif', label: 'En küçük', excel: 'ÇOKEĞERMİN', agg: 'EN KÜÇÜK değerini' },
  { value: 'maxif', label: 'En büyük', excel: 'ÇOKEĞERMAK', agg: 'EN BÜYÜK değerini' },
  { value: 'formula', label: 'Formül', excel: 'Formül', agg: '' },
]

const FUNCTIONS: [string, string][] = [
  ['EĞER(koşul; doğruysa; yanlışsa)', 'Koşula göre değer döndürür'],
  ['EĞERHATA(ifade; hata_değeri)', 'Hata olursa alternatif değer'],
  ['YUVARLA(sayı; basamak)', 'Yuvarlar (YUKARIYUVARLA, AŞAĞIYUVARLA da var)'],
  ['TOPLA(a; b; ...) / MİN(...) / MAK(...)', 'Toplam, en küçük, en büyük'],
  ['MUTLAK(sayı)', 'Mutlak değer'],
  ['VE(...) / YADA(...) / DEĞİL(x)', 'Mantıksal işlemler'],
  ['EBOŞSA(değer)', 'Boş mu?'],
  ['İLKDOLU(a; b; ...)', 'İlk boş olmayan değer'],
  ['BİRLEŞTİR(a; b; ...) veya a & b', 'Metin birleştirme'],
  ['SOLDAN(metin; n) / SAĞDAN(metin; n) / PARÇAAL(metin; baş; n)', 'Metin parçası'],
  ['UZUNLUK / BÜYÜKHARF / KÜÇÜKHARF / KIRP', 'Metin işlemleri'],
  ['BUGÜN() / ŞİMDİ()', 'Bugünün tarihi / şu an'],
  ['GÜN(bitiş; başlangıç)', 'İki tarih arasındaki gün farkı'],
  ['SAYI(metin)', 'Metni sayıya çevirir'],
]

interface Props {
  value: ComputedColumnDef[]
  onChange: (v: ComputedColumnDef[]) => void
  /** Bu kaynağın ham kolonları */
  localColumns: string[]
  sources: DataSourceDef[]
  currentSourceId: string
}

const newComputed = (): ComputedColumnDef => ({
  id: newId('c'), name: '', type: 'lookup', targetSourceId: null, keys: [{ localColumn: '', targetColumn: '' }],
  targetValueColumn: null, targetFilters: [], formula: '', defaultValue: null,
})

export default function ComputedColumnsEditor({ value, onChange, localColumns, sources, currentSourceId }: Props) {
  const update = (i: number, patch: Partial<ComputedColumnDef>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const c = [...value];
    [c[i], c[j]] = [c[j], c[i]]
    onChange(c)
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Hesaplanan kolonlar"
        description={
          <span>
            Başka bir veri kaynağından eşleştirme ile değer getirebilir (DÜŞEYARA), toplam / adet / ortalama alabilir (ETOPLA, EĞERSAY)
            veya satır içi formül yazabilirsiniz. Kolonlar sırayla hesaplanır; bir kolon kendinden önceki hesaplanan kolonları kullanabilir.
          </span>
        }
      />
      {value.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Henüz hesaplanan kolon yok" />}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {value.map((c, i) => (
          <ComputedItem
            key={c.id}
            index={i}
            item={c}
            total={value.length}
            localColumns={[...localColumns, ...value.slice(0, i).map((x) => x.name).filter(Boolean)]}
            sources={sources}
            currentSourceId={currentSourceId}
            onChange={(p) => update(i, p)}
            onMove={(d) => move(i, d)}
            onDelete={() => onChange(value.filter((_, j) => j !== i))}
          />
        ))}
      </Space>
      <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => onChange([...value, newComputed()])}>
        Hesaplanan Kolon Ekle
      </Button>
    </div>
  )
}

function ComputedItem({ item: c, index, total, localColumns, sources, currentSourceId, onChange, onMove, onDelete }: {
  item: ComputedColumnDef
  index: number
  total: number
  localColumns: string[]
  sources: DataSourceDef[]
  currentSourceId: string
  onChange: (p: Partial<ComputedColumnDef>) => void
  onMove: (d: number) => void
  onDelete: () => void
}) {
  const isSelf = c.targetSourceId === currentSourceId
  const { columns: remoteCols, loading, error } = useSourceColumns(!isSelf && c.type !== 'formula' ? c.targetSourceId : null)
  const targetCols = isSelf ? localColumns : remoteCols
  const type = COMPUTED_TYPES.find((t) => t.value === c.type)!
  const targetName = sources.find((s) => s.id === c.targetSourceId)?.name

  const setKey = (k: number, patch: Partial<{ localColumn: string; targetColumn: string }>) =>
    onChange({ keys: c.keys.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
  const setFilter = (k: number, patch: any) =>
    onChange({ targetFilters: c.targetFilters.map((x, j) => (j === k ? { ...x, ...patch } : x)) })

  return (
    <Card
      size="small"
      className="computed-card"
      title={
        <Space>
          <FunctionOutlined style={{ color: '#1677ff' }} />
          <Input size="small" placeholder="Yeni kolon adı" value={c.name} status={!c.name ? 'error' : undefined}
            onChange={(e) => onChange({ name: e.target.value })} style={{ width: 240, fontWeight: 600 }} />
          <Select size="small" value={c.type} style={{ width: 250 }} popupMatchSelectWidth={false}
            onChange={(v) => onChange({ type: v })}
            options={COMPUTED_TYPES.map((t) => ({ value: t.value, label: <span>{t.label} <Tag style={{ marginLeft: 4, fontSize: 11 }}>{t.excel}</Tag></span> }))} />
        </Space>
      }
      extra={
        <Space size={0}>
          <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMove(-1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === total - 1} onClick={() => onMove(1)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} />
        </Space>
      }
    >
      {c.type === 'formula' ? (
        <div>
          <Input.TextArea
            rows={3}
            className="mono"
            value={c.formula ?? ''}
            onChange={(e) => onChange({ formula: e.target.value })}
            placeholder={'Ör: EĞER([İhtiyaç Miktarı] > [Depo Stok]; [İhtiyaç Miktarı] - [Depo Stok]; 0)'}
          />
          <Space style={{ marginTop: 8 }} wrap>
            <Select
              size="small"
              showSearch
              style={{ width: 280 }}
              placeholder="Formüle kolon ekle..."
              value={null as any}
              options={toOptions(localColumns)}
              onChange={(col: string) => onChange({ formula: `${c.formula ?? ''}[${col}]` })}
            />
            <Input size="small" style={{ width: 200 }} placeholder="Hata/boş durumunda değer" value={c.defaultValue ?? ''}
              onChange={(e) => onChange({ defaultValue: e.target.value || null })} />
          </Space>
          <Collapse
            ghost
            size="small"
            style={{ marginTop: 4 }}
            items={[{
              key: 'h',
              label: 'Formül yardımı',
              children: (
                <div className="formula-help">
                  <p>Kolonlar köşeli parantezle yazılır: <code>[Kolon Adı]</code>. Argüman ayırıcı <code>;</code>, ondalık ayırıcı <code>.</code>.
                    Operatörler: <code>+ - * / ^ &amp; = &lt;&gt; &lt; &gt; &lt;= &gt;=</code>. Metinler çift tırnak içinde: <code>"EKSİK"</code>.</p>
                  <table>
                    <tbody>{FUNCTIONS.map(([f, d]) => <tr key={f}><td><code>{f}</code></td><td>{d}</td></tr>)}</tbody>
                  </table>
                </div>
              ),
            }]}
          />
        </div>
      ) : (
        <div className="lookup-grid">
          <div className="lookup-row">
            <label>Hedef veri kaynağı</label>
            <Select
              style={{ width: 320 }}
              placeholder="Değerin alınacağı kaynak"
              value={c.targetSourceId || undefined}
              onChange={(v) => onChange({ targetSourceId: v, targetValueColumn: null, keys: c.keys.map((k) => ({ ...k, targetColumn: '' })) })}
              options={sources.map((s) => ({ value: s.id, label: s.id === currentSourceId ? `${s.name} (bu kaynak)` : s.name }))}
              loading={loading}
            />
            {error && <Typography.Text type="danger" style={{ marginLeft: 8 }}>{error}</Typography.Text>}
            {!sources.some((s) => s.id === currentSourceId) && (
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>Yeni kaynak kendisine bağlanmak için önce kaydedilmeli.</Typography.Text>
            )}
          </div>

          <div className="lookup-row">
            <label><LinkOutlined /> Eşleşme kriterleri</label>
            <div style={{ flex: 1 }}>
              {c.keys.map((k, j) => (
                <Space key={j} style={{ marginBottom: 6 }} wrap>
                  <Select showSearch style={{ width: 250 }} placeholder="Bu kaynaktaki kolon" value={k.localColumn || undefined}
                    options={toOptions(localColumns)} onChange={(v) => setKey(j, { localColumn: v })} status={!k.localColumn ? 'warning' : undefined} />
                  <SwapOutlined style={{ color: '#8c8c8c' }} />
                  <Select showSearch style={{ width: 250 }} placeholder="Hedef kaynaktaki kolon" value={k.targetColumn || undefined}
                    options={toOptions(targetCols)} onChange={(v) => setKey(j, { targetColumn: v })} status={!k.targetColumn ? 'warning' : undefined} />
                  {c.keys.length > 1 && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange({ keys: c.keys.filter((_, x) => x !== j) })} />}
                </Space>
              ))}
              <div>
                <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => onChange({ keys: [...c.keys, { localColumn: '', targetColumn: '' }] })}>
                  Kriter ekle (VE)
                </Button>
              </div>
            </div>
          </div>

          {c.type !== 'countif' && (
            <div className="lookup-row">
              <label>Getirilecek / hesaplanacak kolon</label>
              <Select showSearch style={{ width: 320 }} placeholder="Hedef kolon" value={c.targetValueColumn || undefined}
                options={toOptions(targetCols)} onChange={(v) => onChange({ targetValueColumn: v })} />
            </div>
          )}

          <div className="lookup-row">
            <label>Hedefte filtre (isteğe bağlı)</label>
            <div style={{ flex: 1 }}>
              {c.targetFilters.map((f, j) => {
                const op = OPERATORS.find((o) => o.value === f.operator)
                return (
                  <Space key={j} style={{ marginBottom: 6 }} wrap>
                    <Select showSearch style={{ width: 220 }} placeholder="Kolon" value={f.column || undefined} options={toOptions(targetCols)} onChange={(v) => setFilter(j, { column: v })} />
                    <Select style={{ width: 170 }} value={f.operator} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => setFilter(j, { operator: v })} />
                    {!op?.noValue && <Input style={{ width: 150 }} placeholder="Değer" value={f.value ?? ''} onChange={(e) => setFilter(j, { value: e.target.value })} />}
                    {op?.twoValues && <Input style={{ width: 120 }} placeholder="ve" value={f.value2 ?? ''} onChange={(e) => setFilter(j, { value2: e.target.value })} />}
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange({ targetFilters: c.targetFilters.filter((_, x) => x !== j) })} />
                  </Space>
                )
              })}
              <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => onChange({ targetFilters: [...c.targetFilters, { column: '', operator: 'eq', value: '' }] })}>
                Filtre ekle
              </Button>
            </div>
          </div>

          <div className="lookup-row">
            <label>Eşleşme yoksa</label>
            <Input style={{ width: 200 }} placeholder={c.type === 'sumif' ? '0' : c.type === 'countif' ? '0' : 'boş bırak'} value={c.defaultValue ?? ''}
              onChange={(e) => onChange({ defaultValue: e.target.value || null })} />
          </div>

          {c.keys.some((k) => k.localColumn && k.targetColumn) && targetName && (
            <div className="lookup-sentence">
              <b>{targetName}</b> kaynağında{' '}
              {c.keys.filter((k) => k.localColumn && k.targetColumn).map((k, j) => (
                <span key={j}>{j > 0 && ' VE '}<Tag color="geekblue">{k.targetColumn}</Tag> = bu satırın <Tag color="blue">{k.localColumn}</Tag></span>
              ))}
              {c.targetFilters.length > 0 && <span> (ve {c.targetFilters.length} filtre)</span>}
              {' '}olan satırların{' '}
              {c.type === 'countif' ? 'SAYISINI' : <><Tag color="green">{c.targetValueColumn || '?'}</Tag> {type.agg}</>}
              {' '}→ <Tag color="purple">{c.name || '?'}</Tag>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
