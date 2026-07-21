// ── What-if / scenario data-contracten ───────────────────────────
// Verhuisd uit de components/app/horizon/whatif-* componenten zodat de
// import-richting UI→lib is. Zuiver type-only.

import type { LifeEvent } from '@/lib/horizon-data'

export interface WhatIfEvent extends LifeEvent {
  /** Temporarily disabled in what-if (not persisted) */
  whatIfDisabled?: boolean
  /** Lives only in client state — added by a preset or slider, not in DB. */
  is_scenario_only?: boolean
  /** Source of a scenario-only event: 'preset:<id>' or 'slider:<key>'. */
  scenario_origin?: string
}

/**
 * WhatIfOverrides is now a derived view, but kept as a public type for
 * components that still consume the snapshot shape (WhatIfActions / Chat /
 * Scenarios). Pages compute it via deriveOverridesFromEvents.
 */
export interface WhatIfOverrides {
  monthlyIncome: number
  workDaysPerWeek: number
  savingsRate: number
  expectedReturn: number
  extraContribution: number
}

/** Mirrors the shape returned by the /api/whatif/suggest route. */
export interface SuggestedEvent {
  event_type: string
  name: string
  target_age: number | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  explanation: string
}

export interface AssetGroupReturn {
  assetType: string
  label: string
  /** Weighted average expected_return for this asset-type (decimal, e.g. 0.07 for 7%). */
  weightedReturn: number
}
