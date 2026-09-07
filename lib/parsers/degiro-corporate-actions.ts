// lib/parsers/degiro-corporate-actions.ts
// ---------------------------------------------------------------------------
// Splitsingen en conversies in de DEGIRO TRANSACTIE-export (Transactions.csv).
//
// HET PROBLEEM
// De transactie-export heeft GEEN `Actie`-kolom — "Split Aanpassing" bestaat
// alleen in de web-UI. Een splitsing of conversie komt binnen als twee gewone
// regels met een tegengesteld teken in `Aantal`. `parseDegiroRow` classificeert
// puur op dat teken, dus de oude regel werd een `sell` op de dagkoers en de
// nieuwe een `buy` op de dagkoers. Gevolg: een verzonnen gerealiseerd resultaat
// op de oude regel (de opbrengst die je nooit kreeg) en een kostbasis op de
// nieuwe regel die is teruggezet op de dagkoers (de inleg die je nooit deed).
// De AANTALLEN kloppen toevallig wel, dus de fout is stil.
//
// DE SIGNATUUR
// Een corporate action is een PAAR rijen met:
//   - dezelfde datum
//   - leeg Order ID op beide benen
//   - lege Uitvoeringsplaats op beide benen
//   - tegengesteld teken in `Aantal` (een uit-been en een in-been)
//   - `|Waarde EUR|` van beide benen vrijwel gelijk, of beide 0,00
// De ISIN's verschillen doorgaans (reverse split, naamswijziging, conversie van
// een inschrijving), maar hoeven dat niet — een gewone forward split houdt
// dezelfde ISIN.
//
// WAAROM HET PAAR-KENMERK EN NIET HET LEGE ORDER ID
// Een leeg Order ID alleen is niet genoeg. Twee legitieme rijen dragen datzelfde
// kenmerk en moeten ONGEMOEID blijven:
//   - de knock-out/expiratie van een turbo of sprinter: een LOSSE negatieve rij
//     op koers 0,00. Dat is een echte sluiting op nul en moet `sell` @ EUR 0
//     blijven — anders verdwijnt een reeel verlies uit de boeken.
//   - stockdividend/bonusaandelen: een LOSSE positieve rij op koers 0,00.
//     Blijft `buy` @ EUR 0.
// Beide zijn ongepaard. Een ongepaarde rij blijft daarom altijd wat hij is.
//
// HET GEDRAG
// De oude regel sluit ZONDER opbrengst en ZONDER gerealiseerd resultaat
// (`transfer_out`); de nieuwe regel opent MET de meegenomen kostbasis
// (`transfer_in`). Die kostbasis wordt afgeleid met de CANONIEKE engine
// (`computePositionFromTransactions`) over de eerdere rijen van de oude regel —
// geen tweede average-cost-lus (consume, don't recompute).
//
// Reikt het exportvenster niet terug tot de oorspronkelijke aankopen, dan is de
// kostbasis onbekend en valt hij terug op de dagwaarde uit `Waarde EUR` — maar
// nog steeds zonder de fictieve realisatie. Die terugval is expliciet zichtbaar
// als `costBasisKnown: false` op het paar.
//
// WIE VÓÓR DEZE HERKENNING IMPORTEERDE, MOET WISSEN
// De herclassificatie verandert de dedup-sleutel van precies deze rijen. Die
// sleutel valt voor een rij zonder Order ID terug op de inhoud — datum,
// instrument, type, prijs, bedrag — en wij wijzigen daar drie velden van (type,
// plus prijs en bedrag: van dagwaarde naar meegenomen kostbasis). Een bestand
// dat vóór deze herkenning al is geïmporteerd, levert bij een nieuwe upload dus
// GEEN duplicaat-treffer op: de oude `buy`/`sell`-rijen blijven staan en de
// transfer-rijen komen ernaast, waarna het aantal te hoog uitvalt.
//
// Bewuste keuze van de eigenaar (7 sep 2026): daar wordt niets voor gebouwd —
// geen backfill en geen sleutelwijziging. De route is de bestaande wis-optie van
// de importwizard (`clearExisting`): importeer de bezitting opnieuw met "eerst
// bestaande posities wissen" aan. Dat ruimt de foute historie én het probleem in
// één keer op. Bouw hier geen stille correctie omheen zonder dat opnieuw te
// wegen.
//
// DE BESTANDSVOLGORDE IS GEEN TIJDLIJN
// De echte export is AFLOPEND gesorteerd: de nieuwste rij staat bovenaan en de
// oorspronkelijke aankopen staan dus ONDER de corporate-action-rij. Alles wat
// hier "eerder" heet, is daarom een DATUM-vergelijking en nooit een
// bestandspositie: de kostbasis-selectie (`carriedBasisFor`), de ketenvolgorde
// (`resolve` loopt de datums chronologisch af) en de rapportagevolgorde van de
// paren. Dezelfde rijen op- of aflopend aangeboden geven dezelfde uitkomst; de
// test `volgorde-onafhankelijkheid` pint dat vast.
//
// SCOPE
// Alleen DEGIRO, alleen het transactie-subformaat. De heuristiek is uitsluitend
// tegen dat formaat gewogen; andere brokers raken we hier niet aan.
// ---------------------------------------------------------------------------

