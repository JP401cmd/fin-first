import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeFireProjection, computeResilienceScore, type HorizonInput } from '@/lib/horizon-data'
import { computeSovereigntyLevel } from '@/lib/feature-phases'

const SWR = 0.04

/**
 * GET /api/snapshots/auto
 *
 * Automatic monthly snapshot endpoint. Creates a snapshot for the authenticated
 * user if one hasn't been created this month yet. Designed to be called by:
 * - External cron service (e.g., Supabase Edge Functions, Vercel Cron)
 * - Client-side on dashboard load (idempotent — safe to call multiple times)
 *
 * Returns: { created: boolean, snapshot: {...}, metrics: {...} }
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  // Check if a snapshot already exists this month
  const { data: existingSnapshots } = await supabase
    .from('net_worth_snapshots')
    .select('id, snapshot_date, net_worth, total_assets, total_debts, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score')
    .eq('user_id', user.id)
    .gte('snapshot_date', monthStart)
    .order('snapshot_date', { ascending: false })
    .limit(1)

  if (existingSnapshots && existingSnapshots.length > 0) {
    return NextResponse.json({
      created: false,
      message: 'Snapshot al aangemaakt deze maand',
      snapshot: existingSnapshots[0],
    })
  }

  // Fetch all required data in parallel
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const [assetsResult, debtsResult, expensesResult, incomeResult, profileResult, budgetsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('current_value, monthly_contribution')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('current_balance, debt_type')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .gt('amount', 0)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('profiles')
      .select('date_of_birth')
      .eq('id', user.id)
      .single(),
    supabase
      .from('budgets')
      .select('default_limit, interval')
      .eq('user_id', user.id)
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
  ])

  if (assetsResult.error || debtsResult.error) {
    return NextResponse.json({
      error: (assetsResult.error || debtsResult.error)?.message,
    }, { status: 500 })
  }

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const expenses = expensesResult.data ?? []
  const income = incomeResult.data ?? []

  const totalAssets = assets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  const yearlyExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount), 0))
  const monthlyExpenses = yearlyExpenses / 12
  const monthlyIncome = income.reduce((s, t) => s + Number(t.amount), 0)
  const monthlyContributions = assets.reduce((s, a) => s + Number(a.monthly_contribution || 0), 0)

  const yearlyMustExpenses = (budgetsResult.data ?? []).reduce((s, b) => {
    const limit = Number(b.default_limit) || 0
    return s + (b.interval === 'yearly' ? limit : limit * 12)
  }, 0)

  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0
  const freedomPercentage = fireTarget > 0
    ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
    : 0

  // Compute FIRE projection
  const dateOfBirth = profileResult.data?.date_of_birth ?? null
  const horizonInput: HorizonInput = {
    totalAssets,
    totalDebts,
    monthlyIncome,
    monthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses,
    dateOfBirth,
  }
  const fireProjection = computeFireProjection(horizonInput)

  // Compute sovereignty level
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPercentage, hasConsumerDebt)

  // Compute resilience score
  const resilience = computeResilienceScore(horizonInput)

  // Build snapshot row
  const snapshotRow: Record<string, unknown> = {
    user_id: user.id,
    snapshot_date: today,
    total_assets: totalAssets,
    total_debts: totalDebts,
    net_worth: netWorth,
  }

  const extendedFields: Record<string, unknown> = {
    freedom_percentage: Math.round(freedomPercentage * 10) / 10,
    fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
    sovereignty_level: sovereigntyLevel,
    savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
    resilience_score: resilience.total,
  }

  // Try upsert with extended fields; fall back to basic if columns don't exist
  let snapshot: Record<string, unknown> | null = null
  let warning: string | undefined

  const { data: fullSnapshot, error: fullError } = await supabase
    .from('net_worth_snapshots')
    .upsert({ ...snapshotRow, ...extendedFields }, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single()

  if (fullError) {
    const { data: basicSnapshot, error: basicError } = await supabase
      .from('net_worth_snapshots')
      .upsert(snapshotRow, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single()

    if (basicError) {
      return NextResponse.json({ error: basicError.message }, { status: 500 })
    }
    snapshot = basicSnapshot
    warning = 'Extended columns not available (migration pending). Basic snapshot saved.'
  } else {
    snapshot = fullSnapshot
  }

  return NextResponse.json({
    created: true,
    snapshot: {
      ...snapshot,
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
      resilience_score: resilience.total,
    },
    metrics: {
      fire_target: fireTarget,
      yearly_expenses: yearlyExpenses,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      resilience_breakdown: resilience.breakdown,
    },
    ...(warning ? { warning } : {}),
  })
}
