'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Tel een getal op van 0 → target met een ease-out, één keer. Respecteert
 * `prefers-reduced-motion` (toont meteen de eindwaarde). Bedoeld om te starten
 * zodra een element in beeld komt: geef `start` door vanuit `useInViewAnimation`.
 *
 * @param target eindwaarde
 * @param opts.duration animatieduur in ms (default 800)
 * @param opts.start begin de animatie wanneer true wordt (default true)
 * @returns de huidige (mogelijk fractionele) waarde — rond af bij weergave
 */
export function useCountUp(
  target: number,
  opts: { duration?: number; start?: boolean } = {},
): number {
  const { duration = 800, start = true } = opts
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!start) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced || startedRef.current) {
      setValue(target)
      return
    }
    startedRef.current = true

    let startTs: number | null = null
    const tick = (ts: number) => {
      if (startTs == null) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setValue(target * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, start])

  return value
}
