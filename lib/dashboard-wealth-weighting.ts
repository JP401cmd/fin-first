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

/**
 * Losse schuldrij met dezelfde inclusion-weging als een bezitting. Een schuld
 * die maar voor 60% van jou is, drukt ook maar voor 60% op je netto vermogen —
 * dezelfde regel, dezelfde kolom.
 */
export type WeightableDebtRow = {
  current_balance: number | string | null
  net_worth_inclusion_pct?: number | null
} & Record<string, unknown>

/** Inclusion-gewogen huidig saldo van één schuld. */
export function weightedDebtBalance(row: WeightableDebtRow): number {
  return Number(row.current_balance) * inclusionFactor(row)
}

/** Inclusion-gewogen bezittingentotaal, inclusief losse (niet-gekoppelde) cash. */
export function computeWeightedAssetsTotal(
  assets: readonly WeightableAssetRow[],
  unlinkedCash: number,
): number {
  return assets.reduce((s, a) => s + weightedAssetValue(a), 0) + unlinkedCash
}

/** Inclusion-gewogen schuldentotaal. */
export function computeWeightedDebtsTotal(debts: readonly WeightableDebtRow[]): number {
  return debts.reduce((s, d) => s + weightedDebtBalance(d), 0)
}

/**
 * NETTO VERMOGEN — de canonieke inclusion-gewogen som, één home.
 *
 * `Σ(bezitting × inclusion) + losse cash − Σ(schuld × inclusion)`. Dit is de
 * grootheid die CLAUDE.md als "netto vermogen (weighted by inclusion_pct)"
 * aanwijst; de dashboard-loader was de plek waar hij inline stond en is nu de
 * eerste consument. Elk ander oppervlak dat hetzelfde getal nodig heeft (het
 * `net_worth`-doel, de doelen-widget) roept déze functie aan op DEZELFDE
 * cache()'de rijen — zo kan de doelkaart per constructie geen ander netto
 * vermogen tonen dan /overzicht.
 *
 * Bewust GEEN liquide/FIRE-eligible variant: dat zijn andere grootheden met een
 * eigen home (`computeLiquidPot` hier, `getFireEligibleNetWorth` in
 * lib/housing-strategy.ts) en ze mogen nooit door elkaar lopen.
 */
export function computeWeightedNetWorth(
  assets: readonly WeightableAssetRow[],
  unlinkedCash: number,
  debts: readonly WeightableDebtRow[],
): number {
  return computeWeightedAssetsTotal(assets, unlinkedCash) - computeWeightedDebtsTotal(debts)
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
 *
 * Eenheid: `expectedReturn` (en `weightedReturn`) is een 0..1-FRACTIE — de
 * percent-schaal van `assets.expected_return` wordt hier genormaliseerd (`/100`),
 * gelijk aan het horizon-kernel-pad. Consumenten vermenigvuldigen zelf met 100
 * voor weergave.
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
    // SCHAAL: `assets.expected_return` staat in de DB als HEEL PERCENTAGE (7 = 7%),
    // terwijl `profiles.expected_return` een 0..1-fractie is. Het canonieke
    // rekenpad normaliseert dat overal expliciet (horizon-kernel/adapter/potten.ts,
    // toekomst-scenario.ts, toekomst-doel.ts: `/ 100`); deze helper doet dat nu
    // óók, zodat `expectedReturn` op deze groep een fractie is — zoals het
    // doc-comment op `weightedExpectedReturn` belooft en zoals de widgets (die er
    // ×100 overheen doen voor weergave) aannemen. Vóór deze normalisatie liet het
    // percent-schaal getal doorlekken naar de weergave → "665,5%".
    const assetReturn = resolveDepreciation(a as unknown as Asset)
      ? 0
      : Number(a.expected_return ?? 0) / 100
    acc[type].weightedReturn += weightedValue * assetReturn
    return acc
  }, {})
  return (Object.values(grouped) as Acc[])
    .map(g => ({ ...g, expectedReturn: g.value > 0 ? g.weightedReturn / g.value : 0 }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Beleggings-asset-types die een verwacht rendement dragen (afschrijvende
 * assets als cash/auto/huis tellen als 0% en zouden een portefeuille-rendement
 * verwateren). Gedeeld door de rendement-widgets zodat ze dezelfde grondslag
 * gebruiken.
 */
export const INVESTMENT_ASSET_TYPES = ['investment', 'retirement', 'crypto'] as const

/** Minimale vorm van een asset-type-groep waarover een rendement te wegen is. */
export type ReturnWeightableGroup = { type: string; value: number; expectedReturn: number }

/**
 * Waarde-gewogen verwacht rendement (0..1-factor) over een set asset-type-groepen.
 * Consumeert de reeds (inclusion-)gewogen `expectedReturn` per type uit
 * `computeAssetsByType` / `data.assetsByType` — géén nieuwe som over losse
 * bezittingen, dus geen drift tussen de widgets (consume-don't-recompute).
 * `types` beperkt de scope (bv. `INVESTMENT_ASSET_TYPES`); levert 0 als er geen
 * waarde in scope is, zodat de aanroeper een lege portefeuille kan afvangen.
 */
export function weightedExpectedReturn(
  groups: readonly ReturnWeightableGroup[],
  types?: readonly string[],
): number {
  const allow = types ? new Set(types) : null
  const scoped = allow ? groups.filter(g => allow.has(g.type)) : groups
  const totalValue = scoped.reduce((s, g) => s + g.value, 0)
  if (totalValue <= 0) return 0
  return scoped.reduce((s, g) => s + g.value * (g.expectedReturn ?? 0), 0) / totalValue
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

/**
 * Asset-types die bewijzen dat iemand AL BELEGT — de marktportefeuille.
 * Bewust zónder `retirement`: een pensioenpot is gestort, niet gekocht, en
 * bewijst geen eigen beleggingskeuze (zelfde standpunt als `NO_BASIS_TYPES` in
 * lib/asset-return.ts). Daarmee is dit expliciet een ándere set dan
 * `INVESTMENT_ASSET_TYPES` hierboven, die het verwachte rendement weegt.
 */
export const INVESTED_ASSET_TYPES = new Set(['investment', 'crypto'])

/**
 * "Belegt deze gebruiker al?" — de ene lezing achter de beleggings-CTA's
 * (kaart H15). Een BESTAANSVRAAG, geen bedrag: de drempels die bepalen óf een
 * inspiratiekaart rendert blijven bij de aanroeper, deze bepaalt alleen of de
 * kaart "Bekijk beleggen" of een gevulde variant toont. Zonder dit stond de
 * CTA onvoorwaardelijk aan en las een lopende inleg als "nog niet begonnen".
 */
export function hasInvestedAssets(
  assets: readonly { asset_type?: string | null; current_value?: number | string | null }[],
): boolean {
  return assets.some(
    a => INVESTED_ASSET_TYPES.has(a.asset_type ?? '') && Number(a.current_value ?? 0) > 0,
  )
}

/** Runway: hoeveel maanden dekt de (liquide) pot de maanduitgaven. */
export function monthsCoveredFrom(pot: number, monthlyExpenses: number): number {
  return monthlyExpenses > 0 ? pot / monthlyExpenses : 0
}
