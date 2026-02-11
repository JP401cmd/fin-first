import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCoreData } from '@/lib/mock-data'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'

/**
 * Shared context available to all domains:
 * profile overview, net worth, freedom calculation.
 * Uses real Supabase data.
 */
export async function buildSharedContext(supabase: SupabaseClient): Promise<string> {
  // Fetch assets and debts from Supabase
  const [assetsResult, debtsResult, transactionsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('current_value')
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('current_balance')
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount, is_income, date')
      .gte('date', getMonthsAgoDate(3))
      .order('date', { ascending: false }),
  ])

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const transactions = transactionsResult.data ?? []

  const totalAssets = assets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)

  // Calculate average monthly income and expenses from recent transactions
  const monthsOfData = Math.max(1, getDistinctMonths(transactions))
  const totalIncome = transactions
    .filter((t) => t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalExpenses = transactions
    .filter((t) => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  const monthlyIncome = Math.round(totalIncome / monthsOfData)
  const monthlyExpenses = Math.round(totalExpenses / monthsOfData)

  // If no transaction data, return minimal context
  if (totalAssets === 0 && totalDebts === 0 && transactions.length === 0) {
    return section('FINANCIEEL OVERZICHT', 'Nog geen financiële data beschikbaar. Vraag de gebruiker om assets, schulden of transacties toe te voegen.')
  }

  const core = computeCoreData(monthlyIncome, monthlyExpenses, totalAssets, totalDebts)

  const lines = [
    `Netto vermogen: ${formatCurrency(core.netWorth)}`,
    `Vrijgekochte tijd: ${formatFreedomTime(core.freedomYears, core.freedomMonths)}`,
    `Vrijheids-%: ${formatPercentage(core.freedomPercentage)}`,
    `FIRE-doel: ${formatCurrency(core.fireTarget)}`,
    `Verwachte FIRE-datum: ${core.expectedFireDate || 'onbekend'}`,
    `Maandinkomen: ${formatCurrency(core.monthlyIncome)} | Maanduitgaven: ${formatCurrency(core.monthlyExpenses)}`,
    `Spaarquote: ${formatPercentage(core.savingsRate)}`,
    `Dagen vrijheid verdiend per maand: ${core.daysWonPerMonth}`,
    `Vrije dagen per jaar (passief inkomen): ${core.freeDaysPerYear}`,
    `Autonomiescore: ${core.autonomyScore}`,
    `Dagelijkse uitgaven: ${formatCurrency(Math.round(core.yearlyExpenses / 365))}`,
  ]

  return section('FINANCIEEL OVERZICHT', lines.join('\n'))
}

/** Get a date string N months ago in YYYY-MM-DD format */
function getMonthsAgoDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

/** Count distinct year-month combinations in transactions */
function getDistinctMonths(transactions: { date: string }[]): number {
  const months = new Set(
    transactions.map((t) => t.date.substring(0, 7))
  )
  return months.size
}
