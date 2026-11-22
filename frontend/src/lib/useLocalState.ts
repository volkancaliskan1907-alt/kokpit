import { useEffect, useRef, useState } from 'react'
import { getPref, hasPref, setPref } from './prefs'

/**
 * Kullanıcı tercihi olarak sunucuda saklanan durum (adı eski kalmıştır).
 * Sayfa yenilense, başka tarayıcı / adres / bilgisayar kullanılsa da aynı kullanıcı için korunur.
 */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => getPref(key, initial))
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      // İlk açılışta yalnızca eski tarayıcı kaydından taşınan (varsayılandan farklı) değeri sunucuya yaz
      if (!hasPref(key) && JSON.stringify(value) !== JSON.stringify(initial)) setPref(key, value)
      return
    }
    setPref(key, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return [value, setValue] as const
}
