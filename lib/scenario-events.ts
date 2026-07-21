/**
 * Scenario-events: bridge between what-if presets/sliders and LifeEvents.
 *
 * Conceptual model:
 *   - All scenario divergence (presets + sliders) is encoded as LifeEvents.
 *   - Scenario events live only in client state (`is_scenario_only: true`)
 *     and are never persisted unless the user saves a scenario via WhatIfScenarios.
 *   - The simulation engine consumes events as cashflows; baseline simulation
 *     uses only DB events, scenario simulation uses DB events + scenario events.
 *
 * Event types used by this module:
 *   - 'income_change'        — permanent monthly income shift (raise, income slider)
 *   - 'lifestyle_adjustment' — permanent monthly expense shift (frugal, savings slider)
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

/** Thematic categories — drive the segmented-control filter on WhatIfPresets. */
export type PresetCategory = 'werk' | 'familie' | 'wonen' | 'markt' | 'eenmalig'

export const PRESET_CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: 'werk', label: 'Werk' },
  { id: 'familie', label: 'Familie' },
  { id: 'wonen', label: 'Wonen' },
  { id: 'markt', label: 'Markt' },
  { id: 'eenmalig', label: 'Eenmalig' },
]

type IconKey =
  | 'Briefcase' | 'TrendingUp' | 'PiggyBank' | 'Rocket' | 'Palmtree'
  | 'AlertTriangle' | 'Gift' | 'Baby' | 'GraduationCap' | 'Home'
  | 'Wrench' | 'Truck' | 'Activity' | 'Hourglass' | 'TrendingDown'
  | 'UserMinus'

export interface PresetSpec {
  id: string
  category: PresetCategory
  label: string
  description: string
  /** Italic editorial sentence for ChartOverlayExplainer. */
  explainer: string
  iconKey: IconKey
  /** Only show in household perspective (e.g. partner-related presets). */
  householdOnly?: boolean
  /** Builds the events to add when this preset is activated. */
  buildEvents: (baseline: WhatIfOverrides, currentAge: number) => WhatIfEvent[]
  /** Short summary line shown when the preset is active. */
  summary: (baseline: WhatIfOverrides) => string
}

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

/** Round to nearest 50 to keep generated amounts tidy in the UI. */
function round50(v: number): number {
  return Math.round(v / 50) * 50
}

// ── Preset catalogus (16 presets across 5 categories) ───────────────────────

