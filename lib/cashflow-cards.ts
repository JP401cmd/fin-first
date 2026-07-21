// lib/cashflow-cards.ts
// Bouwt de vier hefboom-stijl kaarten voor de cashflow-landingspagina
// (/overzicht/cashflow): Budget, Transacties, Vaste lasten, Forecast. Elke
// kaart krijgt een status, een KPI en uitklap-detail — afgeleid uit data die
// de pagina toch al laadt (DashboardData + CashflowData). Pure module zodat de
// server-page hem kan aanroepen; de client rendert de serialiseerbare output.

import type { DashboardData } from '@/lib/types/dashboard'
import type { CashflowData } from '@/lib/cashflow-data-loader'
import type { VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildForecast } from '@/lib/cashflow-forecast-math'
import { pillarStatus, type LeverageStatus } from '@/lib/leverage-status'
import { formatCurrency } from '@/lib/format'

export type CashflowCardKey = 'budget' | 'transacties' | 'vaste-lasten' | 'forecast'

export interface CashflowCard {
  key: CashflowCardKey
  label: string
  href: string
  tooltip: string
  /** Hoofdcijfer (al geformatteerd), of null wanneer er geen data is. */
  kpi: string | null
  status: LeverageStatus
  subText: string | null
  /** Uitklap-detail: secundaire waarde + 1-regel inzicht + deeplink-label. */
  detail: { label: string; value: string; tip: string; actionLabel: string }
}

const BASE = '/overzicht/cashflow'

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
}

// ── Pure status-helpers (SINGLE SOURCE) ───────────────────────────────────
//
// De vier cashflow-kaartstatussen als kleine pure functies, zodat ZOWEL
// `buildCashflowCards` (de kaarten) ALS de sidebar-status-dots (via
// /api/overzicht/cashflow-status → buildCashflowCards) exact dezelfde
// LeverageStatus produceren. Geen gedupliceerde drempels meer.

/** Budget: budgetdekkings-score (pillarStatus) wanneer een budget actief is. */
export function budgetCardStatus(input: {
  budgetingActive: boolean
  expenseLimit: number
  budgetScore: number
}): LeverageStatus {
  const active = input.budgetingActive && input.expenseLimit > 0
  return active ? pillarStatus(input.budgetScore) : 'neutral'
}

/** Transacties: maand-spaarquote (netto/inkomen). ≥20% good, ≥0% warn, <0 bad. */
export function transactiesCardStatus(input: {
  monthlyIncome: number
  monthlyExpenses: number
}): LeverageStatus {
  const { monthlyIncome, monthlyExpenses } = input
  const monthlyNet = monthlyIncome - monthlyExpenses
  const hasTx = monthlyIncome > 0 || monthlyExpenses > 0
  const rate = monthlyIncome > 0 ? (monthlyNet / monthlyIncome) * 100 : null
  if (!hasTx || rate == null) return 'neutral'
  return rate >= 20 ? 'good' : rate >= 0 ? 'warn' : 'bad'
}

/**
 * Vaste-lasten-aandeeldrempels (fractie van maandinkomen).
 *
 * Gedeeld tussen `vasteLastenCardStatus` (de statussemantiek) én de
 * vaste-lasten-quote-meter op /overzicht/cashflow/vaste-lasten, zodat de
 * meter-zones EXACT samenvallen met de statusgrenzen — geen losse getallen in
 * de UI, geen drift. Grondslag: Nibud-richtlijn (≤ ~50% van je netto-inkomen
 * aan vaste lasten is gezond; boven ~70% wordt het risicovol).
 *
 *   aandeel < VASTE_LASTEN_GOOD_MAX  → good  (gezond)
 *   aandeel ≤ VASTE_LASTEN_WARN_MAX  → warn  (aandacht)
 *   anders                           → bad   (risico)
 */
export const VASTE_LASTEN_GOOD_MAX = 0.5
export const VASTE_LASTEN_WARN_MAX = 0.7

/** Vaste lasten: aandeel van inkomen. <50% good, ≤70% warn, anders bad. */
export function vasteLastenCardStatus(input: {
  totalMonthly: number
  count: number
  monthlyIncome: number
}): LeverageStatus {
  const hasVaste = input.count > 0
  const ratio = input.monthlyIncome > 0 ? input.totalMonthly / input.monthlyIncome : null
  if (!hasVaste || ratio == null) return 'neutral'
  return ratio < VASTE_LASTEN_GOOD_MAX ? 'good' : ratio <= VASTE_LASTEN_WARN_MAX ? 'warn' : 'bad'
}

/** Forecast: netto per maand. >0 good, <0 bad, ==0 warn; geen forecast → neutral. */
export function forecastCardStatus(input: {
  netPerMonth: number
  hasForecast: boolean
}): LeverageStatus {
  if (!input.hasForecast) return 'neutral'
  return input.netPerMonth > 0 ? 'good' : input.netPerMonth < 0 ? 'bad' : 'warn'
}

