// lib/page-status/compute.ts
//
// Gedeelde SERVER-berekening van de status-duiding voor één /overzicht-route,
// plus de route-familie-mapping en de per-gebruiker "geminimaliseerd"-lezing.
//
// Bestaansreden (deduplicatie): ZOWEL de client-refetch-route
// (`app/api/overzicht/page-status`) ALS een server-pagina die de banner al
// server-side kan seeden, moeten EXACT dezelfde status berekenen — één bron,
// geen drift. De API-route blijft bestaan voor client-side her-fetches
// (route-wissel binnen /overzicht); een pagina die de databron toch al laadt
// (bv. /overzicht met `loadDashboardData`) roept `computePageStatusInfo`
// server-side aan en geeft het resultaat als seed mee aan de PageStatusProvider,
// zodat de overbodige eerste client-fetch ná hydration vervalt (−queries, −1 λ).
//
// "Consume, don't recompute": deze functie laadt route-scoped ALLEEN de
// databron die de gevraagde familie nodig heeft (identiek aan de oude
// inline-logica van de API-route) en mapt via de pure `resolvePageStatusMap` /
// `resolveFreedomBanner` — geen eigen drempels, geen herberekening.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildCashflowCards } from '@/lib/cashflow-cards'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { resolvePageStatusMap } from '@/lib/page-status/resolve'
import { resolveFreedomBanner } from '@/lib/page-status/freedom'
import type { PageStatusInfo } from '@/lib/page-status/types'
import type { MinimizedLevel } from '@/lib/page-status/display'

/** Welke databron(nen) een in-scope route nodig heeft. */
export type Family = 'lever' | 'cashflow' | 'box2' | 'freedom'

/**
 * Route → databron-familie voor alle in-scope /overzicht-pagina's. Bepaalt welke
 * (soms zware) loader `computePageStatusInfo` route-scoped aanroept:
 *  - 'freedom' (root /overzicht) → loadDashboardData (informatieve vrijheidsduiding).
 *  - 'lever'  (hefbomen + Box 1/3) → loadLeverScores (lichte, gedeelde SSoT).
 *  - 'cashflow' (budget/transacties/vaste-lasten/forecast) → dashboard + cashflow + vaste lasten.
 *  - 'box2' → hasBox2Relevance (één ja/nee-gate).
 * Niet-cashflow-/niet-freedom-routes raken de zware dashboard-loader dus NOOIT aan.
 */
export const ROUTE_FAMILY: Record<string, Family> = {
  // Root /overzicht: de informatieve "je bent vrij / met pensioen"-duiding.
  '/overzicht': 'freedom',
  '/overzicht/bezittingen': 'lever',
  '/overzicht/schulden': 'lever',
  '/overzicht/cashflow': 'lever',
  '/overzicht/belasting': 'lever',
  '/overzicht/belasting/box1': 'lever',
  '/overzicht/belasting/box3': 'lever',
  '/overzicht/cashflow/budget': 'cashflow',
  '/overzicht/cashflow/transacties': 'cashflow',
  '/overzicht/cashflow/vaste-lasten': 'cashflow',
  '/overzicht/cashflow/forecast': 'cashflow',
  '/overzicht/belasting/box2': 'box2',
}

/**
 * Gedeelde in-scope-allowlist voor de API-route (GET én PUT) én de server-seed:
 * normaliseert een pad (trailing slash strippen) en geeft het terug ALLEEN als
 * het in ROUTE_FAMILY zit — anders null. Eén bron van waarheid.
 */
export function normalizePageStatusRoute(raw: string | null): string | null {
  if (!raw) return null
  // Trailing slash strippen (behalve de root "/"); leeg → niets.
  const trimmed = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw
  return trimmed in ROUTE_FAMILY ? trimmed : null
}

/** Smalt een onbekende jsonb-waarde tot een geldig minimized-niveau (of null). */
export function asMinimizedLevel(value: unknown): MinimizedLevel | null {
  return value === 'warn' || value === 'bad' || value === 'info' ? value : null
}

/**
 * Leest `profiles.status_banner_minimized` van de EIGEN profielrij (RLS-scoped,
 * anon-client) en geeft het opgeslagen niveau voor één route terug, of null.
 * Lichte single-row select; bewust geen service-role.
 */
export async function readMinimizedLevel(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<MinimizedLevel | null> {
  const { data } = await supabase
    .from('profiles')
    .select('status_banner_minimized')
    .eq('id', userId)
    .single()

  const map = (data?.status_banner_minimized ?? {}) as Record<string, unknown>
  return asMinimizedLevel(map[route])
}

/**
 * Bereken de PageStatusInfo voor één in-scope route. Laadt route-scoped ALLEEN de
 * databron die de familie nodig heeft en geeft `null` terug voor
 * good/neutral/buiten-scope (dan is er geen banner). Perspectief-bewust via
 * `getServerPerspective()` (dezelfde cookie als de pagina).
 *
 * Identiek aan de voormalige inline `computeInfo()` uit de API-route — die route
 * roept deze functie nu aan voor client-side her-fetches, terwijl een pagina die
 * de databron toch al laadt hem server-side aanroept om de banner te seeden. Op
 * die pagina is de aanroep vrijwel gratis: de zware loaders zijn React-`cache()`-
 * gewrapt en draaien binnen hetzelfde request maar één keer.
 */
export async function computePageStatusInfo(
  supabase: SupabaseClient,
  route: string,
): Promise<PageStatusInfo | null> {
  const family = ROUTE_FAMILY[route]
  if (!family) return null

  if (family === 'freedom') {
    // Root /overzicht — informatieve vrijheids-/pensioenduiding. CONSUMEERT de
    // reeds-berekende kerngetallen uit de dashboard-loader (geen eigen
    // rekenmotor): freedomPct (canoniek), currentAge, fireAge en de gekozen
    // strategie. resolveFreedomBanner geeft null wanneer nog niet vrij.
    const { dashboardData } = await loadDashboardData(supabase)
    return resolveFreedomBanner({
      freedomPct: dashboardData.freedomPct ?? null,
      currentAge: dashboardData.currentAge ?? null,
      fireAge:
        dashboardData.fireAgeFractional != null
          ? Math.round(dashboardData.fireAgeFractional)
          : null,
      strategy: dashboardData.fireEndStrategy,
    })
  }

  if (family === 'lever') {
    // Hefbomen + Box 1/3 — één lichte set queries, GEEN dashboard-load.
    const perspective = await getServerPerspective()
    const levers = await loadLeverScores(supabase, perspective)
    return resolvePageStatusMap({ levers })[route] ?? null
  }

  if (family === 'cashflow') {
    // Cashflow-subkaarten — dezelfde loaders als de cashflow-landingspagina.
    const perspective = await getServerPerspective()
    const [dashboardResult, cashflow, vasteLasten] = await Promise.all([
      loadDashboardData(supabase),
      loadCashflowData(supabase, perspective),
      loadVasteLastenSummary(supabase),
    ])
    const cashflowCards = buildCashflowCards(
      dashboardResult.dashboardData,
      cashflow,
      vasteLasten,
    )
    return resolvePageStatusMap({ cashflowCards })[route] ?? null
  }

  // box2 — alleen de ja/nee-gate.
  const user = await getCachedUser(supabase)
  if (!user) return null
  const box2Relevant = await hasBox2Relevance(supabase, user.id)
  return resolvePageStatusMap({ box2Relevant })[route] ?? null
}
