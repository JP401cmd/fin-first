'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KaternId } from '@/lib/horizon/katern-copy'
import {
  KATERN_ROUTE,
  katernMinimizeLevel,
  resolveKaternMeldingDisplay,
} from '@/lib/horizon/katern-meldingen'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { BannerDisplay, MinimizedLevel } from '@/lib/page-status/display'

/**
 * Minimaliseren van de melding van één katern (ADR 0179 D6), op het bestaande
 * mechanisme van de statusbanner: de own-row JSONB-pref `profiles.status_banner_minimized`
 * (route → stoplichtniveau), geschreven via `PUT /api/overzicht/page-status`. Geen
 * nieuwe route, geen migratie, geen localStorage.
 *
 * - De sleutel is de katern-route (`KATERN_ROUTE`): elk katern is een route.
 * - `initialLevel` komt server-side mee (`readMinimizedMap` +
 *   `katernMinimizedLevelUitMap`), zodat slot en punt niet flikkeren. Geen fetch hier:
 *   de meldingen komen uit data die de pagina al heeft (één fetch-pad).
 * - Escalatie heropent: minimaliseren slaat het niveau op dat je zag; een ergere ernst
 *   klapt weer uit (`resolveBannerDisplay`).
 * - Optimistisch met terugrol bij een fout, en de terugrol alleen zolang het katern
 *   nog hetzelfde is (spiegel van `PageStatusProvider`).
 *
 * De schrijf-allowlist kent de drie katern-routes als `STOPLICHT_MINIMIZE_KEYS`
 * (`lib/page-status/compute.ts`): de PUT neemt ze aan met 'warn' | 'bad' | 'info',
 * zonder dat de GET-scope meegroeit.
 */
export interface KaternMeldingMinimize {
  display: BannerDisplay | 'none'
  minimize: () => void
  restore: () => void
}

export function useKaternMeldingMinimize({
  katern,
  hoogsteErnst,
  initialLevel = null,
}: {
  katern: KaternId
  hoogsteErnst: LeverageStatus | null
  initialLevel?: MinimizedLevel | null
}): KaternMeldingMinimize {
  const route = KATERN_ROUTE[katern]
  const [level, setLevel] = useState<MinimizedLevel | null>(initialLevel)

  // Een nieuwe server-seed (route-wissel, router.refresh) wint van de lokale stand.
  // State bijstellen tijdens het renderen, niet in een effect (geen extra render-ronde).
  const seedKey = `${route}|${initialLevel ?? ''}`
  const [vorigeSeedKey, setVorigeSeedKey] = useState(seedKey)
  if (seedKey !== vorigeSeedKey) {
    setVorigeSeedKey(seedKey)
    setLevel(initialLevel)
  }

  const levelRef = useRef(level)
  useEffect(() => {
    levelRef.current = level
  }, [level])

  const routeRef = useRef(route)
  useEffect(() => {
    routeRef.current = route
  }, [route])

  const persist = useCallback(
    (next: MinimizedLevel | null, rollbackTo: MinimizedLevel | null) => {
      const routeAtCall = route
      ;(async () => {
        try {
          const res = await fetch('/api/overzicht/page-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route: routeAtCall, level: next }),
          })
          if (!res.ok && routeRef.current === routeAtCall) setLevel(rollbackTo)
        } catch {
          if (routeRef.current === routeAtCall) setLevel(rollbackTo)
        }
      })()
    },
    [route],
  )

  const minimize = useCallback(() => {
    if (hoogsteErnst == null) return
    const prev = levelRef.current
    const next = katernMinimizeLevel(hoogsteErnst)
    // Pure setState, side-effect erbuiten: geen dubbele PUT onder StrictMode.
    setLevel(next)
    persist(next, prev)
  }, [hoogsteErnst, persist])

  const restore = useCallback(() => {
    const prev = levelRef.current
    setLevel(null)
    persist(null, prev)
  }, [persist])

  return { display: resolveKaternMeldingDisplay(hoogsteErnst, level), minimize, restore }
}
