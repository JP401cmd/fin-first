import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { InflationImpactCard } from '@/components/overview/inflation-impact-card'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { Kicker } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * De duidingen die van de opgeheven cashflow-hub (ADR 0135) naar de
 * transactiepagina verhuisden.
 *
 * DE VERSHEIDSMELDING STAAT HIER NIET MEER (UR3-22). Ze zat hier als een eigen
 * server-child die zélf `loadCashflowKpis` draaide, het versheidsoordeel velde
 * en de voorkeur uitlas — en die daarbij bewust géén terughaalpunt plaatste
 * ("terughalen doe je op /overzicht"). Gevolg: één keer inklappen doofde de
 * melding op déze pagina definitief. Sinds UR3-22 levert `StaleDataGuard` in
 * `page.tsx` de melding én het punt in één keer; deze module houdt alleen nog
 * de inflatiekaart over.
 */

/**
 * Inflatie-impact ("Koopkracht") — onder de analyse.
 *
 * Hangt aan `cashflow.baselineExpenses`, de gemeten uitgaven. De drempel
 * (>= €500), de `HideInSimple` en de kicker zijn byte-identiek meeverhuisd; aan
 * het gedrag verandert niets.
 *
 * Dit blok is de enige reden dat deze route `loadCashflowData` nog aanraakt —
 * voor één scalar. Bewuste keuze van de eigenaar: het staat achter een eigen
 * `<Suspense>` onderaan de pagina, dus het houdt de analyse niet op.
 */
export async function TransactiesKoopkrachtKaart({ perspective }: { perspective: Perspective }) {
  const supabase = await createClient()
  const cashflow = await loadCashflowData(supabase, perspective)

  if (cashflow.baselineExpenses < 500) return null

  return (
    <HideInSimple>
      <section>
        <Kicker size="small" className="mb-2">
          Koopkracht
        </Kicker>
        <InflationImpactCard monthlyExpenses={cashflow.baselineExpenses} />
      </section>
    </HideInSimple>
  )
}
