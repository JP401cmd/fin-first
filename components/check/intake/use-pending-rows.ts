'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * usePendingRows — houdt bij welke geopende preset-rijen in een intake-stap al
 * een geldige, maar nog niet bevestigde waarde bevatten.
 *
 * Achtergrond (bevinding C4): in de Vrijheidscheck leeft een getypt bedrag alleen
 * in de lokale state van de rij tot je op "Toevoegen" klikt. De brede knop onderaan
 * navigeerde onvoorwaardelijk door, waardoor die invoer stilzwijgend verdween.
 * Elke rij meldt zijn openstaande waarde nu via `report`; de stap haalt ze met
 * `flush()` op en commit ze vóór het navigeren.
 *
 * De rijen zelf staan in een ref (typen mag geen re-render van de hele stap
 * kosten); alleen de boolean `hasPending` is state, zodat de knop-hiërarchie
 * ("Overslaan" verdwijnt zodra er iets in te vullen valt) meebeweegt.
 */
export interface PendingRows<T> {
  /** Meld de openstaande, geldige waarde van één rij — of `null` om te wissen. */
  report: (key: string, pending: T | null) => void
  /** Staat er minstens één ingevulde rij open die nog niet bevestigd is? */
  hasPending: boolean
  /** Geeft de openstaande rijen terug en wist het register (vóór navigeren). */
  flush: () => T[]
}

export function usePendingRows<T>(): PendingRows<T> {
  const store = useRef<Map<string, T>>(new Map())
  const [hasPending, setHasPending] = useState(false)

  const report = useCallback((key: string, pending: T | null) => {
    if (pending) store.current.set(key, pending)
    else store.current.delete(key)
    setHasPending(store.current.size > 0)
  }, [])

  const flush = useCallback(() => {
    const rows = Array.from(store.current.values())
    if (rows.length > 0) {
      store.current.clear()
      setHasPending(false)
    }
    return rows
  }, [])

  return { report, hasPending, flush }
}
