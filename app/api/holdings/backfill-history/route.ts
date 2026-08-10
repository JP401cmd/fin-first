import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchHistoricalPrices, storeHistoricalPrices } from '@/lib/historical-prices'
import { isResolvableTicker, normalizeTicker } from '@/lib/yahoo-ticker'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'

/**
 * POST /api/holdings/backfill-history
 *
 * Vult `investment_holding_prices` met de VOLLEDIGE koershistorie (Yahoo range
 * `max`) van de effectenposities van de ingelogde gebruiker, zodat er een
 * historische portefeuillecurve op gebouwd kan worden.
 *
 * WAAROM NAAST DE DAGELIJKSE CRON
 * -------------------------------
 * `/api/holdings/refresh-prices/cron` schrijft per dag één rij per ACTIEVE
 * positie. Voor een account met 109 posities levert dat 13 rijen van vandaag op:
 * geen historie, dus geen waardegrafiek en een benchmarkgrafiek die meldt "Je
 * eigen lijn ontbreekt nog". Deze route haalt de ontbrekende reeks in één (of
 * enkele) gebruikersgeïnitieerde aanroep(en) op.
 *
 * VIJF IMPORTTOETSEN (CLAUDE.md)
 * ------------------------------
 * 1. Expliciet doel — het doel is de bestaande holding-rij (`holding_id`). Deze
 *    route MAAKT NOOIT een holding, asset of andere bak aan; hij vult alleen
 *    historie bij rijen die de gebruiker al bezit.
 * 2. Sleutel server-bepaald — de dedup-sleutel is `(holding_id, date)`.
 *    `holding_id` komt uit een query die op `user_id` is gescoped; `date` komt
 *    van Yahoo. De client levert geen enkel deel van de sleutel aan; `offset` is
 *    puur een cursor in de eigen lijst en kan de scope niet verbreden.
 * 3. Afgeleide getallen herleiden — deze route hoogt NIETS op. Hij raakt
 *    `current_price`, `units` en de asset-rollups niet aan; historie is puur
 *    additief per (holding, dag). De tellers in de respons worden geteld uit de
 *    daadwerkelijke schrijfresultaten, niet opgeteld bij een eerdere stand.
 * 4. Scoping volgt eigenaarschap — `investment_holding_prices` is eigen-rij via
 *    `holding_id` (FK + RLS naar `investment_holdings.user_id`), dus de unieke
 *    index is `UNIQUE(holding_id, date)` ZONDER `user_id`. De `onConflict` in
 *    `storeHistoricalPrices` noemt exact die twee kolommen.
 * 5. Zichtbare terugkoppeling — de respons telt expliciet wat gevuld,
 *    overgeslagen, onoplosbaar en nog te doen is. Geen stille afkap: wat deze
 *    aanroep niet haalde staat in `remaining` + `nextOffset`.
 *
 * IDEMPOTENT — twee keer draaien is veilig. `storeHistoricalPrices` doet een
 * upsert op `holding_id,date`; de tweede run herschrijft dezelfde rijen met
 * dezelfde waarden. `priceRowsWritten` telt aangeboden rijen, dus dat getal
 * blijft gelijk — het aantal rijen in de tabel niet meer.
 *
 * Body (optioneel): { offset?: number } — cursor in de gesorteerde lijst van
 * oplosbare tickers, voor doorpagineren.
 */

// Yahoo-calls + grote upserts over tientallen tickers. Spiegelt de zuster-routes
// (refresh-prices, refresh-prices/cron, transactions/import) die om dezelfde
// reden op het Vercel-maximum van 60s staan.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// ── Grenzen (allemaal expliciet, geen stille afkap) ───────────────

/**
 * Paginagrootte waarmee we de holdings-lijst uitlezen. supabase-js kapt een
 * `.select()` stil af op de PostgREST-default (1000 rijen); dat is precies de
 * omgekeerde-richting-lek uit CLAUDE.md — je ziet bestaande rijen niet en denkt
 * dat er niets te doen valt. Daarom lezen we in expliciete `range()`-pagina's
 * door tot de bron leeg is.
 */
const HOLDINGS_PAGE_SIZE = 500

/**
 * Noodrem op de paginatie-lus. Puur een lus-garantie: bij 109 posities zitten we
 * er factor 90 onder. Wordt hij toch geraakt, dan wordt dat server-side gelogd
 * (alleen tellingen, geen rij-data) — niet stil ingeslikt.
 */
const HOLDINGS_SCAN_HARD_CAP = 10_000

/**
 * Aantal UNIEKE tickers dat één aanroep ophaalt. Een `max`-reeks is al gauw
 * 2.500–15.000 dagen; fetch + chunked upsert kost ~1–3s per ticker. 20 past
 * ruim binnen `maxDuration`, de rest gaat via `nextOffset`.
 */
const MAX_TICKERS_PER_CALL = 20

