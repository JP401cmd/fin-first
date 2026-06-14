'use client'

import { useEffect, useState } from 'react'

/**
 * Bepaalt of er een nieuwe (nog niet bevestigde) vaste last is gedetecteerd —
 * voedt de freshness-dot op de "Vaste lasten"-rij in de sidebar.
 *
 * Eénmalige fetch op mount (geen polling) van `/api/subscriptions`, dat een
 * `VasteLastenSummary` retourneert (`subscriptions` + `vasteKosten`, elk item
 * met `alreadyConfirmed`). Groen zodra minstens één item nog niet bevestigd is.
 * Egress: deze rij rendert alleen op een cashflow-route, dus de hook is van
 * nature lui. Defensief: bij loading/fout retourneert hij `false` (dot grijs).
 */
export function useVasteLastenUnconfirmed(): boolean {
  const [hasUnconfirmed, setHasUnconfirmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/subscriptions')
        if (!res.ok) return
        const data = (await res.json()) as {
          subscriptions?: Array<{ alreadyConfirmed?: boolean }>
          vasteKosten?: Array<{ alreadyConfirmed?: boolean }>
        }
        const items = [...(data.subscriptions ?? []), ...(data.vasteKosten ?? [])]
        const unconfirmed = items.some((i) => !i.alreadyConfirmed)
        if (!cancelled) setHasUnconfirmed(unconfirmed)
      } catch {
        // Stil falen — dot blijft grijs (progressive enhancement).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return hasUnconfirmed
}
