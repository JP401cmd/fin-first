/**
 * Household Data Utilities
 * Pure functions for perspective-aware financial calculations and cost splitting.
 */

import { formatCurrency } from '@/lib/format'

export type SplitMode = 'equal' | 'income_ratio' | 'custom' | 'one_carries_all'
export type OwnershipType = 'personal' | 'shared'

/** De drie perspectieven waarmee de hele app gefilterd kan worden. */
export type Perspective = 'personal' | 'household' | 'partner'

/** "Van wie is dit": afgeleid uit ownership + user_id t.o.v. de huidige gebruiker. */
export type Provenance = 'eigen' | 'partner' | 'gezamenlijk'

/**
 * Bepaal de herkomst ("van wie is dit") van een item voor de UI-badge.
 *
 * - `shared` → altijd `gezamenlijk` (huishouden)
 * - `personal` van de huidige gebruiker → `eigen`
 * - `personal` van iemand anders → `partner`
 *
 * Centraal afgeleid zodat geen enkel domein dit zelf herberekent.
 */
export function deriveProvenance(
  item: { ownership: OwnershipType; user_id?: string },
  currentUserId?: string,
): Provenance {
  if (item.ownership === 'shared') return 'gezamenlijk'
  if (item.user_id && currentUserId && item.user_id !== currentUserId) return 'partner'
  return 'eigen'
}

/**
 * Het aandeel (0-1) dat een gegeven viewer draagt van een (gedeelde) schuld.
 *
 * `partner_split_pct` is het percentage van de EIGENAAR van de schuld (`user_id`).
 * De andere partner draagt het complement. Zonder split-% valt het terug op de
 * huishoud-brede fractie. Hergebruikt door bezittingen/schulden/tax/FIRE zodat
 * de attributie overal identiek is.
 */
export function debtShareFraction(
  debt: { partner_split_pct?: number | null; user_id?: string },
  viewerId: string | undefined,
  householdShareFraction: number,
): number {
  if (debt.partner_split_pct == null) return householdShareFraction
  const ownerFraction = debt.partner_split_pct / 100
  if (debt.user_id && viewerId && debt.user_id === viewerId) return ownerFraction
  return 1 - ownerFraction
}

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
  debts: Array<{ current_balance: number; ownership: OwnershipType; user_id?: string; is_active?: boolean; partner_split_pct?: number | null }>,
  perspective: Perspective,
  mySharePct: number,
  userId?: string,
  partnerId?: string,
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

  // ── Partner-perspectief: spiegel van personal, maar attribueert de
  //    PERSOONLIJKE items van de partner + het partner-aandeel van gedeeld. ──
  if (perspective === 'partner') {
    const partnerShareFraction = 1 - mySharePct / 100
    const partnerPersonalAssets = activeAssets
      .filter((a) => a.ownership === 'personal' && a.user_id === partnerId)
      .reduce((sum, a) => sum + a.current_value, 0)
    const partnerPersonalDebts = activeDebts
      .filter((d) => d.ownership === 'personal' && d.user_id === partnerId)
      .reduce((sum, d) => sum + d.current_balance, 0)
    const sharedAssetsTotal = activeAssets
      .filter((a) => a.ownership === 'shared')
      .reduce((sum, a) => sum + a.current_value, 0)
    const sharedDebtItemsP = activeDebts.filter((d) => d.ownership === 'shared')
    const sharedDebtsTotal = sharedDebtItemsP.reduce((sum, d) => sum + d.current_balance, 0)
    const partnerSharedAssets = sharedAssetsTotal * partnerShareFraction
    const partnerSharedDebts = sharedDebtItemsP.reduce((sum, d) => {
      const f = d.partner_split_pct != null ? 1 - d.partner_split_pct / 100 : partnerShareFraction
      return sum + d.current_balance * f
    }, 0)
    return {
      totalAssets: partnerPersonalAssets + partnerSharedAssets,
      totalDebts: partnerPersonalDebts + partnerSharedDebts,
      netWorth: partnerPersonalAssets + partnerSharedAssets - (partnerPersonalDebts + partnerSharedDebts),
      personalAssets: partnerPersonalAssets,
      personalDebts: partnerPersonalDebts,
      sharedAssets: sharedAssetsTotal,
      sharedDebts: sharedDebtsTotal,
      myShareOfSharedAssets: partnerSharedAssets,
      myShareOfSharedDebts: partnerSharedDebts,
    }
  }

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

  // Per-debt split override: debts with partner_split_pct use their own split
  const sharedDebtItems = activeDebts.filter((d) => d.ownership === 'shared')
  const myShareOfSharedDebts = sharedDebtItems.reduce((sum, d) => {
    const debtShareFraction = d.partner_split_pct != null ? d.partner_split_pct / 100 : shareFraction
    return sum + d.current_balance * debtShareFraction
  }, 0)

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
      myShareOfSharedDebts: myShareOfSharedDebts,
    }
  }

  // Personal perspective: personal items + user's share of shared items
  const mySharedAssets = sharedAssets * shareFraction

  return {
    totalAssets: personalAssets + mySharedAssets,
    totalDebts: personalDebts + myShareOfSharedDebts,
    netWorth: (personalAssets + mySharedAssets) - (personalDebts + myShareOfSharedDebts),
    personalAssets,
    personalDebts,
    sharedAssets,
    sharedDebts,
    myShareOfSharedAssets: mySharedAssets,
    myShareOfSharedDebts: myShareOfSharedDebts,
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

// ── Provenance / aandeel-presentatie ─────────────────────────────────────

/**
 * "Jouw aandeel"-subregel voor een (gedeelde) kaart.
 *
 * - Persoonlijke items → null (geen subregel; volledig van de viewer).
 * - Huishouden-perspectief → null (de kaart toont al de volledige waarde).
 * - Personal/partner-perspectief op een gedeeld item → "Jouw aandeel: €X" resp.
 *   "Aandeel partner: €X" op basis van `_myShareFraction` (door de loader gestempeld).
 *
 * Centraal zodat bezittingen/schulden/cashflow exact dezelfde subregel tonen.
 */
export function formatOwnershipSubline(
  item: { ownership: OwnershipType; _myShareFraction?: number },
  perspective: Perspective,
  fullValue: number,
): string | null {
  if (item.ownership !== 'shared') return null
  if (perspective === 'household') return null
  const fraction = item._myShareFraction ?? 0.5
  const share = fullValue * fraction
  const label = perspective === 'partner' ? 'Aandeel partner' : 'Jouw aandeel'
  return `${label}: ${formatCurrency(share)}`
}

/**
 * Perspectief-correcte dag-uitgaven voor vrijheidstijd-berekeningen.
 *
 * `calculateFreedomTime` moet de juiste noemer krijgen: eigen = mijn dag-uitgaven,
 * huishouden = gecombineerd, partner = het deel dat niet van mij is (afgeleid als
 * `household - personal` wanneer geen expliciete partner-waarde beschikbaar is).
 */
export function dailyExpensesByPerspective(
  monthly: { personal: number; household: number; partner?: number },
  perspective: Perspective,
): number {
  const m =
    perspective === 'household'
      ? monthly.household
      : perspective === 'partner'
        ? monthly.partner ?? Math.max(monthly.household - monthly.personal, 0)
        : monthly.personal
  return m / 30
}