/**
 * Upsert-batchgrootte. Een `max`-reeks in één PostgREST-call duwen loopt tegen
 * payload-grenzen aan; per chunk schrijven houdt dat voorspelbaar. Elke chunk is
 * een eigen upsert op dezelfde unieke index, dus chunking verandert niets aan de
 * idempotentie.
 */
const PRICE_UPSERT_CHUNK = 1_000

/**
 * Zachte deadline: na dit punt starten we geen nieuwe ticker meer. Zo eindigt de
 * aanroep met een eerlijke `remaining`-telling in plaats van een harde timeout
 * die alles verliest wat al opgehaald was.
 */
const SOFT_DEADLINE_MS = 45_000

// ── Rate-limiter (5 requests/seconde, zelfde tempo als lib/price-feed.ts) ──

/**
 * `lib/price-feed.ts` heeft een token-bucket op 5/s, maar exporteert die niet
 * (`acquireRateLimitTokenBlocking` is module-privé). We verbouwen die module
 * niet voor deze route; in plaats daarvan hetzelfde tempo met een eigen kleine
 * bucket. Net als daar is de state per serverless-instance — dat is de
 * bestaande, geaccepteerde benadering, geen nieuwe aanname.
 */
const YAHOO_MAX_TOKENS = 5
const YAHOO_REFILL_PER_SECOND = 5
const YAHOO_REFILL_INTERVAL_MS = Math.ceil(1000 / YAHOO_REFILL_PER_SECOND) // ~200ms
const YAHOO_MAX_WAIT_MS = 10_000

let yahooTokens = YAHOO_MAX_TOKENS
let yahooLastRefill = Date.now()

function tryAcquireYahooToken(): boolean {
  const now = Date.now()
  const elapsedSeconds = (now - yahooLastRefill) / 1000
  yahooTokens = Math.min(YAHOO_MAX_TOKENS, yahooTokens + elapsedSeconds * YAHOO_REFILL_PER_SECOND)
  yahooLastRefill = now

  if (yahooTokens >= 1) {
    yahooTokens -= 1
    return true
  }
  return false
}

/** Wacht (gebonden) op capaciteit i.p.v. de holding vals als "mislukt" te merken. */
async function acquireYahooToken(maxWaitMs = YAHOO_MAX_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    if (tryAcquireYahooToken()) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, YAHOO_REFILL_INTERVAL_MS + 10))
  }
}

// ── Request/response-contract ─────────────────────────────────────

const BackfillBodySchema = z.object({
  /**
   * Cursor: hoeveel unieke tickers al in eerdere aanroepen zijn afgehandeld.
   *
   * Indexeert uitsluitend in de eigen, op `user_id` gescopede lijst — hij kan de
   * scope niet verbreden, alleen bepalen wáár in de eigen lijst begonnen wordt.
   *
   * Bekende beperking: komt er tussen twee pagina's een holding bij met een
   * ticker die alfabetisch vóór de cursor valt, dan slaat déze pagineerronde hem
   * over. Dat is zichtbaar (hij blijft zonder historie) en zelfherstellend — een
   * volgende run vanaf `offset: 0` pakt hem alsnog op, en dat is dankzij de
   * upsert gratis.
   */
  offset: z.number().int().min(0).optional(),
})

type BackfillResponse = {
  /** Holdings waarvoor in DEZE aanroep ≥1 koersrij is weggeschreven. */
  backfilled: number
  /**
   * Holdings die in deze aanroep zijn geprobeerd maar niets opleverden — Yahoo
   * gaf geen reeks terug, of de upsert faalde. Holdings die op een volgende
   * pagina staan tellen hier NIET in mee; die zitten in `remaining`.
   */
  skipped: number
  /**
   * Holdings waarvan het ticker-veld geen Yahoo-symbool kán zijn: leeg, een
   * broker-omschrijving ("AEX 485.9SPSOPENG") of een ISIN. Doorpagineren helpt
   * hier niet — deze hebben een andere resolutieroute nodig.
   */
  skippedUnresolvable: number
  /** Aantal aangeboden koersrijen (holding × dag) over alle upserts heen. */
  priceRowsWritten: number
  /** Unieke tickers die na deze aanroep nog open staan. */
  remaining: number
  /** Cursor voor de volgende aanroep, of `null` als alles is afgehandeld. */
  nextOffset: number | null
}

