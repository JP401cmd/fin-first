import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { computeFireProjection, computeResilienceScore, NL_SWR, type HorizonInput } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { SWR } from '@/lib/constants'

/**
 * GET /api/snapshots/cron
 *
 * Server-side cron endpoint for automatic monthly snapshots.
 * Designed to be called by:
 * - Supabase pg_cron / Edge Function scheduled for 1st of each month
 * - Vercel Cron Jobs
 * - External cron service (cron-job.org, etc.)
 *
 * Uses service role key (not user auth) to create snapshots for ALL users.
 * Protected by CRON_SECRET environment variable.
 *
 * Auto-captures for each user:
 * - net_worth (total_assets - total_debts)
 * - total_assets, total_debts
 * - freedom_percentage
 * - fire_age
 * - sovereignty_level
 * - savings_rate
 * - resilience_score
 *
 * No 24-record cap — keeps unlimited history.
 */
export async function GET(request: Request) {
  // Verify authorization via CRON_SECRET or Authorization header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  // Allow if CRON_SECRET matches (header or query param) or if no secret is configured (dev mode)
  const isAuthorized =
    !cronSecret || // No secret configured = dev mode, allow
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use service role client to access all users' data
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    // Fall back to description of what the cron would do if service role key isn't set
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
      description: 'This endpoint requires the service role key to create snapshots for all users.',
      manual_trigger: 'Users get auto-snapshots via GET /api/snapshots/auto on dashboard load.',
    }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  // Get all users with completed onboarding
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, date_of_birth, expected_return, inflation_rate')
    .eq('onboarding_completed', true)

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const results: { userId: string; created: boolean; error?: string }[] = []

  for (const profile of profiles ?? []) {
    const userId = profile.id

    try {
      // Check if snapshot already exists this month for this user
      const { data: existing } = await supabase
        .from('net_worth_snapshots')
        .select('id')
        .eq('user_id', userId)
        .gte('snapshot_date', monthStart)
        .limit(1)

      if (existing && existing.length > 0) {
        results.push({ userId, created: false })
        continue
      }

      // Fetch all data for this user
      const [assetsResult, debtsResult, expensesResult, incomeResult, budgetsResult] = await Promise.all([
        supabase
          .from('assets')
          .select('id, name, asset_type, current_value, monthly_contribution, net_worth_inclusion_pct')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('debts')
          .select('id, name, debt_type, current_balance, net_worth_inclusion_pct')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .lt('date', monthEnd),
        supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', userId)
          .gt('amount', 0)
          .gte('date', monthStart)
          .lt('date', monthEnd),
        supabase
          .from('budgets')
          .select('default_limit, interval')
          .eq('user_id', userId)
          .eq('is_essential', true)
          .in('budget_type', ['expense'])
          .is('parent_id', null),
      ])

      if (assetsResult.error || debtsResult.error) {
        results.push({ userId, created: false, error: (assetsResult.error || debtsResult.error)?.message })
        continue
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

      const fireParams = resolveFireParams(profile)
      const fireSwr = fireParams.effectiveSwr
      const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / fireSwr : 0
      const freedomPercentage = fireTarget > 0
        ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
        : 0

      const horizonInput: HorizonInput = {
        totalAssets,
        totalDebts,
        monthlyIncome,
        monthlyExpenses,
        monthlyContributions,
        yearlyMustExpenses,
        dateOfBirth: profile.date_of_birth,
      }
      const fireProjection = computeFireProjection(horizonInput, fireParams.grossReturn, fireSwr)

      const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
      const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)
      const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPercentage, hasConsumerDebt)

      const resilience = computeResilienceScore(horizonInput)

      // Upsert snapshot with all metrics
      const snapshotRow = {
        user_id: userId,
        snapshot_date: today,
        total_assets: totalAssets,
        total_debts: totalDebts,
        net_worth: netWorth,
        freedom_percentage: Math.round(freedomPercentage * 10) / 10,
        fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
        sovereignty_level: sovereigntyLevel,
        savings_rate: Math.round(fireProjection.savingsRate * 10) / 10,
        resilience_score: resilience.total,
      }

      const { error: upsertError } = await supabase
        .from('net_worth_snapshots')
        .upsert(snapshotRow, { onConflict: 'user_id,snapshot_date' })

      if (upsertError) {
        // Try without extended columns
        const { error: basicError } = await supabase
          .from('net_worth_snapshots')
          .upsert({
            user_id: userId,
            snapshot_date: today,
            total_assets: totalAssets,
            total_debts: totalDebts,
            net_worth: netWorth,
          }, { onConflict: 'user_id,snapshot_date' })

        if (basicError) {
          results.push({ userId, created: false, error: basicError.message })
          continue
        }
      }

      // Capture per-entity balance snapshots (fire-and-forget)
      captureBalanceSnapshots(supabase, userId, today, assets, debts).catch(() => {})

      results.push({ userId, created: true })
    } catch (err) {
      results.push({ userId, created: false, error: String(err) })
    }
  }

  const created = results.filter(r => r.created).length
  const skipped = results.filter(r => !r.created && !r.error).length
  const errors = results.filter(r => r.error).length

  return NextResponse.json({
    success: true,
    date: today,
    summary: {
      total_users: results.length,
      created,
      skipped_existing: skipped,
      errors,
    },
    results,
  })
}
