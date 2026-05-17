/**
 * Mapping van recommendation type-tags naar de 4 hefbomen.
 *
 * De app gebruikt 4 hefbomen (levers) om financieel welzijn te meten:
 *   - assets     (bezittingen)   — diversificatie + omvang
 *   - debts      (schulden)      — schuld-vermogen-ratio
 *   - cashflow   (cashflow)      — spaarquote, budget
 *   - tax        (belasting)     — box3-exposure
 *
 * Recommendations (uit lib/recommendation-data.ts) hebben een `recommendation_type`
 * string. Deze mapping vertaalt die tags naar de bijbehorende hefboom zodat de
 * UI een hefboom-icoon kan tonen.
 *
 * Drie lagen:
 *   1. Exacte match via EXACT_TAG_TO_LEVER
 *   2. Prefix match via PREFIX_TAG_TO_LEVER (investment_* → assets, tax_* → tax)
 *   3. Fallback: 'cashflow' (veiligste default — meest generieke hefboom)
 */

import type { RecommendationType } from '@/lib/recommendation-data'

// ── Types ─────────────────────────────────────────────────────────────────────

/** De 4 hefboom-ID's, overeenkomend met de keys in LeverScores. */
export type LeverId = 'assets' | 'debts' | 'cashflow' | 'tax'

/** Nederlandse labels voor UI-weergave. */
export const LEVER_LABELS: Record<LeverId, string> = {
  assets: 'Bezittingen',
  debts: 'Schulden',
  cashflow: 'Cashflow',
  tax: 'Belasting',
}

// ── Exacte tag → lever mapping ────────────────────────────────────────────────

/**
 * Exacte mapping van bekende recommendation_type waarden naar hefbomen.
 *
 * Budget/inkomen/spaar-gerelateerde types → cashflow (beïnvloeden geldstroom).
 * Asset-gerelateerde types → assets (beïnvloeden vermogenssamenstelling).
 * Schuld-gerelateerde types → debts (beïnvloeden schuldpositie).
 */
const EXACT_TAG_TO_LEVER: Record<RecommendationType, LeverId> = {
  budget_optimization: 'cashflow',
  asset_reallocation: 'assets',
  debt_acceleration: 'debts',
  income_increase: 'cashflow',
  savings_boost: 'cashflow',
}

// ── Prefix-based matching ─────────────────────────────────────────────────────

/**
 * Prefix → lever voor toekomstige tags die buiten het huidige RecommendationType
 * vallen (bv. investment_diversificatie, tax_box3_optimalisatie).
 *
 * Volgorde bepaalt prioriteit: eerste match wint.
 */
const PREFIX_TAG_TO_LEVER: [prefix: string, lever: LeverId][] = [
  ['investment_', 'assets'],
  ['asset_', 'assets'],
  ['tax_', 'tax'],
  ['debt_', 'debts'],
  ['budget_', 'cashflow'],
  ['income_', 'cashflow'],
  ['savings_', 'cashflow'],
]

/** Fallback als geen exacte of prefix-match gevonden wordt. */
const FALLBACK_LEVER: LeverId = 'cashflow'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Vertaal een recommendation type-tag naar de bijbehorende hefboom.
 *
 * 1. Exacte match in EXACT_TAG_TO_LEVER
 * 2. Prefix match in PREFIX_TAG_TO_LEVER
 * 3. Fallback naar 'cashflow'
 *
 * @example
 *   tagToLever('budget_optimization')  // → 'cashflow'
 *   tagToLever('debt_acceleration')    // → 'debts'
 *   tagToLever('investment_xyz')       // → 'assets'
 *   tagToLever('tax_box3')            // → 'tax'
 *   tagToLever('unknown_type')         // → 'cashflow' (fallback)
 */
export function tagToLever(tag: string): LeverId {
  // 1. Exact match (typed tags)
  if (tag in EXACT_TAG_TO_LEVER) {
    return EXACT_TAG_TO_LEVER[tag as RecommendationType]
  }

  // 2. Prefix match (future-proof / wildcard tags)
  for (const [prefix, lever] of PREFIX_TAG_TO_LEVER) {
    if (tag.startsWith(prefix)) {
      return lever
    }
  }

  // 3. Fallback
  return FALLBACK_LEVER
}

/**
 * Batch-variant: vertaal meerdere tags en retourneer de unieke hefbomen.
 *
 * @example
 *   tagsToLevers(['budget_optimization', 'debt_acceleration'])
 *   // → ['cashflow', 'debts']
 */
export function tagsToLevers(tags: string[]): LeverId[] {
  const seen = new Set<LeverId>()
  const result: LeverId[] = []
  for (const tag of tags) {
    const lever = tagToLever(tag)
    if (!seen.has(lever)) {
      seen.add(lever)
      result.push(lever)
    }
  }
  return result
}

/**
 * Check of een tag bij een specifieke hefboom hoort.
 *
 * @example
 *   isLever('budget_optimization', 'cashflow')  // → true
 *   isLever('debt_acceleration', 'cashflow')     // → false
 */
export function isLever(tag: string, lever: LeverId): boolean {
  return tagToLever(tag) === lever
}
