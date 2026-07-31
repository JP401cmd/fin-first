import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
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
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { logError } from '@/lib/log-error'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { resolveSavingsSource, savingsRateFromAggregates } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { selectUnlinkedBankAccounts, unlinkedCashTotal } from '@/lib/unlinked-cash'
import {
  weightedAssetTotal,
  weightedDebtTotal,
  computeSnapshotNetWorth,
  computeSnapshotFreedomPct,
  buildSnapshotParams,
  type SnapshotAsset,
  type SnapshotDebt,
} from './snapshot-math'

/**
 * GET /api/snapshots
 * Returns all net worth snapshots for the authenticated user,
 * enriched with computed freedom_percentage based on real asset/debt data.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  // Fetch snapshots
  const { data: snapshots, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', claims.sub)
    .order('snapshot_date', { ascending: true })

  if (error) {
    return serverError(error, 'snapshots:GET')
  }

  // Fetch essential budgets + profile to compute freedom_percentage for each
  // snapshot. SWR komt uit resolveFireParams (gepersonaliseerd) — identiek aan
  // het POST-schrijfpad, zodat GET-enrichment en POST hetzelfde fire_target geven.
  const [budgetsRes, profileRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('default_limit, interval')
      .eq('user_id', claims.sub)
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
    supabase
      .from('profiles')
      .select('expected_return, inflation_rate')
      .eq('id', claims.sub)
      .single(),
  ])

  const yearlyMustExpenses = (budgetsRes.data ?? []).reduce((s, b) => {
    const limit = Number(b.default_limit) || 0
    return s + (b.interval === 'yearly' ? limit : limit * 12)
  }, 0)
  const fireSwr = resolveFireParams(profileRes.data ?? {}).effectiveSwr
  const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / fireSwr : 0

  // Enrich snapshots with computed freedom_percentage.
  // NB: bewuste afwijking van de canonieke vrijheidsvoortgang
  // (computeFreedomProgress in lib/core-metrics.ts). Hier: VOLLEDIG netWorth ÷
  // (essentiële jaarlasten / NL_SWR), huis meegerekend, géén unified-projection
  // en géén housing-strategie-filter. De live-loaders (dashboard/horizon)
  // gebruiken sinds de "100% naast nog X jaar"-fix WEL de FIRE-eligible
  // grondslag. Snapshot-historie houdt bewust een eigen, per-rij intern
  // consistente definitie (de freedom_percentage hier ↔ de opgeslagen kolom).
  const enriched = (snapshots ?? []).map(s => {
    const netWorth = Number(s.net_worth)
    const totalAssets = Number(s.total_assets)
    const totalDebts = Number(s.total_debts)
    const computedNetWorth = totalAssets - totalDebts
    const freedom_percentage = computeSnapshotFreedomPct(netWorth, fireTarget)

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
    return unauthorized()
  }

  // Fetch real asset, debt, transaction, and profile data in parallel
  const now = new Date()
  const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  const sixMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1))
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // Brondata identiek aan /api/snapshots/auto (zelfde queries/kolommen), zodat
  // de handmatige POST exact dezelfde, canonieke health-score- en net_worth-
  // berekening draait als de auto/cron-schrijfpaden.
  const [
    assetsResult,
    debtsResult,
    expensesResult,
    incomeResult,
    profileResult,
    budgetsResult,
    monthTxResult,
    bankAccountsResult,
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
      // net_monthly_income/estimated_monthly_expenses + de bron-vlaggen: nodig
      // voor de EFFECTIEVE spaarquote (handmatig wint) en de noodbuffer-norm
      // (3 × netto maandsalaris) — dezelfde grondslag als de live loader.
      .select('date_of_birth, expected_return, inflation_rate, household_type, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source')
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
    // Niet-gekoppelde bankrekeningen voor unlinkedCash. Bewust zónder
    // user-filter: de policy is huishoud-verbreed, RLS scoopt hier al — een
    // eigen `.eq('user_id', …)` zou gedeelde huishoudrekeningen wegsnijden en
    // dit net_worth laten driften met het dashboard (lib/unlinked-cash.ts).
    selectUnlinkedBankAccounts(supabase),
  ])

  if (assetsResult.error) {
    return serverError(assetsResult.error, 'snapshots:POST')
  }
  if (debtsResult.error) {
    return serverError(debtsResult.error, 'snapshots:POST')
  }

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const expenses = expensesResult.data ?? []
  const income = incomeResult.data ?? []

  // Canoniek opgeslagen net_worth: inclusion-gewogen assets + losse cash
  // − inclusion-gewogen debts (spiegelt dashboard-loader; gedeeld met auto/cron).
  const unlinkedCash = unlinkedCashTotal(bankAccountsResult.data)
  const weightedAssets = weightedAssetTotal(assets as SnapshotAsset[])
  const totalDebts = weightedDebtTotal(debts as SnapshotDebt[])
  const totalAssets = weightedAssets + unlinkedCash
  const netWorth = computeSnapshotNetWorth(weightedAssets, unlinkedCash, totalDebts)

  const yearlyExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount), 0))
  const monthlyExpenses = yearlyExpenses / 12
  const monthlyIncome = income.reduce((s, t) => s + Number(t.amount), 0) / 6
  const monthlyContributions = assets.reduce((s, a) => s + Number(a.monthly_contribution || 0), 0)

  // Essential budgets for yearly "must" expenses (parents-only, expense, essentieel).
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
  // Bewuste afwijking van de canonieke vrijheidsvoortgang (computeFreedomProgress
  // in lib/core-metrics.ts): freedomPercentage is hier VOLLEDIG netWorth ÷
  // fireTarget (essentiële lasten / SWR), huis meegerekend en ZONDER
  // unified-projection / housing-strategie-filter. De live-voortgangsbalk
  // (dashboard/horizon) gebruikt sinds de "100% naast nog X jaar"-fix WEL de
  // FIRE-eligible grondslag ÷ benodigde portfolio uit runUnifiedProjection.
  // Unificeren zou hier de volledige housing-/fire-strategy-machinerie per
  // snapshot vereisen (grote ombouw) en de per-rij kolom-consistentie breken
  // (deze waarde landt 1-op-1 in de freedom_percentage-kolom van diezelfde rij).
  // Daarom: snapshot-historie = eigen, gedocumenteerde definitie. Bewust twee
  // grondslagen — identiek aan auto/cron (ADR 0009-uitzondering).
  const freedomPercentage = computeSnapshotFreedomPct(netWorth, fireTarget)

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
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPercentage, hasConsumerDebt)

  // Schuldaflossing voor de spaarquote-correctie (zelfde logica als auto).
  let debtAflossing6m = 0
  for (const d of debts as Debt[]) {
    if (!d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    debtAflossing6m += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }

  // Compute 6/7-pillar health score via het CANONIEKE gedeelde input-bouwpad
  // (lib/health-score-input.ts) — exact dezelfde functie als de live loader en
  // de auto/cron-routes. Echte noodfonds-maanden, budgetCategories en Box 3-
  // taxData i.p.v. proxies (was: assets×0.3, lege budgetCategories, geen taxData),
  // zodat de opgeslagen resilience_score ≈ de live score (SSoT, ADR 0008).
  // Canonieke spaarquote-grondslag via de gedeelde helper (consume, don't
  // recompute) — dezelfde formule die de dashboard-loader voedt. Voedt zowel de
  // health-score-input als de gepersisteerde savings_rate-kolom (zie hieronder),
  // zodat de spaarquote-widget-historie op DE spaarquote draait en niet op het
  // vlakke FIRE-tempo (fireProjection.savingsRate).
  const savingsRateFromTx = savingsRateFromAggregates(monthlyIncome, monthlyExpenses, debtAflossing6m)
  // EFFECTIEVE inkomsten/uitgaven en spaarquote: handmatige invoer wint over de
  // transactiemeting, exact zoals de live loader en het instellingenblok
  // onderaan /overzicht/cashflow. Zonder dit dreef de opgeslagen historie weg
  // van het getal dat de gebruiker ziet.
  const { income: effectiveMonthlyIncome } = resolveEffectiveIncomeExpenses(
    profileResult.data ?? {},
    monthlyIncome,
    monthlyExpenses,
  )
  const { effectiveSavingsRatePct: savingsRate6m } = resolveSavingsSource({
    incomeSource: profileResult.data?.income_source,
    expensesSource: profileResult.data?.expenses_source,
    netMonthlyIncome: Number(profileResult.data?.net_monthly_income ?? 0),
    estimatedAnnualIncome: monthlyIncome * 12,
    estimatedMonthlyExpenses: Number(profileResult.data?.estimated_monthly_expenses ?? 0),
    savingsRate6m: savingsRateFromTx,
  })
  // DSTI-teller: Σ maandlasten over de actieve schulden (select bevat monthly_payment).
  const debtMonthlyPayments = debts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0)
  const healthScore = computeHealthScoreFromInputs(
    buildHealthScoreInput(
      {
        savingsRate6m,
        totalAssets: weightedAssets + unlinkedCash,
        totalDebts,
        freedomPct: freedomPercentage,
        avgMonthlyExpenses: monthlyExpenses,
        // Zelfde inkomensbron als de transactiequote (income/6) — DSTI-noemer.
        netMonthlyIncome: monthlyIncome,
        // Noodbuffer-norm: 3 × netto maandsalaris (lib/emergency-fund.ts).
        netMonthlySalary: effectiveMonthlyIncome,
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
    // Canonieke spaarquote (savingsRate6m), NIET fireProjection.savingsRate:
    // deze kolom voedt de spaarquote-widget-ontwikkeling (savingsHistory).
    savings_rate: Math.round(savingsRate6m * 10) / 10,
    // Note: resilience_score column is retained for historical data continuity.
    // It now stores the v2 4-pijler/7-indicator gezondheidsscore (ADR 0010).
    resilience_score: healthScore.total,
    // Methode-versie van de opgeslagen score (ADR 0010 / FR-7). DEFAULT 1 op de
    // kolom; v2-snapshots schrijven expliciet 2 zodat de trendlijn de
    // methodewissel kan markeren bij een mix v1/v2.
    score_version: 2,
    // Provenance-parameterset ([Arch F6] #27): de aannames (SWR/rendement/
    // inflatie/Box 3-drag/belastingjaar/grondslag) die deze afgeleiden
    // produceerden. Engine-onafhankelijk — de basic-fallback-upsert hieronder
    // laat 'm bewust weg (kolom nullable) als de kolom nog niet bestaat.
    params: buildSnapshotParams(fireParams),
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
      return serverError(basicError, 'snapshots:POST')
    }
    snapshot = basicSnapshot
    upsertError = 'Extended columns not available (migration pending). Basic snapshot saved.'
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
          context: 'balance-snapshot:POST',
          message: res.error,
        })
      }
    })
    .catch((err: unknown) => {
      void logError(supabase, {
        userId: user.id,
        context: 'balance-snapshot:POST',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    })

  return NextResponse.json({
    snapshot: {
      ...snapshot,
      // Always include computed values in response even if not saved to DB
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_age: fireProjection.fireAge !== null ? Math.round(fireProjection.fireAge * 10) / 10 : null,
      sovereignty_level: sovereigntyLevel,
      savings_rate: Math.round(savingsRate6m * 10) / 10,
      resilience_score: healthScore.total,
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
      savings_rate: Math.round(savingsRate6m * 10) / 10,
      resilience_score: healthScore.total,
      health_pillars: healthScore.pillars.map(p => ({ id: p.id, name: p.name, score: p.score, weight: p.weight })),
    },
    ...(upsertError ? { warning: upsertError } : {}),
  })
}