import type { ParsedHoldingRow } from './broker-csv'
import { computePositionFromTransactions } from '@/lib/holdings-aggregation'
import { instrumentKey } from '@/lib/holdings-import-grouping'

/** Een herkend paar: de regel die sluit en de regel die opent. */
export interface DegiroCorporateActionPair {
  /** Index in de rijenlijst van het been dat de positie verlaat. */
  outIndex: number
  /** Index in de rijenlijst van het been dat de positie binnenkomt. */
  inIndex: number
  /**
   * De kostbasis (EUR) die van het uit-been naar het in-been meegaat. Bij
   * `costBasisKnown: false` is dit de dagwaarde uit `Waarde EUR` — behalve bij
   * een paar waarvan beide benen 0,00 zijn: daar IS de dagwaarde 0, en die
   * overnemen zou een reële inleg wissen. Voor die groep blijft de afgeleide
   * basis staan terwijl de vlag toch op `false` gaat (zie hieronder).
   */
  carriedCostBasis: number
  /**
   * True wanneer de kostbasis betrouwbaar uit dit bestand volgt.
   *
   * False in drie gevallen:
   *  - het exportvenster reikt niet terug tot de oorspronkelijke aankopen;
   *  - er staat andere activiteit van hetzelfde instrument op de actiedatum,
   *    zodat we niet kunnen zien wat vóór en wat ná de actie lag;
   *  - beide benen zijn 0,00 IN DE BRON. Dan is een gelijk aantal het énige
   *    onderscheid, en dat onderscheid is te zwak: een knock-out van 500 stuks
   *    en een bonusuitgifte van 500 stuks op dezelfde dag dragen exact dezelfde
   *    signatuur. Zo'n paar mag nooit als een geverifieerde kostbasis doorgaan.
   *
   * Dat laatste geval is een oordeel over de BRONRIJEN en dus over de eerste
   * pass — precies wanneer het telt. Draai je `detect` daarna nog eens over de
   * al omgezette rijen, dan dragen beide benen de meegenomen basis en is het
   * geen 0,00-paar meer; de vlag kan dan `true` zijn. De paren en de bedragen
   * blijven wél identiek (dat is de idempotentie die ertoe doet: dezelfde rijen
   * en dus dezelfde dedup-sleutels).
   */
  costBasisKnown: boolean
}

/**
 * Marge waarbinnen twee `Waarde EUR`-benen als "hetzelfde bedrag" gelden.
 * Twee cent absoluut, of een promille van het grootste been — welke groter is.
 * Absolute marge voor kleine bedragen (afronding op de laatste cent), relatieve
 * marge voor grote (de broker rondt per stuk af, niet op het totaal).
 */
function amountsMatch(a: number, b: number): boolean {
  const max = Math.max(a, b)
  return Math.abs(a - b) <= Math.max(0.02, 0.001 * max)
}

/** Onder deze grens beschouwen we een bedrag als 0,00. */
const ZERO_EUR = 0.005
const EPSILON = 1e-9

