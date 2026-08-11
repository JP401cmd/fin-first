// lib/holdings-staleness.ts
// ---------------------------------------------------------------------------
// Wanneer is een koers "verouderd"? ÉÉN antwoord, voor élk oppervlak.
//
// DE AANLEIDING — twee schermen spraken elkaar tegen. Op hetzelfde account, op
// hetzelfde moment, zei de zijbalk "Koersen actueel" (0) terwijl de banner op de
// holdings-pagina "Prijzen verouderd" (1) meldde. Beide klopten volgens hun
// eigen definitie, en die verschilden op drie punten:
//
//   • de grens: 24 uur (banner) tegenover 7 dagen (zijbalk);
//   • nooit bijgewerkt: telde als verouderd (banner), maar was onzichtbaar voor
//     de zijbalk — `.lt(kolom, grens)` op NULL levert NULL, dus geen match;
//   • gesloten posities: uitgesloten (banner) tegenover meegeteld (zijbalk).
//
// Voor een app waarvan het hele punt is dat een getal op twee schermen hetzelfde
// betekent, is dat geen schoonheidsfoutje. Dit bestand is de enige plek waar de
// vraag beantwoord wordt.
//
// DE TWEEDE FOUT — de grens zelf. Een vaste 24-uursgrens betekent dat maandag-
// ochtend élke positie "verouderd" is: de beurzen waren het weekend dicht, dus
// de jongste slotkoers is per definitie van vrijdag. Een melding die elke maandag
// afgaat, leert de gebruiker haar te negeren — en dan werkt ze ook niet meer op
// de dag dat er écht iets mis is. Daarom telt deze module HANDELSDAGEN
// (maandag t/m vrijdag) in plaats van klokuren.
//
// BEWUST GEEN BEURSKALENDER. Feestdagen worden niet meegenomen: die vergen een
// kalender per beurs, die onderhouden moet worden en stil verkeerd gaat zodra
// hij achterloopt. Op tweede kerstdag meldt de app dus "verouderd" terwijl er
// niets te halen viel. Dat is een bekende, zeldzame en onschadelijke
// vals-positief — het weekend was de structurele.
// ---------------------------------------------------------------------------

/**
 * Hoeveel handelsdagen een koers oud mag zijn voordat hij verouderd heet.
 *
 * 1 = "er is een hele handelsdag voorbijgegaan zonder nieuwe koers". De
 * dagelijkse cron draait om 18:00 UTC (zie `vercel.json`), dus onder normale
 * omstandigheden is elke koers hooguit één handelsdag oud.
 */
export const STALE_AFTER_TRADING_DAYS = 1

/** Zelfde EPSILON als de aggregatie-engine: ~0 stuks telt als gesloten. */
export const CLOSED_UNITS_EPSILON = 1e-9

/**
 * Zaterdag of zondag — IN UTC.
 *
 * Bewust niet in lokale tijd. Deze regel draait op twee plekken: server-side in
 * de app-layout (Vercel = UTC) en in de browser (in NL = UTC+1/+2). Met lokale
 * tijd bepaalt de kalenderdag van de dráaiplek hoeveel dagen worden overgeslagen,
 * en dan lopen de twee rond een weekendgrens een hele dag uiteen — zondag 23:30
 * UTC is voor de server nog zondag en voor de browser al maandag, wat een cutoff
 * van vrijdag tegenover donderdag oplevert. Precies de tegenspraak die deze
 * module opheft, zou dan via de achterdeur terugkomen. De handelsdag-grens is
 * daarom een UTC-grens.
 */
