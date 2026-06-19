/**
 * GET /api/investment/holdings/[id]/detail
 *
 * Eén-call data-bundle voor de `InvestmentHoldingPane`-detail-modus. Levert
 * de holding-rij (incl. notes/ter/avg-purchase-price die de standaard
 * `loadInvestmentHoldingsForUser` loader weglaat omdat de holdings-tabel ze
 * niet in z'n minimale view-shape heeft) plus de volledige transactiehistorie
 * (tot HOLDINGS_TX_AGG_LIMIT) uit `investment_transactions`.
 *
 * De transacties voeden zowel de aggregatie-engine (computePositionFromTransactions)
 * als de getoonde transactie-log in de pane. De cap is bewust ruim (5000) zodat
 * pane, full-page én de batch-loader (loadHoldingsPnL) over dezelfde feitelijk
 * volledige set aggregeren — bij een afwijkende cap wijkt "Totale opbrengst" af.
 *
 * Mirror van `app/api/crypto/holdings/[id]/detail/route.ts` met twee bewuste
 * verschillen:
 *   - **Geen prijs-historie** — investment-detail toont geen 90-dgs chart in
 *     de pane (de full-page detail rendert ook geen chart, alleen KPI + meta
 *     + transactions-tabel). Dat scheelt een dure prijs-tabel-fetch zonder
 *     UX-verlies.
 *   - **Holding-row geladen via een directe `select('*')`** ipv de typed-loader,
 *     omdat de pane ook `notes`, `ter`, `ter_source` en `avg_purchase_price`
 *     nodig heeft — velden die `loadInvestmentHoldingsForUser` (zie
 *     `lib/investment-holdings-data.ts`) bewust laat liggen voor z'n list-
 *     view shape. De pane krijgt dezelfde rij die de full-page detail-route
 *     ook opvraagt zodat beide flows dezelfde data zien.
 *
 * Bewuste keuzes:
 *   - Geen caching headers — pane fetcht on-demand. Verschillende holdings
 *     hebben verschillende transactie-historie, en `cache: 'no-store'` op
 *     de Supabase-client zorgt dat de data altijd vers is voor het pane-
 *     moment.
 *   - Errors per call afgevangen — een ontbrekende transactie-tabel mag
 *     de holding zelf niet verbergen.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { HOLDINGS_TX_AGG_LIMIT } from '@/lib/holdings-aggregation'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await params
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  // Stap 1 — holding-row lookup. We selecteren alle velden die de pane mogelijk
  // toont: standaard list-velden (units, current_price, ticker, ...) plus de
  // edit-form velden (avg_purchase_price, notes) en de display-meta (ter,
  // ter_source). Identiek aan de query in
  // `app/(app)/core/assets/investment/[holdingId]/page.tsx` zodat full-page
  // en pane dezelfde shape gebruiken.
  const { data: holding, error: holdingError } = await supabase
    .from('investment_holdings')
    .select(
      `
      id,
      asset_id,
      ticker,
      name,
      isin,
      exchange,
      currency,
      units,
      avg_purchase_price,
      current_price,
      last_price_update,
      previous_close,
      daily_change_percent,
      asset_class,
      sector,
      ter,
      ter_source,
      is_favorite,
      external_source,
      notes,
      asset:assets!asset_id(id, name, asset_type)
      `,
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (holdingError || !holding) {
    return NextResponse.json(
      { error: 'Investment-holding niet gevonden' },
      { status: 404 },
    )
  }

  // Stap 2 — transactions ophalen. Lege rij-set is geldig (nieuwe positie /
  // import zonder trade-detail); we vangen DB-fouten af zodat een falende
  // sub-call de holding-respons niet meeneemt. Schema mirror:
  // `supabase/migrations/20260502000003_split_holdings_tables.sql` regel 169-184.
  //
  // Cap = HOLDINGS_TX_AGG_LIMIT (5000) — dekt de volledige transactiehistorie
  // van elke realistische positie zodat de engine dezelfde set ziet als de
  // batch-loader (loadHoldingsPnL). Zie lib/holdings-aggregation.ts.
  const { data: txData } = await supabase
    .from('investment_transactions')
    .select(
      'id, type, units, price_per_unit, total_amount, currency, date, notes, external_source',
    )
    .eq('holding_id', id)
    .order('date', { ascending: false })
    .limit(HOLDINGS_TX_AGG_LIMIT)

  // Numerieke kolommen worden door PostgREST als string geleverd; we
  // normaliseren ze hier zodat de client geen `Number(...)`-roundtrip hoeft te
  // doen (mirror van `crypto/holdings/[id]/detail` regel 107-129).
  const transactions = ((txData ?? []) as Array<{
    id: string
    type: string
    units: number | string | null
    price_per_unit: number | string | null
    total_amount: number | string | null
    currency: string | null
    date: string
    notes: string | null
    external_source: string | null
  }>).map((tx) => ({
    id: tx.id,
    type: tx.type,
    units: Number(tx.units) || 0,
    price_per_unit: tx.price_per_unit != null ? Number(tx.price_per_unit) : null,
    total_amount: tx.total_amount != null ? Number(tx.total_amount) : null,
    currency: tx.currency,
    date: tx.date,
    notes: tx.notes,
    external_source: tx.external_source,
  }))

  return NextResponse.json({
    holding,
    transactions,
  })
}
