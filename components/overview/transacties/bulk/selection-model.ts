/**
 * De selectie-statemachine van transactie-bulkbewerken.
 *
 * ── Waarom dit een eigen, pure module is ────────────────────────────────────
 * Dit is het hart van de functionaliteit én de plek waar het in de praktijk
 * misgaat. Shopify Polaris heeft een openstaande bug waarin de kopcheckbox
 * stilzwijgend álles pakt in plaats van de zichtbare pagina; bij een
 * onherroepelijke bulk-verwijdering (besluit B1: hard delete, geen prullenbak)
 * is dat geen schoonheidsfoutje maar dataverlies. Door de regels hier — zonder
 * React, zonder DOM — vast te leggen, is "de kop pakt nooit meer dan de pagina"
 * een getoetste eigenschap in plaats van een gewoonte in een render-functie.
 *
 * ── De twee modi ────────────────────────────────────────────────────────────
 * 1. **Expliciet** (`allMatching: false`): een verzameling id's die de gebruiker
 *    daadwerkelijk heeft aangevinkt. Per definitie al een bevroren id-lijst
 *    (ADR 0104) — deze rijen heeft hij gezien.
 * 2. **Alle treffers** (`allMatching: true`): de gebruiker koos expliciet
 *    "Selecteer alle N gevonden transacties". De id's zitten hier NIET in de
 *    state: die worden pas vlak vóór een actie één keer server-side
 *    gematerialiseerd (het selectiemanifest). De teller leest dan het
 *    treffer-totaal.
 *
 * ── De uitstap uit "alle treffers" ──────────────────────────────────────────
 * Vinkt de gebruiker in modus 2 een rij (of de kop) aan/uit, dan valt hij terug
 * naar modus 1 met de **zichtbare pagina** als vertrekpunt — het model dat
 * Gmail hanteert en dat gebruikers kennen. Dat is bewust: de id's buiten de
 * pagina kent de client niet, dus "alles behalve deze ene" zou een verzameling
 * beloven die hij niet kan opsommen. Beter een kleinere, aanwijsbare selectie
 * dan een grotere die niemand kan controleren. De teller springt daardoor
 * zichtbaar terug, en dat is precies de bedoeling.
 */

export type HeaderCheckboxState = 'empty' | 'indeterminate' | 'full'

export interface BulkSelection {
  /** Expliciet aangevinkte id's. Leeg zolang `allMatching` waar is. */
  readonly ids: ReadonlySet<string>
  /** De gebruiker koos "Selecteer alle N gevonden transacties". */
  readonly allMatching: boolean
  /** Anker voor shift-klik; blijft staan zodat een bereik bij te stellen is. */
  readonly anchorId: string | null
}

export const EMPTY_SELECTION: BulkSelection = {
  ids: new Set<string>(),
  allMatching: false,
  anchorId: null,
}

export function clearSelection(): BulkSelection {
  return EMPTY_SELECTION
}

/**
 * Hoeveel transacties staan er geselecteerd?
 *
 * In "alle treffers"-modus is dat het treffer-totaal uit de zoekrespons — het
 * getal dat ook in de affordance stond die de gebruiker aanklikte.
 */
export function selectionCount(sel: BulkSelection, totalMatches: number): number {
  return sel.allMatching ? totalMatches : sel.ids.size
}

export function isEmptySelection(sel: BulkSelection, totalMatches: number): boolean {
  return selectionCount(sel, totalMatches) === 0
}

export function isRowSelected(sel: BulkSelection, id: string): boolean {
  return sel.allMatching || sel.ids.has(id)
}

/**
 * Stand van de kopcheckbox, **uitsluitend** bepaald door de zichtbare pagina.
 *
 * Dit is de regel die niet mag verschuiven: de kop kijkt nooit naar treffers
 * buiten `pageIds`, en zet er nooit iets buiten `pageIds`.
 */
