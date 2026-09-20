import { createClient } from '@/lib/supabase/server'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { vasteLastenVerdict } from '@/lib/cashflow-cards'
import { PageVerdictSuffix } from '@/components/editorial'

/**
 * Het oordeel in de paginatitel van /overzicht/budget/vaste-lasten, als eigen
 * async server-child achter een `<Suspense>` ín de kop.
 *
 * WAAROM APART EN NIET IN page.tsx. Die pagina mag per constructie geen loader
 * aanraken: haar titel is de LCP-kandidaat en moet in de eerste byte staan
 * (perf-taak 2.4 / ADR 0083). `page.streaming.test.ts` bewaakt dat letterlijk —
 * hij faalt zodra `loadCashflowKpis` of `loadVasteLastenSummary` in de
 * paginabron voorkomt. Door het oordeel in dít bestand te laden blijft de kop
 * dataloos en groeit hij van "Vaste lasten" naar "Vaste lasten | 43% van je
 * inkomen" zodra de cijfers er zijn.
 *
 * `createClient()` is React-`cache()`-gewrapt en `loadCashflowKpis`/
 * `loadVasteLastenSummary` draaien op deze route toch al in
 * `VasteLastenLoader` — dit kost dus geen extra queries, alleen een tweede
 * consument van hetzelfde resultaat.
 *
 * Het oordeel zelf komt uit `vasteLastenVerdict`, dezelfde bron die de
 * Vaste-lasten-kaart op /overzicht/budget zijn `subText` geeft.
 */
export async function VasteLastenVerdict() {
  const supabase = await createClient()
  const [kpis, summary] = await Promise.all([
    loadCashflowKpis(supabase),
    loadVasteLastenSummary(supabase),
  ])

  const { status, label } = vasteLastenVerdict({
    totalMonthly: summary.totalMonthly,
    count: summary.count,
    // EFFECTIVE maandinkomen (ADR 0073) — dezelfde noemer die de kaart en
    // `buildVasteLastenInsights` gebruiken. De gerealiseerde maand zou het
    // aandeel vroeg in de maand kunstmatig opblazen.
    monthlyIncome: kpis.monthlyIncome,
  })

  return <PageVerdictSuffix verdict={label} tone={status} />
}
