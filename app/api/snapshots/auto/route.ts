import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { unauthorized, serverError } from '@/lib/api/respond'
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
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { logError } from '@/lib/log-error'
import { captureNetWorthHistory, type NetWorthHistorySource } from '@/lib/networth-history'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { savingsRateFromAggregates } from '@/lib/savings-source'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  weightedAssetTotal,
  weightedDebtTotal,
  computeSnapshotNetWorth,
  computeSnapshotFreedomPct,
  buildSnapshotParams,
  type SnapshotAsset,
  type SnapshotDebt,
} from '../snapshot-math'

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
 *
 * Query `?source=`: wanneer de aanroep bij een PRIJS-SYNC hoort (eerste-open-van-
 * de-dag 'daily-open' of de handmatige sync-knop 'manual'), leggen we naast de
 * DATE-gekeyde dag-snapshot óók een APPEND-ONLY tijdstempel-punt vast in
 * net_worth_history (intraday vermogenscurve). Zonder `source` (de kale
 * AutoSnapshotTrigger die bij élke page-load draait) NIET — anders spammen we
 * de historie op elke navigatie.
 */
const HISTORY_SOURCES: ReadonlySet<string> = new Set<NetWorthHistorySource>([
  'daily-open',
  'manual',
  'sync',
])

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const sourceParam = new URL(request.url).searchParams.get('source')
  const historySource: NetWorthHistorySource | null =
    sourceParam && HISTORY_SOURCES.has(sourceParam)
      ? (sourceParam as NetWorthHistorySource)
      : null

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // ── Server-side dag-gate (besluit: 1×/dag is akkoord) ──────────────────────
  // De kale AutoSnapshotTrigger (zónder `source`) vuurt bij ELKE page-load. Als
  // er voor (user, vandaag) al een snapshot is, antwoorden we direct met een
  // goedkope no-op — geen 8-query-batch, geen FIRE-projectie, geen upsert.
  //
  // Alleen voor de kale trigger: prijs-sync-aanroepen (`?source=daily-open|manual|
  // sync`) MOETEN wél herberekenen (verse waarden + history-punt) en zijn zelf al
  // gegate (daily-open-claim / gebruikersactie). Dit dekt óók de "dubbele PATCH op
  // net_worth_snapshots" op /toekomst: latere same-day mounts worden een no-op.
  //
  // Een simpele head+count SELECT op de eigen rij (RLS) — GEEN `update().or().
  // select()`, dus de bekende PostgREST-42703-val (representation-filter) speelt
  // hier niet.
  if (!historySource) {
    const { count: existingToday, error: gateError } = await supabase
      .from('net_worth_snapshots')
      .select('snapshot_date', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .eq('snapshot_date', today)

    if (!gateError && (existingToday ?? 0) > 0) {
      return NextResponse.json({
        updated: false,
        created: false,
        skipped: true,
        message: 'Snapshot voor vandaag bestaat al — geen herberekening.',
      })
    }
  }

  // Fetch all required data in parallel
  const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  const sixMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1))
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  const [
    assetsResult,
    debtsResult,
    expensesResult,
    incomeResult,
    profileResult,
    budgetsResult,
    monthTxResult,
    bankAccountsResult,
    goalsResult,
  ] = await Promise.all([
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
      .select('date_of_birth, expected_return, inflation_rate, household_type')
      .eq('id', user.id)
      .single(),
    // Alle budgetten (alle types, parents + children) — must-expenses + health.
    supabase
      .from('budgets')
      .select('id, parent_id, budget_type, default_limit, interval, is_essential')
      .eq('user_id', user.id),
    // Huidige-maand-transacties met budget_id voor budget-discipline.
    supabase
      .from('transactions')
      .select('amount, budget_id')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Niet-gekoppelde bankrekeningen voor unlinkedCash.
    supabase
      .from('bank_accounts')
      .select('balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('linked_asset_id', null),
    // Actieve doelen → noodfonds-target voor de score (goal-losgekoppeld-fix).
    supabase
      .from('goals')
      .select('goal_type, target_value, metadata')
      .eq('user_id', user.id)
      .eq('is_completed', false),
  ])

  if (assetsResult.error || debtsResult.error) {
    return serverError(assetsResult.error || debtsResult.error, 'snapshots-auto:GET')
  }

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const expenses = expensesResult.data ?? []
  const income = incomeResult.data ?? []

  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)

  // Canoniek opgeslagen net_worth: inclusion-gewogen assets + losse cash
  // − inclusion-gewogen debts (spiegelt dashboard-loader; gedeeld met POST/cron).
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

  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr
  const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / fireSwr : 0
  const freedomPercentage = computeSnapshotFreedomPct(netWorth, fireTarget)

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

  // Compute 6/7-pillar health score via het CANONIEKE gedeelde input-bouwpad
  // (lib/health-score-input.ts) — exact dezelfde functie als de live loader.
  // Echte noodfonds-maanden, budgetCategories en Box 3-taxData i.p.v. proxies,
  // zodat de opgeslagen resilience_score ≈ de live score (ADR 0008).
  // freedomPct = snapshot-eigen freedomPercentage (zie /api/snapshots/route.ts
  // voor de motivatie van deze bewuste afwijking).
  // Canonieke spaarquote-grondslag via de gedeelde helper (consume, don't
  // recompute) — voedt de health-score-input én de gepersisteerde savings_rate
  // (zie hieronder), zodat de spaarquote-widget-historie op DE spaarquote draait
  // en niet op het vlakke FIRE-tempo (fireProjection.savingsRate).
  const savingsRate6m = savingsRateFromAggregates(monthlyIncome, monthlyExpenses, debtAflossing6m)
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
        householdType: profileResult.data?.household_type ?? null,
        debtMonthlyPayments,
      },
    ),
  )

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
    // Canonieke spaarquote (savingsRate6m), NIET fireProjection.savingsRate:
    // deze kolom voedt de spaarquote-widget-ontwikkeling (savingsHistory).
    savings_rate: Math.round(savingsRate6m * 10) / 10,
    resilience_score: healthScore.total,
    // Methode-versie van de opgeslagen score (ADR 0010 / FR-7). DEFAULT 1 op de
    // kolom; v2-snapshots schrijven expliciet 2 voor de trend-methodemarkering.
    score_version: 2,
    // Provenance-parameterset ([Arch F6] #27) — zie POST /api/snapshots. De
    // basic-fallback-upsert hieronder laat 'm bewust weg (kolom nullable).
    params: buildSnapshotParams(fireParams),
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
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return NextResponse.json({ error: basicError.message }, { status: 500 })
    }
    snapshot = basicSnapshot
    warning = 'Extended columns not available (migration pending). Basic snapshot saved.'
  } else {
    snapshot = fullSnapshot
  }

  // Capture per-entity balance snapshots (fire-and-forget, non-critical).
  // Silent failures are logged to error_logs so empty sparklines don't go
  // unnoticed for months — main path stays non-blocking (no await).
  captureBalanceSnapshots(supabase, user.id, today, assets, debts)
    .then(res => {
      if (res.error) {
        void logError(supabase, {
          userId: user.id,
          context: 'balance-snapshot:auto',
          message: res.error,
        })
      }
    })
    .catch((err: unknown) => {
      void logError(supabase, {
        userId: user.id,
        context: 'balance-snapshot:auto',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    })

  // Bij een prijs-sync (daily-open / manual): leg een tijdstempel-punt vast in
  // net_worth_history (intraday vermogenscurve). Consumeert het reeds canoniek
  // berekende net_worth + totalen — geen herberekening. Fire-and-forget.
  if (historySource) {
    captureNetWorthHistory(supabase, user.id, {
      netWorth,
      totalAssets,
      totalDebts,
      source: historySource,
    }).catch(() => {})
  }

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
    created: true,
    snapshot: {
      ...snapshot,
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(savingsRate6m * 10) / 10,
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