export function headerState(sel: BulkSelection, pageIds: readonly string[]): HeaderCheckboxState {
  if (pageIds.length === 0) return 'empty'
  if (sel.allMatching) return 'full'
  let hit = 0
  for (const id of pageIds) if (sel.ids.has(id)) hit++
  if (hit === 0) return 'empty'
  return hit === pageIds.length ? 'full' : 'indeterminate'
}

/**
 * Vertrekpunt voor elke rij-interactie: in expliciete modus de bestaande
 * selectie, in "alle treffers"-modus de zichtbare pagina (zie module-docblock).
 */
function baseIds(sel: BulkSelection, pageIds: readonly string[]): Set<string> {
  return sel.allMatching ? new Set(pageIds) : new Set(sel.ids)
}

/** Eén rij aan/uit. Zet het shift-anker op deze rij. */
export function toggleRow(
  sel: BulkSelection,
  id: string,
  pageIds: readonly string[],
): BulkSelection {
  const ids = baseIds(sel, pageIds)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ids, allMatching: false, anchorId: id }
}

/**
 * Kopcheckbox: selecteert of deselecteert **alleen** de rijen op deze pagina.
 *
 * Vol → pagina eraf. Leeg of half → pagina erbij. Id's van andere pagina's
 * blijven staan; de kop is geen "alles"-knop en wordt dat ook nooit.
 */
export function togglePage(sel: BulkSelection, pageIds: readonly string[]): BulkSelection {
  if (pageIds.length === 0) return sel
  const ids = baseIds(sel, pageIds)
  const allOnPage = pageIds.every((id) => ids.has(id))
  for (const id of pageIds) {
    if (allOnPage) ids.delete(id)
    else ids.add(id)
  }
  return { ids, allMatching: false, anchorId: null }
}

/**
 * Shift-klik: aaneengesloten bereik tussen het anker en de aangeklikte rij.
 *
 * Shift-klik **selecteert altijd** — hij haalt nooit rijen uit je selectie. Dat
 * is bewust: op een scherm waar de volgende klik onherroepelijk kan verwijderen
 * mag een modifier-toets geen rijen stilletjes uit beeld halen. Deselecteren
 * blijft per rij, waar je precies ziet wat je uitzet.
 *
 * Het anker blijft staan, zodat een tweede shift-klik vanaf hetzelfde punt
 * verder meet in plaats van een nieuw bereik te beginnen.
 *
 * Zonder geldig anker (of anker buiten deze pagina) valt dit terug op een
 * gewone rij-toggle — nooit stilzwijgend "van boven af".
 */
export function selectRange(
  sel: BulkSelection,
  clickedId: string,
  pageIds: readonly string[],
): BulkSelection {
  const anchor = sel.anchorId
  const from = anchor == null ? -1 : pageIds.indexOf(anchor)
  const to = pageIds.indexOf(clickedId)
  if (from < 0 || to < 0) return toggleRow(sel, clickedId, pageIds)

  const ids = baseIds(sel, pageIds)
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  for (let i = lo; i <= hi; i++) ids.add(pageIds[i])
  return { ids, allMatching: false, anchorId: anchor }
}

/** "Selecteer alle N gevonden transacties" — de aparte, nooit-standaard affordance. */
export function selectAllMatching(): BulkSelection {
  return { ids: new Set<string>(), allMatching: true, anchorId: null }
}

/**
 * Mag de "alle N"-affordance verschijnen?
 *
 * Alleen wanneer de héle pagina geselecteerd is én er méér treffers zijn dan
 * die pagina. Nooit als standaardgedrag van de kopcheckbox (F7/AC3).
 */
export function shouldOfferSelectAll(
  sel: BulkSelection,
  pageIds: readonly string[],
  totalMatches: number,
): boolean {
  if (sel.allMatching) return false
  if (pageIds.length === 0) return false
  return headerState(sel, pageIds) === 'full' && totalMatches > pageIds.length
}
