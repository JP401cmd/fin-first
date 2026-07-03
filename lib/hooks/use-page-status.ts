'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
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
 * SERVER-SEED (dedup): een pagina die de databron toch al SSR-laadt (bv.
 * /overzicht met loadDashboardData) berekent de status server-side en geeft die
 * mee als `seedRef`. Bij de EERSTE render na een harde load consumeren we die
 * seed en slaan we de overbodige eerste client-fetch over — dat scheelt de
 * volledige dashboard-loader in een aparte λ-request per bezoek. Elke LATERE
 * route-wissel (ook terug-navigeren) fetcht gewoon vers: het gedrag na de eerste
 * render is identiek aan voorheen.
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

/** Server-berekende initiële status voor één route (zie computePageStatusInfo). */
export interface PageStatusSeedData {
  route: string
  info: PageStatusInfo | null
  minimized: MinimizedLevel | null
}

function asMinimizedLevel(value: unknown): MinimizedLevel | null {
  return value === 'warn' || value === 'bad' || value === 'info' ? value : null
}

export function usePageStatus(
  route: string,
  seedRef?: RefObject<PageStatusSeedData | null>,
): PageStatusResult {
  const [result, setResult] = useState<PageStatusResult>({
    info: null,
    minimized: null,
  })

  // Of de server-seed al geprobeerd is. De seed geldt ALLEEN voor de eerste
  // render na een harde load; daarna valt elke route-wissel terug op de fetch.
  const seedConsumedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    // Consumeer de server-seed exact één keer, en alleen voor zijn eigen route:
    // toon direct de reeds server-berekende status en sla de overbodige eerste
    // client-fetch over. Ontbreekt de seed (of hoort hij bij een andere route),
    // dan valt alles gewoon terug op de fetch — identiek aan voorheen.
    if (!seedConsumedRef.current) {
      seedConsumedRef.current = true
      const seed = seedRef?.current
      if (seed && seed.route === route) {
        setResult({ info: seed.info, minimized: seed.minimized })
        return
      }
    }

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
  }, [route, seedRef])

  return result
}
