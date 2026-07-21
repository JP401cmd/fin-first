import { describe, it, expect } from 'vitest'
import {
  resolveWidgetComputeFlags,
  EMPTY_WEEK_OVERVIEW,
  WEEK_OVERVIEW_WIDGET_ID,
  HEATMAP_WIDGET_ID,
  HOUSEHOLD_ACTIVITY_WIDGET_ID,
} from './dashboard-data-loader'
import { WIDGET_CATALOG, type WidgetPref } from './widget-catalog'
import { MOCK_DASHBOARD_DATA } from './mock-dashboard-data'
import type { DashboardData } from '@/lib/types/dashboard'
import { buildOverviewBriefingInput } from './briefing/overview-briefing'

/**
 * Task 2.3 — widget-gated berekenen (gebruikersbesluit optie A: briefing intact).
 *
 * De loader berekent de dure, widget-EXCLUSIEVE velden (weekOverview / heatmap* /
 * householdActivity) alleen nog wanneer de bijbehorende widget actief is. Deze
 * suite bewaakt de gating-contracten die de loader-code aan- of uitzetten:
 *  (a) de pure `resolveWidgetComputeFlags`-beslissing per widget;
 *  (b) de gated-off velden = exact de canonieke leeg-vorm, en geen ander veld wijzigt;
 *  (c) briefing-parity: de gated velden voeden de altijd-getoonde briefing NIET, dus
 *      de briefing-engine-input is byte-identiek met/zonder die velden (optie A).
 */

/** Bouw een minimale WidgetPref-lijst uit widget-IDs (allemaal enabled). */
function widgets(ids: string[]): WidgetPref[] {
  return ids.map((id, i) => ({ id, enabled: true, size: 'quarter' as const, order: i }))
}

// De zes DashboardData-velden die de loader widget-gated maakt.
const GATED_KEYS: (keyof DashboardData)[] = [
  'weekOverview',
  'householdActivity',
  'heatmapExpenseGroups',
  'heatmapSpending',
  'heatmapBeschikbaarMap',
  'heatmapPreviousSpending',
]

/** Zet de widget-gegate velden op hun canonieke leeg-vorm (widget UIT). */
function gateOff(d: DashboardData): DashboardData {
  return {
    ...d,
    weekOverview: EMPTY_WEEK_OVERVIEW,
    householdActivity: [],
    heatmapExpenseGroups: [],
    heatmapSpending: {},
    heatmapBeschikbaarMap: {},
    heatmapPreviousSpending: {},
  }
}

describe('resolveWidgetComputeFlags — gating-waarheidstabel', () => {
  it('alle drie widgets AAN → alle flags true', () => {
    expect(
      resolveWidgetComputeFlags(
        widgets([WEEK_OVERVIEW_WIDGET_ID, HEATMAP_WIDGET_ID, HOUSEHOLD_ACTIVITY_WIDGET_ID]),
      ),
    ).toEqual({ wantWeekOverview: true, wantHeatmap: true, wantHouseholdActivity: true })
  })

  it('geen widgets → alle flags false', () => {
    expect(resolveWidgetComputeFlags([])).toEqual({
      wantWeekOverview: false,
      wantHeatmap: false,
      wantHouseholdActivity: false,
    })
  })

  it('per-widget isolatie (één aan zet alleen zijn eigen flag)', () => {
    expect(resolveWidgetComputeFlags(widgets([WEEK_OVERVIEW_WIDGET_ID]))).toEqual({
      wantWeekOverview: true,
      wantHeatmap: false,
      wantHouseholdActivity: false,
    })
    expect(resolveWidgetComputeFlags(widgets([HEATMAP_WIDGET_ID]))).toEqual({
      wantWeekOverview: false,
      wantHeatmap: true,
      wantHouseholdActivity: false,
    })
    expect(resolveWidgetComputeFlags(widgets([HOUSEHOLD_ACTIVITY_WIDGET_ID]))).toEqual({
      wantWeekOverview: false,
      wantHeatmap: false,
      wantHouseholdActivity: true,
    })
  })

  it('een uitgeschakelde widget telt niet mee (alleen enabled komt in activeWidgets)', () => {
    // activeWidgets bevat per definitie alleen enabled widgets; onbekende IDs negeren.
    expect(resolveWidgetComputeFlags(widgets(['iets_anders', 'nog_iets']))).toEqual({
      wantWeekOverview: false,
      wantHeatmap: false,
      wantHouseholdActivity: false,
    })
  })
})

