'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { usePageStatus, type PageStatusSeedData } from '@/lib/hooks/use-page-status'
import {
  resolveBannerDisplay,
  type BannerDisplay,
  type MinimizedLevel,
} from '@/lib/page-status/display'
import type { PageStatusInfo } from '@/lib/page-status/types'

/**
 * PageStatusProvider — deelt de status-duiding van de huidige /overzicht-route
 * tussen de bovenaan-gemounte `PageStatusBanner` en de per-pagina
 * `PageStatusDot` (naast de pagina-'i'), zodat er EXACT ÉÉN fetch per route
 * loopt (via usePageStatus). De provider houdt de optimistische lokale
 * "geminimaliseerd"-state vast en bepaalt of de banner expanded of geminimaliseerd
 * (dot) getoond wordt.
 *
 * minimize()/restore() schrijven de keuze fire-and-forget naar de server
 * (`PUT /api/overzicht/page-status`) en rollen lokaal terug bij een fout, zodat
 * de UI direct reageert maar consistent blijft met de opgeslagen voorkeur.
 *
 * SERVER-SEED (dedup): een server-pagina die de databron toch al SSR-laadt (bv.
 * /overzicht met loadDashboardData) berekent de status server-side
 * (`computePageStatusInfo`) en registreert die via een `<PageStatusSeed>`. Die
 * seed laat `usePageStatus` de overbodige eerste client-fetch ná hydration
 * overslaan (−queries + −1 λ per bezoek), terwijl de API-route blijft bestaan
 * voor client-side her-fetches bij route-wissel. De provider blijft daarmee het
 * ENIGE fetch-pad; de seed is enkel een server-side voorsprong, geen tweede pad.
 */

interface PageStatusContextValue {
  /** De status-duiding van de huidige route (of null als er geen banner is). */
  info: PageStatusInfo | null
  /** 'expanded' = banner bovenaan · 'minimized' = dot naast de 'i' · 'none' = geen banner. */
  display: BannerDisplay | 'none'
  /** Banner inklappen tot de dot (onthoudt het huidige status-niveau). */
  minimize: () => void
  /** Banner weer uitklappen (wist de voorkeur). */
  restore: () => void
}

const NULL_CONTEXT: PageStatusContextValue = {
  info: null,
  display: 'none',
  minimize: () => {},
  restore: () => {},
}

const PageStatusContext = createContext<PageStatusContextValue | null>(null)

/**
 * Kanaal waarmee een descendant `<PageStatusSeed>` de server-berekende initiële
 * status bij de provider registreert. Bewust apart van `PageStatusContext` zodat
 * de pure consumers (banner/dot) hun contract ongewijzigd houden.
 */
const PageStatusSeedContext = createContext<
  ((seed: PageStatusSeedData) => void) | null
>(null)

/** Trailing slash strippen vóór lookup (behoud "/" als enige teken). */
function normalizeRoute(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
}

/**
 * Veilig buiten de provider: geeft een null-ish default terug zodat een
 * `PageStatusDot` die per ongeluk zonder provider mount niet crasht (rendert
 * dan simpelweg niets via display === 'none').
 */
export function usePageStatusContext(): PageStatusContextValue {
  return useContext(PageStatusContext) ?? NULL_CONTEXT
}