function isWeekendUtc(d: Date): boolean {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/**
 * Het moment waarvóór een koers als verouderd geldt.
 *
 * Loopt `tradingDays` handelsdagen terug vanaf `now` en slaat weekenddagen
 * daarbij over. Maandag 09:00 met één handelsdag levert vrijdag 09:00 op — een
 * koers van vrijdagmiddag is dan dus NIET verouderd, wat klopt: er is sindsdien
 * geen handelsdag afgesloten.
 *
 * Geëxporteerd omdat de server-kant hem als querygrens gebruikt en de
 * client-kant als vergelijkingspunt: hetzelfde getal, één berekening.
 */
export function stalenessCutoff(
  now: Date = new Date(),
  tradingDays: number = STALE_AFTER_TRADING_DAYS,
): Date {
  // De invoer klemmen, niet de lus. Een lus-guard maakt de functie wel eindig
  // maar geeft dan een cutoff terug die NIET het gevraagde aantal handelsdagen
  // terugligt — hij zou stil iets anders betekenen dan zijn eigen documentatie.
  // 260 handelsdagen ≈ een jaar; ruim boven elke zinnige drempel.
  const days = Math.min(Math.max(0, Math.floor(tradingDays)), 260)
  const cutoff = new Date(now.getTime())
  for (let remaining = days; remaining > 0; ) {
    cutoff.setUTCDate(cutoff.getUTCDate() - 1)
    if (!isWeekendUtc(cutoff)) remaining--
  }
  return cutoff
}

/** De velden waarop het oordeel rust. Superset-veilig. */
export interface StalenessRow {
  units?: number | string | null
  ticker?: string | null
  isin?: string | null
  last_price_update?: string | null
  /**
   * Server-afgeleide engine-vlag; wint van `units` wanneer aanwezig.
   *
   * LET OP — deze vlag is géén kolom: hij komt uit `attachPnLToHoldings` en
   * bestaat dus alleen op oppervlakken die de P&L-verrijking laden (de
   * holdings-pagina). De zijbalk leest de rijen rechtstreeks en valt daarom
   * altijd terug op `units`. Zolang kolom en transactiehistorie het eens zijn
   * maakt dat niets uit; lopen ze uiteen (deelimport, handmatige correctie),
   * dan oordeelt de pagina op de engine en de zijbalk op de kolom. Bewuste,
   * benoemde beperking — de kolom is daar de enige beschikbare waarheid.
   */
  pnl_is_closed?: boolean | null
  /**
   * Crypto: een fiat-saldo (EUR/USD op een exchange). Draagt wél een `symbol`,
   * maar heeft geen koersbron — élk koerspad slaat zo'n rij over.
   */
  is_fiat_balance?: boolean | null
}

/**
 * Of dit een gesloten positie is. Prefereert de engine-vlag `pnl_is_closed`
 * (afgeleid uit de transactiehistorie) en valt terug op de `units`-kolom, zodat
 * de regel ook geldt op oppervlakken die de verrijking niet laden.
 *
 * Deze functie is de enige implementatie; `isClosedHolding` in
 * `components/core/holdings/holdings-list-view.ts` delegeert hierheen.
 */
export function isClosedPosition(row: StalenessRow): boolean {
  if (typeof row.pnl_is_closed === 'boolean') return row.pnl_is_closed
  const units = typeof row.units === 'string' ? Number(row.units) : (row.units ?? 0)
  return !Number.isFinite(units) || Math.abs(units as number) <= CLOSED_UNITS_EPSILON
}

/**
 * Of de koers van deze positie verouderd is.
 *
 * Drie regels, in volgorde:
 *   1. Een GESLOTEN positie is nooit verouderd. Niet omdat haar prijs vers is,
 *      maar omdat er niets te vernieuwen valt: `refresh-prices` slaat posities
 *      met 0 stuks bewust over. Zou je ze meetellen, dan meldt de app een
 *      aantal dat door vernieuwen niet kán dalen — precies wat er gebeurde
 *      (96 gemeld, 1 daadwerkelijk te verhelpen).
 *   2. Zonder ticker én zonder ISIN is er geen koersbron: die positie beheer je
 *      met de hand en kan per definitie niet verouderen.
 *   3. Anders: nooit bijgewerkt telt als verouderd, en verder beslist de
 *      handelsdag-grens.
 */
export function isPriceStale(row: StalenessRow, now: Date = new Date()): boolean {
  // Een fiat-saldo op een exchange (EUR/USD) draagt wél een symbool maar heeft
  // geen koers om te verversen: alle drie de koerspaden slaan zo'n rij expliciet
  // over ("Fiat balance — geen prijsverversing"). Meetellen levert dus een
  // stipje op dat door verversen niet kán doven — hetzelfde patroon als bij de
  // gesloten posities, en de reden dat deze check vóór de rest staat.
  if (row.is_fiat_balance) return false
  if (isClosedPosition(row)) return false
  if (!row.ticker && !row.isin) return false
  if (!row.last_price_update) return true

  const updated = new Date(row.last_price_update)
  if (Number.isNaN(updated.getTime())) return true
  return updated.getTime() < stalenessCutoff(now).getTime()
}

/** Aantal posities met een verouderde koers. */
export function countStalePrices(
  rows: readonly StalenessRow[],
  now: Date = new Date(),
): number {
  return rows.reduce((n, row) => (isPriceStale(row, now) ? n + 1 : n), 0)
}
