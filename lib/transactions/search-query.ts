// lib/transactions/search-query.ts
//
// Criterium → PostgREST-query. ÉÉN plek, gedeeld door de zoekroute
// (`POST /api/transactions/search`) én de manifest-route
// (`POST /api/transactions/search/manifest`).
//
// ## Waarom dat delen niet-onderhandelbaar is
//
// ADR 0104 koopt zijn veiligheid met "het criterium wordt precies één keer
// uitgevoerd": het getal dat de gebruiker bevestigt en de verzameling die
// gemuteerd wordt komen uit dezelfde uitvoering. Dat argument staat of valt
// ermee dat de lijst die de gebruiker ZIET en de lijst die het manifest
// BEVRIEST door hetzelfde filter komen. Zouden die twee ooit forken — een extra
// `.eq()` hier, een vergeten `.lt()` daar — dan bevriest het manifest een andere
// verzameling dan de gebruiker beoordeelde, en is de bevriezing waardeloos.
// Vandaar: geen route bouwt zelf een filter, ze roepen allebei
// `applyTransactionSearchCriteria` aan.
//
// ## De zoekterm-escaping (S4)
//
// De vrije tekst gaat over twee kolommen en dus door een PostgREST `.or()`:
//
//     or=(description.ilike."%term%",counterparty_name.ilike."%term%")
//
// Daarin zijn `,` `.` `(` `)` scheidingstekens en `%` `_` `*` LIKE-wildcards.
// Een gebruiker die `%` typt zou zonder behandeling ÁLLES matchen — dezelfde
// te-brede-selectie als een filterbug, alleen via de voordeur. Dat is geen
// cosmetisch nettigheidsdingetje: die verzameling gaat rechtstreeks een
// onherroepelijke `bulk-delete` in. Zie `escapeSearchTerm` voor de precieze
// behandeling.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BULK_BATCH_SIZE,
  SEARCH_TERM_MAX_LENGTH,
  type TransactionSearchCriteria,
} from './bulk-contract'

/**
 * Minimale structurele vorm van een PostgREST-filterbuilder.
 *
 * Bewust structureel en niet `PostgrestFilterBuilder<…>`: dan is deze module
 * testbaar met een fake die alleen registreert wélke filters zijn aangebracht —
 * en dát is precies wat je van een escaping-laag wilt kunnen bewijzen.
 */
