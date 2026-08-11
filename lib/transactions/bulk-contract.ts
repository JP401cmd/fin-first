// lib/transactions/bulk-contract.ts
//
// Het gedeelde contract voor transactie-bulkbewerken: de vormen die over de lijn
// gaan en de drempels die client én server allebei moeten kennen.
//
// ## Waarom dit één bestand is
//
// De hele veiligheid van deze functionaliteit hangt op ADR 0104: een bulkselectie
// is een **bevroren id-lijst**, geen criterium. Het criterium wordt precies één
// keer uitgevoerd (de manifest-route) en levert in hetzelfde antwoord het
// getal dat de gebruiker bevestigt én de verzameling die gemuteerd wordt. Zou de
// mutatieroute het criterium opnieuw uitvoeren, dan zijn "wat de gebruiker
// bevestigde" en "wat er geraakt is" twee losse uitvoeringen, en is elk verschil
// daartussen pas ná de mutatie zichtbaar — bij een hard delete zonder prullenbak
// (besluit B1) is dat onherstelbaar dataverlies.
//
// De drempels hieronder staan daarom in ÉÉN bestand. Zou de UI-poort
// (type-to-confirm boven 25) een ander getal kennen dan de server-poort, dan is
// de server-poort in de praktijk uitgeschakeld voor precies het bereik waar hij
// om gaat. Zelfde redenering als de gedeelde `MIN_OWN_ACCOUNT_NAME_LENGTH` in
// lib/own-accounts.ts: één ondergrens, twee schrijfpaden, geen achterdeur.
//
// Bewust GEEN zod hier: dit bestand wordt ook door clientcode gelezen (de overlay
// leest de drempels) en zod hoort niet in die bundel. De routes bouwen hun eigen
// zod-schema's op deze types.

// ── Drempels ────────────────────────────────────────────────────────────────

/**
 * Harde bovengrens op één selectie. Daarboven weigert de manifest-route met
 * `selection_too_large` — nooit stil afkappen (R-NF2).
 *
 * Dit is de bodem onder de blast radius: welke filterfout er ook optreedt, meer
 * dan dit aantal rijen kan één actie niet raken. Het Greenhouse-incident (een
 * filterbug waardoor bulkacties veel meer records raakten dan bedoeld) is precies
 * het scenario waar deze grens tegen beschermt.
 */
export const SELECTION_MAX = 5000

/**
 * Aantal id's per mutatie-call. Boven ~200 wordt de URL-lengte van een
 * PostgREST `.in()` een probleem en wordt een gesneuvelde batch duur.
 */
export const BULK_BATCH_SIZE = 200

/**
 * Paginagrootte van de `.range()`-lus in de manifest-route.
 *
 * Staat hier en niet in die route omdat het een DREMPEL is en geen detail: hij
 * moet ≤ PostgREST's `max_rows` blijven. Zakt `max_rows` ooit onder deze waarde,
 * dan levert de eerste pagina minder rijen dan gevraagd, breekt de lus, en
 * bevriest het manifest stil minder id's dan er treffers zijn. Die situatie
 * wordt daarom expliciet gedetecteerd en gerapporteerd (`SelectionManifest.truncated`,
 * R-NF2) — nooit stil.
 */
export const MANIFEST_PAGE_SIZE = 1000

/**
 * Vanaf dit aantal moet de gebruiker bij verwijderen het aantal overtypen (F17).
 * Client toont de poort, server dwingt hem af — vandaar gedeeld.
 */
export const TYPE_TO_CONFIRM_THRESHOLD = 25

/**
 * Maximale lengte van de vrije zoekterm.
 *
 * Niet cosmetisch: de zoekterm wordt in een PostgREST `.or()`-expressie gebouwd,
 * en `%`, `_`, komma's en haakjes kunnen die expressie openbreken. Een getypte
 * `%` zou álles matchen — dezelfde te-brede-selectie via de achterdeur. De
 * escaping zelf woont in `search-query.ts` (één plek, gedeeld door de zoek- én
 * de manifest-route); deze grens is de tweede rem.
 */