/**
 * Types die als uit-been respectievelijk in-been kunnen dienen.
 *
 * De reeds omgezette types staan er bewust bij: detectie moet IDEMPOTENT zijn.
 * Dezelfde rijenlijst een tweede keer door de detector halen levert exact
 * dezelfde paren en dezelfde bedragen op — anders zou een tweede pass (of een
 * herparse van hetzelfde bestand) een ander resultaat geven dan de eerste.
 */
const OUT_TYPES: ReadonlySet<string> = new Set(['sell', 'transfer_out'])
const IN_TYPES: ReadonlySet<string> = new Set(['buy', 'transfer_in'])

/**
 * De Uitvoeringsplaats van een rij, uit de bewaarde bronkolommen.
 *
 * Ontbreekt de kolom volledig (een oudere export), dan lezen we dat als "leeg"
 * en leunt de herkenning volledig op het paar-kenmerk + het lege Order ID. Dat
 * is bewust: de kolom is een extra bevestiging, niet het dragende signaal.
 */
function executionVenue(row: ParsedHoldingRow): string {
  return (row.raw['Uitvoeringsplaats'] ?? '').trim()
}

/** Kan deze rij uberhaupt een been van een corporate action zijn? */
function isCandidate(row: ParsedHoldingRow): boolean {
  if (row.type === 'position' || row.type === 'dividend') return false
  if (!row.date) return false
  if (row.externalId) return false
  if (executionVenue(row) !== '') return false
  return row.units > EPSILON
}

/**
 * Vormen deze twee benen samen een corporate action?
 *
 * Voor benen met een bedrag is het bedrag zelf het onderscheidende kenmerk.
 * Voor benen van 0,00 bestaat dat kenmerk niet — dan zouden een knock-out
 * (-500 @ 0,00) en een stockdividend (+3 @ 0,00) op dezelfde dag valselijk
 * koppelen, en dat is stil destructief: het echte verlies van de knock-out
 * verdwijnt. Voor die groep eisen we daarom aanvullend een GELIJK aantal, zoals
 * een 1-op-1-conversie van een inschrijving naar echte stukken. Een 0,00-paar
 * met een ongelijk aantal wordt dus gemist — dat blijft een zichtbare `sell` @
 * EUR 0, niet een stille herwaardering.
 */
function isPair(out: ParsedHoldingRow, inn: ParsedHoldingRow): boolean {
  if (isZeroValuePair(out, inn)) {
    return Math.abs(out.units - inn.units) <= 1e-6
  }
  return amountsMatch(Math.abs(out.total_amount), Math.abs(inn.total_amount))
}

/**
 * Zijn beide benen 0,00? Dan is een gelijk aantal het enige onderscheid, en dat
 * is te zwak om een kostbasis op te baseren: een knock-out van 500 stuks en een
 * bonusuitgifte van 500 stuks op dezelfde dag dragen exact dezelfde signatuur.
 * De aantallen mogen we nog wel volgen (het paar houdt de positie kloppend),
 * maar de kostbasis krijgt `costBasisKnown: false`.
 */
function isZeroValuePair(out: ParsedHoldingRow, inn: ParsedHoldingRow): boolean {
  return Math.abs(out.total_amount) < ZERO_EUR && Math.abs(inn.total_amount) < ZERO_EUR
}

