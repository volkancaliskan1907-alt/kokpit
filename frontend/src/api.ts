import { Modal } from 'antd'
import type { DekitLookup, DekitCompare, DekitConfig, DekitDetail, DekitSummaryRow, ImportPreview, ImportResult,
  AppConfig, BrowseResponse, DashboardResponse, OverviewResponse, CustomRow, CustomTableDef, DataSourceDef, GeneralSettings, PickDetailResponse, PickInfo, KittDataResponse,
  KittNote, KittPageConfig, OrderOption, OrderPageConfig, PreviewResponse, SourceTestResult,
} from './types'

const USER_KEY = 'kokpit.user'

export const getUserName = () => localStorage.getItem(USER_KEY) || ''
export const setUserName = (name: string) => localStorage.setItem(USER_KEY, name.trim())

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const user = getUserName()
  if (user) headers['X-User'] = encodeURIComponent(user)

  const res = await fetch(url, { method, headers, cache: 'no-store', body: body !== undefined ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
      else if (j?.title) msg = j.title
    } catch { /* yoksay */ }
    if (res.status === 409) {
      Modal.confirm({
        title: 'Ayarlar başka bir yerden değiştirildi',
        content: msg,
        okText: 'Sayfayı Yenile',
        cancelText: 'Kapat',
        onOk: () => window.location.reload(),
      })
    }
    throw new Error(msg)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Ekranın üzerinde çalıştığı ayar sürümü; sunucu daha yeni bir sürüme sahipse kayıt reddedilir. */
let configRevision: number | null = null
const trackConfig = async (p: Promise<AppConfig>) => {
  const c = await p
  configRevision = c.revision
  return c
}
const saveConfig = (section: string, body: unknown) =>
  trackConfig(request<AppConfig>('PUT', `/api/config/${section}${configRevision !== null ? `?rev=${configRevision}` : ''}`, body))

export const api = {
  getConfig: () => trackConfig(request<AppConfig>('GET', '/api/config')),
  saveGeneral: (g: GeneralSettings) => saveConfig('general', g),
  saveDataSources: (list: DataSourceDef[]) => saveConfig('datasources', list),
  saveOrderPage: (c: OrderPageConfig) => saveConfig('orderpage', c),
  saveKittPage: (c: KittPageConfig) => saveConfig('kittpage', c),

  testSource: (def: DataSourceDef) => request<SourceTestResult>('POST', '/api/sources/test', def),
  preview: (id: string, limit = 1000) => request<PreviewResponse>('GET', `/api/sources/${encodeURIComponent(id)}/preview?limit=${limit}`),
  columns: (id: string) => request<{ columns: string[]; computedColumns: string[]; warnings: string[] }>('GET', `/api/sources/${encodeURIComponent(id)}/columns`),
  distinct: (id: string, column: string) =>
    request<string[]>('GET', `/api/sources/${encodeURIComponent(id)}/distinct?column=${encodeURIComponent(column)}`),
  reload: () => request<void>('POST', '/api/sources/reload'),
  browse: (path?: string) => request<BrowseResponse>('GET', `/api/fs/browse?path=${encodeURIComponent(path || '')}`),

  orderOptions: () => request<OrderOption[]>('GET', '/api/orders/options'),
  orderData: () => request<KittDataResponse>('POST', '/api/orders/data', {}),
  orderAdd: (orders: string[]) => request<{ added: number }>('POST', '/api/orders/add', { orders }),
  orderDeleteRows: (keys: string[]) => request<void>('POST', '/api/orders/rows/delete', { keys }),
  orderSetRowOrder: (keys: string[]) => request<void>('PUT', '/api/orders/rows/order', { keys }),
  orderVcOptions: () => request<Record<string, string[]>>('GET', '/api/orders/vcoptions'),
  orderSetValue: (rowKeys: string[], columnId: string, value: unknown) =>
    request<{ by?: string; at: string }>('PUT', '/api/orders/values', { rowKeys, columnId, value: value ?? null }),

  kittOrders: () => request<string[]>('GET', '/api/kitt/orders'),
  kittOrdersRemove: (orders: string[]) => request<void>('POST', '/api/kitt/orders/remove', { orders }),
  kittData: (orders: string[]) => request<KittDataResponse>('POST', '/api/kitt/data', { orders }),
  kittDetail: (orders: string[]) => request<PickDetailResponse>('POST', '/api/kitt/detail', { values: orders }),
  kittPicks: (keys: string[], picked: boolean, method: 'scan' | 'manual') =>
    request<Record<string, PickInfo>>('PUT', '/api/kitt/picks', { keys, picked, method }),
  kittProcess: (order: string, rowKey: string, option: string | null) =>
    request<{ option?: string; added: boolean; table?: string }>('PUT', '/api/kitt/process', { order, rowKey, option }),

  saveTables: (list: CustomTableDef[]) => saveConfig('tables', list),
  saveDekit: (c: DekitConfig) => saveConfig('dekit', c),
  dekitSummary: (orders: string[], others: string[]) =>
    request<{ rows: DekitSummaryRow[]; warnings: string[]; compare: DekitCompare }>('POST', '/api/dekit/summary', { orders, others }),
  dekitDetail: (order: string, orders: string[], others: string[]) => request<DekitDetail>('POST', '/api/dekit/detail', { order, orders, others }),
  dekitLookup: (order: string, code: string, orders: string[], others: string[]) =>
    request<DekitLookup>('POST', '/api/dekit/lookup', { order, code, orders, others }),
  dekitArrived: () => request<{ orders: string[]; status: string }>('GET', '/api/dekit/arrived'),
  tablesSummary: () => request<Record<string, number>>('GET', '/api/tables/summary'),
  tableRows: (id: string) => request<CustomRow[]>('GET', `/api/tables/${encodeURIComponent(id)}/rows`),
  addTableRow: (id: string, values: Record<string, unknown>) => request<CustomRow>('POST', `/api/tables/${encodeURIComponent(id)}/rows`, { values }),
  updateTableRow: (id: string, rowId: string, values: Record<string, unknown>) =>
    request<CustomRow>('PUT', `/api/tables/${encodeURIComponent(id)}/rows/${encodeURIComponent(rowId)}`, { values }),
  deleteTableRows: (id: string, ids: string[]) => request<{ deleted: number }>('POST', `/api/tables/${encodeURIComponent(id)}/rows/delete`, { ids }),
  kittOptions: () => request<Record<string, string[]>>('GET', '/api/kitt/options'),
  kittSetValue: (rowKeys: string[], columnId: string, value: unknown) =>
    request<{ by?: string; at: string; extra?: { columnId: string; value: unknown }[] }>('PUT', '/api/kitt/values', { rowKeys, columnId, value: value ?? null }),
  kittAddNote: (rowKey: string, columnId: string, text: string) =>
    request<KittNote[]>('POST', '/api/kitt/notes', { rowKey, columnId, text }),
  kittDeleteNote: (rowKey: string, columnId: string, noteId: string) =>
    request<KittNote[]>('POST', '/api/kitt/notes/delete', { rowKey, columnId, noteId }),

  dashboard: () => request<DashboardResponse>('GET', '/api/dashboard'),
  overview: () => request<OverviewResponse>('GET', '/api/overview'),

  async exportExcel(fileName: string, columns: { field: string; label: string; format: string }[], rows: Record<string, unknown>[]) {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, sheetName: fileName, columns, rows }),
    })
    if (!res.ok) throw new Error('Excel oluşturulamadı')
    await downloadResponse(res, `${fileName}.xlsx`)
  },

  /** Özel tablo Excel şablonu (withData: mevcut kayıtlarla birlikte). */
  async downloadTemplate(id: string, withData: boolean) {
    const res = await fetch(`/api/tables/${encodeURIComponent(id)}/template?withData=${withData}`)
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Şablon oluşturulamadı')
    await downloadResponse(res, 'sablon.xlsx')
  },

  async previewImport(id: string, file: File, headerRow: number): Promise<ImportPreview> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('headerRow', String(headerRow))
    const res = await fetch(`/api/tables/${encodeURIComponent(id)}/import/preview`, { method: 'POST', body: fd })
    const j = await res.json().catch(() => null)
    if (!res.ok) throw new Error(j?.error || 'Dosya okunamadı')
    return j
  },

  async importTable(id: string, file: File, update: boolean, headerRow: number, mapping: Record<string, string>): Promise<ImportResult> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('headerRow', String(headerRow))
    fd.append('mapping', JSON.stringify(mapping))
    const headers: Record<string, string> = {}
    const user = getUserName()
    if (user) headers['X-User'] = encodeURIComponent(user)
    const res = await fetch(`/api/tables/${encodeURIComponent(id)}/import?update=${update}`, { method: 'POST', body: fd, headers })
    const j = await res.json().catch(() => null)
    if (!res.ok) throw new Error(j?.error || 'Yükleme başarısız')
    return j
  },
}

async function downloadResponse(res: Response, fallback: string) {
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallback
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Benzersiz kimlik (http üzerinde crypto.randomUUID olmayabilir). */
export const newId = (prefix = '') =>
  prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8)