export interface TransactionFilterBuilder {
  eq(column: string, value: unknown): TransactionFilterBuilder
  in(column: string, values: readonly unknown[]): TransactionFilterBuilder
  is(column: string, value: unknown): TransactionFilterBuilder
  or(filters: string): TransactionFilterBuilder
  gt(column: string, value: unknown): TransactionFilterBuilder
  lt(column: string, value: unknown): TransactionFilterBuilder
  gte(column: string, value: unknown): TransactionFilterBuilder
  lte(column: string, value: unknown): TransactionFilterBuilder
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Maakt een vrije zoekterm veilig voor gebruik in een `.or()`-ilike-expressie.
 *
 * Drie behandelingen, elk met een eigen reden:
 *
 *  1. **`"` en `\` worden verwijderd.** De waarde wordt in dubbele quotes gezet
 *     zodat `,` `.` `(` `)` hun betekenis verliezen. Een niet-verwijderde `"`
 *     zou die quoting kunnen sluiten en er een tweede `ilike`-tak naast kunnen
 *     hangen (`…"%x",description.ilike."%%"` = match-alles). PostgREST kent wel
 *     backslash-escaping binnen quotes, maar de veiligheid van een
 *     bulk-verwijdering laten afhangen van de escape-semantiek van een
 *     upstream-parser is een slechte ruil voor twee tekens die in een
 *     bankomschrijving niet voorkomen.
 *  2. **`%`, `_` en `*` worden `_`.** Dit zijn de LIKE-wildcards (PostgREST
 *     vertaalt `*` naar `%`); quoting beschermt daar niet tegen, want dat is
 *     LIKE-semantiek en geen parser-semantiek. Ze wegstrepen zou "50% korting"
 *     onvindbaar maken; ze op `_` zetten houdt de match begrensd tot precies
 *     één willekeurig teken. De blast radius van een getypte `%` gaat daarmee
 *     van "alles" naar "één teken speling".
 *  3. **Lengte begrensd** op `SEARCH_TERM_MAX_LENGTH` (tweede rem; de route
 *     weigert 'm ook al via zod).
 *
 * @returns de veilige binnenkant van het patroon, of `null` als er geen
 *   tekstfilter overblijft (leeg = géén foutsituatie, F5).
 */
export function escapeSearchTerm(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().slice(0, SEARCH_TERM_MAX_LENGTH)
  if (!trimmed) return null

  const safe = trimmed
    .replace(/["\\]/g, '')
    .replace(/[%_*]/g, '_')

  return safe.length > 0 ? safe : null
}

/**
 * Maakt vrije gebruikerstekst veilig als LIKE/ILIKE-patroon.
 *
 * Broertje van `escapeSearchTerm` hierboven, met een ander doel: die begrenst een
 * ZOEKterm binnen een `.or()`-expressie, deze beschermt een `.ilike(kolom, tekst)`
 * waarin de tekst LETTERLIJK moet matchen — een regelwaarde die vervangen wordt,
 * een tegenpartij waarop retroactief bijgewerkt wordt.
 *
 * Zonder deze behandeling is `%` een joker. Een `category_corrections`-regel met
 * matchwaarde `%` laat `.delete().ilike('match_value', '%')` ÁLLE regels van die
 * gebruiker wissen, met "Regel opgeslagen" als terugkoppeling; op een retro-update
 * raakt hij élke transactie zonder budget. Dat is dezelfde te-brede-verzameling
 * als een filterbug, alleen via de voordeur.
 *
 * Behandeling:
 *  - `\`, `%` en `_` worden ge-escaped met een backslash (de standaard
 *    LIKE-escape van Postgres) en matchen daarmee letterlijk;
 *  - `*` wordt `_`. PostgREST vertaalt `*` ONVOORWAARDELIJK naar `%` in een
 *    like/ilike-patroon, ook achter een backslash — escapen helpt daar dus niet.
 *    Eén willekeurig teken speling is de kleinst mogelijke rest-onnauwkeurigheid;
 *    de alternatieven zijn "alles matchen" of de term onvindbaar maken.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`).replace(/\*/g, '_')
}

/**
 * De `.or()`-expressie voor de vrije tekst over `description` +
 * `counterparty_name`. `null` wanneer er geen tekstfilter is.
 */
export function buildSearchTextFilter(raw: string | null | undefined): string | null {
  const term = escapeSearchTerm(raw)
  if (!term) return null
  const pattern = `"%${term}%"`
  return `description.ilike.${pattern},counterparty_name.ilike.${pattern}`
}

/** Bedragen deterministisch formatteren: nooit exponent-notatie in een filter. */
function amountLiteral(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

function uuidsOnly(values: readonly (string | null)[]): string[] {
  return values.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
}

/**
 * Brengt het volledige criterium aan op een query.
 *
 * `userId` is een verplichte parameter en `.eq('user_id', …)` wordt ALTIJD
 * gezet — ook al staat er RLS op `transactions`. Die RLS is hier bewust BREDER
 * dan wat we willen tonen: SELECT is huishoud-verbreed
 * (`ownership='shared' AND household_id = user_household_id()`), terwijl
 * UPDATE/DELETE strikt `auth.uid() = user_id` zijn. Zonder dit filter zou de
 * overlay partnerrijen tonen die de gebruiker vervolgens niet kán muteren: een
 * scherm dat liegt, en een selectieteller die niet klopt met wat er gebeurt
 * (ADR 0104, besluit 6).
 *
 * Alles wat als string in een `.or()`-expressie landt wordt hier eerst gezeefd
 * (UUID-vorm, ISO-datum, eindig getal). De zod-schema's op de routes doen dat
 * óók — dit is de laag die het waarmaakt als er ooit een aanroeper bijkomt die
 * dat vergeet.
 */
export function applyTransactionSearchCriteria<Q extends object>(
  query: Q,
  criteria: TransactionSearchCriteria,
  userId: string,
): Q {
  // `Q` is bewust ONgeconstraind en wordt hier naar de structurele vorm gecast.
  // Zou de constraint `Q extends TransactionFilterBuilder` zijn, dan moet TS
  // `PostgrestFilterBuilder` (dat zichzelf als `this` teruggeeft) recursief tegen
  // deze interface aan houden en klapt hij om in TS2589 "type instantiation is
  // excessively deep". De cast kost hier niets: elke aanroeper geeft een
  // PostgREST-builder, en de unit-tests geven een fake die exact deze interface
  // implementeert — dát is waar de vorm bewezen wordt.
  let q = (query as unknown as TransactionFilterBuilder).eq('user_id', userId)

  const textFilter = buildSearchTextFilter(criteria.q)
  if (textFilter) q = q.or(textFilter)

  if (criteria.accountIds && criteria.accountIds.length > 0) {
    q = q.in('account_id', uuidsOnly(criteria.accountIds))
  }

  if (criteria.budgetIds && criteria.budgetIds.length > 0) {
    const wantsNull = criteria.budgetIds.some((b) => b === null)
    const ids = uuidsOnly(criteria.budgetIds)
    if (wantsNull && ids.length > 0) {
      // UUID's zijn hier al gezeefd op vorm, dus veilig als kale lijst in de
      // `in.()`-tak; ze kunnen per definitie geen scheidingsteken bevatten.
      q = q.or(`budget_id.is.null,budget_id.in.(${ids.join(',')})`)
    } else if (wantsNull) {
      q = q.is('budget_id', null)
    } else {
      q = q.in('budget_id', ids)
    }
  }

  // Bedragen zijn ondertekend opgeslagen: positief = inkomst, negatief =
  // uitgave. Dat is dezelfde grondslag als `aggSumPositief`/`aggSumNegatiefAbs`.
  if (criteria.direction === 'expense') q = q.lt('amount', 0)
  if (criteria.direction === 'income') q = q.gt('amount', 0)

  // Bedragfilters zijn ABSOLUUT (het contract zegt: altijd positief opgegeven).
  // `abs(amount) <= max` is een gewone band; `abs(amount) >= min` moet als OR,
  // want PostgREST kan geen `abs()` in een filter.
  if (typeof criteria.amountMax === 'number' && Number.isFinite(criteria.amountMax)) {
    const max = Math.abs(criteria.amountMax)
    q = q.gte('amount', -max).lte('amount', max)
  }
  if (
    typeof criteria.amountMin === 'number' &&
    Number.isFinite(criteria.amountMin) &&
    Math.abs(criteria.amountMin) > 0
  ) {
    const min = Math.abs(criteria.amountMin)
    q = q.or(`amount.gte.${amountLiteral(min)},amount.lte.${amountLiteral(-min)}`)
  }

  if (criteria.dateFrom && ISO_DATE_RE.test(criteria.dateFrom)) q = q.gte('date', criteria.dateFrom)
  if (criteria.dateTo && ISO_DATE_RE.test(criteria.dateTo)) q = q.lte('date', criteria.dateTo)

  return q as unknown as Q
}

/**
 * Kolommen die de zoek- en manifest-route van `transactions` lezen.
 *
 * Expliciet en niet `*`: `transactions` draagt geen ciphertext, maar de
 * kolomregel uit CLAUDE.md is een gewoonte die je niet per tabel wilt afwegen —
 * en een expliciete lijst maakt zichtbaar wat er in de RSC-payload en over de
 * lijn gaat.
 */
export const SEARCH_ROW_COLUMNS =
  'id, date, amount, description, counterparty_name, budget_id, account_id, is_split, transaction_type'

/** Kolommen die het manifest nodig heeft om zijn waarschuwingen te kunnen stellen. */
export const MANIFEST_ROW_COLUMNS = 'id, amount, account_id, is_split, linked_transfer_id'

/** De rijvorm achter `MANIFEST_ROW_COLUMNS`. */
export interface ManifestRow {
  id: string
  amount: number | string
  account_id: string | null
  is_split: boolean | null
  linked_transfer_id: string | null
}

/**
 * De id-tak van het manifest: dezelfde rijen ophalen, maar voor een EXPLICIETE
 * selectie in plaats van een criterium.
 *
 * Waarom dit bestaat naast `readBulkCandidates` (bulk-mutate.ts), dat ook
 * own-row op id leest: die levert de kolommen die de MUTATIE nodig heeft (de
 * huidige markering), deze de kolommen die de BEVESTIGING nodig heeft (bedragen
 * voor de sommen, rekening voor de bankwaarschuwing). Ze samenvoegen zou beide
 * paden kolommen laten lezen die ze niet gebruiken; ze delen wél hun vorm:
 * own-row, gebatcht op `BULK_BATCH_SIZE`, en een gefaalde batch levert géén
 * rijen (die id's vallen dan uit het manifest en dus uit de mutatie — te weinig,
 * nooit te veel).
 *
 * `.eq('user_id')` staat er expliciet bovenop RLS: die is bij SELECT
 * huishoud-verbreed, en een partnerrij in het manifest zou een aantal tonen dat
 * de mutatie nooit haalt.
 */
export async function readManifestRowsByIds(
  supabase: SupabaseClient,
  userId: string,
  ids: readonly string[],
): Promise<ManifestRow[]> {
  const rows: ManifestRow[] = []
  for (let i = 0; i < ids.length; i += BULK_BATCH_SIZE) {
    const batch = ids.slice(i, i + BULK_BATCH_SIZE)
    const { data, error } = await supabase
      .from('transactions')
      .select(MANIFEST_ROW_COLUMNS)
      .eq('user_id', userId)
      .in('id', batch)
    if (error) {
      console.error('[transactions:manifest-ids] leesronde mislukt', error)
      continue
    }
    rows.push(...((data ?? []) as unknown as ManifestRow[]))
  }
  return rows
}

/**
 * De bankrekening-ids met een ACTIEVE koppeling, voor de herimport-waarschuwing
 * (F18/AC10): een verwijderde banktransactie kan bij een volgende sync opnieuw
 * binnenkomen, omdat de dedup-index niets meer blokkeert zodra de rij weg is
 * (R-NF7 — waarschuwen, niet voorkomen).
 *
 * Woont hier omdat zowel de zoekroute (`is_bank_linked` per rij) als de
 * manifest-route (`bankLinkedCount`) hem nodig heeft; twee afleidingen van
 * hetzelfde feit zouden de waarschuwing op de bevestiging kunnen laten afwijken
 * van het vinkje in de lijst.
 *
 * `bank_connection_accounts` is own-row (`auth.uid() = user_id`); het
 * `.eq('user_id')` staat er alsnog expliciet bij, in lijn met de rest van dit
 * pad.
 */
export async function loadBankLinkedAccountIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('bank_connection_accounts')
    .select('bank_account_id')
    .eq('user_id', userId)
    .eq('is_active', true)

  // Een gefaalde leesronde mag de zoekopdracht niet blokkeren: het gevolg is een
  // ONTBREKENDE waarschuwing, niet een verkeerde mutatie. Wel loggen — anders is
  // het verschil met "geen koppelingen" onzichtbaar.
  if (error) {
    console.error('[transactions:bank-linked] koppelrijen laden mislukt', error)
    return new Set()
  }

  const ids = new Set<string>()
  for (const row of data ?? []) {
    if (row.bank_account_id) ids.add(row.bank_account_id)
  }
  return ids
}
