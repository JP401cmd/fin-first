import {
  computeSovereigntyLevel,
  levelToPhaseId,
} from '@/lib/feature-phases'
import { NL_SWR } from '@/lib/horizon-data'
import {
  UNIFIED_FEATURES,
  LEGACY_FEATURE_MAP,
  hasSubscription,
  type CommercialTier,
  type ActiveSubscriptions,
} from '@/lib/feature-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export type LockReason = 'accessible' | 'tier_locked' | 'user_disabled'

export interface FeatureAccessResult {
  accessible: boolean
  reason: LockReason
  requiredTier?: CommercialTier
  /** Default state before any user override (true unless tier-locked) */
  defaultEnabled: boolean
}

export type FeatureAccessMap = Record<string, FeatureAccessResult>

export type FeatureAccessData = {
  features: FeatureAccessMap
  /** Sovereignty phase — motivatie-weergave (Jouw Pad), stuurt géén toegang */
  phase: string
  /** Sovereignty level — motivatie-weergave, stuurt géén toegang */
  level: number
  /** Active subscriptions (independent add-ons, not hierarchical) */
  subscriptions: ActiveSubscriptions
  netWorth: number
  monthlyExpenses: number
  freedomPct: number
  /** @deprecated Use subscriptions instead */
  tier: CommercialTier
}

export type FinancialInput = {
  assets: { current_value: number | string }[]
  debts: { current_balance: number | string; debt_type: string }[]
  transactions: { amount: number | string; is_income: boolean }[]
  /** Active subscription add-ons */
  activeSubscriptions: ActiveSubscriptions
  userFeaturePrefs: Record<string, boolean> | null  // user toggles
  /** @deprecated Use activeSubscriptions instead — kept for backward compat */
  commercialTier?: CommercialTier
}

// ── Backward-compat helper ───────────────────────────────────────────────────
// Resolves both new and legacy feature IDs against the access map.

export function isFeatureAccessible(features: FeatureAccessMap, id: string): boolean {
  // Direct match
  const direct = features[id]
  if (direct) return direct.accessible
  // Legacy mapping
  const newId = LEGACY_FEATURE_MAP[id]
  if (newId) return features[newId]?.accessible ?? true
  // Fail-open: unknown features are accessible
  return true
}

/** Get the full access result for a feature (supports legacy IDs) */
export function getFeatureAccess(features: FeatureAccessMap, id: string): FeatureAccessResult | null {
  const direct = features[id]
  if (direct) return direct
  const newId = LEGACY_FEATURE_MAP[id]
  if (newId) return features[newId] ?? null
  return null
}

// ── Main computation ─────────────────────────────────────────────────────────

export function computeFeatureAccess(input: FinancialInput): FeatureAccessData {
  const totalAssets = input.assets.reduce((s, a) => s + Number(a.current_value), 0)
  const debts = input.debts
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  const expenses = input.transactions
    .filter(t => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const monthlyExpenses = expenses / 3

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)

  // Sovereignty level/phase worden alleen nog berekend voor motivatie-weergave
  // (Jouw Pad, fase-overgang-viering) — ze sturen geen feature-toegang meer.
  const level = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt)
  const phase = levelToPhaseId(level)
  const subs = input.activeSubscriptions

  const userPrefs = input.userFeaturePrefs ?? {}

  // ── Build feature access map (2-layer resolution) ──────────────────────────
  // Laag 1: abonnement (harde lock). Laag 2: user-toggle (default aan).

  const features: FeatureAccessMap = {}

  for (const feat of UNIFIED_FEATURES) {
    // LAYER 1 — Subscription check (independent add-ons)
    if (!hasSubscription(subs, feat.requiredTier)) {
      features[feat.id] = {
        accessible: false,
        reason: 'tier_locked',
        requiredTier: feat.requiredTier,
        defaultEnabled: false,
      }
      continue
    }

    // LAYER 2 — User override (features staan standaard aan)
    const userOverride = userPrefs[feat.id]
    const accessible = userOverride !== undefined ? userOverride : true

    features[feat.id] = {
      accessible,
      reason: accessible ? 'accessible' : 'user_disabled',
      defaultEnabled: true,
    }
  }

  // Derive legacy tier for backward compat (highest active subscription)
  const legacyTier: CommercialTier = subs.includes('ai') ? 'ai' : subs.includes('connected') ? 'connected' : 'gratis'

  return { features, phase, level, subscriptions: subs, tier: legacyTier, netWorth, monthlyExpenses, freedomPct }
}
