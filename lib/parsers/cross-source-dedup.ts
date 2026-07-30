import { normalizeCounterparty } from './counterparty-normalize'

/**
 * Cross-bron duplicaatdetectie — dedup-laag 2.
 *
 * Laag 1 is `import_hash` (SHA-256 over `datum|bedrag|omschrijving`, zie
 * `lib/parsers/shared.ts#computeHash`) en die blijft ALTIJD als eerste draaien:
 * ze is idempotent en spiegelt de unieke index in de database. Laag 2 komt
 * erbij, niet ervoor in de plaats. Ze vangt het geval dat laag 1 per definitie
 * niet kán vangen: dezelfde boeking uit een ANDERE bron, waar de bank een andere
 * omschrijvingstekst levert dan de CSV van diezelfde bank — waardoor de hash
 * verschilt terwijl het om één boeking gaat.
 *
 * ## De sleutel is exact, niet fuzzy
 *
 * Gescoped op `(user_id, account_id)` — die scoping is de verantwoordelijkheid
 * van de aanroeper, want dit bestand kent geen database. Binnen die scope:
 *
 *  1. datum binnen **±1 kalenderdag** (bank en bestand boeken dezelfde
 *     transactie soms een dag uit elkaar);
 *  2. bedrag **exact gelijk op de cent, inclusief teken**;
 *  3. tegenpartij-IBAN **exact gelijk** na normalisatie — of, als één van beide
 *     zijden géén IBAN heeft, `normalizeCounterparty(naam)` exact gelijk.
 *
 * Géén bedragmarge, géén Levenshtein, géén scoredrempel, géén similariteits-
 * score. Alles wat niet exact matcht is per definitie geen duplicaat.
 *
 * **Waarom zo streng.** De twee fouten zijn niet gelijkwaardig. Een
 * fout-positief is stil verlies van een échte transactie: de rij wordt nooit
 * ingevoegd, niemand ziet het, en het saldo klopt daarna niet meer. Een
 * fout-negatief is een zichtbaar duplicaat dat de gebruiker wegklikt. Deze
 * module leunt dus consequent naar het fout-negatief.
 *
 * Twee gevolgen daarvan die makkelijk als "gemiste kans" lezen maar bewust zijn:
 *  - staan er aan beide kanten IBANs die van elkaar verschillen, dan is er GEEN
 *    naam-terugval. Twee verschillende IBANs zijn positief bewijs van twee
 *    verschillende tegenpartijen; naam-gelijkheid mag dat niet overrulen.
 *  - ontbreekt aan één kant zowel een bruikbare IBAN als een bruikbare naam, dan
 *    is er geen match. Op alleen datum + bedrag matchen zou elke maandelijkse
 *    vaste last op zichzelf laten lijken.
 *
 * ## Wat deze laag NOOIT doet
 *
 * Dedup verhindert alleen INSERTs. Nooit een update, nooit een merge, nooit een
 * delete. De oudste rij wint en houdt haar budget-toewijzing (`budget_id`,
 * `category_source`) — dat is precies wat een gebruiker met de hand heeft gezet
 * en wat een "slimme" samenvoeging zou weggooien.
 *
 * Er komt ook geen "mogelijk duplicaat"-status in `transactions`. Dat zou een
 * derde waarheid worden die élke lezer (dashboard, budgetten, AI-context,
 * FIRE-motor) correct zou moeten negeren, en die vergeet er altijd één.
 *
 * ## Transport-agnostisch
 *
 * Puur, geen Supabase-import. De "welke rijen bestaan er al"-ophaal woont bij de
 * afnemer (`lib/truelayer/existing-hashes.ts` voor het synchronisatiepad),
 * zodat het importpad dezelfde matchfunctie kan gebruiken vanuit de andere kant.
 */

/** Normalisatie van de tegenpartij-naam: de canonieke variant uit
 *  `counterparty-normalize.ts`, bewust géén vierde lokale kopie (besluit 0c). */
export { normalizeCounterparty }

/**
 * Datumtolerantie in kalenderdagen. Eén dag: bank en bestand boeken dezelfde
 * transactie soms een dag uit elkaar (valutadatum vs. boekdatum). Bewust lager
 * dan de 3-dagenmarge waarmee de eerste ophaal start (B9) — die marge bepaalt
 * hoeveel we opnieuw ophalen, deze tolerantie hoeveel we durven samen te nemen.
 */
export const CROSS_SOURCE_DATE_TOLERANCE_DAYS = 1

/** Reden waarom twee rijen als dezelfde boeking gelden. */
export type CrossSourceMatchReason = 'iban' | 'name'

