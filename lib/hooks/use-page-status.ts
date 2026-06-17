'use client'

import { useEffect, useState } from 'react'
import type { PageStatusInfo } from '@/lib/page-status/types'
import type { MinimizedLevel } from '@/lib/page-status/display'

/**
 * usePageStatus — haalt de status-duiding (PageStatusInfo) ÉN de per-gebruiker
 * "geminimaliseerd"-voorkeur voor de huidige /overzicht-route LAZY op via
 * `GET /api/overzicht/page-status?route=<route>`.
 *
 * Spiegelt het lazy-patroon van use-cashflow-card-statuses.ts: de banner-data
 * wordt pas op de pagina zélf gefetcht (niet eager in de layout), zodat
 * niet-cashflow-routes de zware dashboard-loader nooit aanraken (egress).
 *
 * Géén module-level cache: die kon na een same-tab logout→login kortstondig de
 * banner-cijfers van de vórige gebruiker tonen (cross-account-lek). We fetchen
 * daarom vers bij elke mount / route-wissel en resetten naar `null` zolang we
 * laden, off-route zitten, of een fout optreedt — net als
 * use-cashflow-card-statuses.ts. Een lokale `cancelled`-vlag in het effect
 * voorkomt setState-na-unmount en out-of-order responses.
 *
 * Retourneert `{ info: null, minimized: null }` tijdens het laden, bij een fout,
 * of wanneer er geen banner is (groen/neutraal/buiten scope) — progressive
 * enhancement. `minimized` is het LeverageStatus-niveau waarop de gebruiker de
 * banner voor deze route eerder inklapte (of null).
 */
export interface PageStatusResult {
  info: PageStatusInfo | null
  minimized: MinimizedLevel | null
}

function asMinimizedLevel(value: unknown): MinimizedLevel | null {
  return value === 'warn' || value === 'bad' ? value : null
}

export function usePageStatus(route: string): PageStatusResult {
  const [result, setResult] = useState<PageStatusResult>({
    info: null,
    minimized: null,
  })

  useEffect(() => {
    let cancelled = false
    // Synchroon resetten op route-wissel: toon nooit de vorige-route-banner
    // (of die van een vorige gebruiker) terwijl de nieuwe fetch loopt.
    setResult({ info: null, minimized: null })
    ;(async () => {
      try {
        const res = await fetch(
          `/api/overzicht/page-status?route=${encodeURIComponent(route)}`,
        )
        if (!res.ok) return
        const data = (await res.json()) as {
          info?: PageStatusInfo | null
          minimized?: unknown
        }
        if (cancelled) return
        setResult({
          info: data.info ?? null,
          minimized: asMinimizedLevel(data.minimized),
        })
      } catch {
        // Stil falen — geen banner (progressive enhancement).
      }
    })()

    return () => {
      cancelled = true
    }
  }, [route])

  return result
}
