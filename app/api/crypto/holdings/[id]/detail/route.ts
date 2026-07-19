/**
 * GET /api/crypto/holdings/[id]/detail
 *
 * Eén-call data-bundle voor de `CryptoHoldingPane`-detail-modus. Levert de
 * holding-rij (incl. hydrated source/sync-velden), de laatste 200 transacties
 * en 90 dagen close-prijs-historie. Dezelfde info die de full-page
 * `/core/assets/crypto/[holdingId]` server-component zou laden, maar dan via
 * een client-bereikbare API zodat de pane on-demand kan fetchen zonder een
 * server roundtrip op de holdings-tab voor élke holding.
 *
 * Bewuste keuzes:
 *   - Geen caching headers — pane fetcht on-demand. Verschillende holdings
 *     hebben verschillende prijs-historie-windows, en `cache: 'no-store'` op
 *     de Supabase-client (zie `lib/supabase/server.ts`) zorgt dat de prijzen
 *     altijd vers zijn voor het pane-moment.
 *   - Gebruik `loadCryptoHoldingsForUser()` + filter op `id` ipv een aparte
 *     query — hergebruikt de geheel-getypeerde row-mapper inclusief de
 *     `source` discriminator, EUR-valuation en kostenbasis-berekening. De
 *     loader cachet binnen één request (react/cache) dus de extra werk-load
 *     is minimaal als de pane samen met de holdings-page laadt.
 *   - Errors per call afgevangen — een falende prijs-historie (of een
 *     ontbrekende transactie-tabel) mag de holding zelf niet verbergen.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  loadCryptoHoldingPriceHistory,
  loadCryptoHoldingsForUser,
} from '@/lib/crypto-holdings-data'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PRICE_HISTORY_DAYS = 90
const TRANSACTIONS_LIMIT = 200

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await params
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  // Stap 1 — holding-row lookup. We hergebruiken de typed-loader zodat we
  // dezelfde `CryptoHoldingRow`-shape aan de pane geven als de holdings-grid;
  // dat scheelt een extra type-mapping op de client. Filter op `id` na een
  // bredere fetch is bewust — de loader cachet user-breed en heeft de
  // hydrated source-velden al uitgepakt.
  const holdings = await loadCryptoHoldingsForUser(supabase)
  const holding = holdings.find((h) => h.id === id) ?? null

  if (!holding) {
    return NextResponse.json(
      { error: 'Crypto-holding niet gevonden' },
      { status: 404 },
    )
  }

  // Stap 2 — transactions + price history parallel. Beide kunnen leeg zijn
  // (nieuwe positie / fiat-saldo / nieuwe import); we gebruiken
  // `Promise.allSettled` zodat één falende sub-call de andere niet meeneemt.
  // Voor fiat-saldi slaan we de price-history call helemaal over — er is
  // geen koers en de tabel zou per definitie leeg zijn.
  const txPromise = supabase
    .from('crypto_transactions')
    .select(
      'id, type, units, price_per_unit, total_amount, fee_native, fee_currency, date, notes, external_source',
    )
    .eq('holding_id', id)
    .eq('user_id', claims.sub)
    .order('date', { ascending: false })
    .limit(TRANSACTIONS_LIMIT)

  const priceHistoryPromise = holding.isFiatBalance
    ? Promise.resolve([])
    : loadCryptoHoldingPriceHistory(supabase, id, PRICE_HISTORY_DAYS).catch(
        () => [],
      )

  const [txResult, priceHistoryResult] = await Promise.allSettled([
    txPromise,
    priceHistoryPromise,
  ])

  const txRows =
    txResult.status === 'fulfilled' ? (txResult.value.data ?? []) : []
  const priceHistory =
    priceHistoryResult.status === 'fulfilled' ? priceHistoryResult.value : []

  // Type-shape voor de transactions die we naar de client sturen — alle
  // numerieke kolommen worden door PostgREST als string geleverd; we laten
  // dat zo en laten de client `Number(...)` aanroepen waar nodig (mirror van
  // de full-page `[holdingId]/page.tsx` regel 126-137 zodat beide flows
  // dezelfde type-aannames hebben).
  const transactions = (txRows as Array<{
    id: string
    type: string
    units: number | string
    price_per_unit: number | string | null
    total_amount: number | string | null
    fee_native: number | string | null
    fee_currency: string | null
    date: string
    notes: string | null
    external_source: string | null
  }>).map((tx) => ({
    id: tx.id,
    type: tx.type,
    units: Number(tx.units) || 0,
    price_per_unit: tx.price_per_unit != null ? Number(tx.price_per_unit) : null,
    total_amount: tx.total_amount != null ? Number(tx.total_amount) : null,
    fee_native: tx.fee_native != null ? Number(tx.fee_native) : null,
    fee_currency: tx.fee_currency,
    date: tx.date,
    notes: tx.notes,
    external_source: tx.external_source,
  }))

  return NextResponse.json({
    holding,
    transactions,
    priceHistory,
  })
}
