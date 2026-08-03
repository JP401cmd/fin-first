import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { buildCashflowCards, cashflowCardStatuses } from '@/lib/cashflow-cards'
import { unauthorized, serverError } from '@/lib/api/respond'
import {
  cashflowStatusCacheKey,
  readCashflowStatusCache,
  writeCashflowStatusCache,
} from '@/lib/cashflow-status-cache'

/**
 * GET /api/overzicht/cashflow-status
 *
 * Levert de vier cashflow-kaartstatussen (Budget, Transacties, Vaste lasten,
 * Forecast) als `LeverageStatus`, voor de sidebar-status-dots onder Cashflow.
 *
 * SINGLE SOURCE: dit endpoint roept EXACT dezelfde loaders + `buildCashflowCards`
 * + `cashflowCardStatuses` aan als de cashflow-landingspagina
 * (components/overview/cashflow-cards-loader.tsx). Daardoor toont de sidebar-dot
 * gegarandeerd dezelfde status als de kaart — geen herberekening, geen drift.
 *
 * SLANKE KPI-LAAG (ADR 0077 · perf Task 2.3): de eerste input komt uit
 * `loadCashflowKpis` — de vier `cache()`-gedeelde fetches waar de zeven scalars
 * van `buildCashflowCards` aan hangen — en niet meer uit de volle
 * `loadDashboardData` (~40 queries in 5-6 seriële golven plus een KOUDE
 * horizon-tak van nog eens ~17 queries mét bisectie-solve). Vier statuskleuren
 * kosten daarmee ~10 queries in plaats van ~60. De statussen blijven per
 * constructie identiek: zelfde `buildCashflowCards`, zelfde drie inputs, alleen
 * de eerste uit een slankere loader (pariteit vastgelegd in
 * lib/cashflow-kpis.parity.test.ts).
 *
 * Perspectief-bewust via `getServerPerspective()` (dezelfde cookie als de
 * pagina), zodat de statussen ook in huishouden-/partner-weergave kloppen. Het
 * perspectief stuurt `loadCashflowData`, precies zoals op de pagina;
 * `loadCashflowKpis` is — net als `loadDashboardData` hiervoor — persoonlijk.
 *
 * Egress: deze route is bewust LAZY — hij wordt alleen gefetcht op de
 * /overzicht/cashflow-SUB-routes (zie use-cashflow-card-statuses.ts). Op de HUB
 * valt hij helemaal weg: die pagina berekent de kaarten toch al server-side en
 * seedt de dots via `<CashflowStatusSeed>`.
 *
 * TTL-cache (lib/cashflow-status-cache.ts): bovenop die lazy-gating vouwt een
 * korte per-gebruiker+perspectief-cache herhaalde bezoeken samen — React
 * `cache()` overleeft immers geen request-grens. Bij een hit gaan de drie loaders
 * NIET aan. Bewust géén expliciete invalidatie (per-instance Map →
 * schijnzekerheid); een verse mutatie toont maximaal één TTL-venster een
 * verouderde dot.
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

    const [kpis, cashflow, vasteLasten] = await Promise.all([
      loadCashflowKpis(supabase),
      loadCashflowData(supabase, perspective),
      loadVasteLastenSummary(supabase),
    ])
    const statuses = cashflowCardStatuses(buildCashflowCards(kpis, cashflow, vasteLasten))
    writeCashflowStatusCache(key, statuses)

    return NextResponse.json(statuses)
  } catch (err) {
    return serverError(err, 'cashflow-status:GET')
  }
}
