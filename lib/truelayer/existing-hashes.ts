import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CROSS_SOURCE_DATE_TOLERANCE_DAYS,
  shiftIsoDate,
  type CrossSourceCandidate,
} from '@/lib/parsers/cross-source-dedup'

/**
 * Paginagrootte van de bestaande-hashes-leesronde. Gelijk aan die van de
 * import-pagina (`range(from, from + 999)`) zodat beide dedup-paden hetzelfde
 * gedrag vertonen bij grote historie.
 */
export const EXISTING_HASH_PAGE_SIZE = 1000

/** Bovengrens op het aantal pagina's — vangnet tegen een oneindige lus als een
 *  backend ooit méér rijen blijft teruggeven dan gevraagd. 100 pagina's = 100k
 *  transacties binnen één rekening én één datumvenster; ruim boven elk reëel
 *  scenario (de bank levert ~3k rijen over 19 maanden). */
const MAX_PAGES = 100

export type ExistingHashScope = {
  /**
   * Verplicht, en in beide loaders hieronder een PRIVACY-CONTROL — geen
   * optimalisatie. De SELECT-policy op `transactions` is bewust bréder dan
   * eigen-rij: ze laat óók huishoud-gedeelde partnerrijen door
   * (`ownership = 'shared' AND household_id = user_household_id()`). RLS is hier
   * dus géén vangnet. Valt de `.eq('user_id', …)` ooit weg omdat iemand 'm als
   * dubbelop leest, dan komen partnerboekingen in de dedup-vergelijking: een
   * eigen transactie wordt stil weggegooid omdat de partner 'm ook heeft, en de
   * cross-bron-teller wordt een inferentiekanaal over andermans uitgaven.
   */
  userId: string
  /** Verplicht: de dedup is rekening-gescoped, net als de unieke index. */
  accountId: string
  /** Vroegste datum uit de binnenkomende batch (`YYYY-MM-DD`). */
  minDate: string
  /** Laatste datum uit de binnenkomende batch (`YYYY-MM-DD`). */
  maxDate: string
}

/**
 * Haal de `import_hash`-en op van transacties die al op DEZE rekening staan,
 * binnen het datumvenster van de binnenkomende batch.
 *
 * Waarom rekening-gescoped: de unieke index is sinds
 * `20260729171125_transactions_drift_account_scoped_dedup_and_source.sql`
 * `(user_id, account_id, import_hash, coalesce(bank_seq,''))`. Een gebruiker-brede
 * vergelijking is dus strenger dan de database en sloeg twee échte boekingen met
 * gelijke datum/bedrag/omschrijving op twéé rekeningen (bv. "Kosten
 * betaalrekening €1,70" op 1 juli bij twee rekeningen) stil over — dataverlies
 * zonder signaal.
 *
 * Waarom het datumvenster veilig is: `computeHash(date, amount, description)`
 * neemt de datum mee, dus twee rijen met dezelfde hash hebben per definitie
 * dezelfde datum. Rijen buiten [minDate, maxDate] kunnen nooit botsen met de
 * batch en hoeven dus niet geladen te worden. Dit begrenst de leesronde bij
 * groeiende historie (de bank levert minstens 19 maanden / ~3k transacties).
 *
 * Waarom gepagineerd: `.in('import_hash', hashes)` is een bewezen faalpatroon —
 * bij een grote batch faalt/kapt de `in`-lijst stil af en glipt élk duplicaat
 * erdoor. De import-pagina heeft dat patroon al afgeschaft; dit spiegelt die
 * `range()`-lus, mét een stabiele `order` zodat pagina's elkaar niet overlappen.
 *
 * Fouten worden bewust gegooid: een leeg resultaat behandelen als "niets bestaat
 * al" zou de hele batch tegen de unieke index laten knallen en de sync als
 * "geslaagd, 0 nieuw" wegschrijven.
 */
