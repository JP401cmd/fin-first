'use client'

/**
 * SSR-safe media-query hook gebouwd op `useSyncExternalStore`. Geen
 * "set-state-in-effect"-anti-pattern. Server-snapshot = `false` zodat de
 * server-render altijd "mobile-first" rendert; hydratie schakelt direct
 * naar de echte breakpoint via matchMedia.
 *
 * Gebruik liefst Tailwind `lg:`/`md:` classes voor visuele responsive
 * gedrag — die zijn cheaper en flicker-loos. Reserveer deze hook voor
 * gevallen waarin JS-state moet weten welke breakpoint actief is
 * (bv. een component dat conditioneel een ander overlay-mechanisme kiest).
 */

import { useCallback, useSyncExternalStore } from 'react'

function getServerSnapshot(): boolean {
  return false
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Convenience: matches Tailwind's `lg:` breakpoint (≥1024px). */
export function useIsLgUp(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
