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
  /** Delay in ms after the IntersectionObserver trigger before hasEntered becomes true.
   *  Use ~300 for modal/BottomSheet context so the bar starts after the open animation. */
  triggerDelay?: number
  /**
   * Set true for charts inside BottomSheet modals.
   * Presets rootMargin:'0px' and threshold:0 so the animation
   * fires immediately when the modal content mounts.
   */
  forModal?: boolean
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
    duration = 700,
    delay = 0,
    once = true,
    triggerDelay = 0,
    forModal = false,
  } = options

  const resolvedRootMargin = forModal ? '0px' : (options.rootMargin ?? '0px 0px -40px 0px')
  const resolvedThreshold  = forModal ? 0      : (options.threshold  ?? 0.15)

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
            if (once) observer.disconnect()

            const enter = () => {
              setHasEntered(true)
              setTimeout(() => setAnimationComplete(true), duration + delay + 50)
            }

            if (triggerDelay > 0) {
              const delayTimer = setTimeout(enter, triggerDelay)
              return () => clearTimeout(delayTimer)
            } else {
              enter()
            }
          }
        }
      },
      { threshold: resolvedThreshold, rootMargin: resolvedRootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [resolvedThreshold, resolvedRootMargin, duration, delay, once, triggerDelay])

  return { ref, hasEntered, animationComplete }
}
