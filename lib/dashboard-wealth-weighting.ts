// ── Dashboard wealth weighting ───────────────────────────────────────────────
// Eén home voor de inclusion-weging van bezittingen op het dashboard.
//
// `net_worth_inclusion_pct` is een HARD gegeven: geeft een gebruiker aan een
// bezitting maar voor 80% mee te tellen (bv. gedeeld bezit), dan HÉÉFT die
// bezitting die nieuwe (gewogen) hoogte — het volledige bedrag telt nergens
// meer mee. Deze helper wordt daarom overal gebruikt waar het dashboard een
// vermogens-grondslag afleidt, zodat één weging door alle afgeleide cijfers
// loopt (headline netto vermogen, vermogensverdeling per type, liquide pot,
// runway/buffer). Zie kaart "Dashboard telt gedeeld bezit overal even zwaar".

import { resolveDepreciation, type Asset } from './asset-data'

/** Losse asset-rij zoals de dashboard-loader ze uit Supabase krijgt. */
export type WeightableAssetRow = {
  current_value: number | string | null
  asset_type?: string | null
  purchase_value?: number | null
  expected_return?: number | null
  net_worth_inclusion_pct?: number | null
} & Record<string, unknown>

/**
 * `net_worth_inclusion_pct` als 0..1-factor. Ontbreekt de waarde → 100% (1).
 * Dit is de enige plek die de default-100%-conventie kent.
 */
export function inclusionFactor(row: { net_worth_inclusion_pct?: number | null }): number {
  return (row.net_worth_inclusion_pct ?? 100) / 100
}

/** Inclusion-gewogen huidige waarde van één bezitting. */
export function weightedAssetValue(row: WeightableAssetRow): number {
  return Number(row.current_value) * inclusionFactor(row)
}

export interface AssetTypeGroup {
  type: string
  value: number
  purchaseValue: number
  weightedReturn: number
  expectedReturn: number
}

/**
 * Vermogensverdeling per `asset_type`, inclusion-gewogen.
 *
 * Invariant: som(value) == het inclusion-gewogen totaal (headline
 * totalAssets/netto vermogen). `value` én `purchaseValue` krijgen dezelfde
 * weging. `expectedReturn = weightedReturn / value` blijft een correcte
 * (inclusion-)waarde-gewogen ratio: de inclusion-factor zit in teller én
 * noemer en valt tegen elkaar weg, dus het rendement-% wordt niet vertekend.
 */
export function computeAssetsByType(assets: readonly WeightableAssetRow[]): AssetTypeGroup[] {
  type Acc = Omit<AssetTypeGroup, 'expectedReturn'>
  const grouped = assets.reduce<Record<string, Acc>>((acc, a) => {
    const type = a.asset_type ?? 'other'
    if (!acc[type]) acc[type] = { type, value: 0, purchaseValue: 0, weightedReturn: 0 }
    const incl = inclusionFactor(a)
    const weightedValue = Number(a.current_value) * incl
    acc[type].value += weightedValue
    acc[type].purchaseValue += Number(a.purchase_value ?? 0) * incl
    const assetReturn = resolveDepreciation(a as unknown as Asset)
      ? 0
      : Number(a.expected_return ?? 0)
    acc[type].weightedReturn += weightedValue * assetReturn
    return acc
  }, {})
  return (Object.values(grouped) as Acc[])
    .map(g => ({ ...g, expectedReturn: g.value > 0 ? g.weightedReturn / g.value : 0 }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Asset-types die als "liquide pot" (direct besteedbaar) tellen — de grondslag
 * voor buffer/noodfonds/runway. Bewust géén vastgoed/beleggingen/pensioen: een
 * huis is geen opeetbare buffer (CLAUDE.md: nettoVermogen ≠ liquide vermogen).
 */
export const LIQUID_ASSET_TYPES = new Set(['savings', 'checking', 'cash'])

/**
 * Inclusion-gewogen liquide pot: spaar-/betaal-/cash-bezittingen (gewogen) plus
 * niet-gekoppelde bankrekeningen (legacy `bank_accounts`, altijd 100% eigen).
 */
export function computeLiquidPot(
  assets: readonly WeightableAssetRow[],
  unlinkedCash: number,
): number {
  const liquid = assets
    .filter(a => LIQUID_ASSET_TYPES.has(a.asset_type ?? ''))
    .reduce((s, a) => s + weightedAssetValue(a), 0)
  return liquid + unlinkedCash
}

/** Runway: hoeveel maanden dekt de (liquide) pot de maanduitgaven. */
export function monthsCoveredFrom(pot: number, monthlyExpenses: number): number {
  return monthlyExpenses > 0 ? pot / monthlyExpenses : 0
}