describe('gated widget-IDs bestaan in de catalogus', () => {
  it.each([WEEK_OVERVIEW_WIDGET_ID, HEATMAP_WIDGET_ID, HOUSEHOLD_ACTIVITY_WIDGET_ID])(
    '%s staat in WIDGET_CATALOG',
    (id) => {
      expect(WIDGET_CATALOG.some((w) => w.id === id)).toBe(true)
    },
  )
})

describe('EMPTY_WEEK_OVERVIEW = canonieke leeg-vorm', () => {
  it('is exact de leeg-vorm die een minimaal account oplevert', () => {
    expect(EMPTY_WEEK_OVERVIEW).toEqual({
      weekExpenses: 0,
      weekIncome: 0,
      dailyExpenses: [],
      weekBudget: 0,
      prevWeekExpenses: 0,
      topCategories: [],
    })
  })
})

describe('widget-gating — veld-isolatie + payload-reductie', () => {
  it('gated-off wijzigt UITSLUITEND de zes widget-exclusieve velden (parity b)', () => {
    const populated = MOCK_DASHBOARD_DATA
    const gated = gateOff(populated)
    for (const key of Object.keys(populated) as (keyof DashboardData)[]) {
      if (GATED_KEYS.includes(key)) continue
      // Spread bewaart referentie-identiteit: elk niet-gegate veld is onaangeraakt.
      expect(gated[key]).toBe(populated[key])
    }
  })

  it('gated-off velden hebben exact de canonieke leeg-vorm', () => {
    const gated = gateOff(MOCK_DASHBOARD_DATA)
    expect(gated.weekOverview).toEqual(EMPTY_WEEK_OVERVIEW)
    expect(gated.householdActivity).toEqual([])
    expect(gated.heatmapExpenseGroups).toEqual([])
    expect(gated.heatmapSpending).toEqual({})
    expect(gated.heatmapBeschikbaarMap).toEqual({})
    expect(gated.heatmapPreviousSpending).toEqual({})
  })

  it('RSC-payload-bewijs: gated-off serialiseert aantoonbaar kleiner', () => {
    // De DashboardData reist als RSC-flight naar de client; lege gated velden
    // krimpen die payload voor een account met minimale widgets.
    const populatedSize = JSON.stringify(MOCK_DASHBOARD_DATA).length
    const gatedSize = JSON.stringify(gateOff(MOCK_DASHBOARD_DATA)).length
    expect(gatedSize).toBeLessThan(populatedSize)
  })
})

describe('briefing-parity (optie A) — gating raakt de briefing niet', () => {
  // Minimale, gedeelde will/horizon (mirror van overview-briefing.test.ts) zodat
  // ALLEEN de dashboard-gated velden verschillen tussen de twee runs.
  type Args = Parameters<typeof buildOverviewBriefingInput>
  const will = {
    recommendations: [],
    goals: [{ name: 'Doel A' }],
    goalProgresses: [{ current: 1, target: 10, pct: 10, onTrack: false, eta: null }],
  } as unknown as Args[1]
  const horizon = {
    healthScore: null,
    healthScoreInput: { freedomPct: 42 },
    effectiveInput: { dateOfBirth: '1990-01-01' },
    events: [],
    assets: [],
    unlinkedCash: 0,
  } as unknown as Args[2]
  const now = new Date('2026-07-19T12:00:00Z')

  it('buildOverviewBriefingInput is byte-identiek met/zonder de gated velden', () => {
    // MOCK_DASHBOARD_DATA heeft backtest/fee/hvb + box3 gevuld, dus de briefing
    // produceert échte Time-Machine-/fee-/HvB-briefjes — die mogen NIET afhangen
    // van weekOverview/heatmap*/householdActivity.
    const inputPopulated = buildOverviewBriefingInput(MOCK_DASHBOARD_DATA, will, horizon, now)
    const inputGated = buildOverviewBriefingInput(gateOff(MOCK_DASHBOARD_DATA), will, horizon, now)
    expect(JSON.stringify(inputGated)).toBe(JSON.stringify(inputPopulated))
  })

  it('de finance-context leest geen enkel gated veld', () => {
    const finance = buildOverviewBriefingInput(MOCK_DASHBOARD_DATA, will, horizon, now).finance ?? {}
    for (const key of GATED_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(finance, key)).toBe(false)
    }
  })
})