/**
 * De kostbasis die het uit-been meeneemt, afgeleid met de canonieke engine over
 * de VOORAFGAANDE rijen van datzelfde instrument in dit bestand.
 *
 * "Voorafgaand" is een DATUM, geen bestandspositie. De DEGIRO-transactie-export
 * is aflopend gesorteerd (nieuwste rij bovenaan), dus de oorspronkelijke
 * aankopen staan in het bestand ONDER de corporate-action-rij. Een selectie op
 * `slice(0, outIndex)` vindt ze daar niet — en erger: hij pakt de rijen van
 * LATERE datums op en noemt de uitkomst dan alsnog `costBasisKnown: true`. Een
 * fout die zichzelf als bekend bestempelt is erger dan een eerlijke terugval,
 * dus de selectie loopt over de datum en het resultaat is identiek of het
 * bestand nu op- of aflopend binnenkomt.
 *
 * TWEE RIJEN OP DEZELFDE DATUM
 * Binnen één datum kunnen we niet ordenen: de export draagt geen betrouwbare
 * volgorde en de `Tijd` van een corporate action zegt niets over de vraag of
 * een handelsregel van diezelfde dag ervoor of erna lag. Staat er naast dit paar
 * nog ANDERE activiteit van hetzelfde instrument op de actiedatum (een keten die
 * op één dag valt, of een koop op de ochtend van de splitsing), dan is de
 * kostbasis dus niet betrouwbaar af te leiden en valt hij expliciet terug op de
 * dagwaarde met `costBasisKnown: false`. Liever een eerlijke terugval dan een
 * gokje dat `true` heet.
 *
 * Rijen zonder datum tellen om dezelfde reden niet mee: ze zijn niet te ordenen.
 */
function carriedBasisFor(
  rows: readonly ParsedHoldingRow[],
  outIndex: number,
  inIndex: number,
): { carriedCostBasis: number; costBasisKnown: boolean } {
  const out = rows[outIndex]
  const key = instrumentKey(out)
  const outDate = out.date as string
  const dagwaarde = {
    carriedCostBasis: Math.abs(out.total_amount),
    costBasisKnown: false,
  }

  // Alle andere rijen van dit instrument — de twee benen van dit paar zelf
  // horen er per definitie niet bij.
  //
  // `position` valt af (een momentopname is geen mutatie) en `dividend` ook:
  // een dividendrij verandert het aantal noch de gemiddelde kostprijs, dus hij
  // draagt niets bij aan de kostbasis én mag de dag-ambiguïteit hieronder niet
  // triggeren. Een uitkering op de dag van een splitsing zou anders zonder
  // reden een bruikbare kostbasis als "onbekend" wegzetten.
  const others = rows.filter(
    (r, i) =>
      i !== outIndex &&
      i !== inIndex &&
      r.type !== 'position' &&
      r.type !== 'dividend' &&
      instrumentKey(r) === key,
  )

  if (others.some((r) => r.date === outDate)) return dagwaarde

  const prior = others.filter((r) => r.date !== null && r.date < outDate)

  const agg = computePositionFromTransactions(
    prior.map((r) => ({
      type: r.type,
      units: r.units,
      price_per_unit: r.price_per_unit,
      total_amount: r.total_amount,
      date: r.date,
    })),
  )

  // Kostbasis bekend = er staat volgens de voorafgaande rijen daadwerkelijk een
  // positie met een kostprijs. Is de positie 0 of negatief (het venster reikt
  // niet terug tot de aankoop), dan is er niets om mee te nemen.
  if (agg.netUnits > EPSILON && agg.avgCost > EPSILON) {
    return { carriedCostBasis: out.units * agg.avgCost, costBasisKnown: true }
  }
  return dagwaarde
}

/**
 * Herschrijf een paar naar `transfer_out` / `transfer_in`.
 *
 * Beide benen krijgen dezelfde kostbasis als bedrag: dezelfde waarde verlaat de
 * ene regel en komt de andere binnen. Dat maakt het paar zelf-documenterend in
 * het transactielogboek — een uit-been op de DAGwaarde zou daar suggereren dat
 * er EUR X is verkocht terwijl er niets is gerealiseerd.
 *
 * Bij een onbekende kostbasis is de dagwaarde de basis, dus verandert het
 * uit-been feitelijk niets aan zijn bedragen.
 */
function rewritePair(
  rows: ParsedHoldingRow[],
  pair: DegiroCorporateActionPair,
): void {
  const out = rows[pair.outIndex]
  const inn = rows[pair.inIndex]
  const basis = pair.carriedCostBasis

  rows[pair.outIndex] = {
    ...out,
    type: 'transfer_out',
    total_amount: basis,
    price_per_unit: out.units > EPSILON ? basis / out.units : 0,
  }
  rows[pair.inIndex] = {
    ...inn,
    type: 'transfer_in',
    total_amount: basis,
    price_per_unit: inn.units > EPSILON ? basis / inn.units : 0,
  }
}

