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
import { usePageStatus } from '@/lib/hooks/use-page-status'
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
 * Veilig buiten de provider: geeft een null-ish default terug zodat een
 * `PageStatusDot` die per ongeluk zonder provider mount niet crasht (rendert
 * dan simpelweg niets via display === 'none').
 */
export function usePageStatusContext(): PageStatusContextValue {
  return useContext(PageStatusContext) ?? NULL_CONTEXT
}

export function PageStatusProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Trailing slash strippen vóór lookup (behoud "/" als enige teken).
  const route =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

  const { info, minimized: fetchedMinimized } = usePageStatus(route)

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
    // Minimaliseren op het HUIDIGE status-niveau; alleen warn/bad zijn geldig
    // (good/neutral leveren geen banner, dus dan is er niets te minimaliseren).
    if (info?.status !== 'warn' && info?.status !== 'bad') return
    const level = info.status
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
      {children}
    </PageStatusContext.Provider>
  )
}
