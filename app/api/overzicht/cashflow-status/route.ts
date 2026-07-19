import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { buildCashflowCards } from '@/lib/cashflow-cards'
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
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const perspective = await getServerPerspective()
    const [dashboardResult, cashflow, vasteLasten] = await Promise.all([
      loadDashboardData(supabase),
      loadCashflowData(supabase, perspective),
      loadVasteLastenSummary(supabase),
    ])
    const cards = buildCashflowCards(dashboardResult.dashboardData, cashflow, vasteLasten)

    const byKey = (k: string): LeverageStatus =>
      cards.find((c) => c.key === k)?.status ?? 'neutral'

    return NextResponse.json({
      budget: byKey('budget'),
      transacties: byKey('transacties'),
      vasteLasten: byKey('vaste-lasten'),
      forecast: byKey('forecast'),
    })
  } catch (err) {
    console.error('[/api/overzicht/cashflow-status]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