export async function loadExistingImportHashes(
  supabase: SupabaseClient,
  scope: ExistingHashScope,
): Promise<Set<string>> {
  const hashes = new Set<string>()

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * EXISTING_HASH_PAGE_SIZE
    const { data, error } = await supabase
      .from('transactions')
      .select('import_hash')
      .eq('user_id', scope.userId)
      .eq('account_id', scope.accountId)
      .not('import_hash', 'is', null)
      .gte('date', scope.minDate)
      .lte('date', scope.maxDate)
      .order('id', { ascending: true })
      .range(from, from + EXISTING_HASH_PAGE_SIZE - 1)

    if (error) {
      // De rauwe PostgREST-melding blijft server-side: de route vangt deze fout
      // en schrijft `err.message` naar `bank_sync_log.error_message`, en die
      // tabel staat in `lib/user-data-tables.ts` — driver-details zouden dus via
      // de AVG-data-export alsnog bij de gebruiker terugkomen.
      console.error('[bankconnect-sync:existing-hashes] query mislukt:', error)
      throw new Error('Bestaande import-hashes ophalen mislukt')
    }

    const rows = (data ?? []) as { import_hash: string | null }[]
    for (const row of rows) {
      if (row.import_hash) hashes.add(row.import_hash)
    }

    if (rows.length < EXISTING_HASH_PAGE_SIZE) break
  }

  return hashes
}

/**
 * Sleutel die de samengestelde unieke index exact spiegelt:
 * `import_hash | coalesce(bank_seq, '')`.
 *
 * Bewust identiek aan `rowDedupKey` op de import-pagina — dat is de sleutel die
 * de database daadwerkelijk afdwingt. Eén serialisatie, twee schrijvers.
 */
export function dedupKey(row: { import_hash: string; bank_seq?: string | null }): string {
  return `${row.import_hash}|${row.bank_seq ?? ''}`
}

/**
 * Laag 1 voor het IMPORTPAD: de volledige indexsleutels
 * (`import_hash|bank_seq`) van transacties die al op DEZE rekening staan.
 *
 * Waarom niet `loadExistingImportHashes` hergebruiken? Omdat de twee schrijvers
 * verschillende brongegevens hebben en de plooi precies daar zit:
 *
 *  - **Sync (TrueLayer)** vergelijkt op `import_hash` alléén. Dat mag daar, want
 *    de mapper zet `bank_seq` altijd op `null` — de volledige indexsleutel is er
 *    per definitie gelijk aan de hash. Hash-only is daar bovendien bewust
 *    conservatief tegenover CSV-rijen mét volgnummer.
 *  - **Import (bestand)** heeft wél volgnummers. Zou dit pad op hash-only
 *    vergelijken, dan sloeg het twee ÉCHT verschillende boekingen met gelijke
 *    datum/bedrag/omschrijving en een verschillend Volgnr samen — strenger dan
 *    de database zelf en dus stil dataverlies. Dat is precies de fout die
 *    migratie `20260729171125_…` aan de indexkant repareerde (R6).
 *
 * Verder identiek aan `loadExistingImportHashes`: gescoped op
 * `(user_id, account_id)` + het datumvenster van de batch, gepagineerd, en
 * fouten worden gegooid in plaats van als "niets bestaat al" gelezen.
 */
export async function loadExistingDedupKeys(
  supabase: SupabaseClient,
  scope: ExistingHashScope,
): Promise<Set<string>> {
  const keys = new Set<string>()

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * EXISTING_HASH_PAGE_SIZE
    const { data, error } = await supabase
      .from('transactions')
      .select('import_hash, bank_seq')
      .eq('user_id', scope.userId)
      .eq('account_id', scope.accountId)
      .not('import_hash', 'is', null)
      .gte('date', scope.minDate)
      .lte('date', scope.maxDate)
      .order('id', { ascending: true })
      .range(from, from + EXISTING_HASH_PAGE_SIZE - 1)

    if (error) {
      // Rauwe PostgREST-melding blijft server-side (AVG): de route stuurt een
      // generieke tekst en logt het echte detail met tag.
      console.error('[transactions-import:existing-dedup-keys] query mislukt:', error)
      throw new Error('Bestaande transacties voor duplicaatcontrole ophalen mislukt')
    }

    const rows = (data ?? []) as { import_hash: string | null; bank_seq: string | null }[]
    for (const row of rows) {
      if (row.import_hash) keys.add(dedupKey({ import_hash: row.import_hash, bank_seq: row.bank_seq }))
    }

    if (rows.length < EXISTING_HASH_PAGE_SIZE) break
  }

  return keys
}

