/**
 * Scenario-events: bridge between what-if sliders and LifeEvents.
 *
 * Conceptual model:
 *   - All scenario divergence (sliders) is encoded as LifeEvents.
 *   - Scenario events live only in client state (`is_scenario_only: true`)
 *     and are never persisted as life events.
 *   - The simulation engine consumes events as cashflows; baseline simulation
 *     uses only DB events, scenario simulation uses DB events + scenario events.
 *
 * Event types used by this module:
 *   - 'income_change'        — permanent monthly income shift (raise, income slider)
 *   - 'lifestyle_adjustment' — monthly expense shift (frugal preset = permanent; savings
 *                              slider = income-bound, FIRE-gated via SLIDER_WORK_ORIGINS)
 *   - 'extra_inleg'          — additional monthly contribution (sprinter, extra slider)
 *   - 'part_time'            — workday reduction with income loss (slider)
 *   - 'sabbatical'           — finite-duration income loss (preset)
 *   - 'one_time_expense'     — unexpected lump-sum expense
 *   - 'one_time_income'      — unexpected lump-sum income (e.g. inheritance, windfall)
 *   - 'mortgage_payoff'      — lump-sum debt payoff that frees up monthly cashflow
 *   - 'renovation'           — one-time home renovation cost
 *   - 'relocate'             — moving cost + lifestyle adjustment
 *   - 'children'             — NIBUD-fased child cost (handled specially in lifeEventsToCashflows)
 *   - 'child_extra_cost'     — recurring child expense (e.g. study)
 *   - 'market_shock'         — portfolio percentage shock (engine-handled with portfolioPct)
 *
 * All non-special types fall through to the generic fallback in lifeEventsToCashflows.
 */

import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

/** Slider keys that map onto scenario-events. The return-rate slider is intentionally absent — it stays a market-assumption override. */
export type SliderKey = 'income' | 'workdays' | 'savings' | 'extra_inleg'

interface ScenarioEventSpec {
  id: string
  name: string
  event_type: string
  target_age: number
  monthly_income_change?: number
  monthly_cost_change?: number
  one_time_cost?: number
  duration_months?: number
  icon?: string
  is_indexed?: boolean
  metadata?: Record<string, unknown>
  scenario_origin: string
}

/** Build a fully-formed WhatIfEvent from a partial spec, defaulting unset fields. */
function buildScenarioEvent(spec: ScenarioEventSpec): WhatIfEvent {
  return {
    id: spec.id,
    name: spec.name,
    event_type: spec.event_type,
    target_age: spec.target_age,
    target_date: null,
    one_time_cost: spec.one_time_cost ?? 0,
    monthly_cost_change: spec.monthly_cost_change ?? 0,
    monthly_income_change: spec.monthly_income_change ?? 0,
    duration_months: spec.duration_months ?? 0,
    icon: spec.icon ?? 'Calendar',
    is_active: true,
    sort_order: 999,
    is_indexed: spec.is_indexed ?? true,
    metadata: spec.metadata ?? {},
    is_scenario_only: true,
    scenario_origin: spec.scenario_origin,
  }
}

// ── Slider → event helpers ───────────────────────────────────────────────────

const SLIDER_EVENT_ID: Record<SliderKey, string> = {
  income: 'whatif-slider-income',
  workdays: 'whatif-slider-workdays',
  savings: 'whatif-slider-savings',
  extra_inleg: 'whatif-slider-extra-inleg',
}

/**
 * Build a single scenario event for a slider value, or null if the value
 * matches the baseline (no event needed).
 */
export function buildSliderEvent(
  key: SliderKey,
  value: number,
  baseline: WhatIfOverrides,
  currentAge: number,
): WhatIfEvent | null {
  const id = SLIDER_EVENT_ID[key]

  switch (key) {
    case 'income': {
      if (Math.round(value) === Math.round(baseline.monthlyIncome)) return null
      return buildScenarioEvent({
        id,
        name: `Inkomenswijziging (${value > baseline.monthlyIncome ? '+' : ''}${formatDelta(value - baseline.monthlyIncome)})`,
        event_type: 'income_change',
        target_age: currentAge,
        monthly_income_change: Math.round(value - baseline.monthlyIncome),
        duration_months: 0,
        scenario_origin: 'slider:income',
        icon: 'TrendingUp',
      })
    }
    case 'workdays': {
      if (value === baseline.workDaysPerWeek) return null
      const ratio = value / baseline.workDaysPerWeek
      const deltaIncome = Math.round(baseline.monthlyIncome * (ratio - 1))
      return buildScenarioEvent({
        id,
        name: `Werkdagen ${value}/week`,
        event_type: 'part_time',
        target_age: currentAge,
        monthly_income_change: deltaIncome,
        duration_months: 0,
        scenario_origin: 'slider:workdays',
        icon: 'Briefcase',
        metadata: { huidigUren: 40, nieuwUren: value * 8, isPermanent: true },
      })
    }
    case 'savings': {
      // Spaarquote-slider. Het bedrag blijft bewust op `monthly_cost_change` staan (negatief
      // = minder besteden = meer sparen): dat is het SHAPE waarop de round-trip
      // (`readSliderValueFromEvents`/`deriveOverridesFromEvents`) én eerder OPGESLAGEN
      // scenario's de sliderstand reconstrueren. Het is dus GEEN permanente lifestyle-keuze:
      // de adapter-guard (`SLIDER_WORK_ORIGINS`, guard.ts) routeert dit event per 29-jul via
      // het FIRE-gegate salaris-kanaal — spaarquote is inkomensgebonden en vervalt met het
      // inkomen. Een `lifestyle_adjustment` ZONDER slider-origin blijft wél permanent.
      if (Math.round(value) === Math.round(baseline.savingsRate)) return null
      const baselineIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
      const deltaPp = value - baseline.savingsRate
      const deltaCost = -Math.round(baselineIncome * (deltaPp / 100))
      return buildScenarioEvent({
        id,
        name: `Spaarquote-aanpassing (${deltaPp > 0 ? '+' : ''}${Math.round(deltaPp)}pp)`,
        event_type: 'lifestyle_adjustment',
        target_age: currentAge,
        monthly_cost_change: deltaCost,
        duration_months: 0,
        scenario_origin: 'slider:savings',
        icon: 'PiggyBank',
      })
    }
    case 'extra_inleg': {
      if (value === 0) return null
      return buildScenarioEvent({
        id,
        name: `Extra inleg`,
        event_type: 'extra_inleg',
        target_age: currentAge,
        monthly_income_change: Math.round(value),
        duration_months: 0,
        scenario_origin: 'slider:extra_inleg',
        icon: 'Rocket',
      })
    }
  }
}

