/**
 * URL-opschoning na een geconsumeerde tijdas-deeplink.
 *
 * `/toekomst` opent panelen/overlays via query-params (`?whatif=open`,
 * `?strategie=open`, `?uitgaven=open`, `?modal=…`, `?event=…`). Het
 * mount-effect in `components/app/horizon/horizon-client.tsx` leest die params,
 * zet de bijbehorende state en poetst ze daarna uit de URL zodat een refresh of
 * een gedeelde link niet nóg een keer hetzelfde paneel opent.
 *
 * WAAROM DIT EEN EIGEN MODULE IS (bug UR2-11, 31 aug 2026). Die opschoning
 * schreef een HARDGECODEERD `/horizon` terug — de legacy-route die op de
 * routing-laag meteen naar `/toekomst` redirect (zie `next.config.ts`). Het
 * gevolg was dat élke deeplink zichzelf ongedaan maakte: de state werd gezet,
 * waarna de router van route wisselde, de boom opnieuw monteerde en de zojuist
 * gezette state (o.a. `whatIfInlineOpen`) weer op de beginwaarde stond. De
 * gebruiker landde op een kale `/toekomst` zonder paneel — precies wat er in
 * UR2-11 gemeld werd voor de Wat-Als-ingang. Bovendien is een client-navigatie
 * náár een redirect-only route de gedocumenteerde trigger achter React #310
 * (het redirect-blok in `next.config.ts`).
 *
 * De regel is daarom: opschonen mag NOOIT van route wisselen. Deze helper
 * bouwt de opgeschoonde URL op het HUIDIGE pad en verwijdert alléén de params
 * die het effect daadwerkelijk consumeert — overige params (bv. `?view=`,
 * `?focus=`) blijven staan. Los getest omdat `horizon-client.tsx` >9000 regels
 * is en niet importeerbaar is in een unit-test.
 */

/**
 * De deeplink-params die het mount-effect van `horizon-client.tsx` consumeert.
 * Alles wat hier NIET in staat, hoort na de opschoning nog in de URL te staan.
 *
 * `via` is de uitzondering die niets opent: een restant van oude bladwijzers
 * (`/toekomst/whatif?via=dreamgate`). De redirect in `next.config.ts` geeft de
 * query door, dus zonder deze regel bleef `via=dreamgate` na het openen van het
 * lab in de URL staan (ADR 0144). Veilig om hier weg te poetsen: op /toekomst
 * leest niets `via` — de enige lezers zijn de bezittingen-/schulden-panes
 * (`?asset=…&via=revalue`), op andere routes.
 *
 * `nieuw` (ADR 0179, addendum 26 sep) is de alias van `event=new`: tot het addendum las
 * de gebeurtenissenlijst in Instellingen hem zelf; sinds de lijst onder het plan staat is
 * er één manier om via een link een gebeurtenis toe te voegen, en die opent de provider.
 */
export const CONSUMED_DEEPLINK_PARAMS = [
  'modal',
  'strategie',
  'uitgaven',
  'event',
  'edit',
  'whatif',
  'via',
  'nieuw',
] as const

/**
 * Bouw de opgeschoonde URL voor `router.replace()` na een geconsumeerde
 * deeplink.
 *
 * @param pathname het huidige pad (`usePathname()`); `null`/leeg valt terug op
 *   `/toekomst` — de canonieke tijdas-route, nooit de legacy `/horizon`.
 * @param search   de huidige query (`useSearchParams()` of een querystring).
 * @param hash     de huidige hash (`window.location.hash`), mét `#`; blijft staan zodat
 *   een anker (`/toekomst?event=new#gebeurtenissen`) klopt na de opschoning.
 * @returns pad + resterende query (+ hash), of het kale pad als er niets overblijft.
 */
export function buildDeeplinkCleanupUrl(
  pathname: string | null | undefined,
  search: URLSearchParams | string,
  hash = '',
): string {
  const rest = new URLSearchParams(typeof search === 'string' ? search : search.toString())
  for (const key of CONSUMED_DEEPLINK_PARAMS) rest.delete(key)
  const qs = rest.toString()
  const base = pathname || '/toekomst'
  return `${qs ? `${base}?${qs}` : base}${hash}`
}
