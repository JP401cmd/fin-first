/**
 * Invulfase checklist item definitions.
 *
 * 10 fixed items in 3 categories (vermogen, schulden, instellingen)
 * + 5 conditional items in 2 categories (budgetten, holdings)
 *
 * Each item has a weight (1-5) for weighted progress calculation
 * and an autoDetect function that determines its status from data state.
 */

// ── Types ────────────────────────────────────────────────────

export type InvulfaseCategory = 'vermogen' | 'schulden' | 'instellingen' | 'budgetten' | 'holdings'
export type InvulfaseStatus = 'empty' | 'partial' | 'complete' | 'skipped'

export interface InvulfaseItem {
  key: string
  category: InvulfaseCategory
  title: string
  description: string
  href: string
  weight: number
  /** If set, item only appears when condition returns true */
  condition?: (ctx: InvulfaseConditionContext) => boolean
  autoDetect: (data: InvulfaseDataState) => InvulfaseStatus
}

/** Context for deciding whether a conditional item/category is visible */
export interface InvulfaseConditionContext {
  budgetingActive: boolean
  hasBudgetTracking: boolean      // ≥1 cash asset with has_budget_tracking
  hasHoldingsTracking: boolean    // ≥1 asset with has_holdings_tracking
  hasActiveBankConnection: boolean
}

/** Data state for auto-detecting item completion */
export interface InvulfaseDataState {
  // Assets by type
  hasEigenHuis: boolean
  hasCash: boolean
  hasSavings: boolean
  hasInvestments: boolean
  hasOtherAssets: boolean
  // Debts by type
  hasMortgage: boolean
  hasCreditCard: boolean
  hasLoan: boolean
  hasOtherDebts: boolean
  // Profile
  hasFullName: boolean
  hasDateOfBirth: boolean
  hasHouseholdType: boolean
  hasFireParams: boolean
  hasModuleColors: boolean
  // Budgets & transactions
  hasBudgets: boolean
  hasActiveBankConnection: boolean
  hasTransactions: boolean
  // Holdings
  hasHoldings: boolean
  hasHoldingsWithIsin: boolean
  // Skipped items
  skippedItems: Set<string>
}

// ── Category metadata ────────────────────────────────────────

export const CATEGORY_META: Record<InvulfaseCategory, {
  label: string
  conditional: boolean
  condition?: (ctx: InvulfaseConditionContext) => boolean
}> = {
  vermogen: { label: 'Vermogen', conditional: false },
  schulden: { label: 'Schulden', conditional: false },
  budgetten: {
    label: 'Budgetten',
    conditional: true,
    condition: (ctx) => ctx.budgetingActive || ctx.hasBudgetTracking,
  },
  holdings: {
    label: 'Holdings',
    conditional: true,
    condition: (ctx) => ctx.hasHoldingsTracking,
  },
  instellingen: { label: 'Instellingen', conditional: false },
}

/** Ordered list of category keys (determines display order) */
export const CATEGORY_ORDER: InvulfaseCategory[] = [
  'vermogen',
  'schulden',
  'budgetten',
  'holdings',
  'instellingen',
]

// ── Helper ───────────────────────────────────────────────────

function skipOr(data: InvulfaseDataState, key: string, status: InvulfaseStatus): InvulfaseStatus {
  return data.skippedItems.has(key) ? 'skipped' : status
}

// ── Item definitions ─────────────────────────────────────────

