import { getUserName } from '../api'

/**
 * Kullanıcı tercihleri sunucuda (App_Data/user-prefs.json) saklanır.
 * Uygulama açılırken tek seferde yüklenir; değişiklikler kısa gecikmeyle sunucuya yazılır.
 */
let cache: Record<string, any> = {}
const timers = new Map<string, number>()

const headers = (): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const u = getUserName()
  if (u) h['X-User'] = encodeURIComponent(u)
  return h
}

export async function loadPrefs() {
  try {
    const r = await fetch('/api/prefs', { headers: headers() })
    if (r.ok) cache = await r.json()
  } catch { /* sunucuya ulaşılamazsa varsayılanlarla devam */ }
}

export const hasPref = (key: string) => key in cache

/** Sunucuda yoksa, eski sürümden kalan tarayıcı kaydı bir kez okunur ve sunucuya taşınır. */
export function getPref<T>(key: string, initial: T): T {
  if (key in cache) return cache[key] as T
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* yoksay */ }
  return initial
}

const send = (key: string, value: unknown) =>
  fetch(`/api/prefs/${encodeURIComponent(key)}`, { method: 'PUT', headers: headers(), body: JSON.stringify(value ?? null), keepalive: true }).catch(() => {})

export function setPref(key: string, value: unknown) {
  cache[key] = value
  const t = timers.get(key)
  if (t) window.clearTimeout(t)
  timers.set(key, window.setTimeout(() => { timers.delete(key); send(key, value) }, 400))
}

/** Sayfa kapanırken bekleyen kayıtları hemen gönder. */
export function flushPrefs() {
  for (const [key, t] of timers) { window.clearTimeout(t); timers.delete(key); send(key, cache[key]) }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPrefs)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPrefs() })
}
