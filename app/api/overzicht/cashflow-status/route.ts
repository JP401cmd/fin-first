import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { buildCashflowCards, type CashflowCardStatuses } from '@/lib/cashflow-cards'
import { unauthorized, serverError } from '@/lib/api/respond'
import {
  cashflowStatusCacheKey,
  readCashflowStatusCache,
  writeCashflowStatusCache,
} from '@/lib/cashflow-status-cache'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * GET /api/overzicht/cashflow-status
 *
 * Levert de vier cashflow-kaartstatussen (Budget, Transacties, Vaste lasten,
 * Forecast) als `LeverageStatus`, voor de sidebar-status-dots onder Cashflow.
 *
 * SINGLE SOURCE: dit endpoint roept EXACT dezelfde loaders + `buildCashflowCards`
 * aan als de cashflow-landingspagina (app/(app)/overzicht/cashflow/page.tsx) en
 * geeft per kaart `{key, status}` terug. Daardoor toont de sidebar-dot
 * gegarandeerd dezelfde status als de kaart — geen herberekening, geen drift.
 *
 * Perspectief-bewust via `getServerPerspective()` (dezelfde cookie als de
 * pagina), zodat de statussen ook in huishouden-/partner-weergave kloppen.
 *
 * Egress: deze route is bewust LAZY — de bijbehorende client-hook fetcht hem
 * alleen op /overzicht/cashflow*-routes (zie use-cashflow-card-statuses.ts), niet
 * op elke pagina. De zware loaders (~25 + 6m + 12m queries) blijven zo van de
 * globale layout af.
 *
 * TTL-cache (lib/cashflow-status-cache.ts): bovenop die lazy-gating vouwt een
 * korte per-gebruiker+perspectief-cache herhaalde bezoeken samen. De pagina heeft
 * ditzelfde werk net server-side gedaan, maar React `cache()` overleeft geen
 * request-grens — zonder cache betaalt élke hydratie de volle loader-prijs
 * opnieuw. Bij een hit gaan de drie loaders NIET aan. Dat lost het tweede bezoek
 * op, niet het eerste: de eerste hit per gebruiker per TTL blijft even duur.
 * Bewust géén expliciete invalidatie (per-instance Map → schijnzekerheid); een
 * verse mutatie toont maximaal één TTL-venster een verouderde dot.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return unauthorized()
    }

    const perspective = await getServerPerspective()
    const key = cashflowStatusCacheKey(claims.sub, perspective)
    const cached = readCashflowStatusCache(key)
    if (cached.hit) {
      return NextResponse.json(cached.statuses)
    }

    const [dashboardResult, cashflow, vasteLasten] = await Promise.all([
      loadDashboardData(supabase),
      loadCashflowData(supabase, perspective),
      loadVasteLastenSummary(supabase),
    ])
    const cards = buildCashflowCards(dashboardResult.dashboardData, cashflow, vasteLasten)

    const byKey = (k: string): LeverageStatus =>
      cards.find((c) => c.key === k)?.status ?? 'neutral'

    const statuses: CashflowCardStatuses = {
      budget: byKey('budget'),
      transacties: byKey('transacties'),
      vasteLasten: byKey('vaste-lasten'),
      forecast: byKey('forecast'),
    }
    writeCashflowStatusCache(key, statuses)

    return NextResponse.json(statuses)
  } catch (err) {
    return serverError(err, 'cashflow-status:GET')
  }
}
