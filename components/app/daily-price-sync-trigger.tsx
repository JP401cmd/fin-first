'use client'

import { useEffect, useRef } from 'react'

/**
 * DailyPriceSyncTrigger — eerste-open-van-de-dag prijs-sync (rendert niets).
 *
 * Bij de eerste app-open van de dag ververst dit automatisch de marktprijzen en
 * legt het één tijdstempel-punt vast in net_worth_history. De dag-gate zit
 * SERVER-side (POST /api/sync/daily-open, cross-device via
 * profiles.last_price_sync_at): die claimt de dag atomisch en antwoordt
 * `{ due: true }` als er vandaag nog niet gesynct is.
 *
 * Flow bij `due`:
 *   1. POST /api/holdings/refresh-prices  → verse koersen + assets.current_value-rollup
 *   2. GET  /api/snapshots/auto?source=daily-open → dag-snapshot + history-punt
 *
 * Alles fire-and-forget en niet-blokkerend; guard tegen dubbel-mount (StrictMode).
 * Prijzen-only (zoals de kaart vraagt) — geen exchange/wallet-koppelingssync.
 */
export function DailyPriceSyncTrigger() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      try {
        const res = await fetch('/api/sync/daily-open', {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) return
        const data = (await res.json()) as { due?: boolean }
        if (!data?.due) return

        // Ververs prijzen; daarna een tijdstempel-history-punt via de snapshot-route.
        await fetch('/api/holdings/refresh-prices', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }).catch(() => {})

        await fetch('/api/snapshots/auto?source=daily-open', {
          credentials: 'include',
        }).catch(() => {})
      } catch {
        // Niet-kritiek — de dagelijkse prijs-cron is het vangnet.
      }
    })()
  }, [])

  return null
}