/**
 * Het best passende in-been bij een uit-been, uit de nog niet geclaimde
 * kandidaten van dezelfde datum.
 *
 * Niet "de eerste die past": bij twee corporate actions op dezelfde datum met
 * (vrijwel) hetzelfde bedrag zou de eerste-die-past afhangen van de
 * bestandsvolgorde, en dan koppelt een aflopend bestand andere benen dan een
 * oplopend. Daarom eerst op het KLEINSTE bedragsverschil, en pas bij gelijk
 * spel op de kleinste afstand tussen de twee rijen — de twee benen van één
 * actie staan in de export naast elkaar, en die afstand blijft gelijk als de
 * hele lijst omdraait.
 */
function bestMatchingInLeg(
  rows: readonly ParsedHoldingRow[],
  outIndex: number,
  ins: readonly number[],
  claimed: ReadonlySet<number>,
): number | undefined {
  const out = rows[outIndex]
  let best: { index: number; delta: number; distance: number } | undefined
  for (const j of ins) {
    if (claimed.has(j)) continue
    if (!isPair(out, rows[j])) continue
    const delta = Math.abs(Math.abs(out.total_amount) - Math.abs(rows[j].total_amount))
    const distance = Math.abs(j - outIndex)
    if (
      best === undefined ||
      delta < best.delta - EPSILON ||
      (delta <= best.delta + EPSILON && distance < best.distance)
    ) {
      best = { index: j, delta, distance }
    }
  }
  return best?.index
}

/**
 * De pass over ALLE rijen: koppel per datum de uit- en in-benen.
 *
 * Bewust een pass over de hele lijst en niet per rij — het kenmerk is het paar,
 * en dat kun je in `parseDegiroRow` per definitie niet zien. De datums worden
 * CHRONOLOGISCH afgelopen, niet in bestandsvolgorde, zodat een ketting (een
 * regel die eerst geconverteerd is en later opnieuw splitst) de kostbasis van de
 * vorige stap meeneemt — ook in de aflopend gesorteerde echte export, waar die
 * vorige stap ONDER de latere staat.
 */
function resolve(input: readonly ParsedHoldingRow[]): {
  pairs: DegiroCorporateActionPair[]
  rows: ParsedHoldingRow[]
} {
  const rows = [...input]
  const pairs: DegiroCorporateActionPair[] = []
  if (rows.length === 0) return { pairs, rows }

  // Kandidaat-indices per datum, in bestandsvolgorde.
  const byDate = new Map<string, number[]>()
  rows.forEach((row, index) => {
    if (!isCandidate(row)) return
    const date = row.date as string
    const bucket = byDate.get(date)
    if (bucket) bucket.push(index)
    else byDate.set(date, [index])
  })

  const claimed = new Set<number>()
  // Chronologisch, niet op bestandsvolgorde: de ISO-datums sorteren lexicaal.
  const dates = [...byDate.keys()].sort()
  for (const date of dates) {
    const indices = byDate.get(date) as number[]
    const outs = indices.filter((i) => OUT_TYPES.has(rows[i].type))
    const ins = indices.filter((i) => IN_TYPES.has(rows[i].type))
    for (const outIndex of outs) {
      if (claimed.has(outIndex)) continue
      const inIndex = bestMatchingInLeg(rows, outIndex, ins, claimed)
      if (inIndex === undefined) continue
      claimed.add(outIndex)
      claimed.add(inIndex)
      const { carriedCostBasis, costBasisKnown } = carriedBasisFor(
        rows,
        outIndex,
        inIndex,
      )
      const pair = {
        outIndex,
        inIndex,
        carriedCostBasis,
        // Een 0,00-paar is nooit geverifieerd (zie `isZeroValuePair`). De
        // afgeleide waarde blijft wél staan: de dagwaarde is hier per definitie
        // 0, en die overnemen zou een reële inleg wissen.
        costBasisKnown: costBasisKnown && !isZeroValuePair(rows[outIndex], rows[inIndex]),
      }
      pairs.push(pair)
      rewritePair(rows, pair)
    }
  }

  // Rapportagevolgorde is chronologisch (en pas daarbinnen op bestandspositie),
  // zodat dezelfde inhoud dezelfde lijst geeft, op- of aflopend aangeboden.
  pairs.sort(
    (a, b) =>
      (rows[a.outIndex].date ?? '').localeCompare(rows[b.outIndex].date ?? '') ||
      a.outIndex - b.outIndex,
  )
  return { pairs, rows }
}

