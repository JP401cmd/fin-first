import { describe, it, expect } from 'vitest'
import { toSpendLimitWidgetData } from './widget-data'
import {
  buildSpendLimitReport,
  resolveSpendLimitPeriods,
  SPEND_LIMIT_NEAR_LIMIT_PCT,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  type SpendLimitAggregateRow,
} from './engine'
import type { SpendLimitConfig, SpendLimitWithReport } from './types'

/**
 * DE WIDGET-PROJECTIE — een SELECTIE uit het motor-rapport, geen tweede
 * berekening.
 *
 * Wat hier bewaakt wordt (en waarom het geen "er staat een getal"-test is):
 *
 *  1. elk veld dat de tegel toont wordt gepind tegen de CANONIEKE motoruitvoer
 *     voor dezelfde invoer — een verkeerd veld, een verkeerde grondslag of een
 *     stale mapping valt hier om en niet pas bij een gebruiker;
 *  2. `withinPeriodCount` is het complement van twee canonieke tellingen
 *     (`closedPeriodCount − exceededPeriodCount`) en mag nooit uit een eigen
 *     hertelling over de periodes komen;
 *  3. de near-drempel komt uit de motor: de projectie kopieert `isNearLimit` en
 *     rekent nergens zelf met 0,8.
 */

const NOW = new Date(2026, 7, 15) // 15 augustus 2026 (lokaal)