export const PRESETS: PresetSpec[] = [
  // ── Werk (4) ──────────────────────────────────────────────────────────────
  {
    id: 'part-time',
    category: 'werk',
    label: 'Deeltijd werken',
    description: 'Van 5 naar 4 dagen (−20% inkomen)',
    explainer: 'Deeltijd werken — je inkomen daalt 20%, je krijgt een hele dag per week terug. Pas uren en startmoment aan via de sliders en het evenementen-paneel.',
    iconKey: 'Briefcase',
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-part-time',
        name: 'Deeltijd werken (4 dagen)',
        event_type: 'part_time',
        target_age: a,
        monthly_income_change: -round50(b.monthlyIncome * 0.2),
        duration_months: 0,
        scenario_origin: 'preset:part-time',
        icon: 'Briefcase',
        metadata: { huidigUren: 40, nieuwUren: 32, isPermanent: true },
      }),
    ],
    summary: (b) => `−€${round50(b.monthlyIncome * 0.2)}/mnd (4 dagen)`,
  },
  {
    id: 'raise',
    category: 'werk',
    label: 'Loonsverhoging',
    description: '+10% bruto inkomen, permanent',
    explainer: 'Een loonsverhoging van 10% — al het extra geld vloeit naar sparen, je lifestyle blijft gelijk.',
    iconKey: 'TrendingUp',
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-raise',
        name: 'Loonsverhoging (+10%)',
        event_type: 'income_change',
        target_age: a,
        monthly_income_change: round50(b.monthlyIncome * 0.1),
        duration_months: 0,
        scenario_origin: 'preset:raise',
        icon: 'TrendingUp',
      }),
    ],
    summary: (b) => `+€${round50(b.monthlyIncome * 0.1)}/mnd inkomen`,
  },
  {
    id: 'sabbatical',
    category: 'werk',
    label: 'Mini-sabbatical',
    description: '1 jaar 3 dagen werken',
    explainer: 'Een jaar drie dagen werken — minder inkomen, lager spaartempo, meer ruimte.',
    iconKey: 'Palmtree',
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-sabbatical',
        name: 'Mini-sabbatical (3 dagen, 1 jaar)',
        event_type: 'sabbatical',
        target_age: a,
        monthly_income_change: -round50(b.monthlyIncome * 0.4),
        duration_months: 12,
        scenario_origin: 'preset:sabbatical',
        icon: 'Palmtree',
      }),
    ],
    summary: (b) => `12mnd, −€${round50(b.monthlyIncome * 0.4)}/mnd inkomen`,
  },
  {
    id: 'earlier-retire',
    category: 'werk',
    label: 'Eerder stoppen',
    description: 'Stop met werken over 3 jaar',
    explainer: 'Drie jaar nog werken, dan stop. Hoeveel kun je verteren tot je AOW-leeftijd?',
    iconKey: 'Hourglass',
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-earlier-retire',
        name: 'Stop met werken in 3 jaar',
        event_type: 'income_change',
        target_age: a + 3,
        monthly_income_change: -round50(b.monthlyIncome),
        duration_months: 0,
        scenario_origin: 'preset:earlier-retire',
        icon: 'Hourglass',
      }),
    ],
    summary: (b) => `vanaf ${'+3 jr'}: −€${round50(b.monthlyIncome)}/mnd`,
  },
  {
    id: 'zzp-start',
    category: 'werk',
    label: 'ZZP starten',
    description: 'Loondienst → zelfstandig, met aanloopperiode',
    explainer: 'De stap naar zelfstandig — een aanloopjaar met lager inkomen, geen werkgeverspensioen meer, maar wel zelfstandigenaftrek en vrijheid.',
    iconKey: 'Rocket',
    buildEvents: (b, a) => [
      // Permanent: ZZP income is ~15% lower than salary (no vakantiegeld, no 13e maand, admin overhead)
      buildScenarioEvent({
        id: 'whatif-preset-zzp-income',
        name: 'ZZP netto-inkomen (na aanloop)',
        event_type: 'income_change',
        target_age: a,
        monthly_income_change: -round50(b.monthlyIncome * 0.15),
        duration_months: 0,
        scenario_origin: 'preset:zzp-start',
        icon: 'Rocket',
        metadata: { type: 'zzp_income_stable' },
      }),
      // Temporary: extra income loss during aanloopperiode (first 12 months)
      // Total first year: -40% income (15% permanent + 25% extra aanloop)
      buildScenarioEvent({
        id: 'whatif-preset-zzp-aanloop',
        name: 'Aanloopperiode (lagere omzet)',
        event_type: 'income_change',
        target_age: a,
        monthly_income_change: -round50(b.monthlyIncome * 0.25),
        duration_months: 12,
        scenario_origin: 'preset:zzp-start',
        icon: 'Hourglass',
        metadata: { type: 'zzp_aanloop' },
      }),
      // Net recurring costs: AOV (€250) + pensioenreservering (€350) − zelfstandigenaftrek (€400) = +€200/mnd
      buildScenarioEvent({
        id: 'whatif-preset-zzp-costs',
        name: 'AOV + pensioen − zelfstandigenaftrek',
        event_type: 'lifestyle_adjustment',
        target_age: a,
        monthly_cost_change: 200,
        duration_months: 0,
        scenario_origin: 'preset:zzp-start',
        icon: 'Activity',
        metadata: {
          aov_per_maand: 250,
          pensioenreservering_per_maand: 350,
          zelfstandigenaftrek_netto_per_maand: -400,
        },
      }),
    ],
    summary: (b) => `aanloop 12mnd −€${round50(b.monthlyIncome * 0.40)}/mnd, daarna −€${round50(b.monthlyIncome * 0.15)}/mnd`,
  },

  // ── Familie (3) ───────────────────────────────────────────────────────────
  {
    id: 'partner-stops',
    category: 'familie',
    label: 'Partner stopt',
    description: 'Eén inkomen valt weg',
    explainer: 'Eén partner stopt met werken — gezinsinkomen halveert, sparen onder druk.',
    iconKey: 'UserMinus',
    householdOnly: true,
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-partner-stops',
        name: 'Partner stopt met werken',
        event_type: 'income_change',
        target_age: a + 1,
        monthly_income_change: -round50(b.monthlyIncome * 0.5),
        duration_months: 0,
        scenario_origin: 'preset:partner-stops',
        icon: 'UserMinus',
      }),
    ],
    summary: (b) => `−€${round50(b.monthlyIncome * 0.5)}/mnd gezinsinkomen`,
  },
  {
    id: 'child-coming',
    category: 'familie',
    label: 'Kind krijgen',
    description: 'Opvang ~€1.320/mnd, kinderbijslag, 4 dagen werken',
    explainer: 'Een kind krijgen — kinderopvang (3 dagen, ~€1.320/mnd bruto), NIBUD-gefaseerde kosten tot 18, kinderbijslag, en één dag minder werken.',
    iconKey: 'Baby',
    buildEvents: (b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-child-coming',
        name: 'Kind krijgen (komend jaar)',
        event_type: 'children',
        target_age: a + 1,
        one_time_cost: 5000,
        duration_months: 0,
        scenario_origin: 'preset:child-coming',
        icon: 'Baby',
        metadata: {
          aantalKinderen: 1,
          kinderopvangDagen: 3,
          kinderbijslag: true,
          babyuitzet: 5000,
        },
      }),
      buildScenarioEvent({
        id: 'whatif-preset-child-coming-parttime',
        name: 'Minder werken (4 dagen)',
        event_type: 'part_time',
        target_age: a + 1,
        monthly_income_change: -round50(b.monthlyIncome * 0.2),
        duration_months: 0,
        scenario_origin: 'preset:child-coming',
        icon: 'Briefcase',
        metadata: { huidigUren: 40, nieuwUren: 32, isPermanent: true },
      }),
    ],
    summary: (b) => `opvang 3d, −€${round50(b.monthlyIncome * 0.2)}/mnd werk`,
  },
  {
    id: 'study-cost',
    category: 'familie',
    label: 'Studiekosten kind',
    description: '€700/mnd, 4 jaar',
    explainer: 'Studiekosten voor je kind — kamer, boeken, levensonderhoud, vier jaar lang.',
    iconKey: 'GraduationCap',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-study-cost',
        name: 'Studiekosten kind',
        event_type: 'child_extra_cost',
        target_age: a + 17,
        monthly_cost_change: 700,
        duration_months: 48,
        scenario_origin: 'preset:study-cost',
        icon: 'GraduationCap',
      }),
    ],
    summary: () => '€700/mnd, 4 jaar (vanaf +17j)',
  },

  // ── Wonen (4) ─────────────────────────────────────────────────────────────
  {
    id: 'house-purchase',
    category: 'wonen',
    label: 'Huis kopen',
    description: '€350K, overdrachtsbelasting 2%, huur valt weg',
    explainer: 'Een huis kopen voor €350.000 — kosten koper ~€25K (overdrachtsbelasting 2%, notaris, taxatie), hypotheek ~€1.200/mnd, maar je huur van ~€1.000/mnd valt weg.',
    iconKey: 'Home',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-house-purchase',
        name: 'Huis kopen (€350K)',
        event_type: 'house_purchase',
        target_age: a + 1,
        one_time_cost: 25000,
        monthly_cost_change: 1500, // hypotheek €1.200 + onderhoud €300
        duration_months: 0,
        scenario_origin: 'preset:house-purchase',
        icon: 'Home',
        metadata: {
          aankoopprijs: 350000,
          hypotheekRente: 4.0,
          eersteWoning: false,
          hypotheekLasten: 1200,
          huidigeHuur: 1000,
          nhg: false,
        },
      }),
      buildScenarioEvent({
        id: 'whatif-preset-house-purchase-huurvrijval',
        name: 'Huurvrijval',
        event_type: 'lifestyle_adjustment',
        target_age: a + 1,
        monthly_cost_change: -1000, // besparing op huur
        duration_months: 0,
        scenario_origin: 'preset:house-purchase',
        icon: 'Home',
      }),
    ],
    summary: () => '€25K kk, +€500/mnd netto',
  },
  {
    id: 'mortgage-payoff',
    category: 'wonen',
    label: 'Hypotheek aflossen',
    description: '€50.000 extra aflossen',
    explainer: 'Vijftigduizend euro extra op je hypotheek — minder rente, hogere maandelijkse vrije ruimte.',
    iconKey: 'Home',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-mortgage-payoff',
        name: 'Hypotheek extra aflossen',
        event_type: 'mortgage_payoff',
        target_age: a + 1,
        one_time_cost: 50000,
        monthly_income_change: 200, // saved on monthly mortgage payment (rough)
        duration_months: 0,
        scenario_origin: 'preset:mortgage-payoff',
        icon: 'Home',
      }),
    ],
    summary: () => '−€50k vermogen, +€200/mnd ruimte',
  },
  {
    id: 'renovation',
    category: 'wonen',
    label: 'Renovatie',
    description: '€30.000 verbouwing',
    explainer: 'Dertigduizend euro voor een verbouwing — keuken, badkamer, dak. Eenmalige uitgave nu.',
    iconKey: 'Wrench',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-renovation',
        name: 'Renovatie',
        event_type: 'renovation',
        target_age: a + 1,
        one_time_cost: 30000,
        duration_months: 0,
        scenario_origin: 'preset:renovation',
        icon: 'Wrench',
      }),
    ],
    summary: () => '€30.000 eenmalig',
  },
  {
    id: 'relocate',
    category: 'wonen',
    label: 'Verhuizen',
    description: 'Goedkoper wonen, eenmalige kosten',
    explainer: 'Verhuizen naar iets goedkopers — €15k verhuiskosten, daarna €200/mnd lagere vaste lasten.',
    iconKey: 'Truck',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-relocate-move',
        name: 'Verhuiskosten',
        event_type: 'one_time_expense',
        target_age: a + 1,
        one_time_cost: 15000,
        duration_months: 0,
        scenario_origin: 'preset:relocate',
        icon: 'Truck',
      }),
      buildScenarioEvent({
        id: 'whatif-preset-relocate-savings',
        name: 'Lagere woonlasten',
        event_type: 'lifestyle_adjustment',
        target_age: a + 1,
        monthly_cost_change: -200,
        duration_months: 0,
        scenario_origin: 'preset:relocate',
        icon: 'Home',
      }),
    ],
    summary: () => '€15k nu, −€200/mnd permanent',
  },

  // ── Markt (3) ─────────────────────────────────────────────────────────────
  {
    id: 'crash-2008',
    category: 'markt',
    label: 'Crash 2008',
    description: '−37% portfolio dit jaar',
    explainer: 'Een crash zoals 2008 — je vermogen daalt 37% in één klap. Hoe veerkrachtig is je plan?',
    iconKey: 'TrendingDown',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-crash-2008',
        name: 'Beurscrash (−37%)',
        event_type: 'market_shock',
        target_age: a + 1,
        duration_months: 0,
        scenario_origin: 'preset:crash-2008',
        icon: 'TrendingDown',
        metadata: { shockPercentage: -0.37 },
      }),
    ],
    summary: () => '−37% portfolio dit jaar',
  },
  {
    id: 'lost-decade',
    category: 'markt',
    label: 'Verloren decennium',
    description: '~25% achterstand cumulatief',
    explainer: 'Een decennium van magere rendementen — alsof tien jaar groei wegvalt. Dramatische impact bij het einde.',
    iconKey: 'TrendingDown',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-lost-decade',
        name: 'Verloren decennium (−25% cumulatief)',
        event_type: 'market_shock',
        target_age: a + 1,
        duration_months: 0,
        scenario_origin: 'preset:lost-decade',
        icon: 'TrendingDown',
        metadata: { shockPercentage: -0.25 },
      }),
    ],
    summary: () => '−25% cumulatief',
  },
  {
    id: 'stagflation',
    category: 'markt',
    label: 'Stagflatie',
    description: '+€400/mnd uitgaven, 5 jaar',
    explainer: 'Hoge inflatie die niet weggaat — boodschappen, energie, dagelijks leven, vijf jaar lang duurder.',
    iconKey: 'AlertTriangle',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-stagflation',
        name: 'Stagflatie (5 jaar duurder leven)',
        event_type: 'lifestyle_adjustment',
        target_age: a + 1,
        monthly_cost_change: 400,
        duration_months: 60,
        scenario_origin: 'preset:stagflation',
        icon: 'AlertTriangle',
      }),
    ],
    summary: () => '+€400/mnd, 5 jaar',
  },

  // ── Eenmalig (3) ─────────────────────────────────────────────────────────
  {
    id: 'unexpected-expense',
    category: 'eenmalig',
    label: 'Onverwachte uitgave',
    description: 'Eenmalig €25.000 dit jaar',
    explainer: 'Een onverwachte tegenvaller van €25.000 — ziekenhuis, dak, auto. Hoe veerkrachtig is je plan?',
    iconKey: 'AlertTriangle',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-unexpected-expense',
        name: 'Onverwachte uitgave',
        event_type: 'one_time_expense',
        target_age: a,
        one_time_cost: 25000,
        duration_months: 0,
        scenario_origin: 'preset:unexpected-expense',
        icon: 'AlertTriangle',
      }),
    ],
    summary: () => '€25.000 eenmalig',
  },
  {
    id: 'inheritance',
    category: 'eenmalig',
    label: 'Erfenis',
    description: '€50.000 over 5 jaar',
    explainer: 'Een erfenis van €50.000 over vijf jaar — hoe versnelt dit je traject?',
    iconKey: 'Gift',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-inheritance',
        name: 'Erfenis (verwacht)',
        event_type: 'one_time_income',
        target_age: a + 5,
        one_time_cost: -50000,
        duration_months: 0,
        scenario_origin: 'preset:inheritance',
        icon: 'Gift',
      }),
    ],
    summary: () => '€50.000 over 5 jaar',
  },
  {
    id: 'windfall',
    category: 'eenmalig',
    label: 'Bonus',
    description: '€15.000 incasso volgend jaar',
    explainer: 'Een bonus, schadevergoeding of meevaller van €15.000 volgend jaar — kleine sprong vooruit.',
    iconKey: 'Gift',
    buildEvents: (_b, a) => [
      buildScenarioEvent({
        id: 'whatif-preset-windfall',
        name: 'Bonus / meevaller',
        event_type: 'one_time_income',
        target_age: a + 1,
        one_time_cost: -15000,
        duration_months: 0,
        scenario_origin: 'preset:windfall',
        icon: 'Gift',
      }),
    ],
    summary: () => '€15.000 over 1 jaar',
  },
]

