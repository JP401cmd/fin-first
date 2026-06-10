import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'
import { resolveFireParams } from '@/lib/fire-params'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { SWR } from '@/lib/constants'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'

/**
 * GET /api/snapshots/auto
 *
 * Automatic monthly snapshot endpoint. Always recomputes and upserts the
 * current-month snapshot for the authenticated user. The upsert is idempotent
 * on (user_id, snapshot_date), so repeated calls within a day overwrite the
 * same row with fresh values — they do not create duplicates.
 *
 * Designed to be called by:
 * - External cron service (e.g., Supabase Edge Functions, Vercel Cron)
 * - Client-side on dashboard load (safe to call multiple times)
 *
 * Why no early-return on existence: a snapshot row may exist for this month
 * with stale or null extended fields (e.g., fire_age) — for example, a seeded
 * historical snapshot, or a row inserted before the user visited /horizon.
 * Always recomputing keeps the row in sync with the latest portfolio + horizon
 * params. The projection is cheap. AutoSnapshotTrigger throttles itself to
 * once per mount via a ref (see lib/hooks/use-auto-snapshot.ts), so this runs
 * at most once per page load.
 *
 * Returns: { updated: true, snapshot: {...}, metrics: {...} }
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Fetch all required data in parallel
  const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  const sixMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1))
  const monthEnd = localMonthBounds(now).end

  const [assetsResult, debtsResult, expensesResult, incomeResult, profileResult, budgetsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('id, name, asset_type, current_value, monthly_contribution, net_worth_inclusion_pct')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('id, name, debt_type, current_balance, net_worth_inclusion_pct, interest_rate, monthly_payment, repayment_type, end_date, start_date, include_aflossing_in_savings, custom_aflossing_amount')
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
      .gte('date', sixMonthsAgo)
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

  if (assetsResult.error || debtsResult.error) {
    return NextResponse.json({
      error: (assetsResult.error || debtsResult.error)?.message,
    }, { status: 500 })
  }

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const expenses = expensesResult.data ?? []
  const income = incomeResult.data ?? []

  const totalAssets = assets.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const netWorth = totalAssets - totalDebts

  const yearlyExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount), 0))
  const monthlyExpenses = yearlyExpenses / 12
  const monthlyIncome = income.reduce((s, t) => s + Number(t.amount), 0) / 6
  const monthlyContributions = assets.reduce((s, a) => s + Number(a.monthly_contribution || 0), 0)

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

  // Compute FIRE projection
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
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPercentage, hasConsumerDebt)

  // Compute debt aflossing total for savings rate correction
  let debtAflossing6m = 0
  for (const d of debts as Debt[]) {
    if (!d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    debtAflossing6m += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }

  // Compute 6-pillar health score (replaces old 4-pillar resilience)
  const savingsRate6m = monthlyIncome > 0
    ? ((monthlyIncome - monthlyExpenses + debtAflossing6m) / monthlyIncome) * 100
    : 0
  const emergencyFundMonths = monthlyExpenses > 0 ? totalAssets * 0.3 / monthlyExpenses : 0
  const assetTypes = new Set(assets.map((a: { asset_type?: string }) => a.asset_type).filter(Boolean))
  const healthScore = computeHealthScoreFromInputs({
    savingsRate6m,
    totalAssets,
    totalDebts,
    emergencyFundMonths,
    freedomPct: freedomPercentage,
    assetTypeCount: assetTypes.size,
    budgetCategories: [],
  })

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
    resilience_score: healthScore.total,
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

  // Capture per-entity balance snapshots (fire-and-forget, non-critical)
  captureBalanceSnapshots(supabase, user.id, today, assets, debts).catch(() => {})

  // Sync last_known_phase to profiles (fire-and-forget — layout also handles this on page load,
  // but cron-triggered snapshots would otherwise leave profiles stale).
  // IMPORTANT: Only update if last_known_phase is already set (not null).
  // A null value means the user hasn't activated yet — we must not bypass the activation flow.
  void (async () => {
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('last_known_phase')
        .eq('id', user.id)
        .single()
      if (p && p.last_known_phase !== null) {
        await supabase
          .from('profiles')
          .update({ last_known_phase: levelToPhaseId(sovereigntyLevel) })
          .eq('id', user.id)
      }
    } catch {
      // Non-critical
    }
  })()

  // Trigger badge evaluation after snapshot creation (fire-and-forget, server-side)
  // This evaluates badges after monthly close/snapshot events
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
    updated: true,
    snapshot: {
      ...snapshot,
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
      resilience_score: healthScore.total,
    },
    metrics: {
      fire_target: fireTarget,
      yearly_must_expenses: yearlyMustExpenses,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      health_pillars: healthScore.pillars.map(p => ({ id: p.id, name: p.name, score: p.score, weight: p.weight })),
    },
    ...(warning ? { warning } : {}),
  })
}