export function buildCashflowCards(
  dashboardData: DashboardData,
  cashflow: CashflowData,
  vasteLastenSummary: VasteLastenSummary,
): CashflowCard[] {
  // ── Budget ──────────────────────────────────────────────────
  const budgetLimit = dashboardData.budgetTotals.expense.limit
  const budgetSpent = dashboardData.budgetTotals.expense.spent
  const budgetScore = dashboardData.monthSummary.budgetScore
  const budgetActive = dashboardData.budgetingActive && budgetLimit > 0
  const budgetStatus: LeverageStatus = budgetCardStatus({
    budgetingActive: dashboardData.budgetingActive,
    expenseLimit: budgetLimit,
    budgetScore,
  })
  const budget: CashflowCard = {
    key: 'budget',
    label: 'Budget',
    href: `${BASE}/budget`,
    tooltip: 'Plan en volg je maandbudgetten.',
    kpi: budgetActive ? `${formatCurrency(budgetLimit)}/mnd` : null,
    status: budgetStatus,
    subText: budgetActive
      ? budgetStatus === 'good'
        ? 'Op schema'
        : budgetStatus === 'warn'
          ? 'Let op je budget'
          : 'Boven budget'
      : 'Nog geen budget',
    detail: {
      label: 'Budgetdekking',
      value: budgetActive ? `${Math.round(budgetScore)}/100` : '—',
      tip: budgetActive
        ? `${formatCurrency(budgetSpent)} van ${formatCurrency(budgetLimit)} besteed deze maand.`
        : 'Stel budgetten in om grip te krijgen op je uitgaven.',
      actionLabel: 'Bekijk budget',
    },
  }

  // ── Transacties ─────────────────────────────────────────────
  const monthlyIncome = dashboardData.monthlyIncome
  const monthlyExpenses = dashboardData.monthlyExpenses
  const monthlyNet = monthlyIncome - monthlyExpenses
  const hasTx = monthlyIncome > 0 || monthlyExpenses > 0
  const rate = monthlyIncome > 0 ? (monthlyNet / monthlyIncome) * 100 : null
  const txStatus: LeverageStatus = transactiesCardStatus({ monthlyIncome, monthlyExpenses })
  const transacties: CashflowCard = {
    key: 'transacties',
    label: 'Transacties',
    href: `${BASE}/transacties`,
    tooltip: 'Inkomsten en uitgaven van deze maand.',
    kpi: hasTx ? signed(monthlyNet) : null,
    subText: !hasTx
      ? 'Nog geen transacties'
      : txStatus === 'good'
        ? 'Goed gespaard deze maand'
        : txStatus === 'warn'
          ? 'Krap deze maand'
          : 'Tekort deze maand',
    status: txStatus,
    detail: {
      label: 'Deze maand',
      value: rate != null ? `${rate.toFixed(0)}% spaarquote` : '—',
      tip: `Inkomen ${formatCurrency(monthlyIncome)} · uitgaven ${formatCurrency(monthlyExpenses)}.`,
      actionLabel: 'Bekijk transacties',
    },
  }

  // ── Vaste lasten ────────────────────────────────────────────
  // Bron: gedeelde vaste-lasten-samenvatting (confirmed recurrings +
  // auto-detectie over 12 mnd) — exact hetzelfde totaal als de
  // Vaste-lasten-pagina, die /api/subscriptions → loadVasteLastenSummary leest.
  const vastePerMonth = vasteLastenSummary.totalMonthly
  const vasteCount = vasteLastenSummary.count
  const hasVaste = vasteCount > 0
  const vasteRatio = monthlyIncome > 0 ? vastePerMonth / monthlyIncome : null
  const vasteStatus: LeverageStatus = vasteLastenCardStatus({
    totalMonthly: vastePerMonth,
    count: vasteCount,
    monthlyIncome,
  })
  const vasteLasten: CashflowCard = {
    key: 'vaste-lasten',
    label: 'Vaste lasten',
    href: `${BASE}/vaste-lasten`,
    tooltip: 'Abonnementen en terugkerende kosten.',
    kpi: hasVaste ? `${formatCurrency(Math.round(vastePerMonth))}/mnd` : null,
    subText: !hasVaste
      ? 'Nog geen vaste lasten'
      : vasteRatio != null
        ? `${Math.round(vasteRatio * 100)}% van inkomen`
        : `${vasteCount} ${vasteCount === 1 ? 'post' : 'posten'}`,
    status: vasteStatus,
    detail: {
      label: 'Vaste lasten',
      value: hasVaste ? `${formatCurrency(Math.round(vastePerMonth * 12))}/jr` : '—',
      tip: hasVaste
        ? `${vasteCount} terugkerende ${vasteCount === 1 ? 'post' : 'posten'}.`
        : 'Voeg je abonnementen en vaste kosten toe.',
      actionLabel: 'Bekijk vaste lasten',
    },
  }

  // ── Forecast ────────────────────────────────────────────────
  const rows = buildForecast(
    cashflow.recurrings,
    cashflow.baselineIncome,
    cashflow.baselineExpenses,
    cashflow.startingBalance,
    new Date(),
  )
  const netPerMonth = rows[0]?.net ?? 0
  const endBalance = rows[rows.length - 1]?.cumulative ?? cashflow.startingBalance
  const hasForecast =
    cashflow.baselineIncome > 0 || cashflow.baselineExpenses > 0 || cashflow.recurrings.length > 0
  const fcStatus: LeverageStatus = forecastCardStatus({ netPerMonth, hasForecast })
  const forecast: CashflowCard = {
    key: 'forecast',
    label: 'Forecast',
    href: `${BASE}/forecast`,
    tooltip: 'Verwachte kasstroom 6 maanden vooruit.',
    kpi: hasForecast ? formatCurrency(endBalance) : null,
    subText: !hasForecast
      ? 'Nog geen forecast'
      : netPerMonth > 0
        ? 'Saldo groeit'
        : netPerMonth < 0
          ? 'Saldo daalt'
          : 'Stabiel',
    status: fcStatus,
    detail: {
      label: 'Netto per maand',
      value: signed(netPerMonth),
      tip: `Verwacht saldo na ${rows.length} maanden: ${formatCurrency(endBalance)}.`,
      actionLabel: 'Bekijk forecast',
    },
  }

  return [budget, transacties, vasteLasten, forecast]
}
