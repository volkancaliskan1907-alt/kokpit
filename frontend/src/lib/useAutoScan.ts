import { useRef, useState } from 'react'

/**
 * Barkod okuyucu girişi: Enter gerekmez.
 * Okuyucunun hızlı yazışı (tuşlar arası < 70 ms) veya yapıştırma algılanınca kısa bir duraklamadan sonra otomatik işlenir.
 * Elle yavaş yazılırken yalnızca tam eşleşme olunca (veya Enter ile) işlenir; eşleşme yoksa yazmaya devam edilebilir.
 *
 * @param handle (kod, kesin) → işlendiyse true (kutu temizlenir), yazmaya devam edilsin isteniyorsa false.
 *               "kesin": Enter'a basıldı veya hızlı (okuyucu) giriş; eşleşme olmasa da sonuç gösterilmelidir.
 */
export function useAutoScan(handle: (raw: string, definite: boolean) => boolean | Promise<boolean>) {
  const [value, setValue] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const last = useRef(0)
  const gap = useRef(0)
  const fn = useRef(handle)
  fn.current = handle

  const run = async (raw: string, definite: boolean) => {
    window.clearTimeout(timer.current)
    if (!raw.trim()) return
    const done = await fn.current(raw.trim(), definite)
    if (done) { gap.current = 0; setValue('') }
  }

  const onChange = (v: string) => {
    const now = performance.now()
    const added = v.length - value.length
    gap.current = !value ? 0 : Math.max(gap.current, now - last.current)
    last.current = now
    setValue(v)
    window.clearTimeout(timer.current)
    if (!v.trim()) return
    const fast = added >= 4 || (v.length >= 4 && gap.current < 70)
    timer.current = window.setTimeout(() => run(v, fast), fast ? 90 : 700)
  }

  return { value, onChange, onEnter: () => run(value, true) }
}