/**
 * Haal de KANDIDAAT-RIJEN op voor dedup-laag 2 (cross-bron): de vier velden
 * waarop `lib/parsers/cross-source-dedup.ts` matcht, van transacties die al op
 * DEZE rekening staan rond het datumvenster van de binnenkomende batch.
 *
 * Woont bewust in dit bestand en niet in de route: het is exact dezelfde
 * scope-regel (gebruiker + rekening + datumvenster + `range()`-paginatie) die
 * hierboven al is verantwoord. Een derde ophaalpad met een eigen interpretatie
 * van "wat staat er al" is precies hoe twee dedup-lagen uit de pas gaan lopen.
 *
 * **Het venster wordt hier verbreed met de tolerantie van laag 2**, niet door de
 * aanroeper. De matcher accepteert ±1 kalenderdag; zou de ophaal exact het
 * batchvenster nemen, dan zou een duplicaat op de dag vóór de vroegste of ná de
 * laatste rij nooit in beeld komen en glipte hij er stil doorheen. Eén constante
 * (`CROSS_SOURCE_DATE_TOLERANCE_DAYS`), één plek waar ze wordt toegepast.
 *
 * Op een verse rekening levert deze query nul rijen en is laag 2 dus vanzelf een
 * no-op — daar is bewust géén "is deze rekening nieuw"-vlag voor: zo'n vlag
 * veroudert en gaat op enig moment stil liegen.
 *
 * Alle bronnen tellen mee (`source` = bank/import/handmatig/NULL): laag 2 gaat
 * er juist over dat de tegenpartij van een CSV-rij en die van een bankrij
 * dezelfde boeking zijn.
 *
 * Fouten worden gegooid, niet als "niets bestaat al" geïnterpreteerd: dat zou de
 * hele batch alsnog invoegen en de dubbele reeks opleveren die deze laag hoort
 * te voorkomen.
 */
export async function loadCrossSourceCandidates(
  supabase: SupabaseClient,
  scope: ExistingHashScope,
): Promise<CrossSourceCandidate[]> {
  const from = shiftIsoDate(scope.minDate, -CROSS_SOURCE_DATE_TOLERANCE_DAYS)
  const to = shiftIsoDate(scope.maxDate, CROSS_SOURCE_DATE_TOLERANCE_DAYS)
  const candidates: CrossSourceCandidate[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * EXISTING_HASH_PAGE_SIZE
    const { data, error } = await supabase
      .from('transactions')
      .select('date, amount, counterparty_iban, counterparty_name')
      .eq('user_id', scope.userId)
      .eq('account_id', scope.accountId)
      .gte('date', from)
      .lte('date', to)
      .order('id', { ascending: true })
      .range(offset, offset + EXISTING_HASH_PAGE_SIZE - 1)

    if (error) {
      // Zelfde reden als hierboven: de rauwe PostgREST-melding zou via
      // bank_sync_log.error_message in de AVG-data-export belanden.
      console.error('[bankconnect-sync:cross-source-candidates] query mislukt:', error)
      throw new Error('Bestaande transacties voor cross-bron-dedup ophalen mislukt')
    }

    const rows = (data ?? []) as CrossSourceCandidate[]
    candidates.push(...rows)

    if (rows.length < EXISTING_HASH_PAGE_SIZE) break
  }

  return candidates
}

/**
 * Datum van de nieuwste transactie die al op DEZE rekening staat, of `null` bij
 * een lege rekening.
 *
 * Woont bewust in dit bestand: het is dezelfde scope-regel (gebruiker + rekening
 * op `transactions`) die hierboven al is verantwoord, en die redenering hoort
 * niet op twee plekken te leven. Het is géén tweede dedup-pad — dit levert
 * alleen het startpunt voor `planInitialFetch` (B9).
 *
 * Alle bronnen tellen mee (`source` = bank/import/handmatig/NULL): B9 gaat over
 * "draagt deze rekening al historie", niet over waar die historie vandaan komt.
 * Juist een CSV-geïmporteerde reeks is de reden dat de eerste ophaal daar niet
 * overheen mag walsen.
 *
 * Fouten worden gegooid, niet als "lege rekening" geïnterpreteerd: dat laatste
 * zou een volledige historische ophaal (vier verzoeken tegen de bank-eigen
 * limiet) uitlokken op een rekening die al vol staat.
 */
export async function loadNewestTransactionDate(
  supabase: SupabaseClient,
  scope: { userId: string; accountId: string },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', scope.userId)
    .eq('account_id', scope.accountId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Zelfde reden als hierboven: de rauwe PostgREST-melding zou via
    // bank_sync_log.error_message in de AVG-data-export belanden.
    console.error('[bankconnect-sync:newest-transaction] query mislukt:', error)
    throw new Error('Nieuwste bestaande transactie ophalen mislukt')
  }

  return (data as { date?: string | null } | null)?.date ?? null
}
