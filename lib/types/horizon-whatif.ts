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
 * WhatIfOverrides is de baseline-snapshot waartegen de scenario-sliders hun
 * events opbouwen en teruglezen (`buildSliderEvent`/`readSliderValueFromEvents`).
 */
export interface WhatIfOverrides {
  monthlyIncome: number
  workDaysPerWeek: number
  savingsRate: number
  expectedReturn: number
  extraContribution: number
}

export interface AssetGroupReturn {
  assetType: string
  label: string
  /** Weighted average expected_return for this asset-type (decimal, e.g. 0.07 for 7%). */
  weightedReturn: number
}
