/**
 * Pot-regels — de drie "potten"-voorkeuren op /toekomst → Voorkeuren:
 *  - Onttrekkingsvolgorde (rule 3): welke pot leeg je eerst in de afbouw-fase.
 *  - Verdeling bij toename (rule 4): waar gaat overschot/meevaller heen.
 *  - Onttrekking bij afname (rule 5): waar haal je geld bij een tegenvaller.
 *
 * Opgeslagen in `profiles.pot_rules` (jsonb) op WealthGroup-granulariteit (5 groepen),
 * begrijpelijker dan de 10 asset-types. De engine-wiring (unified-projection) vertaalt
 * groep-volgorde → asset-type-volgorde via `expandGroupsToAssetTypes`.
 *
 * Pure types + resolver, geen Supabase/UI dependency.
 */

import type { AssetType } from '@/lib/asset-data'
import { WEALTH_GROUPS, type WealthGroup } from '@/lib/wealth-composition'

export const ALL_WEALTH_GROUPS: WealthGroup[] = [
  'spaargeld',
  'beleggingen',
  'pensioen',
  'vastgoed',
  'overig',
]

/**
 * Canonieke asset-type-volgorde = de hardcoded `WATERFALL_ORDER` in unified-projection.ts.
 * Single source of truth zodat de engine en de pot-regels niet uiteenlopen.
 */
export const CANONICAL_ASSET_ORDER: readonly AssetType[] = [
  'cash',
  'savings',
  'investment',
  'crypto',
  'retirement',
  'real_estate',
  'vehicle',
  'deelneming',
  'other',
  'eigen_huis',
] as const

/**
 * Default groep-volgorde, afgeleid uit `CANONICAL_ASSET_ORDER` (eerste voorkomen per groep):
 * cash→spaargeld, investment→beleggingen, crypto→overig, retirement→pensioen, real_estate→vastgoed.
 */
export const DEFAULT_GROUP_ORDER: WealthGroup[] = [
  'spaargeld',
  'beleggingen',
  'overig',
  'pensioen',
  'vastgoed',
]

export type SurplusGroup = WealthGroup | 'schuld_aflossen'

export interface PotRulesConfig {
  /** Rule 3 — onttrekkingsvolgorde tijdens decumulatie (geordende groepen). */
  withdrawalOrderGroups: WealthGroup[]
  /** Rule 4 — waar gaat overschot/meevaller heen. */
  surplusGroup: SurplusGroup
  /** Rule 5 — onttrekkingsvolgorde bij een negatieve gebeurtenis (geordende groepen). */
  deficitOrderGroups: WealthGroup[]
}

export const POT_RULES_DEFAULTS: PotRulesConfig = {
  withdrawalOrderGroups: DEFAULT_GROUP_ORDER,
  surplusGroup: 'beleggingen',
  deficitOrderGroups: DEFAULT_GROUP_ORDER,
}

/** snake_case-vorm zoals opgeslagen in de jsonb-kolom. */
interface PotRulesRaw {
  withdrawal_order_groups?: unknown
  surplus_group?: unknown
  deficit_order_groups?: unknown
}

/** Valideer dat `value` een permutatie is van de 5 WealthGroups; anders default. */
function sanitizeGroupOrder(value: unknown, fallback: WealthGroup[]): WealthGroup[] {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<WealthGroup>()
  const result: WealthGroup[] = []
  for (const g of value) {
    if (typeof g === 'string' && ALL_WEALTH_GROUPS.includes(g as WealthGroup) && !seen.has(g as WealthGroup)) {
      seen.add(g as WealthGroup)
      result.push(g as WealthGroup)
    }
  }
  // Vul ontbrekende groepen aan in default-volgorde zodat de waterfall nooit korter wordt.
  for (const g of DEFAULT_GROUP_ORDER) {
    if (!seen.has(g)) result.push(g)
  }
  return result
}

function sanitizeSurplusGroup(value: unknown): SurplusGroup {
  if (value === 'schuld_aflossen') return 'schuld_aflossen'
  if (typeof value === 'string' && ALL_WEALTH_GROUPS.includes(value as WealthGroup)) {
    return value as WealthGroup
  }
  return POT_RULES_DEFAULTS.surplusGroup
}

/**
 * Lees pot-regels uit een profielobject met veilige defaults.
 * Accepteert het rauwe profiel (profiles.pot_rules) of een al-geparset object.
 */
export function resolvePotRules(
  profile: { pot_rules?: unknown } | null | undefined,
): PotRulesConfig {
  let raw: PotRulesRaw = {}
  const value = profile?.pot_rules
  if (value && typeof value === 'object') {
    raw = value as PotRulesRaw
  } else if (typeof value === 'string') {
    try {
      raw = JSON.parse(value) as PotRulesRaw
    } catch {
      raw = {}
    }
  }
  return {
    withdrawalOrderGroups: sanitizeGroupOrder(raw.withdrawal_order_groups, DEFAULT_GROUP_ORDER),
    surplusGroup: sanitizeSurplusGroup(raw.surplus_group),
    deficitOrderGroups: sanitizeGroupOrder(raw.deficit_order_groups, DEFAULT_GROUP_ORDER),
  }
}

/** Serialiseer config → jsonb-shape voor opslag. */
export function potRulesToRaw(config: PotRulesConfig): Required<PotRulesRaw> {
  return {
    withdrawal_order_groups: config.withdrawalOrderGroups,
    surplus_group: config.surplusGroup,
    deficit_order_groups: config.deficitOrderGroups,
  }
}

/**
 * Vertaal een groep-volgorde naar asset-type-volgorde op `CANONICAL_ASSET_ORDER`-granulariteit.
 * Binnen elke groep blijft de canonieke onderlinge volgorde behouden.
 */
export function expandGroupsToAssetTypes(groups: WealthGroup[]): AssetType[] {
  const byGroup = new Map<WealthGroup, AssetType[]>()
  for (const at of CANONICAL_ASSET_ORDER) {
    const g = WEALTH_GROUPS[at]
    const arr = byGroup.get(g) ?? []
    arr.push(at)
    byGroup.set(g, arr)
  }
  const ordered: AssetType[] = []
  const usedGroups = new Set<WealthGroup>()
  for (const g of groups) {
    if (usedGroups.has(g)) continue
    usedGroups.add(g)
    ordered.push(...(byGroup.get(g) ?? []))
  }
  // Vang groepen op die niet in `groups` zaten.
  for (const g of ALL_WEALTH_GROUPS) {
    if (!usedGroups.has(g)) ordered.push(...(byGroup.get(g) ?? []))
  }
  return ordered
}

/** True wanneer een groep-volgorde gelijk is aan de default (→ engine mag WATERFALL_ORDER gebruiken). */
export function isDefaultGroupOrder(groups: WealthGroup[]): boolean {
  return (
    groups.length === DEFAULT_GROUP_ORDER.length &&
    groups.every((g, i) => g === DEFAULT_GROUP_ORDER[i])
  )
}
