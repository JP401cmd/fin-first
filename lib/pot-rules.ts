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

/** Onderwerp waarvoor per-categorie-prio's gelden (V5, horizon-kernel). */
export type PrioSubject = 'toename' | 'afname' | 'onttrekking'

/**
 * V5 (horizon-kernel) — échte per-categorie-prio's 1..5 per onderwerp, met de
 * afwijkende reserve-semantiek: **prio 5 = reserve** (pas aanspreken bij depletie
 * van de overige categorieën, de Excel-reserve-pass). Categorie-sleutels zijn de
 * kernel-categorie-labels (bezit: Spaargeld/Beleggingen/Pensioen/Vastgoed/Eigen huis/
 * Overig; schuld: Woning/Consumptief/…). ADDITIEF: ontbrekend → de drie orde-regels
 * bepalen de prio's zoals voorheen (byte-identiek).
 */
export type CategoriePrios = Partial<Record<PrioSubject, Record<string, number>>>

export interface PotRulesConfig {
  /** Rule 3 — onttrekkingsvolgorde tijdens decumulatie (geordende groepen). */
  withdrawalOrderGroups: WealthGroup[]
  /** Rule 4 — waar gaat overschot/meevaller heen. */
  surplusGroup: SurplusGroup
  /** Rule 5 — onttrekkingsvolgorde bij een negatieve gebeurtenis (geordende groepen). */
  deficitOrderGroups: WealthGroup[]
  /**
   * V5 (optioneel) — échte per-categorie-prio's per onderwerp. Alleen aanwezig
   * wanneer de gebruiker ze expliciet heeft gezet; anders `undefined` → de kernel-
   * adapter gebruikt de bestaande orde-groep-afleiding (byte-identiek).
   */
  categoriePrios?: CategoriePrios
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
  /** V5 — per-categorie-prio's per onderwerp (zie CategoriePrios). */
  categorie_prios?: unknown
}

const PRIO_SUBJECTS: readonly PrioSubject[] = ['toename', 'afname', 'onttrekking']

/**
 * Valideer `categorie_prios` uit de jsonb-kolom (V5). Per onderwerp een map
 * categorie→prio; alleen integer-prio's 1..5 worden overgenomen (ongeldige prio's
 * weggelaten). BEWUST categorie-vocabulaire-AGNOSTISCH: pot-rules.ts kent de kernel-
 * categorie-labels niet (dat zou de laag-afhankelijkheid omdraaien), dus categorie-
 * SLEUTELS worden hier niet gefilterd — dat doet de kernel-adapter (prio-overgang.ts,
 * `BEZIT_LABELS`) op het consumptiepunt. Levert `undefined` wanneer er geen enkele
 * geldige prio is (→ adapter gebruikt de orde-groep-afleiding; gedrag byte-identiek).
 */
export function sanitizeCategoriePrios(value: unknown): CategoriePrios | undefined {
  if (!value || typeof value !== 'object') return undefined
  const src = value as Record<string, unknown>
  const result: CategoriePrios = {}
  for (const subject of PRIO_SUBJECTS) {
    const rawMap = src[subject]
    if (!rawMap || typeof rawMap !== 'object') continue
    const cleaned: Record<string, number> = {}
    for (const [cat, prio] of Object.entries(rawMap as Record<string, unknown>)) {
      const n = typeof prio === 'number' ? prio : Number(prio)
      if (Number.isInteger(n) && n >= 1 && n <= 5) cleaned[cat] = n
    }
    if (Object.keys(cleaned).length > 0) result[subject] = cleaned
  }
  return Object.keys(result).length > 0 ? result : undefined
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
  const categoriePrios = sanitizeCategoriePrios(raw.categorie_prios)
  return {
    withdrawalOrderGroups: sanitizeGroupOrder(raw.withdrawal_order_groups, DEFAULT_GROUP_ORDER),
    surplusGroup: sanitizeSurplusGroup(raw.surplus_group),
    deficitOrderGroups: sanitizeGroupOrder(raw.deficit_order_groups, DEFAULT_GROUP_ORDER),
    ...(categoriePrios ? { categoriePrios } : {}),
  }
}

/** Serialiseer config → jsonb-shape voor opslag. */
export function potRulesToRaw(config: PotRulesConfig): PotRulesRaw {
  return {
    withdrawal_order_groups: config.withdrawalOrderGroups,
    surplus_group: config.surplusGroup,
    deficit_order_groups: config.deficitOrderGroups,
    ...(config.categoriePrios ? { categorie_prios: config.categoriePrios } : {}),
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

/**
 * Vertaal ÉÉN wealth-groep naar uitsluitend de asset-types in díe groep
 * (canonieke onderlinge volgorde). Anders dan `expandGroupsToAssetTypes` vult dit
 * NIET de overige groepen aan: het is bedoeld voor een surplus-DOEL (een
 * exclusieve bestemming "waar gaat overschot/opbrengst heen"), niet voor een
 * onttrekkings-VOLGORDE (die juist alle groepen als complete waterfall nodig
 * heeft). Bug-fix (review A, jun 2026): `expandGroupsToAssetTypes([group])`
 * leverde de volledige 10-type-lijst op → de engine-`surplusTargets` matchten
 * álle assets → overschot/liquidatie-opbrengst werd pro-rata over alle potten
 * verdeeld i.p.v. naar de gekozen pot (bv. "cash" kreeg slechts een fractie).
 */
export function expandSingleGroupToAssetTypes(group: WealthGroup): AssetType[] {
  return CANONICAL_ASSET_ORDER.filter((at) => WEALTH_GROUPS[at] === group)
}

/** True wanneer een groep-volgorde gelijk is aan de default (→ engine mag WATERFALL_ORDER gebruiken). */
export function isDefaultGroupOrder(groups: WealthGroup[]): boolean {
  return (
    groups.length === DEFAULT_GROUP_ORDER.length &&
    groups.every((g, i) => g === DEFAULT_GROUP_ORDER[i])
  )
}
