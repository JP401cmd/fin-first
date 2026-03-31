/**
 * Module-aware nudge definitions.
 *
 * Static, rule-based catalog of suggestions per module.
 * Each nudge detects whether a user has incomplete data
 * and provides a link to the relevant page.
 *
 * Nudges are surfaced in the notification center (meldingencentrum)
 * as type 'module_nudge'. Admin overrides (enable/disable, custom
 * title/description) are stored in app_settings.
 */

import type { ModuleId } from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

export interface NudgeDefinition {
  key: string
  moduleId: ModuleId
  title: string
  description: string
  href: string
  icon: string
  priority: number
  isActive: (data: NudgeDataState) => boolean
}

export interface NudgeDataState {
  hasAssets: boolean
  hasDebts: boolean
  hasBudgets: boolean
  hasTransactions: boolean
  hasActiveBankConnection: boolean
  hasHoldings: boolean
  hasHoldingsWithIsin: boolean
  hasGoals: boolean
  hasLifeEvents: boolean
  hasFireParams: boolean
  activeModules: ModuleId[]
  dismissedNudgeIds: Set<string>
}

export interface Nudge {
  key: string
  moduleId: ModuleId
  title: string
  description: string
  href: string
  icon: string
  priority: number
}

export interface NudgeOverrides {
  [key: string]: {
    title?: string
    description?: string
    enabled?: boolean
  }
}

// ── Nudge Catalog ────────────────────────────────────────────

export const NUDGE_CATALOG: NudgeDefinition[] = [
  // ── Vermogensregistratie ──
  {
    key: 'vermogen_bezittingen',
    moduleId: 'vermogensregistratie',
    title: 'Voeg je bezittingen toe',
    description: 'Registreer je rekeningen, beleggingen en overige bezittingen',
    href: '/core/assets',
    icon: 'Wallet',
    priority: 3,
    isActive: (d) => !d.hasAssets,
  },
  {
    key: 'vermogen_schulden',
    moduleId: 'vermogensregistratie',
    title: 'Registreer je schulden',
    description: 'Hypotheek, leningen en overige schulden',
    href: '/core/debts',
    icon: 'CreditCard',
    priority: 3,
    isActive: (d) => !d.hasDebts,
  },

  // ── Budgetteren ──
  {
    key: 'budget_stel_in',
    moduleId: 'budgetteren',
    title: 'Stel budgetten in',
    description: 'Maak categorieën met limieten aan',
    href: '/core/budgets',
    icon: 'BarChart3',
    priority: 3,
    isActive: (d) => !d.hasBudgets,
  },
  {
    key: 'budget_bank',
    moduleId: 'budgetteren',
    title: 'Koppel je bank',
    description: 'Automatisch transacties importeren',
    href: '/core/cash/connect',
    icon: 'Building2',
    priority: 3,
    isActive: (d) => !d.hasActiveBankConnection,
  },
  {
    key: 'budget_transacties',
    moduleId: 'budgetteren',
    title: 'Importeer transacties',
    description: 'Handmatig via MT940, CSV of OFX',
    href: '/core/cash/import',
    icon: 'Download',
    priority: 3,
    isActive: (d) => !d.hasTransactions,
  },

  // ── Aandelenregistratie ──
  {
    key: 'aandelen_holdings',
    moduleId: 'aandelenregistratie',
    title: 'Voeg beleggingen toe',
    description: 'Registreer individuele posities in je portefeuille',
    href: '/core/assets/holdings',
    icon: 'TrendingUp',
    priority: 3,
    isActive: (d) => !d.hasHoldings,
  },
  {
    key: 'aandelen_isin',
    moduleId: 'aandelenregistratie',
    title: 'Koppel ISIN-codes',
    description: 'Automatische koersupdates voor je holdings',
    href: '/core/assets/holdings',
    icon: 'Link',
    priority: 3,
    isActive: (d) => d.hasHoldings && !d.hasHoldingsWithIsin,
  },

  // ── Toekomstplannen ──
  {
    key: 'horizon_rendement',
    moduleId: 'toekomstplannen',
    title: 'Stel verwacht rendement in',
    description: 'Personaliseer je FIRE-berekeningen',
    href: '/identity/instellingen',
    icon: 'Settings',
    priority: 3,
    isActive: (d) => !d.hasFireParams,
  },
  {
    key: 'horizon_events',
    moduleId: 'toekomstplannen',
    title: 'Plan levensgebeurtenissen',
    description: 'Voeg toekomstige financiële events toe',
    href: '/horizon/life-events',
    icon: 'Calendar',
    priority: 3,
    isActive: (d) => !d.hasLifeEvents,
  },

  // ── Inzicht & Acties ──
  {
    key: 'inzicht_doel',
    moduleId: 'inzicht_acties',
    title: 'Stel een financieel doel',
    description: 'Werk toe naar concrete doelen',
    href: '/will/goals',
    icon: 'Flag',
    priority: 3,
    isActive: (d) => !d.hasGoals,
  },
]

// ── Filter Function ──────────────────────────────────────────

/**
 * Filter nudges to only those relevant for active modules,
 * not yet completed, not dismissed, and not disabled by admin.
 */
export function getActiveNudges(
  state: NudgeDataState,
  overrides?: NudgeOverrides,
): Nudge[] {
  return NUDGE_CATALOG
    .filter((n) => {
      // Must be an active module
      if (!state.activeModules.includes(n.moduleId)) return false
      // Must not be dismissed
      if (state.dismissedNudgeIds.has(`nudge_${n.key}`)) return false
      // Must not be disabled by admin
      if (overrides?.[n.key]?.enabled === false) return false
      // Must be active (data not yet filled)
      return n.isActive(state)
    })
    .sort((a, b) => a.priority - b.priority)
    .map((n) => {
      const ov = overrides?.[n.key]
      return {
        key: n.key,
        moduleId: n.moduleId,
        title: ov?.title || n.title,
        description: ov?.description || n.description,
        href: n.href,
        icon: n.icon,
        priority: n.priority,
      }
    })
}
