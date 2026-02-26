'use client'
import { useState, useEffect } from 'react'

export type UseModalAnimationOptions = {
  /** Delay in ms before animation starts after mount. Default: 100 */
  delay?: number
  /** Duration of the animation sequence in ms, for animationComplete. Default: 700 */
  duration?: number
}

export type UseModalAnimationReturn = {
  hasEntered: boolean
  animationComplete: boolean
}

/**
 * Hook voor grafiek-animaties in modals/bottom sheets.
 * Triggert op mount (na een korte delay) in plaats van op viewport-scroll.
 * Gebruik useInViewAnimation voor pagina-componenten.
 */
export function useModalAnimation({
  delay = 100,
  duration = 700,
}: UseModalAnimationOptions = {}): UseModalAnimationReturn {
  const [hasEntered, setHasEntered] = useState(false)
  const [animationComplete, setAnimationComplete] = useState(false)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      setHasEntered(true)
      setAnimationComplete(true)
      return
    }

    const t1 = setTimeout(() => setHasEntered(true), delay)
    const t2 = setTimeout(() => setAnimationComplete(true), delay + duration + 50)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [delay, duration])

  return { hasEntered, animationComplete }
}
