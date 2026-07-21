import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'
import { resolveFireParams } from '@/lib/fire-params'
import { resolveEmergencyTargetMonths, type EmergencyGoalCandidate } from '@/lib/emergency-fund'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { logError } from '@/lib/log-error'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { recordJobRun } from '@/lib/job-runs'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  weightedAssetTotal,
  weightedDebtTotal,
  computeSnapshotNetWorth,
  computeSnapshotFreedomPct,
  type SnapshotAsset,
  type SnapshotDebt,
} from '../snapshot-math'

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
 * - resilience_score (now stores 6-pillar health score, not legacy 4-pillar resilience)
 *
 * No 24-record cap — keeps unlimited history.
 */
export async function GET(request: Request) {
  // Verify authorization via CRON_SECRET or Authorization header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend
  // secret mag dit service-role-endpoint niet openbaar maken (fail-closed).
  if (!cronSecret && isProduction) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  // Allow if CRON_SECRET matches (header or query param); alleen in dev mag het zonder secret
  const isAuthorized =
    !cronSecret || // dev mode zonder secret
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

  // Canonieke service-role client (lib/supabase/service.ts). De cron draait
  // zonder gebruikerssessie: de balance_snapshots-INSERT via
  // captureBalanceSnapshots() zou met een sessie-client door de
  // WITH CHECK (auth.uid() = user_id)-policy worden geweigerd. Service-role
  // (server-only, achter CRON_SECRET) passeert RLS bewust voor deze
  // system-actor. De env-guard hierboven garandeert dat de key gezet is.
  const supabase = getServiceClient()
  const startedAt = new Date().toISOString()

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)
  const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  const sixMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1))

  // Get all users with completed onboarding
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, date_of_birth, expected_return, inflation_rate, household_type')
    .eq('onboarding_completed', true)

  if (profilesError) {
    await recordJobRun(supabase, { job: 'snapshots', status: 'error', startedAt, error: profilesError.message })
    // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
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
      const [
        assetsResult,
        debtsResult,
        expensesResult,
        incomeResult,
        budgetsResult,
        monthTxResult,
        bankAccountsResult,
        goalsResult,
      ] = await Promise.all([
        supabase
          .from('assets')
          .select('id, name, asset_type, current_value, monthly_contribution, net_worth_inclusion_pct')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('debts')
          .select('id, name, debt_type, current_balance, net_worth_inclusion_pct, interest_rate, monthly_payment, repayment_type, end_date, start_date, include_aflossing_in_savings, custom_aflossing_amount')
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
          .gte('date', sixMonthsAgo)
          .lt('date', monthEnd),
        // Alle budgetten (alle types, parents + children) — must-expenses + health.
        supabase
          .from('budgets')
          .select('id, parent_id, budget_type, default_limit, interval, is_essential')
          .eq('user_id', userId),
        // Huidige-maand-transacties met budget_id voor budget-discipline.
        supabase
          .from('transactions')
          .select('amount, budget_id')
          .eq('user_id', userId)
          .gte('date', monthStart)
          .lt('date', monthEnd),
        // Niet-gekoppelde bankrekeningen voor unlinkedCash.
        supabase
          .from('bank_accounts')
          .select('balance')
          .eq('user_id', userId)
          .eq('is_active', true)
          .is('linked_asset_id', null),
        // Actieve doelen → noodfonds-target (goal-losgekoppeld-fix). Één
        // geïndexeerde query per user (user_id) — past in het per-user-batch.
        supabase
          .from('goals')
          .select('goal_type, target_value, metadata')
          .eq('user_id', userId)
          .eq('is_completed', false),
      ])

      if (assetsResult.error || debtsResult.error) {
        results.push({ userId, created: false, error: (assetsResult.error || debtsResult.error)?.message })
        continue
      }

      const assets = assetsResult.data ?? []
      const debts = debtsResult.data ?? []
      const expenses = expensesResult.data ?? []
      const income = incomeResult.data ?? []

      const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)

      // Canoniek opgeslagen net_worth: inclusion-gewogen assets + losse cash
      // − inclusion-gewogen debts (spiegelt dashboard-loader; gedeeld met POST/auto).
      const weightedAssets = weightedAssetTotal(assets as SnapshotAsset[])
      const totalDebts = weightedDebtTotal(debts as SnapshotDebt[])
      const totalAssets = weightedAssets + unlinkedCash
      const netWorth = computeSnapshotNetWorth(weightedAssets, unlinkedCash, totalDebts)

      const yearlyExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount), 0))
      const monthlyExpenses = yearlyExpenses / 12
      const monthlyIncome = income.reduce((s, t) => s + Number(t.amount), 0) / 6
      const monthlyContributions = assets.reduce((s, a) => s + Number(a.monthly_contribution || 0), 0)

      const allBudgets = budgetsResult.data ?? []
      const yearlyMustExpenses = allBudgets
        .filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
        .reduce((s, b) => {
          const limit = Number(b.default_limit) || 0
          return s + (b.interval === 'yearly' ? limit : limit * 12)
        }, 0)

      const fireParams = resolveFireParams(profile)
      const fireSwr = fireParams.effectiveSwr
      const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / fireSwr : 0
      const freedomPercentage = computeSnapshotFreedomPct(netWorth, fireTarget)

      const horizonInput: FinancialInput = {
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

      // Schuldaflossing voor de spaarquote-correctie (zelfde logica als POST/auto).
      let debtAflossing6m = 0
      for (const d of debts as Debt[]) {
        if (!d.include_aflossing_in_savings) continue
        const aflossing = d.custom_aflossing_amount != null
          ? Number(d.custom_aflossing_amount)
          : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
        debtAflossing6m += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
      }

      // Compute 6/7-pillar health score via het CANONIEKE gedeelde input-bouwpad
      // (lib/health-score-input.ts) — exact dezelfde functie als de live loader.
      // Echte noodfonds-maanden, budgetCategories en Box 3-taxData i.p.v. proxies,
      // zodat de opgeslagen resilience_score ≈ de live score (SSoT, ADR 0008).
      // freedomPct = snapshot-eigen freedomPercentage (zie /api/snapshots/route.ts
      // voor de motivatie van deze bewuste afwijking t.o.v. de strategy-adjusted
      // loader-freedomPct).
      const savingsRate6m = monthlyIncome > 0
        ? ((monthlyIncome - monthlyExpenses + debtAflossing6m) / monthlyIncome) * 100
        : 0
      // DSTI-teller: Σ maandlasten over de actieve schulden (select bevat monthly_payment).
      const debtMonthlyPayments = debts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0)
      // Noodfonds-target uit het (optionele) noodfonds-doel; geen doel → default 6.
      const emergencyTargetMonths = resolveEmergencyTargetMonths(
        (goalsResult.data ?? []) as EmergencyGoalCandidate[],
        monthlyExpenses,
      )
      const healthScore = computeHealthScoreFromInputs(
        buildHealthScoreInput(
          {
            savingsRate6m,
            totalAssets: weightedAssets + unlinkedCash,
            totalDebts,
            freedomPct: freedomPercentage,
            avgMonthlyExpenses: monthlyExpenses,
            // Zelfde inkomensbron als savingsRate6m (income/6) — DSTI-noemer.
            netMonthlyIncome: monthlyIncome,
            emergencyTargetMonths,
          },
          {
            assets: assets as HealthScoreAsset[],
            unlinkedCash,
            budgets: allBudgets as HealthScoreBudget[],
            transactions: (monthTxResult.data ?? []) as HealthScoreTransaction[],
            householdType: profile.household_type ?? null,
            debtMonthlyPayments,
          },
        ),
      )

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
        resilience_score: healthScore.total,
        // Methode-versie van de opgeslagen score (ADR 0010 / FR-7). DEFAULT 1 op
        // de kolom; v2-snapshots schrijven expliciet 2. De basic-fallback-upsert
        // hieronder laat 'm bewust weg (mag terugvallen op de kolom-default).
        score_version: 2,
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

      // Capture per-entity balance snapshots (fire-and-forget). Silent failures
      // are logged to error_logs (service-role client bypasses RLS) so empty
      // sparklines don't go unnoticed — main path stays non-blocking (no await).
      captureBalanceSnapshots(supabase, userId, today, assets, debts)
        .then(res => {
          if (res.error) {
            void logError(supabase, {
              userId,
              context: 'balance-snapshot:cron',
              message: res.error,
            })
          }
        })
        .catch((err: unknown) => {
          void logError(supabase, {
            userId,
            context: 'balance-snapshot:cron',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          })
        })

      results.push({ userId, created: true })
    } catch (err) {
      results.push({ userId, created: false, error: String(err) })
    }
  }

  const created = results.filter(r => r.created).length
  const skipped = results.filter(r => !r.created && !r.error).length
  const errors = results.filter(r => r.error).length

  const summary = {
    total_users: results.length,
    created,
    skipped_existing: skipped,
    errors,
  }

  await recordJobRun(supabase, {
    job: 'snapshots',
    status: 'success',
    startedAt,
    summary,
    error: errors > 0 ? `${errors} gebruiker(s) faalden` : null,
  })

  return NextResponse.json({
    success: true,
    date: today,
    summary,
    results,
  })
}