export const INVULFASE_ITEMS: InvulfaseItem[] = [
  // ── Vermogen (4 items) ──
  {
    key: 'huis',
    category: 'vermogen',
    title: 'Eigen woning',
    description: 'Registreer je woning met WOZ-waarde',
    href: '/core/assets',
    weight: 4,
    autoDetect: (d) => d.hasEigenHuis ? 'complete' : skipOr(d, 'huis', 'empty'),
  },
  {
    key: 'rekeningen',
    category: 'vermogen',
    title: 'Bank- en spaarrekeningen',
    description: 'Voeg je lopende en spaarrekeningen toe',
    href: '/core/assets',
    weight: 3,
    autoDetect: (d) => (d.hasCash || d.hasSavings) ? 'complete' : skipOr(d, 'rekeningen', 'empty'),
  },
  {
    key: 'beleggingen',
    category: 'vermogen',
    title: 'Beleggingsportefeuille',
    description: 'ETFs, aandelen en fondsen registreren',
    href: '/core/assets',
    weight: 3,
    autoDetect: (d) => d.hasInvestments ? 'complete' : skipOr(d, 'beleggingen', 'empty'),
  },
  {
    key: 'overige_bezittingen',
    category: 'vermogen',
    title: 'Overige bezittingen',
    description: 'Pensioen, voertuigen, crypto en meer',
    href: '/core/assets',
    weight: 2,
    autoDetect: (d) => d.hasOtherAssets ? 'complete' : skipOr(d, 'overige_bezittingen', 'empty'),
  },

  // ── Schulden (4 items) ──
  {
    key: 'hypotheek',
    category: 'schulden',
    title: 'Hypotheek',
    description: 'Hypotheek met rente en aflossing',
    href: '/core/debts',
    weight: 4,
    autoDetect: (d) => d.hasMortgage ? 'complete' : skipOr(d, 'hypotheek', 'empty'),
  },
  {
    key: 'creditcard',
    category: 'schulden',
    title: 'Creditcard',
    description: 'Creditcardschulden registreren',
    href: '/core/debts',
    weight: 2,
    autoDetect: (d) => d.hasCreditCard ? 'complete' : skipOr(d, 'creditcard', 'empty'),
  },
  {
    key: 'lening',
    category: 'schulden',
    title: 'Leningen',
    description: 'Persoonlijke, studie- of autolening',
    href: '/core/debts',
    weight: 3,
    autoDetect: (d) => d.hasLoan ? 'complete' : skipOr(d, 'lening', 'empty'),
  },
  {
    key: 'overige_schulden',
    category: 'schulden',
    title: 'Overige schulden',
    description: 'Doorlopend krediet, betalingsregelingen',
    href: '/core/debts',
    weight: 2,
    autoDetect: (d) => d.hasOtherDebts ? 'complete' : skipOr(d, 'overige_schulden', 'empty'),
  },

  // ── Budgetten (3 items, conditional) ──
  {
    key: 'budgetplan',
    category: 'budgetten',
    title: 'Budgetplan aanmaken',
    description: 'Maak categorieën met limieten aan',
    href: '/core/budgets',
    weight: 3,
    autoDetect: (d) => d.hasBudgets ? 'complete' : skipOr(d, 'budgetplan', 'empty'),
  },
  {
    key: 'bank_koppelen',
    category: 'budgetten',
    title: 'Bankrekening koppelen',
    description: 'Koppel je bank voor automatische transacties',
    href: '/core/cash/connect',
    weight: 3,
    // Only shown when user does NOT already have a manual-only setup
    condition: (ctx) => !ctx.hasActiveBankConnection,
    autoDetect: (d) => d.hasActiveBankConnection ? 'complete' : skipOr(d, 'bank_koppelen', 'empty'),
  },
  {
    key: 'transacties_importeren',
    category: 'budgetten',
    title: 'Transacties registreren',
    description: 'Importeer handmatig via MT940/CSV/OFX',
    href: '/core/cash/import',
    weight: 3,
    // Only shown when user has NO active bank connection (manual mode)
    condition: (ctx) => !ctx.hasActiveBankConnection,
    autoDetect: (d) => d.hasTransactions ? 'complete' : skipOr(d, 'transacties_importeren', 'empty'),
  },

  // ── Holdings (2 items, conditional) ──
  {
    key: 'holdings_registreren',
    category: 'holdings',
    title: 'Holdings registreren',
    description: 'Voeg individuele posities toe aan je portefeuille',
    href: '/core/assets/holdings',
    weight: 3,
    autoDetect: (d) => d.hasHoldings ? 'complete' : skipOr(d, 'holdings_registreren', 'empty'),
  },
  {
    key: 'isin_koppelen',
    category: 'holdings',
    title: 'ISIN koppelen',
    description: 'Koppel ISIN-codes voor automatische koersupdates',
    href: '/core/assets/holdings',
    weight: 2,
    autoDetect: (d) => d.hasHoldingsWithIsin ? 'complete' : skipOr(d, 'isin_koppelen', 'empty'),
  },

  // ── Instellingen (2 items) ──
  {
    key: 'persoonsgegevens',
    category: 'instellingen',
    title: 'Persoonsgegevens',
    description: 'Naam, geboortedatum en huishouden',
    href: '/identity/profiel',
    weight: 2,
    autoDetect: (d) => {
      const filled = [d.hasFullName, d.hasDateOfBirth, d.hasHouseholdType].filter(Boolean).length
      if (filled === 3) return 'complete'
      if (filled > 0) return 'partial'
      return skipOr(d, 'persoonsgegevens', 'empty')
    },
  },
  {
    key: 'voorkeuren',
    category: 'instellingen',
    title: 'Voorkeuren inzichten',
    description: 'FIRE parameters en weergave',
    href: '/identity/instellingen',
    weight: 1,
    autoDetect: (d) => (d.hasFireParams || d.hasModuleColors) ? 'complete' : skipOr(d, 'voorkeuren', 'empty'),
  },
]

// ── Progress calculation ─────────────────────────────────────

export interface InvulfaseProgress {
  completedWeight: number
  totalWeight: number
  skippedWeight: number
  percentage: number
}

/**
 * Calculate weighted progress over active items.
 * Skipped items reduce the denominator so the user isn't penalized.
 */
export function calculateProgress(
  items: InvulfaseItem[],
  dataState: InvulfaseDataState,
): InvulfaseProgress {
  let completedWeight = 0
  let skippedWeight = 0
  let totalWeight = 0

  for (const item of items) {
    totalWeight += item.weight
    const status = item.autoDetect(dataState)
    if (status === 'complete') completedWeight += item.weight
    if (status === 'skipped') skippedWeight += item.weight
  }

  const applicableWeight = totalWeight - skippedWeight
  const percentage = applicableWeight > 0
    ? Math.round((completedWeight / applicableWeight) * 100)
    : 100

  return { completedWeight, totalWeight, skippedWeight, percentage }
}

/**
 * Filter items to only those visible for the current user context.
 * - Category-level conditions filter entire categories
 * - Item-level conditions filter individual items within visible categories
 */
export function getActiveItems(
  ctx: InvulfaseConditionContext,
): InvulfaseItem[] {
  return INVULFASE_ITEMS.filter(item => {
    // Check category-level condition
    const catMeta = CATEGORY_META[item.category]
    if (catMeta.conditional && catMeta.condition && !catMeta.condition(ctx)) {
      return false
    }
    // Check item-level condition
    if (item.condition && !item.condition(ctx)) {
      return false
    }
    return true
  })
}