function config(overrides: Partial<SpendLimitConfig> = {}): SpendLimitConfig {
  return {
    id: 'POT-1',
    name: 'Tankstations',
    purpose: null,
    ruleType: 'counterparty',
    budgetId: null,
    budgetName: null,
    budgetArchived: false,
    includeChildBudgets: false,
    counterpartyKey: 'shell',
    counterpartyLabel: 'Shell',
    limitAmount: 100,
    period: 'month',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Eén tegenpartij-aggregaatrij per maand met netto uitgave `spent` (positief
 * getal in). De RPC-vorm draagt `sumNegatief ≤ 0`; de motor maakt daar
 * `periodMatchedAmount = −(sumNegatief + sumPositief)` van.
 */
function row(month: string, spent: number): SpendLimitAggregateRow {
  return {
    month,
    transactionType: null,
    sumPositief: 0,
    sumNegatief: -spent,
    count: 1,
    matchedNames: ['Shell'],
  }
}

function build(
  rows: SpendLimitAggregateRow[],
  cfg: SpendLimitConfig = config(),
): SpendLimitWithReport {
  const report = buildSpendLimitReport({
    rule: { ruleType: cfg.ruleType, limitAmount: cfg.limitAmount, period: cfg.period },
    rows,
    now: NOW,
    windowPeriods: SPEND_LIMIT_WINDOW_BY_PERIOD[cfg.period],
  })
  return { config: cfg, report, budgetSplit: [] }
}

describe('toSpendLimitWidgetData — projectie pint de motoruitvoer', () => {
  it('kopieert de lopende periode verbatim uit het rapport', () => {
    // Augustus 2026 zit op 60 van een grens van 100 → binnen, niet near.
    const limit = build([row('2026-08', 60), row('2026-07', 40), row('2026-06', 30)])
    const w = toSpendLimitWidgetData(limit)
    const cur = limit.report.currentPeriod

    expect(w.currentPeriodKey).toBe(cur.periodKey)
    expect(w.currentPeriodLabel).toBe(cur.label)
    expect(w.currentMatchedAmount).toBe(cur.periodMatchedAmount)
    expect(w.currentHeadroom).toBe(cur.periodHeadroom)
    expect(w.currentOverAmount).toBe(cur.periodOverAmount)
    expect(w.status).toBe(cur.status)
    expect(w.isNearLimit).toBe(cur.isNearLimit)
    // Geen drift op de identiteit/grondslag zelf.
    expect(w.id).toBe('POT-1')
    expect(w.limitAmount).toBe(limit.config.limitAmount)
    expect(w.period).toBe(limit.config.period)
    expect(w.ruleType).toBe(limit.config.ruleType)
  })

  it('neemt de near-vlag over uit de motor i.p.v. zelf 0,8 te rekenen', () => {
    // Exact op de drempel: de motor zegt "near", de projectie mag daar niets
    // van afwijken (en berekent de drempel niet opnieuw).
    const atThreshold = 100 * SPEND_LIMIT_NEAR_LIMIT_PCT
    const limit = build([row('2026-08', atThreshold)])
    const w = toSpendLimitWidgetData(limit)

    expect(limit.report.currentPeriod.isNearLimit).toBe(true)
    expect(w.isNearLimit).toBe(limit.report.currentPeriod.isNearLimit)
    expect(w.status).toBe('within')
  })

  it('bij een overschrijding: status exceeded, near uit, overAmount uit de motor', () => {
    const limit = build([row('2026-08', 175)])
    const w = toSpendLimitWidgetData(limit)

    expect(w.status).toBe('exceeded')
    expect(w.isNearLimit).toBe(false)
    expect(w.currentOverAmount).toBe(limit.report.currentPeriod.periodOverAmount)
    expect(w.currentHeadroom).toBe(limit.report.currentPeriod.periodHeadroom)
  })

  it('reeks-velden komen 1-op-1 uit report.streaks', () => {
    const limit = build([
      row('2026-08', 10),
      row('2026-07', 20),
      row('2026-06', 150), // eroverheen
      row('2026-05', 30),
      row('2026-04', 40),
    ])
    const w = toSpendLimitWidgetData(limit)
    const s = limit.report.streaks

    expect(w.currentStreak).toBe(s.currentStreak)
    expect(w.longestStreak).toBe(s.longestStreak)
    expect(w.closedPeriodCount).toBe(s.closedPeriodCount)
    expect(w.exceededPeriodCount).toBe(s.exceededPeriodCount)
  })

  it('withinPeriodCount = closedPeriodCount − exceededPeriodCount (complement, geen hertelling)', () => {
    const limit = build([
      row('2026-07', 20),
      row('2026-06', 150), // eroverheen
      row('2026-05', 160), // eroverheen
      row('2026-04', 30),
    ])
    const w = toSpendLimitWidgetData(limit)
    const s = limit.report.streaks

    expect(w.withinPeriodCount).toBe(s.closedPeriodCount - s.exceededPeriodCount)
    // En het complement klopt óók met een onafhankelijke telling over dezelfde
    // canonieke uitkomsten — zo bewijst de test dat de aftreksom niet toevallig
    // klopt maar dezelfde werkelijkheid beschrijft.
    const withinFromOutcomes = limit.report.closedPeriods.filter(p => p.status === 'within').length
    expect(w.withinPeriodCount).toBe(withinFromOutcomes)
  })

  it('sparkline draagt de afgesloten periodes oud → nieuw, zonder de lopende', () => {
    const limit = build([row('2026-08', 99), row('2026-07', 40), row('2026-06', 30)])
    const w = toSpendLimitWidgetData(limit)

    expect(w.sparkClosedMatchedAmounts).toEqual(
      limit.report.closedPeriods.map(p => p.periodMatchedAmount),
    )
    // De lopende periode (augustus, 99) hoort er NIET in — die is voorlopig en
    // telt ook in de motor niet mee voor reeks of trend.
    expect(limit.report.currentPeriod.periodMatchedAmount).toBe(99)
    expect(w.sparkClosedMatchedAmounts).not.toContain(99)
    expect(w.sparkClosedMatchedAmounts.length).toBe(limit.report.closedPeriods.length)
    expect(w.trendDirection).toBe(limit.report.trend.direction)
  })

  it('lege historie levert een bruikbare tegel: nullen, geen NaN', () => {
    const limit = build([])
    const w = toSpendLimitWidgetData(limit)

    expect(w.currentMatchedAmount).toBe(0)
    expect(w.status).toBe('within')
    // Een periode ZONDER uitgaven telt in de motor als BINNEN de grens (je hebt
    // immers niets uitgegeven) — de reeks is dus het volle venster, niet 0. De
    // projectie mag daar niets aan corrigeren.
    expect(w.currentStreak).toBe(limit.report.streaks.currentStreak)
    expect(w.exceededPeriodCount).toBe(0)
    expect(w.withinPeriodCount).toBe(w.closedPeriodCount - w.exceededPeriodCount)
    expect(Number.isNaN(w.currentHeadroom)).toBe(false)
    expect(Number.isNaN(w.currentOverAmount)).toBe(false)
    // Elke afgesloten periode staat als 0 in de sparkline — geen NaN-gaten.
    expect(w.sparkClosedMatchedAmounts.every(v => v === 0)).toBe(true)
  })

  it('gepauzeerde pot blijft in de projectie, herkenbaar aan isActive:false', () => {
    // De bundel draagt gepauzeerde potten bewust mee: de widget-pref mag niet
    // wissen omdat iemand de pot even pauzeerde.
    const limit = build([row('2026-08', 10)], config({ isActive: false }))
    expect(toSpendLimitWidgetData(limit).isActive).toBe(false)
  })

  it('draagt de truncatie-kanarie plat mee (eigenschap van de fetch, niet van de pot)', () => {
    const limit = build([row('2026-08', 10)])
    expect(toSpendLimitWidgetData(limit).aggregateTruncationSuspected).toBe(false)
    expect(
      toSpendLimitWidgetData(limit, { aggregateTruncationSuspected: true })
        .aggregateTruncationSuspected,
    ).toBe(true)
  })

  it('kwartaalpot: label/sleutel komen uit de motor, niet uit een eigen parser', () => {
    const cfg = config({ period: 'quarter', id: 'POT-Q' })
    const limit = build([row('2026-07', 50), row('2026-08', 20)], cfg)
    const w = toSpendLimitWidgetData(limit)
    const periods = resolveSpendLimitPeriods('quarter', NOW, SPEND_LIMIT_WINDOW_BY_PERIOD.quarter)
    const open = periods[periods.length - 1]

    expect(w.currentPeriodKey).toBe(open.periodKey)
    expect(w.currentPeriodLabel).toBe(open.label)
    expect(w.period).toBe('quarter')
  })
})
