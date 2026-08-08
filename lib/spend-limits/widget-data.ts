/**
 * DE WIDGET-PROJECTIE van een grenzenpot — een SMALLE vorm van
 * `SpendLimitWithReport`, bedoeld voor de dashboardbundel.
 *
 * ── WAAROM EEN PROJECTIE EN NIET HET HELE RAPPORT ───────────────────────────
 * Een volledig `SpendLimitReport` draagt tot 13 periode-uitkomsten (met namen en
 * tellingen) per pot. Dat is precies wat de prestatieweergave nodig heeft en
 * precies wat een tegel op het startscherm níét nodig heeft; ongefilterd zou het
 * bij elke `/overzicht`-load in de RSC-payload belanden, per pot.
 *
 * ── HET IS EEN PROJECTIE, GEEN BEREKENING ───────────────────────────────────
 * Hieronder wordt niets opnieuw uitgerekend: elk veld is een SELECTIE uit het
 * rapport dat de motor (lib/spend-limits/engine.ts) al heeft geproduceerd. De
 * enige uitzondering is `withinPeriodCount`, en dat is het complement van twee
 * canonieke TELLINGEN — geen tweede weg naar een bedrag, een status of een
 * drempel. Zo blijft er één eigenaar per getal (consume, don't recompute).
 */

import type { SpendLimitPeriodKind, SpendLimitRuleType, SpendLimitStatus, SpendLimitTrendDirection } from './engine'
import type { SpendLimitWithReport } from './types'

export interface SpendLimitWidgetData {
  /** De pot-id; de widget-pref-id is `spend_limit:<id>`. */
  id: string
  name: string
  ruleType: SpendLimitRuleType
  period: SpendLimitPeriodKind
  /** Gepauzeerde potten blijven in de bundel (de widget-pref mag niet wissen). */
  isActive: boolean
  limitAmount: number

  // ── De lopende (voorlopige) periode ───────────────────────────────────────
  currentPeriodKey: string
  currentPeriodLabel: string
  currentMatchedAmount: number
  currentHeadroom: number
  currentOverAmount: number
  status: SpendLimitStatus
  /** Nog binnen, maar op/boven de near-drempel van de motor. Nooit hier herrekenen. */
  isNearLimit: boolean

  // ── Reeks-context (aantallen, geen bedragen — maskeren dus niet) ──────────
  currentStreak: number
  longestStreak: number
  closedPeriodCount: number
  exceededPeriodCount: number
  /** Complement van de twee tellingen hierboven: "binnen je grens X van Y". */
  withinPeriodCount: number

  // ── Verloop ───────────────────────────────────────────────────────────────
  /** Bedragen van de afgesloten periodes, oud → nieuw (sparkline). */
  sparkClosedMatchedAmounts: number[]
  /** Richting uit `report.trend` — 'unknown' bij < 6 afgesloten periodes. */
  trendDirection: SpendLimitTrendDirection

  /**
   * Een aggregaat-chunk kwam op de PostgREST-cap terug, dus de sommen kunnen
   * stil te laag zijn (D-P2). Reist plat mee tot in de tegel: op géén enkel
   * oppervlak mag een gebruiker een stil te laag getal zien zonder dat erbij
   * staat dat het onbetrouwbaar kan zijn.
   */
  aggregateTruncationSuspected: boolean
}

/**
 * Projecteer één doorgerekende pot naar de widget-vorm.
 *
 * `aggregateTruncationSuspected` komt van de sectie-data (het is een eigenschap
 * van de FETCH, niet van de pot) en wordt daarom expliciet meegegeven.
 */
export function toSpendLimitWidgetData(
  limit: SpendLimitWithReport,
  opts: { aggregateTruncationSuspected?: boolean } = {},
): SpendLimitWidgetData {
  const { config, report } = limit
  const current = report.currentPeriod
  const streaks = report.streaks

  return {
    id: config.id,
    name: config.name,
    ruleType: config.ruleType,
    period: config.period,
    isActive: config.isActive,
    limitAmount: config.limitAmount,

    currentPeriodKey: current.periodKey,
    currentPeriodLabel: current.label,
    currentMatchedAmount: current.periodMatchedAmount,
    currentHeadroom: current.periodHeadroom,
    currentOverAmount: current.periodOverAmount,
    status: current.status,
    isNearLimit: current.isNearLimit,

    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    closedPeriodCount: streaks.closedPeriodCount,
    exceededPeriodCount: streaks.exceededPeriodCount,
    withinPeriodCount: streaks.closedPeriodCount - streaks.exceededPeriodCount,

    sparkClosedMatchedAmounts: report.closedPeriods.map((p) => p.periodMatchedAmount),
    trendDirection: report.trend.direction,

    aggregateTruncationSuspected: opts.aggregateTruncationSuspected === true,
  }
}