function formatDelta(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}€${Math.round(v)}`
}

// ── Derive WhatIfOverrides shape from events (backward compat) ───────────────

/**
 * Reconstruct a WhatIfOverrides snapshot from scenario events.
 */
export function deriveOverridesFromEvents(
  scenarioEvents: WhatIfEvent[],
  baseline: WhatIfOverrides,
  expectedReturnOverride: number | null,
): WhatIfOverrides {
  let monthlyIncome = baseline.monthlyIncome
  let workDaysPerWeek = baseline.workDaysPerWeek
  let extraContribution = 0
  let savingsRateAdjustment = 0
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)

  for (const e of scenarioEvents) {
    if (!e.is_scenario_only) continue
    switch (e.event_type) {
      case 'part_time': {
        const meta = e.metadata as { nieuwUren?: number } | undefined
        if (typeof meta?.nieuwUren === 'number' && meta.nieuwUren > 0) {
          workDaysPerWeek = Math.max(1, Math.min(5, Math.round(meta.nieuwUren / 8)))
        } else if (baseline.monthlyIncome > 0) {
          const ratio = 1 + e.monthly_income_change / baseline.monthlyIncome
          workDaysPerWeek = Math.max(1, Math.min(5, Math.round(5 * ratio)))
        }
        break
      }
      case 'income_change': {
        monthlyIncome += e.monthly_income_change
        break
      }
      case 'extra_inleg': {
        extraContribution += e.monthly_income_change
        break
      }
      case 'lifestyle_adjustment': {
        if (baselineEffectiveIncome > 0) {
          savingsRateAdjustment += -e.monthly_cost_change / baselineEffectiveIncome * 100
        }
        break
      }
    }
  }

  return {
    monthlyIncome: Math.max(0, Math.round(monthlyIncome)),
    workDaysPerWeek,
    savingsRate: Math.max(0, Math.min(80, baseline.savingsRate + savingsRateAdjustment)),
    expectedReturn: expectedReturnOverride ?? baseline.expectedReturn,
    extraContribution: Math.max(0, Math.round(extraContribution)),
  }
}

/**
 * Read a slider's effective value from the current scenario events.
 */
export function readSliderValueFromEvents(
  key: SliderKey,
  scenarioEvents: WhatIfEvent[],
  baseline: WhatIfOverrides,
): number {
  const ev = scenarioEvents.find(e => e.id === SLIDER_EVENT_ID[key])
  if (!ev) {
    switch (key) {
      case 'income': return baseline.monthlyIncome
      case 'workdays': return baseline.workDaysPerWeek
      case 'savings': return baseline.savingsRate
      case 'extra_inleg': return 0
    }
  }
  switch (key) {
    case 'income':
      return baseline.monthlyIncome + ev.monthly_income_change
    case 'workdays': {
      const meta = ev.metadata as { nieuwUren?: number } | undefined
      if (typeof meta?.nieuwUren === 'number' && meta.nieuwUren > 0) {
        return Math.max(1, Math.min(5, Math.round(meta.nieuwUren / 8)))
      }
      return baseline.workDaysPerWeek
    }
    case 'savings': {
      const baselineIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
      if (baselineIncome <= 0) return baseline.savingsRate
      const deltaPp = -ev.monthly_cost_change / baselineIncome * 100
      return Math.max(0, Math.min(80, baseline.savingsRate + deltaPp))
    }
    case 'extra_inleg':
      return ev.monthly_income_change
  }
}

/**
 * Replace or remove the scenario-event tied to a slider key.
 */
export function applySliderEvent(
  events: WhatIfEvent[],
  key: SliderKey,
  newEvent: WhatIfEvent | null,
): WhatIfEvent[] {
  const id = SLIDER_EVENT_ID[key]
  const filtered = events.filter(e => e.id !== id)
  if (!newEvent) return filtered
  return [...filtered, newEvent]
}

/**
 * Remove all scenario-only events whose origin matches the given prefix.
 */
export function clearScenarioEvents(
  events: WhatIfEvent[],
  originPrefix?: string,
): WhatIfEvent[] {
  if (!originPrefix) {
    return events.filter(e => !e.is_scenario_only)
  }
  return events.filter(e => !(e.is_scenario_only && e.scenario_origin?.startsWith(originPrefix)))
}
