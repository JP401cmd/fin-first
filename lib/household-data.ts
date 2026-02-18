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
