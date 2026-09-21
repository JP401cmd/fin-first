// ── Regelbronnen: waar de volledige tekst wordt opgehaald om te duiden ───────
//
// De RSS-teaser (gemiddeld 228 tekens) noemt zelden het getal dat een regel
// verandert. Voor bronnen die regels PUBLICEREN haalt de duidingsstap daarom
// de volledige paginatekst op (via `fetchWebContent`, max 8.000 tekens). Voor
// alle andere bronnen volstaat de teaser: een marktbericht van een krant heeft
// zijn cijfer meestal in de kop.
//
// De tekst wordt gebruikt om te duiden en NIET bewaard (keuze 4, 21 sep 2026):
// de citaten in `duiding.grond` zijn het bewijs. Dat beperkt de auteursrecht-
// vraag (U5) tot korte fragmenten.
//
// Domeinen matchen op hostnaam inclusief subdomeinen (www.belastingdienst.nl,
// download.belastingdienst.nl). Een synthetische URL van een web-item
// (`ensureUniqueArticleUrl`) wijst naar de themapagina, niet naar het item —
// daarvoor is de in-memory paginatekst van dezelfde run de betere bron; de
// ingest geeft die vóór.

export const REGELBRON_DOMEINEN = [
  'rijksoverheid.nl',
  'rijksfinancien.nl',
  'belastingdienst.nl',
  'toeslagen.nl',
  'duo.nl',
  'svb.nl',
  'uwv.nl',
  'officielebekendmakingen.nl',
] as const

/**
 * Alleen https op de standaardpoort: een feed die `http://duo.nl:8443/…`
 * aanlevert krijgt geen fetch. De hostnaam moet het domein zijn of een
 * subdomein ervan; lookalikes (`rijksoverheid.nl.evil.example`) vallen af.
 */
export function isRegelbron(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.port !== '') return false
  const host = parsed.hostname.toLowerCase()
  return REGELBRON_DOMEINEN.some((domein) => host === domein || host.endsWith(`.${domein}`))
}
