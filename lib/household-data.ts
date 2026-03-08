/**
 * Household Data Utilities
 * Pure functions for perspective-aware financial calculations and cost splitting.
 */

export type SplitMode = 'equal' | 'income_ratio' | 'custom' | 'one_carries_all'
export type OwnershipType = 'personal' | 'shared'

export const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  equal: '50/50',
  income_ratio: 'Inkomenratio',
  custom: 'Aangepast %',
  one_carries_all: 'Een draagt alles',
}

export const SPLIT_MODE_DESCRIPTIONS: Record<SplitMode, string> = {
  equal: 'Gelijke verdeling van gedeelde kosten',
  income_ratio: 'Verdeling op basis van inkomensverhoudingen',
  custom: 'Handmatig percentage instellen',
  one_carries_all: 'Een partner draagt alle gedeelde kosten',
}

interface HouseholdSettings {
  splitMode: SplitMode
  customSplitPct: number | null // 0-100, percentage for primary user
  primaryPayerId: string | null
}

interface PerspectiveData<T extends { ownership: OwnershipType }> {
  items: T[]
  perspective: 'personal' | 'household'
}

/**
 * Compute the user's share percentage based on split mode.
 *
 * @param settings Household split settings
 * @param userId Current user's ID
 * @param myIncome User's monthly income (for income_ratio mode)
 * @param partnerIncome Partner's monthly income (for income_ratio mode)
 * @returns Percentage (0-100) that this user covers of shared costs
 */
export function computeSharePct(
  settings: HouseholdSettings,
  userId: string,
  myIncome = 0,
  partnerIncome = 0,
): number {
  switch (settings.splitMode) {
    case 'equal':
      return 50

    case 'income_ratio': {
      const total = myIncome + partnerIncome
      if (total <= 0) return 50
      return Math.round((myIncome / total) * 100)
    }

    case 'custom': {
      const pct = settings.customSplitPct ?? 50
      // If the current user is the primary payer, they get the custom percentage.
      // If not, they get the remainder.
      if (settings.primaryPayerId === userId) return pct
      return 100 - pct
    }

    case 'one_carries_all':
      return settings.primaryPayerId === userId ? 100 : 0

    default:
      return 50
  }
}

/**
 * Filter items based on perspective.
 *
 * - 'personal': show personal items + shared items (user sees their share)
 * - 'household': show ALL items (personal + shared from all members)
 *
 * Note: RLS handles what items the user can SEE. This function is for
 * the client-side perspective switcher display.
 */
export function filterByPerspective<T extends { ownership: OwnershipType; user_id?: string }>(
  items: T[],
  perspective: 'personal' | 'household',
  userId?: string,
): T[] {
  if (perspective === 'household') {
    // Show everything (RLS already limits to household scope)
    return items
  }

  // Personal perspective: show own items + shared items
  // (shared items will be shown with the user's share percentage)
  return items.filter(
    (item) => item.ownership === 'shared' || item.user_id === userId,
  )
}

/**
 * Compute net worth from a financial perspective.
 *
 * @param assets All visible assets (already filtered by RLS)
 * @param debts All visible debts (already filtered by RLS)
 * @param perspective Current perspective
 * @param mySharePct User's share percentage (0-100) for shared items
 * @param userId Current user's ID
 * @returns Net worth for the given perspective
 */
export function computePerspectiveNetWorth(
  assets: Array<{ current_value: number; ownership: OwnershipType; user_id?: string; is_active?: boolean }>,
  debts: Array<{ current_balance: number; ownership: OwnershipType; user_id?: string; is_active?: boolean }>,
  perspective: 'personal' | 'household',
  mySharePct: number,
  userId?: string,
): {
  totalAssets: number
  totalDebts: number
  netWorth: number
  personalAssets: number
  personalDebts: number
  sharedAssets: number
  sharedDebts: number
  myShareOfSharedAssets: number
  myShareOfSharedDebts: number
} {
  const activeAssets = assets.filter((a) => a.is_active !== false)
  const activeDebts = debts.filter((d) => d.is_active !== false)

  const personalAssets = activeAssets
    .filter((a) => a.ownership === 'personal' && (perspective === 'household' || a.user_id === userId))
    .reduce((sum, a) => sum + a.current_value, 0)

  const personalDebts = activeDebts
    .filter((d) => d.ownership === 'personal' && (perspective === 'household' || d.user_id === userId))
    .reduce((sum, d) => sum + d.current_balance, 0)

  const sharedAssets = activeAssets
    .filter((a) => a.ownership === 'shared')
    .reduce((sum, a) => sum + a.current_value, 0)

  const sharedDebts = activeDebts
    .filter((d) => d.ownership === 'shared')
    .reduce((sum, d) => sum + d.current_balance, 0)

  const shareFraction = mySharePct / 100

  if (perspective === 'household') {
    // Household view: full totals
    return {
      totalAssets: personalAssets + sharedAssets,
      totalDebts: personalDebts + sharedDebts,
      netWorth: (personalAssets + sharedAssets) - (personalDebts + sharedDebts),
      personalAssets,
      personalDebts,
      sharedAssets,
      sharedDebts,
      myShareOfSharedAssets: sharedAssets * shareFraction,
      myShareOfSharedDebts: sharedDebts * shareFraction,
    }
  }

  // Personal perspective: personal items + user's share of shared items
  const mySharedAssets = sharedAssets * shareFraction
  const mySharedDebts = sharedDebts * shareFraction

  return {
    totalAssets: personalAssets + mySharedAssets,
    totalDebts: personalDebts + mySharedDebts,
    netWorth: (personalAssets + mySharedAssets) - (personalDebts + mySharedDebts),
    personalAssets,
    personalDebts,
    sharedAssets,
    sharedDebts,
    myShareOfSharedAssets: mySharedAssets,
    myShareOfSharedDebts: mySharedDebts,
  }
}

