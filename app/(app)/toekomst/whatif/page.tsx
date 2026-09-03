import { createClient } from '@/lib/supabase/server'
import { resolveFireAssumptions, type FireAssumptionRow } from '@/lib/fire-assumptions'
import WhatIfPageClient from '../../horizon/whatif/whatif-page-client'

/**
 * /toekomst/whatif — de volledige what-if-ervaring (dream-gate-bestemming).
 *
 * Deze pagina RENDERT alleen nog; de vertakking zit op de routing-laag:
 *  - zonder `?via=dreamgate` redirect `next.config.ts#redirects` naar
 *    `/toekomst?whatif=open`, waar de inline wat-als-sliders openen;
 *  - mét `?via=dreamgate` valt die regel niet aan (`missing`) en komt de
 *    request hier terecht.
 *
 * Waarom niet meer met `redirect()` in de render (UR2-11, 31 aug 2026): een
 * server-component die bij render meteen redirect duwt de client-router het
 * harde-navigatie-pad in (`pushRef.mpaNavigation`) — de gedocumenteerde bron
 * van "Minified React error #310" en de transiënte HTTP 500 die de UAT hier
 * zag. Dezelfde behandeling als /core/cash, /horizon/whatif, /horizon/strategie
 * en /toekomst/strategie eerder kregen; zie het redirect-blok in
 * `next.config.ts` en de bewaking in `next.config.test.ts`.
 */

/**
 * De beheerde jaarlaag `fire_assumptions.volatility` (ADR 0117) — server-side
 * geresolveerd en als prop doorgegeven, exact zoals /toekomst 'm via
 * `HorizonRawData.marktVolatiliteit` uit de horizon-loader krijgt. De what-if-
 * client laadt zijn overige data zelf, maar déze waarde hoort niet uit een
 * extra client-read te komen (ADR 0058: lezen via de server): de caller queryt,
 * `resolveFireAssumptions` consumeert — dezelfde scheiding als in
 * `lib/horizon/raw-data-loader.ts`. Elke fout → de TS-default, nooit een
 * geblokkeerde pagina; de kernel valt dan op `DEFAULT_VOLATILITY` terug.
 *
 * Zonder dit veld toonde de "Onzekerheid"-band hier een ándere breedte dan de
 * "Marktcheck"-band op /toekomst zodra beheer de jaarlaag wijzigde.
 */
async function loadMarktVolatiliteit(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true })
    return resolveFireAssumptions((data ?? []) as FireAssumptionRow[]).volatility
  } catch {
    return resolveFireAssumptions(null).volatility
  }
}

export default async function ToekomstWhatIfPage() {
  const marktVolatiliteit = await loadMarktVolatiliteit()
  return <WhatIfPageClient marktVolatiliteit={marktVolatiliteit} />
}
