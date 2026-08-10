import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import {
  buildPortfolioValueHistory,
  type PortfolioTransaction,
  type PriceObservation,
} from '@/lib/portfolio-value-history'

/**
 * GET /api/holdings/value-history — waardecurve van de HELE effectenportefeuille.
 *
 * Naast de bestaande per-holding route (`/api/holdings/[id]/value-history`), die
 * één positie in detail toont. Deze route sommeert over alle posities en levert
 * maandpunten (de 1e van elke maand) plus een slotpunt op vandaag.
 *
 * Rekenwerk staat in `lib/portfolio-value-history.ts` — deze route laadt alleen
 * de twee bronnen en geeft het resultaat door. Geen eigen som hier.
 *
 * Query params:
 *   ?months=<n> — beperk tot de laatste n maanden (standaard: hele historie).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const monthsRaw = new URL(request.url).searchParams.get('months')
  const months = monthsRaw !== null && Number.isFinite(Number(monthsRaw))
    ? Math.max(1, Math.min(600, Math.floor(Number(monthsRaw))))
    : null

  try {
    // Alle posities van de gebruiker — óók de gesloten (`units = 0`). Die dragen
    // de historie: een positie die vorig jaar verkocht is, hoorde vorig jaar wél
    // in de curve. Expliciete kolomlijst (kolomregel CLAUDE.md), geen select('*').
    const { data: holdings, error: holdingsError } = await supabase
      .from('investment_holdings')
      .select('id, current_price, last_price_update')
      .eq('user_id', claims.sub)

    if (holdingsError) return serverError(holdingsError, 'holdings-value-history:GET')

    const holdingIds = (holdings ?? []).map((h) => h.id as string)
    if (holdingIds.length === 0) {
      return NextResponse.json({
        points: [],
        averagePricedFromMarket: 0,
        holdingsWithoutMarketPriceCount: 0,
        totalHoldings: 0,
      })
    }

    // Twee batch-queries, geen N+1 — en allebei GEPAGINEERD.
    //
    // Dit is de val die deze route zou opeten zodra de backfill zijn werk doet:
    // PostgREST kapt een select stil af op `max_rows` (1000, supabase/config.toml).
    // Een backfill haalt `range=max` op, dus enkele duizenden koersrijen per
    // ticker; bij 15 tickers is dat tientallen keren de cap. Met
    // `order('date', ascending)` krijg je dan de 1000 OUDSTE rijen — en omdat
    // die de tier `market` dragen, meldt de grafiek `pricedFromMarket = 1`:
    // de hoogst mogelijke vertrouwensclaim boven decennia-oude koersen.
    // "Geen expliciete cap" betekent niet "geen cap".
    const [txRows, priceRows] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from('investment_transactions')
          .select('holding_id, type, units, price_per_unit, total_amount, date')
          .eq('user_id', claims.sub)
          .in('holding_id', holdingIds),
      ),
      fetchAllRows(() =>
        supabase
          .from('investment_holding_prices')
          .select('holding_id, date, close_price')
          .in('holding_id', holdingIds),
      ),
    ])

    if (txRows.error) return serverError(txRows.error, 'holdings-value-history:GET')
    if (priceRows.error) return serverError(priceRows.error, 'holdings-value-history:GET')

    const transactions = txRows.data as unknown as PortfolioTransaction[]
    const today = new Date().toISOString().slice(0, 10)

    // De actuele koers als slotobservatie meegeven. Zonder dit eindigt de curve
    // op de laatst bekende slotkoers of transactieprijs, terwijl de
    // marktwaarde-KPI bóven diezelfde grafiek `current_price` gebruikt — twee
    // getallen voor hetzelfde moment op één scherm. Hardheid volgt
    // `last_price_update`: gezet door een koersvernieuwing = markt, anders (met
    // de hand ingevoerd, of de placeholder die de CSV-import zet) niet.
    const currentPriceRows: PriceObservation[] = (holdings ?? [])
      .filter((h) => Number(h.current_price) > 0)
      .map((h) => ({
        holding_id: h.id as string,
        date: today,
        close_price: Number(h.current_price),
        tier: h.last_price_update ? ('market' as const) : ('transaction' as const),
      }))

    const prices = [
      ...(priceRows.data as unknown as PriceObservation[]),
      ...currentPriceRows,
    ]
    const from = months !== null ? monthsAgo(today, months) : undefined

    const history = buildPortfolioValueHistory({ transactions, prices, today, from })

    return NextResponse.json({
      points: history.points,
      averagePricedFromMarket: history.averagePricedFromMarket,
      // Alleen het AANTAL, niet de id's: de UI heeft genoeg aan "hoeveel
      // posities missen een koers", en holding-id's horen niet nodeloos in een
      // respons die alleen een grafiek voedt.
      holdingsWithoutMarketPriceCount: history.holdingsWithoutMarketPrice.length,
      // De noemer is het aantal posities dat aan de curve MEEDOET, niet het
      // totaal van de gebruiker: alleen posities met transacties zitten in de
      // reeks, dus "X van de 116" zou te gunstig lezen bij 40 met historie.
      totalHoldings: history.holdingsWithHistory,
    })
  } catch (err) {
    return serverError(err, 'holdings-value-history:GET')
  }
}

/** Paginagrootte; gelijk aan PostgREST's `max_rows` (supabase/config.toml). */
const PAGE_SIZE = 1000
/** Runaway-grens: 200 pagina's = 200k rijen, ruim boven elk echt account. */
const MAX_PAGES = 200

/** Minimale vorm van de supabase-query-builder die we hier nodig hebben. */
interface PagableQuery {
  order(column: string, opts: { ascending: boolean }): PagableQuery
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
}

/**
 * Leest een query volledig uit in `range()`-pagina's.
 *
 * Nodig omdat een kale `.select()` stil op `max_rows` afkapt — met een
 * oplopende sortering krijg je dan de OUDSTE rijen en merkt niets het verschil.
 * Sorteren op `(holding_id, date)` maakt de paginering stabiel: zonder een
 * deterministische volgorde kunnen rijen tussen twee pagina's door vallen.
 * Spiegelt `lib/truelayer/existing-hashes.ts`.
 */
async function fetchAllRows(
  build: () => PagableQuery,
): Promise<{ data: Record<string, unknown>[]; error: unknown }> {
  const out: Record<string, unknown>[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await build()
      .order('holding_id', { ascending: true })
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { data: out, error }
    const rows = (data ?? []) as Record<string, unknown>[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return { data: out, error: null }
}

/**
 * `today` minus n maanden, als ISO-datum. String-rekenwerk, geen tijdzones.
 *
 * De dag wordt geklemd op de laatste dag van de doelmaand: 31 maart min één
 * maand is 28 (of 29) februari, niet "2026-02-31". De motor leest van deze
 * waarde alleen jaar en maand, dus die onmogelijke datum zou vandaag niets
 * breken — maar hij lekt wél een ongeldige datumstring naar een parameter die
 * `string` heet, en de eerstvolgende die 'm in `new Date()` stopt of ermee
 * vergelijkt heeft een bug die nergens rood wordt.
 */
function monthsAgo(today: string, months: number): string {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  const total = year * 12 + (month - 1) - months
  const newYear = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  // Dag 0 van de vólgende maand = de laatste dag van deze maand.
  const daysInMonth = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate()
  const safeDay = Math.min(day, daysInMonth)
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}