/**
 * Format perspective net worth with breakdown label.
 */
export function perspectiveLabel(perspective: 'personal' | 'household'): string {
  return perspective === 'household' ? 'Huishouden' : 'Persoonlijk'
}

// ── Household Privacy ────────────────────────────────────────────────────

export type PrivacyLevel = 'full' | 'totals' | 'hidden'

export interface PrivacySettings {
  assets: PrivacyLevel
  debts: PrivacyLevel
  budgets: PrivacyLevel
  transactions: PrivacyLevel
  income: PrivacyLevel
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  assets: 'totals',
  debts: 'totals',
  budgets: 'totals',
  transactions: 'totals',
  income: 'totals',
}

// Map Dutch keys from UI to English DB keys
const DUTCH_TO_ENGLISH: Record<string, keyof PrivacySettings> = {
  vermogen: 'assets',
  schulden: 'debts',
  budgetten: 'budgets',
  transacties: 'transactions',
  inkomen: 'income',
}
const DUTCH_LEVELS: Record<string, PrivacyLevel> = {
  volledig: 'full',
  totalen: 'totals',
  verborgen: 'hidden',
}

/**
 * Normalise privacy settings from either Dutch or English format to English.
 */
export function normalisePrivacySettings(raw: Record<string, string> | null | undefined): PrivacySettings {
  if (!raw) return { ...DEFAULT_PRIVACY_SETTINGS }

  const result = { ...DEFAULT_PRIVACY_SETTINGS }
  for (const [k, v] of Object.entries(raw)) {
    // English key
    if (k in result) {
      const level = (DUTCH_LEVELS[v] ?? v) as PrivacyLevel
      if (['full', 'totals', 'hidden'].includes(level)) {
        result[k as keyof PrivacySettings] = level
      }
    }
    // Dutch key
    const enKey = DUTCH_TO_ENGLISH[k]
    if (enKey) {
      const level = (DUTCH_LEVELS[v] ?? v) as PrivacyLevel
      if (['full', 'totals', 'hidden'].includes(level)) {
        result[enKey] = level
      }
    }
  }
  return result
}

/**
 * Apply privacy filtering to a partner's items based on their privacy settings.
 *
 * - 'full': all individual items returned as-is
 * - 'totals': items replaced with a single aggregated summary item
 * - 'hidden': items removed entirely (empty array)
 *
 * @param items Partner's personal items
 * @param privacyLevel The privacy level the partner has set for this category
 * @param aggregateLabel Label for the aggregated total item (e.g., "Partner's vermogen")
 * @param valueKey The key containing the numeric value (e.g., 'current_value' or 'current_balance')
 */
export function applyPrivacyFilter<T extends Record<string, unknown>>(
  items: T[],
  privacyLevel: PrivacyLevel,
  aggregateLabel: string,
  valueKey: string,
): { items: T[]; aggregatedTotal: number | null; isAggregated: boolean } {
  if (privacyLevel === 'full') {
    return { items, aggregatedTotal: null, isAggregated: false }
  }

  if (privacyLevel === 'hidden') {
    return { items: [], aggregatedTotal: null, isAggregated: false }
  }

  // 'totals' — aggregate into a single summary
  const total = items.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0)

  if (items.length === 0) {
    return { items: [], aggregatedTotal: 0, isAggregated: true }
  }

  // Create a single aggregated item based on the first item's structure
  const aggregated = {
    ...items[0],
    id: `aggregated_partner`,
    name: aggregateLabel,
    [valueKey]: total,
    _aggregated: true,
    _aggregatedCount: items.length,
  } as T

  return { items: [aggregated], aggregatedTotal: total, isAggregated: true }
}