/** Map of preset-id → italic editorial sentence for ChartOverlayExplainer. */
export const PRESET_EXPLAINERS: Record<string, string> = Object.fromEntries(
  PRESETS.map(p => [p.id, p.explainer])
)

/** Find a preset by id. */
export function getPreset(id: string | null): PresetSpec | null {
  if (!id) return null
  return PRESETS.find(p => p.id === id) ?? null
}

/** Detect whether a list of scenario events matches a given preset's signature. */
export function eventsMatchPreset(events: WhatIfEvent[], presetId: string): boolean {
  const preset = getPreset(presetId)
  if (!preset) return false
  const wanted = events.filter(e => e.scenario_origin === `preset:${presetId}`)
  if (wanted.length === 0) return false
  // No other preset's events present (slider events allowed).
  const otherPresetEvents = events.filter(e =>
    e.is_scenario_only
    && e.scenario_origin?.startsWith('preset:')
    && e.scenario_origin !== `preset:${presetId}`
  )
  return otherPresetEvents.length === 0
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
      if (Math.round(value) === Math.round(baseline.savingsRate)) return null
      const baselineIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
      const deltaPp = value - baseline.savingsRate
      const deltaCost = -Math.round(baselineIncome * (deltaPp / 100))
      return buildScenarioEvent({
        id,
        name: `Lifestyle-aanpassing (${deltaPp > 0 ? '+' : ''}${Math.round(deltaPp)}%)`,
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
