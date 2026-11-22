import { useEffect, useState } from 'react'
import { api } from '../api'

const cache = new Map<string, Promise<string[]>>()

export const invalidateColumns = () => cache.clear()

export function fetchColumns(sourceId: string): Promise<string[]> {
  if (!cache.has(sourceId)) {
    const p = api.columns(sourceId).then((r) => r.columns).catch((e) => { cache.delete(sourceId); throw e })
    cache.set(sourceId, p)
  }
  return cache.get(sourceId)!
}

/** Kaydedilmiş bir veri kaynağının kolonları (hesaplanan kolonlar dahil). */
export function useSourceColumns(sourceId?: string | null) {
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!sourceId) { setColumns([]); setError(null); return }
    setLoading(true)
    fetchColumns(sourceId)
      .then((c) => { if (alive) { setColumns(c); setError(null) } })
      .catch((e) => { if (alive) { setColumns([]); setError(e.message) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [sourceId])

  return { columns, loading, error }
}

export const toOptions = (cols: string[]) => cols.map((c) => ({ value: c, label: c }))
