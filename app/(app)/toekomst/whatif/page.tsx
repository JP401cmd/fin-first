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
export default function ToekomstWhatIfPage() {
  return <WhatIfPageClient />
}
