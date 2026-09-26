'use client'

import { useEffect } from 'react'

/**
 * Roept `onMatch` aan zodra `window.location.hash` gelijk is aan `hash` — bij
 * het mounten en na elke `hashchange` — en haalt het anker daarna uit de URL,
 * zodat dezelfde link later opnieuw werkt. `history.state` blijft behouden: de
 * App Router bewaart daar zijn eigen navigatiestaat.
 *
 * `onMatch` hoort stabiel te zijn (bv. een state-setter of `useCallback`).
 */
export function useOpenOnHash(hash: string, onMatch: () => void): void {
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== hash) return
      onMatch()
      const { pathname, search } = window.location
      window.history.replaceState(window.history.state, '', `${pathname}${search}`)
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [hash, onMatch])
}