/**
 * De vier velden waarop laag 2 werkt. Zowel `ParsedTransaction` (importkant en
 * de TrueLayer-mapper) als een kale `transactions`-rij voldoet hieraan, zodat
 * beide afnemers dezelfde functie voeden zonder tussenlaag.
 */
export type CrossSourceCandidate = {
  /** `YYYY-MM-DD`. */
  date: string
  amount: number
  counterparty_iban?: string | null
  counterparty_name?: string | null
}

/** Genormaliseerde, vergelijkbare vorm van een kandidaat. */
export type CrossSourceKeys = {
  /**
   * Dagnummer sinds epoch (UTC). Bewust een geheel getal en niet een `Date`:
   * ±1 *kalenderdag* moet ongevoelig zijn voor tijdzone en zomertijd.
   * `NaN` bij een onleesbare datum — die matcht dan nergens mee.
   */
  day: number
  /**
   * Bedrag in hele centen, inclusief teken. Integer, want vergelijken op
   * doubles zou van "exact op de cent" stil "bijna" maken.
   */
  amountCents: number
  /** Genormaliseerde IBAN (hoofdletters, geen scheidingstekens), of `null`. */
  iban: string | null
  /** Genormaliseerde tegenpartij-naam, of `null` als er geen bruikbare is. */
  name: string | null
}

/** `YYYY-MM-DD` → dagnummer sinds epoch (UTC), of `NaN`. */
function toEpochDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return Number.NaN
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? Number.NaN : Math.floor(ms / 86_400_000)
}

/**
 * IBAN-normalisatie voor vergelijking: hoofdletters, alle niet-alfanumerieke
 * tekens weg (banken en bestanden spatiëren verschillend: "NL91 ABNA 0417 1643
 * 00" vs "NL91ABNA0417164300"). Leeg → `null`; een lege string mag nooit als
 * "gelijke IBAN" gelden.
 */
export function normalizeIban(raw: string | null | undefined): string | null {
  const s = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s || null
}

/**
 * Zet een rij om naar de vergelijkbare sleutels. Puur; geen zijeffecten.
 */
export function buildCrossSourceKeys(tx: CrossSourceCandidate): CrossSourceKeys {
  const name = normalizeCounterparty(tx.counterparty_name)
  return {
    day: toEpochDay(tx.date),
    // Math.round, niet trunc: -12.5 * 100 kan als -1249.9999… uit de double
    // komen. Afkappen zou daar -1249 van maken en de exacte match slopen.
    amountCents: Math.round(tx.amount * 100),
    iban: normalizeIban(tx.counterparty_iban),
    name: name || null,
  }
}

/**
 * Matcht één kandidaat tegen één bestaande rij, beide al genormaliseerd.
 * Retourneert de reden, of `null` als het géén duplicaat is.
 */
export function matchCrossSourceKeys(
  a: CrossSourceKeys,
  b: CrossSourceKeys,
): CrossSourceMatchReason | null {
  // Goedkoopste vergelijking eerst — dit draait O(kandidaten × bestaande).
  if (a.amountCents !== b.amountCents) return null
  if (Number.isNaN(a.day) || Number.isNaN(b.day)) return null
  if (Math.abs(a.day - b.day) > CROSS_SOURCE_DATE_TOLERANCE_DAYS) return null

  if (a.iban && b.iban) {
    // Beide zijden kennen de tegenpartij-IBAN: dan is dát het oordeel. Ongelijk
    // = twee verschillende tegenpartijen, en de naam mag daar niet overheen.
    return a.iban === b.iban ? 'iban' : null
  }

  // Eenzijdig (of tweezijdig) ontbrekende IBAN → terugval op de genormaliseerde
  // naam. Ontbreekt die aan één van beide kanten, dan is er geen grond voor een
  // oordeel en dus geen match.
  if (a.name && b.name && a.name === b.name) return 'name'

  return null
}

/** Uitkomst van `findCrossSourceDuplicate`: de gevonden rij plus de reden. */
export type CrossSourceMatch<T> = {
  match: T
  reason: CrossSourceMatchReason
}

/**
 * Zoek de eerste bestaande rij die dezelfde boeking is als `candidate`.
 *
 * De aanroeper levert `existing` al gescoped op `(user_id, account_id)` en op
 * het datumvenster — deze functie controleert dat niet en kán dat ook niet, ze
 * ziet geen gebruiker en geen rekening. Dat is bewust: één matchregel, twee
 * afnemers (synchronisatie en import), elk met hun eigen ophaal.
 */
export function findCrossSourceDuplicate<T extends CrossSourceCandidate>(
  candidate: CrossSourceCandidate,
  existing: readonly T[],
): CrossSourceMatch<T> | null {
  const key = buildCrossSourceKeys(candidate)

  for (const row of existing) {
    const reason = matchCrossSourceKeys(key, buildCrossSourceKeys(row))
    if (reason) return { match: row, reason }
  }

  return null
}