export function PageStatusProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const route = normalizeRoute(pathname)

  // Server-side seed (van een pagina die de status al berekende). Een descendant
  // <PageStatusSeed> zet 'm hier in zijn mount-effect — dat vuurt vóór het
  // fetch-effect van deze provider (React draait child-effects vóór
  // parent-effects), zodat usePageStatus de seed kan consumeren en de overbodige
  // eerste client-fetch overslaat. De ref is stabiel; hij triggert geen re-fetch.
  const seedRef = useRef<PageStatusSeedData | null>(null)
  const registerInitialStatus = useCallback((seed: PageStatusSeedData) => {
    seedRef.current = seed
  }, [])

  const { info, minimized: fetchedMinimized } = usePageStatus(route, seedRef)

  // Optimistische lokale state, geseed uit de fetch. Sync mee zodra de fetch
  // (of een route-wissel) een nieuwe serverwaarde levert.
  const [minimizedLevel, setMinimizedLevel] = useState<MinimizedLevel | null>(
    fetchedMinimized,
  )
  useEffect(() => {
    setMinimizedLevel(fetchedMinimized)
  }, [fetchedMinimized])

  // Ref die ALTIJD de huidige route vasthoudt. De persist-rollback vergelijkt
  // de route-bij-aanroep hiertegen, zodat een mislukte PUT die binnenkomt nádat
  // de gebruiker naar een andere route navigeerde, de nieuwe-route-state niet
  // terugzet (mirror van de `cancelled`/route-compare in use-page-status.ts).
  const routeRef = useRef(route)
  useEffect(() => {
    routeRef.current = route
  }, [route])

  const persist = useCallback(
    (level: MinimizedLevel | null, rollbackTo: MinimizedLevel | null) => {
      // Route bij aanroep vastleggen; alleen terugrollen als we daar nog zijn.
      const routeAtCall = route
      // Fire-and-forget; bij fout terugrollen naar de vorige waarde.
      ;(async () => {
        try {
          const res = await fetch('/api/overzicht/page-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route, level }),
          })
          if (!res.ok && routeRef.current === routeAtCall) {
            setMinimizedLevel(rollbackTo)
          }
        } catch {
          if (routeRef.current === routeAtCall) setMinimizedLevel(rollbackTo)
        }
      })()
    },
    [route],
  )

  const minimize = useCallback(() => {
    if (!info) return
    // Leverage-banner minimaliseert op z'n stoplicht-niveau (warn/bad, escaleert);
    // de informatieve vrijheidsbanner op een vast 'info'-niveau (escaleert nooit).
    const level: MinimizedLevel | null =
      info.kind === 'freedom'
        ? 'info'
        : info.status === 'warn' || info.status === 'bad'
          ? info.status
          : null
    if (level == null) return
    const prev = minimizedLevel
    // Pure updater + side-effect (persist) ERBUITEN, zodat een dubbele
    // StrictMode-invocatie van de updater niet leidt tot een dubbele PUT.
    setMinimizedLevel(level)
    persist(level, prev)
  }, [info, minimizedLevel, persist])

  const restore = useCallback(() => {
    const prev = minimizedLevel
    setMinimizedLevel(null)
    persist(null, prev)
  }, [minimizedLevel, persist])

  const display: BannerDisplay | 'none' = info
    ? resolveBannerDisplay(info.status, minimizedLevel)
    : 'none'

  const value = useMemo<PageStatusContextValue>(
    () => ({ info, display, minimize, restore }),
    [info, display, minimize, restore],
  )

  return (
    <PageStatusContext.Provider value={value}>
      <PageStatusSeedContext.Provider value={registerInitialStatus}>
        {children}
      </PageStatusSeedContext.Provider>
    </PageStatusContext.Provider>
  )
}

/**
 * PageStatusSeed — onzichtbaar (`null`-renderend) component dat een server-pagina
 * inside de provider rendert om de reeds SERVER-BEREKENDE status-duiding
 * (`computePageStatusInfo` + `readMinimizedLevel`) mee te geven. De provider
 * consumeert die seed zodat de eerste client-fetch ná hydration vervalt.
 *
 * Timing: de registratie loopt in een mount-effect, dat gegarandeerd vóór het
 * fetch-effect van de (voorouder-)provider vuurt — React draait child-effects
 * vóór parent-effects. Registreert uitsluitend voor de eigen route; een
 * mismatch of ontbrekende seed laat de provider gewoon fetchen.
 */
export function PageStatusSeed({ route, info, minimized }: PageStatusSeedData) {
  const registerInitialStatus = useContext(PageStatusSeedContext)
  const normRoute = normalizeRoute(route)

  useEffect(() => {
    registerInitialStatus?.({ route: normRoute, info, minimized })
  }, [registerInitialStatus, normRoute, info, minimized])

  return null
}
