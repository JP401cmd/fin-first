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
 * Basisinkomen waartegen de spaarquote-knop rekent: maandinkomen geschaald met de
 * werkdagen (4 van 5 dagen = 80%). ÉÉN home voor `buildSliderEvent('savings')`,
 * `readSliderValueFromEvents('savings')`, de euro-weergave van de knop "Minder
 * uitgeven" en het antwoordenblok (spec §2/§3, 15 sep 2026).
 */
export function savingsBaselineIncome(baseline: WhatIfOverrides): number {
  return baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
}

/** Euro per maand minder uitgeven die een spaarquote van `pp` procentpunt betekent t.o.v. nu (0 op de basis). */
export function savingsEuroForPp(baseline: WhatIfOverrides, pp: number): number {
  return Math.round(savingsBaselineIncome(baseline) * ((pp - baseline.savingsRate) / 100))
}

/** Inverse: welke spaarquote (pp, ongeclampt) hoort bij `euroPerMaand` minder uitgeven; `null` zonder basisinkomen. */
export function savingsPpForMonthlyAmount(baseline: WhatIfOverrides, euroPerMaand: number): number | null {
  const basis = savingsBaselineIncome(baseline)
  if (basis <= 0) return null
  return baseline.savingsRate + (euroPerMaand / basis) * 100
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
        name: `Inkomenswijziging (${formatDelta(value - baseline.monthlyIncome)})`,
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
      // (`readSliderValueFromEvents`) én eerder OPGESLAGEN
      // scenario's de sliderstand reconstrueren. Het is dus GEEN permanente lifestyle-keuze:
      // de adapter-guard (`SLIDER_WORK_ORIGINS`, guard.ts) routeert dit event per 29-jul via
      // het FIRE-gegate salaris-kanaal — spaarquote is inkomensgebonden en vervalt met het
      // inkomen. Een `lifestyle_adjustment` ZONDER slider-origin blijft wél permanent.
      if (Math.round(value) === Math.round(baseline.savingsRate)) return null
      const baselineIncome = savingsBaselineIncome(baseline)
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
      // De knop "Meer salaris": een delta op het salaris, óók negatief (verlaging). Landt via
      // `salarisDeltaPerMaand` op het FIRE-gegate salaris-kanaal — negatief werkt daar net als
      // `slider:workdays` (guard.ts), dus geen apart event-type nodig.
      if (value === 0) return null
      return buildScenarioEvent({
        id,
        name: value > 0 ? `Meer salaris (${formatDelta(value)})` : `Minder salaris (${formatDelta(value)})`,
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

/**
 * Getekende euro-delta voor een event-naam: "+€500" / "−€500" (typografisch minteken, zoals de
 * badges). Draagt zelf het teken — de aanroeper zet er niets voor (eindreview M1: vóór 15 sep
 * 2026 gaf dat "++€500" en "€-500").
 */
function formatDelta(v: number): string {
  const n = Math.round(v)
  return `${n < 0 ? '−' : '+'}€${Math.abs(n)}`
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
      const baselineIncome = savingsBaselineIncome(baseline)
      if (baselineIncome <= 0) return baseline.savingsRate
      const deltaPp = -ev.monthly_cost_change / baselineIncome * 100
      return Math.max(0, Math.min(80, baseline.savingsRate + deltaPp))
    }
    case 'extra_inleg':
      return ev.monthly_income_change
  }
}

/**
 * Zichtbaar (UI-)bereik per slidertype — puur & geëxporteerd zodat de tester 'm kan pinnen.
 * Dit is UITSLUITEND de zichtbare schaal; de validatie-clamps (`SLIDER_RANGES` in
 * lib/horizon/toekomst-scenario.ts), de parser en de API blijven ongewijzigd.
 *
 * De marge per type (eigenaarskeuze 15 sep 2026 voor salaris en spaarquote):
 *  - `income`     : ±20% — [base×0,8 op €100 omlaag, base×1,2 op €100 omhoog]; base 0 ⇒ [0, 1000].
 *  - `workdays`   : [floor(base×0,8), ceil(base×1,2)], geclampt op domein 1–5.
 *  - `savings`    : ±15 PROCENTPUNT rond de basis — [round(base)−15, round(base)+15], geclampt 0–80.
 *  - `extra_inleg`: de knop "Meer salaris" — basis is per definitie 0 (delta op je salaris);
 *                   `base` = basis-maandinkomen ⇒ [−30%, +30%] daarvan op €50, dus óók een
 *                   verlaging is te verkennen; zonder inkomen ⇒ [−500, 500].
 *
 * Verbreding-vangnet (overal): ligt de opgeslagen waarde buiten [min,max], dan verbreedt de band
 * tot die waarde (min omlaag óf max omhoog) — niets clampt.
 */
export function computeSliderUiRange(
  type: 'income' | 'workdays' | 'savings' | 'extra_inleg',
  base: number,
  saved: number,
): { min: number; max: number } {
  let min: number
  let max: number
  switch (type) {
    case 'income':
      if (base <= 0) { min = 0; max = 1000 }
      else { min = Math.floor((base * 0.8) / 100) * 100; max = Math.ceil((base * 1.2) / 100) * 100 }
      break
    case 'workdays':
      min = Math.max(1, Math.min(5, Math.floor(base * 0.8)))
      max = Math.max(1, Math.min(5, Math.ceil(base * 1.2)))
      break
    case 'savings':
      min = Math.max(0, Math.min(80, Math.round(base) - 15))
      max = Math.max(0, Math.min(80, Math.round(base) + 15))
      break
    case 'extra_inleg': {
      const span = base > 0 ? Math.round((base * 0.3) / 50) * 50 : 500
      min = -span
      max = span
      break
    }
  }
  // Vangnet: een opgeslagen waarde buiten [min,max] verbreedt de band tot die waarde.
  return { min: Math.min(min, saved), max: Math.max(max, saved) }
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

/** Eén stap van de knop "Uitgave na pensioen": € 600/jaar = € 50/mnd, zoals Meer salaris. */
export const UITGAVE_NA_PENSIOEN_STAP = 600

/**
 * Zichtbaar bereik van de knop "Uitgave na pensioen": ±40% rond wat je nu rekent,
 * afgerond op de sliderstap. Bewust ruimer dan de ±20%/±30% van de andere knoppen — een
 * tekort van tientallen procenten is bij een vastgezet stopmoment heel gewoon, en een
 * knop die het antwoord niet kán bereiken is een knop zonder nut.
 *
 * Zelfde verbreding-vangnet als `computeSliderUiRange`: ligt de opgeslagen waarde buiten
 * de band, dan verbreedt de band — niets clampt. Staat hier (en niet in de component)
 * omdat het antwoordenblok hetzelfde bereik nodig heeft om `bovenBereik` te bepalen.
 */
export function uitgaveNaPensioenRange(basis: number, saved: number): { min: number; max: number } {
  const stap = UITGAVE_NA_PENSIOEN_STAP
  const veilig = Number.isFinite(basis) && basis > 0 ? basis : 0
  const min = Math.max(0, Math.round((veilig * 0.6) / stap) * stap)
  const max = Math.max(stap, Math.round((veilig * 1.4) / stap) * stap)
  return { min: Math.min(min, saved), max: Math.max(max, saved) }
}