type HoldingRow = {
  id: string
  ticker: string | null
  isin: string | null
  name: string | null
  units: number | string | null
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  try {
    // ── Body (optioneel, zod-gevalideerd) ──────────────────────────
    // Een lege body is geldig ("backfill alles vanaf het begin"), dus we lezen
    // eerst de tekst; `parseBody` zou op een lege POST een 400 geven.
    const rawBody = await request.text()
    let candidate: unknown = {}
    if (rawBody.trim().length > 0) {
      try {
        candidate = JSON.parse(rawBody)
      } catch {
        return badRequest('Ongeldig JSON-formaat in request body')
      }
    }
    const parsed = BackfillBodySchema.safeParse(candidate)
    if (!parsed.success) {
      return badRequest('offset moet een geheel getal ≥ 0 zijn', 'validation_error')
    }
    const offset = parsed.data.offset ?? 0

    // ── 1. Alle holdings van de gebruiker (óók units = 0) ──────────
    // Bewust GEEN filter op `units` of `is_active`: 95 van de 109 posities in
    // het referentie-account zijn gesloten, en juist die dragen de historie die
    // de portefeuillecurve nodig heeft. De refresh-route slaat ze wél over —
    // daar gaat het om de huidige waarde, hier om het verleden.
    //
    // Expliciete kolomlijst, geen `select('*')`: `investment_holdings` valt
    // onder de kolomregel uit CLAUDE.md.
    const holdings: HoldingRow[] = []
    for (let page = 0; ; page++) {
      const from = page * HOLDINGS_PAGE_SIZE
      const { data, error } = await supabase
        .from('investment_holdings')
        .select('id, ticker, isin, name, units')
        .eq('user_id', claims.sub)
        // Stabiele sortering: zonder expliciete `order` is `range()`-paginatie
        // niet deterministisch en kunnen rijen tussen pagina's wegvallen.
        .order('id', { ascending: true })
        .range(from, from + HOLDINGS_PAGE_SIZE - 1)

      if (error) {
        return serverError(error, 'holdings-backfill:POST')
      }
      const rows = (data ?? []) as HoldingRow[]
      holdings.push(...rows)

      if (rows.length < HOLDINGS_PAGE_SIZE) break
      if (holdings.length >= HOLDINGS_SCAN_HARD_CAP) {
        // Alleen tellingen loggen — nooit rij-data (CLAUDE.md).
        console.warn(
          `[holdings-backfill:POST] scan-hard-cap geraakt bij ${holdings.length} holdings; rest niet gelezen`,
        )
        break
      }
    }

    // ── 2. Splitsen: oplosbaar vs. onoplosbaar ─────────────────────
    // Dedup op de GENORMALISEERDE ticker, zodat meerdere holdings met hetzelfde
    // symbool samen één Yahoo-call doen en de reeks daarna per holding wordt
    // weggeschreven.
    const holdingsByTicker = new Map<string, string[]>()
    let skippedUnresolvable = 0

    for (const holding of holdings) {
      if (!isResolvableTicker(holding.ticker)) {
        skippedUnresolvable++
        continue
      }
      const ticker = normalizeTicker(holding.ticker)!
      const bucket = holdingsByTicker.get(ticker)
      if (bucket) bucket.push(holding.id)
      else holdingsByTicker.set(ticker, [holding.id])
    }

    // Alfabetisch = een cursor die tussen aanroepen stabiel is, zodat `offset`
    // steeds dezelfde tickers overslaat.
    const orderedTickers = [...holdingsByTicker.keys()].sort()
    const slice = orderedTickers.slice(offset, offset + MAX_TICKERS_PER_CALL)

    // ── 3. Ophalen + wegschrijven ──────────────────────────────────
    let backfilled = 0
    let skipped = 0
    let priceRowsWritten = 0
    let processedTickers = 0

    for (const ticker of slice) {
      if (Date.now() - startedAt > SOFT_DEADLINE_MS) break

      const holdingIds = holdingsByTicker.get(ticker) ?? []

      const gotToken = await acquireYahooToken()
      if (!gotToken) {
        // Geen capaciteit binnen de wachttijd: niet als "verwerkt" tellen, zodat
        // deze ticker in `remaining` blijft staan i.p.v. stil te verdwijnen.
        break
      }

      // `fetchHistoricalPrices` throwt nooit — bij netwerk-/parsefout of een
      // symbool dat Yahoo niet kent komt er een lege array terug.
      const prices = await fetchHistoricalPrices(ticker, 'max')
      processedTickers++

      if (prices.length === 0) {
        skipped += holdingIds.length
        continue
      }

      for (const holdingId of holdingIds) {
        let writtenForHolding = 0
        for (let i = 0; i < prices.length; i += PRICE_UPSERT_CHUNK) {
          const chunk = prices.slice(i, i + PRICE_UPSERT_CHUNK)
          // Upsert op `holding_id,date` — exact de kolommen van
          // UNIQUE(holding_id, date). Dit is wat de route idempotent maakt.
          writtenForHolding += await storeHistoricalPrices(supabase, holdingId, chunk)
        }
        priceRowsWritten += writtenForHolding
        if (writtenForHolding > 0) backfilled++
        else skipped++
      }
    }

    const cursor = offset + processedTickers
    const remaining = Math.max(0, orderedTickers.length - cursor)

    const response: BackfillResponse = {
      backfilled,
      skipped,
      skippedUnresolvable,
      priceRowsWritten,
      remaining,
      nextOffset: remaining > 0 ? cursor : null,
    }

    return NextResponse.json(response)
  } catch (err) {
    return serverError(err, 'holdings-backfill:POST')
  }
}
