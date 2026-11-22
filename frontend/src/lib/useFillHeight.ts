import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Tablonun kaydırılabilir gövdesini, sayfanın kalan yüksekliğini dolduracak şekilde ölçer.
 * Üstteki alanlar (filtre, bilgi kartları...) değiştikçe otomatik yeniden hesaplanır.
 * @param reserve Tablonun altında kalması gereken boşluk (sayfalama, kenar boşlukları...)
 */
export function useFillHeight(reserve = 100, min = 220) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(420)
  const [width, setWidth] = useState(1000)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const next = Math.max(min, Math.floor(window.innerHeight - top - reserve))
    setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev))
    setWidth((prev) => (Math.abs(prev - el.clientWidth) > 2 ? el.clientWidth : prev))
  }, [reserve, min])

  // Her çizimden sonra ölç (değer değişmezse yeniden çizim tetiklenmez)
  useLayoutEffect(() => { measure() })
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  return { ref, height, width }
}