/** Oordeel over één kandidaatrij, in dezelfde volgorde als de invoer. */
export type CrossSourceDecision<C> = {
  candidate: C
  /** `null` = geen cross-bron-duplicaat; anders waaróm het er wel één is. */
  reason: CrossSourceMatchReason | null
}

/**
 * Beoordeel een hele batch tegen de bestaande rijen — de laag die beide
 * afnemers delen, zodat synchronisatie en import op dezelfde invoer gegarandeerd
 * hetzelfde besluiten.
 *
 * **Één bestaande rij absorbeert hooguit één kandidaat.** Dat is geen detail:
 * twee échte boekingen van €5 bij dezelfde bakker op dezelfde dag matchen allebei
 * op één bestaande CSV-rij. Zou de match een filter zijn in plaats van een
 * toewijzing, dan verdween er stil één van de twee — precies het fout-positief
 * dat deze module hoort te vermijden. Nu wordt de eerste overgeslagen en de
 * tweede gewoon ingevoegd, en ziet de gebruiker in het slechtste geval een
 * duplicaat dat hij kan wegklikken.
 *
 * Laag 1 heeft dit probleem niet en hoeft deze behandeling dus ook niet: daar
 * spiegelt de vergelijking exact de unieke index, dus de database zou een
 * tweede identieke rij sowieso weigeren.
 *
 * Kandidaten worden NIET onderling vergeleken. Twee rijen uit dezelfde batch
 * komen uit dezelfde bron; dat is het werk van laag 1 (en, bij de bank-sync, van
 * de in-batch ontdubbeling op `transaction_id`).
 */
export function partitionCrossSourceDuplicates<C extends CrossSourceCandidate>(
  candidates: readonly C[],
  existing: readonly CrossSourceCandidate[],
): CrossSourceDecision<C>[] {
  // Emmer op het bedrag in centen. Een match vereist per definitie een gelijk
  // bedrag, dus alles wat niet in de emmer zit kán geen duplicaat zijn — de
  // uitkomst is identiek aan een volle scan, inclusief "eerste treffer wint"
  // (de indexen staan per emmer oplopend). Zonder deze emmer is dit
  // O(kandidaten × bestaande): een eerste ophaal van ~3.000 rijen tegen een
  // volle historie blokkeert dan de event-loop in dezelfde 60 seconden waarin
  // ook de provider-verzoeken en de insert-batches moeten passen.
  const byAmount = new Map<number, CrossSourceKeys[]>()
  for (const row of existing) {
    const key = buildCrossSourceKeys(row)
    const bucket = byAmount.get(key.amountCents)
    if (bucket) bucket.push(key)
    else byAmount.set(key.amountCents, [key])
  }

  const consumed = new Set<CrossSourceKeys>()

  return candidates.map((candidate) => {
    const key = buildCrossSourceKeys(candidate)

    for (const existingKey of byAmount.get(key.amountCents) ?? []) {
      if (consumed.has(existingKey)) continue
      const reason = matchCrossSourceKeys(key, existingKey)
      if (reason) {
        consumed.add(existingKey)
        return { candidate, reason }
      }
    }

    return { candidate, reason: null }
  })
}

/** Tellers per reden — de vorm waarin `bank_sync_log` de splitsing bewaart. */
export type CrossSourceCounts = {
  iban: number
  name: number
  total: number
}

/**
 * Tel de uitkomst per reden. De splitsing is geen cosmetiek: de naam-terugval is
 * de zwakke plek van deze laag (twee verschillende winkels van dezelfde keten
 * normaliseren naar dezelfde naam), en zonder aparte teller is die blinde vlek
 * achteraf niet te meten.
 */
export function countCrossSourceDecisions(
  decisions: readonly CrossSourceDecision<unknown>[],
): CrossSourceCounts {
  let iban = 0
  let name = 0
  for (const d of decisions) {
    if (d.reason === 'iban') iban++
    else if (d.reason === 'name') name++
  }
  return { iban, name, total: iban + name }
}

/**
 * Verschuif een `YYYY-MM-DD`-datum met een aantal kalenderdagen.
 *
 * Woont hier omdat het venster waarin een afnemer bestaande rijen ophaalt nooit
 * smaller mag zijn dan de tolerantie waarmee deze module matcht. Eén constante,
 * één verschuiver, geen tweede plek waar per ongeluk "±1" wordt vergeten.
 */
export function shiftIsoDate(iso: string, days: number): string {
  const day = toEpochDay(iso)
  if (Number.isNaN(day)) return iso
  return new Date((day + days) * 86_400_000).toISOString().slice(0, 10)
}
