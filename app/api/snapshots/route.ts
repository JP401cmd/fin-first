import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { computeFireProjection, computeResilienceScore, NL_SWR, type FinancialInput } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { mapDbRows } from '@/lib/db-mapper'

const SWR = 0.04

/**
 * GET /api/snapshots
 * Returns all net worth snapshots for the authenticated user,
 * enriched with computed freedom_percentage based on real asset/debt data.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch snapshots
  const { data: snapshots, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch essential budgets to compute freedom_percentage for each snapshot
  const { data: essentialBudgets } = await supabase
    .from('budgets')
    .select('default_limit, interval')
    .eq('user_id', user.id)
    .eq('is_essential', true)
    .in('budget_type', ['expense'])
    .is('parent_id', null)

  const yearlyMustExpenses = (essentialBudgets ?? []).reduce((s, b) => {
    const limit = Number(b.default_limit) || 0
    return s + (b.interval === 'yearly' ? limit : limit * 12)
  }, 0)
  const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / NL_SWR : 0

  // Enrich snapshots with computed freedom_percentage
  const enriched = (snapshots ?? []).map(s => {
    const netWorth = Number(s.net_worth)
    const totalAssets = Number(s.total_assets)
    const totalDebts = Number(s.total_debts)
    const computedNetWorth = totalAssets - totalDebts
    const freedom_percentage = fireTarget > 0
      ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
      : 0

    return {
      ...s,
      net_worth_matches: Math.abs(netWorth - computedNetWorth) < 0.01,
      freedom_percentage: Math.round(freedom_percentage * 10) / 10,
      fire_target: fireTarget,
      yearly_must_expenses: yearlyMustExpenses,
    }
  })

  return NextResponse.json({
    snapshots: enriched,
    count: enriched.length,
    fire_target: fireTarget,
    yearly_must_expenses: yearlyMustExpenses,
  })
}

/**
 * POST /api/snapshots
 * Creates a new net worth snapshot from real calculated asset/debt data.
 * Captures all key metrics: net_worth, freedom_percentage, fire_age,
 * sovereignty_level, savings_rate, resilience_score.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch real asset, debt, transaction, and profile data in parallel
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const [assetsResult, debtsResult, expensesResult, incomeResult, profileResult, budgetsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('id, name, asset_type, current_value, monthly_contribution, net_worth_inclusion_pct')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('id, name, debt_type, current_balance, net_worth_inclusion_pct')
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
      .select('date_of_birth, expected_return, inflation_rate')
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

  if (assetsResult.error) {
    return NextResponse.json({ error: assetsResult.error.message }, { status: 500 })
  }
  if (debtsResult.error) {
    return NextResponse.json({ error: debtsResult.error.message }, { status: 500 })
  }

  // Keep raw rows for captureBalanceSnapshots (expects snake_case)
  const rawAssets = assetsResult.data ?? []
  const rawDebts = debtsResult.data ?? []

  // Map DB rows to camelCase for local processing
  const assets = mapDbRows(rawAssets)
  const debts = mapDbRows(rawDebts)
  const expenses = expensesResult.data ?? []
  const income = incomeResult.data ?? []

  const totalAssets = assets.reduce((s, a) => s + Number(a.currentValue), 0)
  const totalDebts = debts.reduce((s, d) => s + Number(d.currentBalance), 0)
  const netWorth = totalAssets - totalDebts

  const yearlyExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount), 0))
  const monthlyExpenses = yearlyExpenses / 12
  const monthlyIncome = income.reduce((s, t) => s + Number(t.amount), 0)
  const monthlyContributions = assets.reduce((s, a) => s + Number(a.monthlyContribution || 0), 0)

  // Essential budgets for yearly "must" expenses
  const yearlyMustExpenses = (budgetsResult.data ?? []).reduce((s, b) => {
    const limit = Number(b.default_limit) || 0
    return s + (b.interval === 'yearly' ? limit : limit * 12)
  }, 0)

  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr
  const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / fireSwr : 0
  const freedomPercentage = fireTarget > 0
    ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
    : 0

  // Compute FIRE projection (includes fire_age, savings_rate)
  const dateOfBirth = profileResult.data?.date_of_birth ?? null
  const horizonInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome,
    monthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses,
    dateOfBirth,
  }
  const fireProjection = computeFireProjection(horizonInput, fireParams.grossReturn, fireSwr)

  // Compute sovereignty level
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debtType) && Number(d.currentBalance) > 0)
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPercentage, hasConsumerDebt)

  // Compute resilience score
  const resilience = computeResilienceScore(horizonInput)

  const today = new Date().toISOString().split('T')[0]

  // Build snapshot row with all metrics
  const snapshotRow: Record<string, unknown> = {
    user_id: user.id,
    snapshot_date: today,
    total_assets: totalAssets,
    total_debts: totalDebts,
    net_worth: netWorth,
  }

  // Add extended metrics (columns may not exist if migration #2 hasn't been applied)
  // We try to include them; if the upsert fails due to missing columns, retry without
  const extendedFields: Record<string, unknown> = {
    freedom_percentage: Math.round(freedomPercentage * 10) / 10,
    fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
    sovereignty_level: sovereigntyLevel,
    savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
    resilience_score: resilience.total,
  }

  // Try upsert with extended fields first
  let snapshot: Record<string, unknown> | null = null
  let upsertError: string | null = null

  const { data: fullSnapshot, error: fullError } = await supabase
    .from('net_worth_snapshots')
    .upsert({ ...snapshotRow, ...extendedFields }, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single()

  if (fullError) {
    // Retry without extended fields (columns might not exist yet)
    const { data: basicSnapshot, error: basicError } = await supabase
      .from('net_worth_snapshots')
      .upsert(snapshotRow, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single()

    if (basicError) {
      return NextResponse.json({ error: basicError.message }, { status: 500 })
    }
    snapshot = basicSnapshot
    upsertError = 'Extended columns not available (migration pending). Basic snapshot saved.'
  } else {
    snapshot = fullSnapshot
  }

  // Capture per-entity balance snapshots (fire-and-forget, non-critical)
  captureBalanceSnapshots(supabase, user.id, today, rawAssets, rawDebts).catch(() => {})

  // Trigger badge evaluation after snapshot creation (fire-and-forget, server-side)
  try {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const cookie = headersList.get('cookie') || ''

    fetch(`${protocol}://${host}/api/badges/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
      },
      body: JSON.stringify({ trigger: 'month_close' }),
    }).catch(() => {}) // Fire-and-forget, non-blocking
  } catch {
    // Silent fail — badge evaluation is non-critical
  }

  return NextResponse.json({
    snapshot: {
      ...snapshot,
      // Always include computed values in response even if not saved to DB
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
      resilience_score: resilience.total,
      fire_target: fireTarget,
      yearly_must_expenses: yearlyMustExpenses,
      net_worth_verified: netWorth === totalAssets - totalDebts,
    },
    calculation: {
      total_assets: totalAssets,
      total_debts: totalDebts,
      net_worth: netWorth,
      formula: 'net_worth = total_assets - total_debts',
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_target: fireTarget,
      swr: fireSwr,
      fire_age: fireProjection.fireAge,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
      resilience_score: resilience.total,
      resilience_breakdown: resilience.breakdown,
    },
    ...(upsertError ? { warning: upsertError } : {}),
  })
}
