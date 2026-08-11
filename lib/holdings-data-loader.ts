// lib/holdings-data-loader.ts
// Server-side data loader for the legacy Holdings app (the deepening tab on
// `/core/assets/investment`). Provides initial data to eliminate the client-
// side JS→fetch waterfall.
//
// UITSLUITEND `investment_holdings`, en alleen rijen waarvan het bovenliggende
// bezit `has_holdings_tracking = true` draagt.
//
// Deze loader las ooit óók `crypto_holdings` mee. Dat stamde uit de tijd dat er
// nog geen crypto-app was; inmiddels is die er wél (`lib/crypto-holdings-data.ts`
// → de "Crypto holdings"-tab, met eigen transacties, koershistorie, spreiding en
// Box 3-strook). Crypto in deze loader laten betekende dat munten opdoken in de
// AANDELEN-app — een tweede, armere weergave van dezelfde posities, met een
// afgeleide `{SYMBOOL}-EUR`-ticker die de aandelen-lijst als beursticker las.
// Eén oppervlak per soort bezit; deze is die voor effecten.
//
// Rijen dragen nog steeds `bucket: 'investment'`: consumenten (chips, filters)
// vertakken erop, en de discriminator weghalen zou hen stilzwijgend breken.
//
// Per-type loaders voor de categorie-pagina-kaarten staan in
// `lib/investment-holdings-data.ts` en `lib/crypto-holdings-data.ts` (P3).

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { yearlyMustExpensesFromBudgets } from '@/lib/budget-utils'
import { resolveFireParamsWithAssumptions } from '@/lib/fire-params'
import type { FireAssumptionRow } from '@/lib/fire-assumptions'
import { loadHoldingsPnL, attachPnLToHoldings } from '@/lib/holdings-pnl-enrichment'
import { sumHoldingTotals, type HoldingTotalsRow } from '@/lib/holdings-totals'
import { getEURRateSync } from '@/lib/forex'

// ── Types ──────────────────────────────────────────────────────

export interface HoldingsPageData {
  holdings: Array<Record<string, unknown>>
  totalValue: number
  totalCost: number
  /**
   * Totale opbrengst over de HELE historie — gerealiseerd + ongerealiseerd +
   * dividend − kosten, uit de canonieke aggregatie-engine. Anders dan
   * `totalValue − totalCost` telt dit ook de posities die inmiddels verkocht
   * zijn (`units = 0`) en dus met hun resultaat uit `totalCost` verdwijnen.
   */
  totalPnL: number
  /** Bruto Σ aankoopbedragen over dezelfde historie — de noemer bij `totalPnL`. */
  totalInvested: number
  source: string
  /**
   * Yearly essentiële uitgaven uit de must-budgets — voor de FIRE-deck-regel
   * onder de hero ("dekt X jaar uitgaven bij 4% SWR"). 0 als budget-module
   * niet gebruikt wordt; UI verbergt de regel dan.
   */
  yearlyEssentialExpenses: number
  /**
   * Gepersonaliseerde veilige onttrekkingsvoet (rendement − Box 3-drag −
   * inflatie) uit `resolveFireParamsWithAssumptions` — de ENIGE grondslag voor
   * de SWR-framing in de FIRE-deck-regel onder de hero.
   *
   * Stond hier eerder niet, waardoor `PortfolioSummary` de app-brede constante
   * `NL_SWR` importeerde en dus een ándere onttrekkingsvoet toonde dan élk
   * ander FIRE-oppervlak (o.a. de SWR-monitor-widget) zodra een gebruiker een
   * eigen rendement/inflatie had staan. Zelfde precedentieketen als
   * /overzicht, /core en /toekomst: profielkeuze > jaarlaag `fire_assumptions`
   * > TS-constanten. Bij een leeg profiel én lege jaarlaag valt de keten per
   * constructie exact op NL_SWR uit — het oude gedrag blijft dus intact.
   */
  effectiveSwr: number
}