export const SEARCH_TERM_MAX_LENGTH = 100

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

// ── Criterium ───────────────────────────────────────────────────────────────

export type TransactionDirection = 'expense' | 'income'

/**
 * Het zoekcriterium. Reist mee naar de mutatieroutes als **tekst voor de
 * bevestigingszin en het regelaanbod** (F20) — maar bepaalt daar nooit wát er
 * gemuteerd wordt. Het criterium versmalt, de id-lijst beslist (ADR 0104).
 */
export interface TransactionSearchCriteria {
  /** Vrije tekst over description + counterparty_name. Leeg = geen tekstfilter. */
  q?: string
  accountIds?: string[]
  /** `null` in de lijst betekent "zonder budget". */
  budgetIds?: (string | null)[]
  direction?: TransactionDirection
  /** Absolute ondergrens/bovengrens op het bedrag (altijd positief opgegeven). */
  amountMin?: number
  amountMax?: number
  /** ISO 'yyyy-mm-dd', inclusief. */
  dateFrom?: string
  /** ISO 'yyyy-mm-dd', inclusief. */
  dateTo?: string
}

// ── Zoeken (paginated read) ─────────────────────────────────────────────────

export interface TransactionSearchRow {
  id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  budget_id: string | null
  account_id: string
  is_split: boolean
  transaction_type: string | null
  /** Afkomstig van een gekoppelde bankrekening — voedt de herimport-waarschuwing (F18). */
  is_bank_linked: boolean
}

export interface TransactionSearchRequest extends TransactionSearchCriteria {
  page: number
  pageSize: number
}

export interface TransactionSearchResponse {
  rows: TransactionSearchRow[]
  /**
   * Totaal aantal treffers, onafhankelijk van de geladen pagina (F3/AC2).
   * Komt uit een `count: 'exact'`-query, niet uit `rows.length`.
   */
  total: number
  page: number
  pageSize: number
}

// ── Selectiemanifest ────────────────────────────────────────────────────────

/**
 * De body van de manifest-route: één van twee vormen.
 *
 *  - **Criterium** (`ids` weggelaten) — "selecteer alle N gevonden transacties";
 *    de route voert het filter uit en materialiseert de uitkomst.
 *  - **Id-lijst** (`ids` gevuld, criterium leeg) — een expliciete rij-selectie.
 *
 * Beide leveren HETZELFDE manifest, en dat is het punt. Een expliciete selectie
 * is voor de *id's* al bevroren, maar niet voor de AFGELEIDEN die de bevestiging
 * moet stellen: welke rijen gesplitst zijn, welke van een bankkoppeling komen, en
 * vooral welke tegenboekingen mee zullen verdwijnen. Die kent alleen de server.
 * Zou de overlay ze voor een expliciete selectie moeten raden, dan noemt de
 * knoptekst een ander getal dan wat de server verwijdert — bij een hard delete
 * zonder prullenbak precies het gat dat ADR 0104 dichttimmert.
 */
export interface SelectionManifestRequest extends TransactionSearchCriteria {
  /** Expliciete selectie; sluit elk criteriumveld uit (de route weigert de combinatie). */
  ids?: string[]
}

/**
 * Het resultaat van "voer het criterium één keer uit". Aantal, bedrag,
 * waarschuwingen én de te muteren verzameling komen aantoonbaar uit dezelfde
 * uitvoering — dat is de hele bedoeling van ADR 0104.
 */
