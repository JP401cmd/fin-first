// lib/holdings-data-loader.ts
// Server-side data loader for the legacy Holdings app (the deepening tab on
// `/core/assets/investment`). Provides initial data to eliminate the client-
// side JS→fetch waterfall.
//
// Reads from BOTH `investment_holdings` and `crypto_holdings`, only including
// rows whose parent asset has has_holdings_tracking = true. The Holdings app
// was originally investment-only; we keep its public shape (a flat array with
// a `bucket` discriminator added) so existing consumers can keep rendering.
//
// Per-type loaders for the new categorie-pagina-cards live in
// `lib/investment-holdings-data.ts` and `lib/crypto-holdings-data.ts` (P3).

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadHoldingsPnL, attachPnLToHoldings } from '@/lib/holdings-pnl-enrichment'

// ── Types ──────────────────────────────────────────────────────

export interface HoldingsPageData {
  holdings: Array<Record<string, unknown>>
  totalValue: number
  totalCost: number
  source: string
  /**
   * Yearly essentiële uitgaven uit de must-budgets — voor de FIRE-deck-regel
   * onder de hero ("dekt X jaar uitgaven bij 4% SWR"). 0 als budget-module
   * niet gebruikt wordt; UI verbergt de regel dan.
   */
  yearlyEssentialExpenses: number
}

interface AssetJoin {
  id: string
  name: string
  has_holdings_tracking: boolean | null
}

// ── Loader ─────────────────────────────────────────────────────

export const loadHoldingsData = cache(async (supabase: SupabaseClient): Promise<HoldingsPageData> => {
  const user = await getCachedUser(supabase)
  if (!user) throw new Error('Not authenticated')

  const [{ data: invRows }, { data: cryRows }, { data: essentialBudgets }] = await Promise.all([
    supabase
      .from('investment_holdings')
      .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('crypto_holdings')
      .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .order('created_at', { ascending: true }),
    // Essentiële uitgaven voor FIRE-deck onder de hero. Spiegelt
    // app/api/snapshots/route.ts:37-48 zodat dezelfde definitie wordt gebruikt.
    supabase
      .from('budgets')
      .select('default_limit, interval')
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
  ])

  const yearlyEssentialExpenses = (essentialBudgets ?? []).reduce(
    (s: number, b: { default_limit: number | string; interval: string }) => {
      const limit = Number(b.default_limit) || 0
      return s + (b.interval === 'yearly' ? limit : limit * 12)
    },
    0,
  )

  const investmentRows = ((invRows ?? []) as Array<Record<string, unknown>>)
    .filter((h) => h.asset != null)
  const cryptoRows = ((cryRows ?? []) as Array<Record<string, unknown>>)
    .filter((h) => h.asset != null)

  let totalValue = 0
  let totalCost = 0
  for (const h of investmentRows) {
    const units = Number(h.units) || 0
    const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
    const avgPurchasePrice = Number(h.avg_purchase_price) || 0
    totalValue += units * currentPrice
    totalCost += units * avgPurchasePrice
  }
  for (const h of cryptoRows) {
    const units = Number(h.units) || 0
    const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
    const avgPurchasePrice = Number(h.avg_purchase_price) || 0
    totalValue += units * currentPrice
    totalCost += units * avgPurchasePrice
  }

  // Crypto rows get a derived `ticker` field (`{symbol}-EUR`) so existing
  // consumers that expect a Yahoo-style ticker keep working without branching
  // on bucket.
  const flatten = (rows: Array<Record<string, unknown>>, bucket: 'investment' | 'crypto') =>
    rows.map((h) => {
      const asset = h.asset as AssetJoin | null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { asset: _unused, ...rest } = h
      const baseTicker = bucket === 'crypto'
        ? `${(rest.symbol as string | null)?.toUpperCase() ?? ''}-EUR`
        : (rest.ticker as string | null)
      return {
        ...rest,
        bucket,
        ticker: baseTicker,
        asset_name: asset?.name ?? null,
        asset_id: asset?.id ?? rest.asset_id,
      }
    })

  // Verrijk de investment-rijen met opbrengst per rij via de canonieke
  // aggregatie-engine (één batch-query, geen N+1). Nodig voor de lijst-
  // weergave: sorteren op opbrengst + het tonen van het opbrengst-bedrag op
  // gesloten posities. Crypto-rijen blijven ongemoeid (eigen transactietabel,
  // buiten scope). De helper levert per holding een Map; ontbrekende rijen
  // (geen transacties) krijgen `null`-P&L en de UI valt terug op de
  // holding-kolommen.
  const flatInvestment = flatten(investmentRows, 'investment') as unknown as Array<
    Record<string, unknown> & { id: string }
  >
  const pnlMap = await loadHoldingsPnL(
    supabase,
    flatInvestment.map((h) => ({
      id: h.id,
      current_price: h.current_price as number | string | null | undefined,
    })),
    user.id,
  )
  const enrichedInvestment = attachPnLToHoldings(flatInvestment, pnlMap)

  const holdings: Array<Record<string, unknown>> = [
    ...enrichedInvestment,
    ...flatten(cryptoRows, 'crypto'),
  ]

  return {
    holdings,
    totalValue,
    totalCost,
    source: 'server',
    yearlyEssentialExpenses,
  }
})