interface AssetJoin {
  id: string
  name: string
  has_holdings_tracking: boolean | null
}

// ── Loader ─────────────────────────────────────────────────────

/**
 * `numeric`-kolom → eindig getal, of `null` ("niet ingesteld"). Houdt de
 * null-semantiek van het profiel intact: alleen een écht ingevulde waarde mag
 * de jaarlaag-default overrulen.
 */
function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export const loadHoldingsData = cache(async (supabase: SupabaseClient): Promise<HoldingsPageData> => {
  const user = await getCachedUser(supabase)
  if (!user) throw new Error('Not authenticated')

  const [
    { data: invRows },
    { data: essentialBudgets },
    { data: profileRow },
    { data: fireAssumptionRows },
  ] = await Promise.all([
    supabase
      .from('investment_holdings')
      .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .order('created_at', { ascending: true }),
    // Essentiële uitgaven voor FIRE-deck onder de hero. Alle budgetrijen
    // (parents + children): de rij-selectie hoort in de canonieke motor
    // (yearlyMustExpensesFromBudgets), niet in de query — anders mist dit deck
    // de parent/child-oprol en de orphan-tak die /toekomst en het dashboard
    // wél toepassen. Spiegelt app/api/snapshots/route.ts.
    supabase
      .from('budgets')
      .select('id, parent_id, budget_type, default_limit, interval, is_essential'),
    // FIRE-grondslag voor de deck-regel onder de hero. Eigen-rij profielkeuze
    // (RLS) + de jaargelaagde markt-default; samen voeden ze
    // resolveFireParamsWithAssumptions. Zónder deze twee reads kón dit
    // oppervlak alleen op de app-brede NL_SWR-constante terugvallen en week de
    // getoonde onttrekkingsvoet af van elk ander FIRE-oppervlak.
    supabase
      .from('profiles')
      .select('expected_return, inflation_rate')
      .maybeSingle()
      .then((r) => r, () => ({ data: null })),
    supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true })
      .then((r) => r, () => ({ data: null })),
  ])

  const yearlyEssentialExpenses = yearlyMustExpensesFromBudgets(essentialBudgets ?? [])

  // Consume, don't recompute: de onttrekkingsvoet komt uit de canonieke
  // resolver, nooit uit een lokale constante of formule op dit oppervlak.
  // De twee profielvelden zijn `numeric`; ze worden expliciet naar een eindig
  // getal genormaliseerd, want een string zou ongemerkt door de nullish-check
  // in `resolveFireParams` glippen en NaN de SWR in duwen.
  const { effectiveSwr } = resolveFireParamsWithAssumptions(
    {
      expected_return: toFiniteOrNull(profileRow?.expected_return),
      inflation_rate: toFiniteOrNull(profileRow?.inflation_rate),
    },
    (fireAssumptionRows ?? []) as FireAssumptionRow[],
  )

  const investmentRows = ((invRows ?? []) as Array<Record<string, unknown>>)
    .filter((h) => h.asset != null)

  const flatten = (rows: Array<Record<string, unknown>>) =>
    rows.map((h) => {
      const asset = h.asset as AssetJoin | null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { asset: _unused, ...rest } = h
      return {
        ...rest,
        bucket: 'investment' as const,
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
  const flatInvestment = flatten(investmentRows) as unknown as Array<
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
  const holdings: Array<Record<string, unknown>> = attachPnLToHoldings(
    flatInvestment,
    pnlMap,
  )

  // Totalen via dezelfde gedeelde helper als `GET /api/holdings`. Eén
  // rekenwijze voor beide bronnen: anders verandert een bedrag zodra de client
  // de lijst herlaadt.
  const { totalValue, totalCost, totalPnL, totalInvested } = sumHoldingTotals(
    holdings as unknown as HoldingTotalsRow[],
    getEURRateSync,
  )

  return {
    holdings,
    totalValue,
    totalCost,
    totalPnL,
    totalInvested,
    source: 'server',
    yearlyEssentialExpenses,
    effectiveSwr,
  }
})
