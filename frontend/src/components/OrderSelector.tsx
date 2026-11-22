import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Select, Tag, Tooltip, message } from 'antd'
import { ClearOutlined, ReloadOutlined, SnippetsOutlined } from '@ant-design/icons'
import { api } from '../api'
import type { OrderOption } from '../types'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  onRefresh?: () => void
  loading?: boolean
  /** Ekleme modu: seçilenler üst alanda tutulmaz, onChange yalnızca yeni eklenenleri verir (liste dışarıda kalıcıdır). */
  addMode?: boolean
}

/** Ayarlarda tanımlı iş emirlerinden / siparişlerden tekli veya çoklu seçim (tek satırlık kompakt alan). */
export default function OrderSelector({ value, onChange, onRefresh, loading, addMode }: Props) {
  const [options, setOptions] = useState<OrderOption[]>([])
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const load = () => {
    setBusy(true)
    api.orderOptions()
      .then(setOptions)
      .catch((e) => message.error(e.message))
      .finally(() => setBusy(false))
  }
  useEffect(load, [])

  const byValue = useMemo(() => new Map(options.map((o) => [o.value.toUpperCase(), o])), [options])
  const unknown = value.filter((v) => !byValue.has(v.toUpperCase()))

  // Yapıştırılan listedeki numaraları mevcut seçeneklerle eşleştir (büyük/küçük harf duyarsız)
  const normalize = (list: string[]) =>
    [...new Set(list.map((v) => v.trim()).filter(Boolean).map((v) => byValue.get(v.toUpperCase())?.value ?? v))]

  const openPaste = async () => {
    let txt = ''
    try { txt = await navigator.clipboard.readText() } catch { /* izin yok: elle yapıştırılır */ }
    setPasteText(txt)
    setPasteOpen(true)
  }
  const applyPaste = () => {
    const list = pasteText.split(/[\s,;]+/).filter(Boolean)
    onChange(normalize([...value, ...list]))
    setPasteOpen(false)
    message.success(`${list.length} iş emri eklendi`)
  }

  return (
    <div className="order-picker">
      <Select
        mode="multiple"
        allowClear
        showSearch
        maxTagCount="responsive"
        placeholder={addMode ? "Tabloya eklemek için iş emri numarası yazın veya seçin · Excel'den birden fazla numara yapıştırabilirsiniz" : "İş emri numarası veya ürün tanımı yazın · Excel'den birden fazla numara yapıştırabilirsiniz"}
        style={{ flex: 1, minWidth: 260 }}
        value={value}
        onChange={(v) => onChange(normalize(v))}
        tokenSeparators={[',', ';', '\n', '\t']}
        loading={busy}
        filterOption={(input, o) => {
          const q = input.toLocaleLowerCase('tr')
          return String(o?.value ?? '').toLocaleLowerCase('tr').includes(q) || String((o as any)?.desc ?? '').toLocaleLowerCase('tr').includes(q)
        }}
        options={options.map((o) => ({ value: o.value, label: o.value, desc: o.description, count: o.rowCount }))}
        optionRender={(o) => (
          <div className="order-option">
            <div>
              <div className="order-option-no">{o.data.label}</div>
              {o.data.desc && <div className="order-option-desc">{o.data.desc}</div>}
            </div>
            <span className={`order-option-count ${o.data.count ? '' : 'empty'}`}>{o.data.count ? `${o.data.count} satır` : 'veri yok'}</span>
          </div>
        )}
        notFoundContent="Eşleşen iş emri yok"
      />
      {!addMode && <span className="order-picker-meta">
        <b>{value.length}</b> / {options.length}
        {unknown.length > 0 && <Tooltip title={`Listede yok: ${unknown.join(', ')}`}><Tag color="warning" style={{ marginLeft: 6 }}>{unknown.length}!</Tag></Tooltip>}
      </span>}
      <Tooltip title="Kopyaladığınız iş emirlerini toplu yapıştır"><Button icon={<SnippetsOutlined />} onClick={openPaste}>Toplu Yapıştır</Button></Tooltip>
      {!addMode && <Tooltip title="Seçimi temizle"><Button icon={<ClearOutlined />} disabled={!value.length} onClick={() => onChange([])} /></Tooltip>}
      <Tooltip title="Excel dosyalarındaki son değişiklikleri al">
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => { load(); onRefresh?.() }}>Yenile</Button>
      </Tooltip>
      <Modal title="Toplu iş emri yapıştır" open={pasteOpen} onOk={applyPaste} onCancel={() => setPasteOpen(false)} okText="Ekle" cancelText="Vazgeç" okButtonProps={{ disabled: !pasteText.trim() }}>
        <Input.TextArea autoFocus rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Excel'den kopyaladığınız iş emri numaralarını buraya yapıştırın (Ctrl+V)" />
      </Modal>
    </div>
  )
}