/**
 * Zet de twee benen van een paar op DEZELFDE ISIN in de juiste volgorde: eerst
 * de regel die sluit, dan de regel die opent.
 *
 * Waarom dat nodig is: bij een forward split houdt DEGIRO dezelfde ISIN, dus
 * beide benen horen bij hetzelfde instrument EN dragen dezelfde datum. De
 * canonieke engine sorteert op datum en is stabiel, dus binnen die datum beslist
 * de lijstvolgorde. Staat het in-been eerst — precies wat de aflopend
 * gesorteerde echte export oplevert — dan telt de engine de stukken even dubbel
 * (60 oud + 120 nieuw) en middelt de kostprijs over 180 stuks: EUR 400 inleg in
 * plaats van EUR 300. De aantallen komen daarna weer goed; alleen de gemiddelde
 * kostprijs blijft stil verkeerd staan.
 *
 * Bewust ALLEEN bij een gelijke instrumentsleutel: bij verschillende ISIN's
 * rekent de engine per instrument en doet de onderlinge volgorde niets. Zo
 * verschuift er niets meer aan de bestandsvolgorde dan strikt nodig — twee
 * rijen van hetzelfde instrument, wat de groepering naar holdings per definitie
 * niet raakt.
 */
function orderLegs(
  rows: readonly ParsedHoldingRow[],
  pairs: readonly DegiroCorporateActionPair[],
): ParsedHoldingRow[] {
  const ordered = [...rows]
  for (const pair of pairs) {
    if (pair.outIndex < pair.inIndex) continue
    if (instrumentKey(ordered[pair.outIndex]) !== instrumentKey(ordered[pair.inIndex])) {
      continue
    }
    const leaving = ordered[pair.outIndex]
    ordered[pair.outIndex] = ordered[pair.inIndex]
    ordered[pair.inIndex] = leaving
  }
  return ordered
}

/**
 * Welke rijen samen een splitsing/conversie vormen — zonder de rijen te wijzigen.
 * De indices verwijzen naar de MEEGEGEVEN lijst. Idempotent: een al omgezette
 * lijst levert exact dezelfde paren, en de sorteerrichting van het bestand
 * verandert er niets aan.
 *
 * LET OP bij combineren: `applyDegiroCorporateActions` kan de twee benen van een
 * split op dezelfde ISIN van plaats wisselen (zie `orderLegs`). Indices uit deze
 * functie horen dus bij de lijst die je HIER meegaf — niet bij de lijst die
 * `apply` teruggeeft. Wil je paren én omgezette rijen, roep `detect` dan aan op
 * de uitvoer van `apply` (die is stabiel: een tweede pass wisselt niets meer),
 * niet op de invoer ervan. In de praktijk is dat vanzelf zo: `parseBrokerCSV`
 * levert al een omgezette lijst.
 */
export function detectDegiroCorporateActions(
  rows: readonly ParsedHoldingRow[],
): DegiroCorporateActionPair[] {
  return resolve(rows).pairs
}

/**
 * Zet herkende splitsingen/conversies om naar `transfer_out` / `transfer_in`
 * met meegenomen kostbasis. Levert een NIEUWE lijst; de invoer blijft ongemoeid.
 *
 * Naast het herschrijven zet dit de twee benen van een split op dezelfde ISIN in
 * de sluitende-dan-openende volgorde (zie `orderLegs`).
 */
export function applyDegiroCorporateActions(
  rows: readonly ParsedHoldingRow[],
): ParsedHoldingRow[] {
  const { pairs, rows: rewritten } = resolve(rows)
  return orderLegs(rewritten, pairs)
}