export interface SelectionManifest {
  /** De bevroren verzameling. Ontdubbeld, hoogstens SELECTION_MAX lang. */
  ids: string[]
  /** `ids.length`, expliciet meegegeven zodat de mutatieroute kan toetsen. */
  count: number
  /** Som van de positieve bedragen (≥ 0). */
  sumPositief: number
  /** Som van de negatieve bedragen (≤ 0). */
  sumNegatief: number
  /**
   * Split-transacties binnen de selectie. Die worden bij hercategoriseren
   * UITGESLOTEN en vooraf gemeld: bij een split bepalen de deelregels het
   * budget, dus stil overschrijven laat `transaction_splits`-rijen achter die
   * niet meer optellen tot de toewijzing — een tweede waarheid over dezelfde euro.
   */
  splitIds: string[]
  /**
   * Tegenboekingen van handmatige overboekingen die zelf NIET in de selectie
   * zitten. Bij verwijderen gaan ze standaard mee: de FK is `ON DELETE SET NULL`,
   * dus er ontstaat geen FK-wees maar een semantische — een rij die nog
   * `transaction_type='transfer'` draagt en daardoor via `isRealAggRow` in noch
   * inkomsten noch uitgaven meetelt, terwijl de tegenhanger weg is.
   */
  linkedCounterpartIds: string[]
  /** Hoeveel rijen van een gekoppelde bankrekening komen (herimport-waarschuwing, F18). */
  bankLinkedCount: number
  /**
   * De `.range()`-lus vond minder id's dan de teller aan treffers meldde.
   *
   * Kan alleen optreden wanneer PostgREST's `max_rows` onder `MANIFEST_PAGE_SIZE`
   * zakt. De richting is veilig (te weinig, nooit te veel) en `count`/`ids` blijven
   * onderling consistent, dus wat de gebruiker bevestigt klopt nog steeds met wat
   * er gebeurt — maar hij selecteerde "alle N" en krijgt er minder. R-NF2 eist dat
   * een afkap die tóch optreedt wordt gerapporteerd, niet verzwegen.
   */
  truncated: boolean
}

// ── Mutaties ────────────────────────────────────────────────────────────────

export interface BulkBudgetRequest {
  ids: string[]
  /** Moet gelijk zijn aan `ids.length` na ontdubbelen; anders 400. */
  expectedCount: number
  /** `null` = ontkoppelen (Niet gecategoriseerd). */
  budgetId: string | null
}

/** Waarom een rij is overgeslagen. Uitbreidbaar; de UI vertaalt naar mensentaal. */
export type BulkSkipReason = 'is_split' | 'not_found'

export interface BulkSkipped {
  id: string
  reason: BulkSkipReason
}

/**
 * Resultaat per UITZONDERING, niet per item.
 *
 * `{ requested, updated, skipped, failedIds }` vervult "X van Y, met de reden bij
 * overgeslagen rijen" (F19/AC14) zonder een payload van 4.000 entries die geen
 * informatie draagt.
 *
 * `updated` komt ALTIJD uit `.select('id')` op de mutatie — nooit uit
 * `expectedCount`. Een UPDATE die door RLS nul rijen raakt geeft géén error; wie
 * kandidaten telt in plaats van geschreven rijen, meldt succes over een mutatie
 * die niet gebeurd is (R-NF4).
 */
export interface BulkBudgetResponse {
  requested: number
  updated: number
  skipped: BulkSkipped[]
  failedIds: string[]
  /** Er waren méér treffers dan SELECTION_MAX; de gebruiker moet dit weten. */
  truncated: boolean
}

export interface BulkDeleteRequest {
  ids: string[]
  expectedCount: number
  /**
   * Het door de gebruiker overgetypte aantal (F17). Boven
   * TYPE_TO_CONFIRM_THRESHOLD verplicht en server-side getoetst — anders is de
   * poort UI-theater.
   */
  confirmCount?: number
  /** Tegenboekingen meenemen (standaard aan; uitzetten mag, met waarschuwing). */
  includeLinkedCounterparts: boolean
}

export interface BulkDeleteResponse {
  requested: number
  deleted: number
  /** Hoeveel tegenboekingen zijn meegegaan. */
  orphansCleared: number
  failedIds: string[]
  truncated: boolean
}

// ── Regelaanbod na hercategoriseren (F20) ───────────────────────────────────

export interface BulkRuleRequest {
  matchField: 'counterparty_name' | 'description'
  matchValue: string
  budgetId: string
}

export interface BulkRuleResponse {
  created: boolean
}
