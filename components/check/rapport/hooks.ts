'use client'

import { useEffect, useRef, useState } from 'react'

/** True zodra de gebruiker `prefers-reduced-motion: reduce` heeft. */
export function useReducedMotion(): boolean {
  // Lazy init: lees de voorkeur al bij de eerste client-render (SSR-veilig — op de
  // server bestaat `window` niet, daar valt 'ie terug op false). Voorkomt een
  // eerste frame mét animatie voor gebruikers die reduced-motion hebben.
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduce
}

/**
 * IntersectionObserver-hook die één keer `true` wordt zodra het element ≥
 * `threshold` in beeld komt (en daarna in beeld blijft). Mirror van de
 * IntersectionObserver-trigger uit het ontwerp.
 */
export function useInViewOnce<T extends Element = HTMLDivElement>(
  threshold = 0.2,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (inView) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true)
            io.disconnect()
          }
        })
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, inView])

  return { ref, inView }
}

/** Leesvoortgang-balk (0–100) gekoppeld aan de scrollpositie van het document. */
export function useReadingProgress(): number {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement
      const total = h.scrollHeight - h.clientHeight
      setProgress(total > 0 ? (h.scrollTop / total) * 100 : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return progress
}

/**
 * Tel-animatie naar een doelwaarde zodra `active`. Respecteert reduced-motion
 * (springt direct naar het doel). `decimals` bepaalt of er een decimaal getoond
 * wordt (met NL-komma).
 */
export function useCountUp(
  target: number,
  active: boolean,
  opts: { decimals?: number; durationMs?: number; delayMs?: number; reduce?: boolean } = {},
): string {
  const { decimals = 0, durationMs = 1100, delayMs = 0, reduce = false } = opts
  const [value, setValue] = useState(reduce ? target : 0)

  useEffect(() => {
    if (!active) return
    if (reduce) {
      setValue(target)
      return
    }
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const elapsed = t - start - delayMs
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      const p = Math.min(elapsed / durationMs, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, decimals, durationMs, delayMs, reduce])

  if (decimals > 0) {
    return value.toFixed(decimals).replace('.', ',')
  }
  return String(Math.round(value))
}
