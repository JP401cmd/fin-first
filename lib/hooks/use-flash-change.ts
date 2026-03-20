'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

type FlashDirection = 'up' | 'down' | null

/**
 * Hook that adds a CSS flash class when a numeric value changes.
 * Inspired by fd.nl live price updates.
 *
 * - flash-up (green pulse): value increased
 * - flash-down (red pulse): value decreased
 * - Respects prefers-reduced-motion
 *
 * @param value - The numeric value to watch for changes
 * @returns { ref, flashClass } - ref to attach to the element, flashClass to apply
 */
export function useFlashChange(value: number | null | undefined) {
  const prevValue = useRef<number | null | undefined>(undefined)
  const [flash, setFlash] = useState<FlashDirection>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useRef(false)

  // Check prefers-reduced-motion once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      reducedMotion.current = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
    }
  }, [])

  useEffect(() => {
    // Skip the initial render (no previous value to compare)
    if (prevValue.current === undefined) {
      prevValue.current = value
      return
    }

    // Skip if reduced motion is preferred
    if (reducedMotion.current) {
      prevValue.current = value
      return
    }

    const prev = prevValue.current ?? 0
    const curr = value ?? 0

    if (curr !== prev) {
      // Clear any existing timer
      if (timerRef.current) clearTimeout(timerRef.current)

      setFlash(curr > prev ? 'up' : 'down')

      // Remove flash class after animation completes (1s)
      timerRef.current = setTimeout(() => {
        setFlash(null)
        timerRef.current = null
      }, 1050) // Slightly longer than the 1s animation
    }

    prevValue.current = value
  }, [value])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const flashClass = flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''

  return { flashClass }
}
