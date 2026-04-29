// ── Compute Module Access ─────────────────────────────────────────────────────
// Two-layer access computation layer that replaces the sovereignty-based system.
// Layer 1: Is the widget's required module active?
// Layer 2: Does the user have the required subscription tier?
// This file is the computation foundation for ModuleAccessProvider and widget-renderer.

import type { ModuleId } from './module-registry'
import { isModuleActive, getWidgetRequiredModule } from './module-registry'
import type { ActiveSubscriptions } from './feature-registry'
import { hasSubscription, UNIFIED_FEATURES, WIDGET_TO_FEATURE } from './feature-registry'

// ── Types ────────────────────────────────────────────────────────────────────

/** Snapshot of the user's module context for access decisions */
export interface ModuleAccessData {
  activeModules: ModuleId[]
  subscriptions: ActiveSubscriptions
  /** Net worth = total assets – total debts */
  netWorth: number
  /** Average monthly non-income spend over the last 3 months */
  monthlyExpenses: number
  /** Portfolio / FIRE target expressed as a percentage (0–100+) */
  freedomPct: number
}

/**
 * Result of a two-layer widget visibility check.
 * - 'visible'         — widget should render
 * - 'module_inactive' — the required module is not in the user's active set
 * - 'tier_locked'     — required subscription add-on is not active
 */
export interface WidgetAccessResult {
  visible: boolean
  reason: 'visible' | 'module_inactive' | 'tier_locked'
}

// ── Widget access ────────────────────────────────────────────────────────────

/**
 * Two-layer widget visibility check.
 *
 * Layer 1 — Module check:
 *   Uses `getWidgetRequiredModule` to find which module owns the widget.
 *   Widgets with no entry in WIDGET_MODULE_MAP are "foundation" widgets and
 *   always pass this layer.
 *
 * Layer 2 — Subscription tier check:
 *   Uses `WIDGET_TO_FEATURE` to find the unified feature, then checks
 *   `requiredTier` against the user's active subscriptions.
 *   Widgets not mapped to a feature are treated as 'gratis' and always pass.
 */
export function isWidgetVisible(
  widgetId: string,
  activeModules: ModuleId[],
  subscriptions: ActiveSubscriptions,
): WidgetAccessResult {
  // Layer 1: module gate
  const requiredModule = getWidgetRequiredModule(widgetId)
  if (requiredModule !== undefined && !isModuleActive(activeModules, requiredModule)) {
    return { visible: false, reason: 'module_inactive' }
  }

  // Layer 2: subscription tier gate
  const featureId = WIDGET_TO_FEATURE[widgetId]
  if (featureId !== undefined) {
    const feature = UNIFIED_FEATURES.find((f) => f.id === featureId)
    if (feature && !hasSubscription(subscriptions, feature.requiredTier)) {
      return { visible: false, reason: 'tier_locked' }
    }
  }

  return { visible: true, reason: 'visible' }
}

// ── Route access ─────────────────────────────────────────────────────────────

/**
 * Determine whether a route is accessible given the user's active modules.
 *
 * Routes are checked from most specific to least specific so that sub-paths
 * like /core/assets/holdings are evaluated before their parent /core/assets.
 * Routes not matched by any rule are always accessible (fail-open).
 *
 * **Kern fundament-regel** (zie CLAUDE.md):
 * Registratie van bezittingen en schulden is fundament — geen module-eis op
 * `/core`, `/core/assets`, `/core/assets/[type]` (behalve holdings),
 * `/core/debts` en `/core/debts/[type]`. Verdiepingen (Budgetteren,
 * Holdings) hebben hun eigen specifieke module-eis op specialistische
 * sub-routes.
 */
export function isRouteAccessible(pathname: string, activeModules: ModuleId[]): boolean {
  // Most-specific routes first to prevent early exit on a parent pattern

  // Holdings is a sub-section of assets and requires the dedicated
  // aandelenregistratie module — it is the verdieping op investment-assets.
  if (pathname.startsWith('/core/assets/holdings')) {
    return isModuleActive(activeModules, 'aandelenregistratie')
  }

  // Box 3 belasting is een berekenings-tool die rust op vermogensregistratie.
  if (pathname.startsWith('/core/belasting')) {
    return isModuleActive(activeModules, 'vermogensregistratie')
  }

  // /core/assets, /core/assets/[type] (cash/savings/etc.), /core/debts en
  // /core/debts/[type] zijn pure registratie — altijd toegankelijk.
  // Verdiepings-tabs binnen deze pagina's vallen zelf terug op een
  // tip-strip wanneer de bijbehorende module uit staat.
  if (pathname.startsWith('/core/assets') || pathname.startsWith('/core/debts')) {
    return true
  }

  if (pathname.startsWith('/core/budgets')) {
    return isModuleActive(activeModules, 'budgetteren')
  }

  // Rapportages sub-routes checked before the general rapportages route
  if (pathname.startsWith('/rapportages/budget')) {
    return isModuleActive(activeModules, 'budgetteren')
  }

  if (pathname.startsWith('/rapportages')) {
    return isModuleActive(activeModules, 'inzicht_acties')
  }

  if (pathname.startsWith('/will') || pathname === '/dashboard') {
    return isModuleActive(activeModules, 'inzicht_acties')
  }

  if (pathname.startsWith('/horizon')) {
    return isModuleActive(activeModules, 'toekomstplannen')
  }

  if (pathname.startsWith('/nieuws') || pathname.startsWith('/briefing')) {
    return isModuleActive(activeModules, 'nieuws')
  }

  // All other routes are accessible regardless of active modules
  return true
}

// ── Financial summary computation ────────────────────────────────────────────

/**
 * Compute `ModuleAccessData` from raw financial row arrays.
 *
 * The financial summary values (netWorth, monthlyExpenses, freedomPct) are
 * kept for backward compatibility and consumed by other parts of the app
 * (e.g. dashboard indicators, freedom percentage display).
 *
 * Freedom % formula: (netWorth / FIRE target) × 100
 * where FIRE target = (monthlyExpenses × 12) / 0.04
 * Returns 0 when monthlyExpenses is zero to avoid division by zero.
 */
export function computeModuleAccess(input: {
  activeModules: ModuleId[]
  activeSubscriptions: ActiveSubscriptions
  assets: { current_value: number | string }[]
  debts: { current_balance: number | string; debt_type: string }[]
  transactions: { amount: number | string; is_income: boolean }[]
}): ModuleAccessData {
  const totalAssets = input.assets.reduce((sum, a) => sum + Number(a.current_value), 0)
  const totalDebts = input.debts.reduce((sum, d) => sum + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  // Average monthly expenses over the last 3 months of transaction data
  const totalExpenses = input.transactions
    .filter((t) => !t.is_income)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
  const monthlyExpenses = totalExpenses / 3

  // FIRE target uses the 4% safe withdrawal rate (SWR = 0.04)
  const fireTarget = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 0.04 : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

  return {
    activeModules: input.activeModules,
    subscriptions: input.activeSubscriptions,
    netWorth,
    monthlyExpenses,
    freedomPct,
  }
}
