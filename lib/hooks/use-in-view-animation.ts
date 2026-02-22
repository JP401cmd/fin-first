'use client'

import { useRef, useState, useEffect } from 'react'

export type UseInViewAnimationOptions = {
  /** IntersectionObserver threshold. Default: 0.15 */
  threshold?: number
  /** IntersectionObserver rootMargin. Default: '0px 0px -40px 0px' */
  rootMargin?: string
  /** Duration of the animation in ms, used to compute animationComplete. Default: 700 */
  duration?: number
  /** Extra delay in ms after duration before animationComplete fires. Default: 0 */
  delay?: number
  /** Whether to only trigger once (disconnects observer after first entry). Default: true */
  once?: boolean
}

export type UseInViewAnimationReturn = {
  ref: React.RefObject<HTMLDivElement | null>
  /** True once the element has entered the viewport */
  hasEntered: boolean
  /** True once the animation is considered complete (hasEntered + duration + delay + 50ms buffer) */
  animationComplete: boolean
}

/**
 * Hook that triggers a build-in animation when an element scrolls into view.
 *
 * - Respects prefers-reduced-motion: both flags are immediately true when the
 *   user has requested reduced motion, so no transition styles are applied.
 * - Uses IntersectionObserver with once:true semantics by default.
 * - animationComplete is set after (duration + delay + 50ms) to gate hover handlers.
 */
export function useInViewAnimation(
  options: UseInViewAnimationOptions = {},
): UseInViewAnimationReturn {
  const {
    threshold = 0.15,
    rootMargin = '0px 0px -40px 0px',
    duration = 700,
    delay = 0,
    once = true,
  } = options

  const ref = useRef<HTMLDivElement | null>(null)
  const [hasEntered, setHasEntered] = useState(false)
  const [animationComplete, setAnimationComplete] = useState(false)

  useEffect(() => {
    // Respect prefers-reduced-motion: skip animation entirely
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      setHasEntered(true)
      setAnimationComplete(true)
      return
    }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasEntered(true)
            if (once) observer.disconnect()

            const timeout = setTimeout(() => {
              setAnimationComplete(true)
            }, duration + delay + 50)

            return () => clearTimeout(timeout)
          }
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, duration, delay, once])

  return { ref, hasEntered, animationComplete }
}
