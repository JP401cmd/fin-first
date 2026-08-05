import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
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
import { annualAmount } from '@/lib/budget-utils'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { logError } from '@/lib/log-error'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { resolveSavingsSource, savingsRateFromAggregates } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { recordJobRun } from '@/lib/job-runs'
import { mapWithConcurrency } from '@/lib/concurrency'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  loadHouseholdIdsByUser,
  selectUnlinkedBankAccountsForUser,
  unlinkedCashTotal,
} from '@/lib/unlinked-cash'
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
// Deze cron verwerkt ALLE onboarded gebruikers per maand-run. Sinds de
// parallelisatie (gebonden pool, zie GET) is de wall-clock kort, maar bij groei
// van de userbase moet de functie langer mogen draaien dan de korte Vercel-
// default. Spiegelt de zuster-cron holdings/refresh-prices (maxDuration = 60).
export const maxDuration = 60

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
    // Bewust NIET `unauthorized()`: die zegt 'Niet ingelogd', maar hier gaat het om
    // een verkeerd CRON_SECRET van een machine die nooit inlogt. Wel de gedeelde
    // envelope (ADR 0044); 401 blijft de status, spiegelt /api/cron/retention.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
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
    // Zie snapshots/route.ts: de bron-vlaggen + handmatige bedragen voeden de
    // EFFECTIEVE spaarquote en de noodbuffer-norm (3 × netto maandsalaris).
    .select('id, date_of_birth, expected_return, inflation_rate, household_type, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source')
    .eq('onboarding_completed', true)

  if (profilesError) {
    await recordJobRun(supabase, { job: 'snapshots', status: 'error', startedAt, error: profilesError.message })
    // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  // Huishouden per gebruiker, in ÉÉN leesronde vooraf (niet per gebruiker in de
  // pool). Nodig omdat de service-role-client RLS passeert: de huishoud-verbrede
  // scope van `bank_accounts` moet hier met de hand mee. Faalt de leesronde, dan
  // is de map leeg en valt iedereen terug op alleen-eigen-rijen — hooguit een
  // gedeeld saldo te weinig, nooit dat van een vreemde.
  const householdIdByUser = await loadHouseholdIdsByUser(
    supabase,
    (profiles ?? []).map(p => p.id),
  )

  type SnapshotEntry = { userId: string; created: boolean; error?: string }

  // Verwerk één gebruiker. Vangt ALTIJD zijn eigen fouten en throwt NOOIT: onder
  // parallelisatie zou een throw de `Promise.all`-pool in mapWithConcurrency laten
  // rejecten en de overige gebruikers overslaan. Retourneert de resultaat-entry én
  // de (optionele) balance-snapshot-promise, die we ná de pool awaiten — zie GET.
  async function processUser(
    profile: NonNullable<typeof profiles>[number],
  ): Promise<{ entry: SnapshotEntry; balancePromise: Promise<void> | null }> {
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
        return { entry: { userId, created: false }, balancePromise: null }
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
        // Niet-gekoppelde bankrekeningen voor unlinkedCash. Deze cron draait op
        // een SERVICE-ROLE-client: `auth.uid()` is NULL, dus de huishoud-verbrede
        // SELECT-policy scoopt hier NIETS en een RLS-leunende query zou de
        // rekeningen van álle gebruikers optellen. De scope moet daarom expliciet
        // mee — eigen rijen OF gedeeld binnen hetzelfde huishouden, exact zoals de
        // policy 'm voor een sessie-client zou toepassen (lib/unlinked-cash.ts).
        selectUnlinkedBankAccountsForUser(
          supabase,
          userId,
          householdIdByUser.get(userId) ?? null,
        ),
      ])

      if (assetsResult.error || debtsResult.error) {
        return {
          entry: { userId, created: false, error: (assetsResult.error || debtsResult.error)?.message },
          balancePromise: null,
        }
      }

      const assets = assetsResult.data ?? []
      const debts = debtsResult.data ?? []
      const expenses = expensesResult.data ?? []
      const income = incomeResult.data ?? []

      const unlinkedCash = unlinkedCashTotal(bankAccountsResult.data)

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
        .reduce((s, b) => s + annualAmount(Number(b.default_limit) || 0, b.interval), 0)

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
      // Canonieke spaarquote-grondslag via de gedeelde helper (consume, don't
      // recompute) — voedt de health-score-input én de gepersisteerde
      // savings_rate (zie hieronder), zodat de spaarquote-widget-historie op DE
      // spaarquote draait en niet op het vlakke FIRE-tempo
      // (fireProjection.savingsRate).
      const savingsRateFromTx = savingsRateFromAggregates(monthlyIncome, monthlyExpenses, debtAflossing6m)
      // EFFECTIEVE inkomsten en spaarquote — handmatige invoer wint, exact zoals
      // de live loader en het instellingenblok onderaan /overzicht/cashflow.
      const { income: effectiveMonthlyIncome } = resolveEffectiveIncomeExpenses(
        profile,
        monthlyIncome,
        monthlyExpenses,
      )
      const { effectiveSavingsRatePct: savingsRate6m } = resolveSavingsSource({
        incomeSource: profile.income_source,
        expensesSource: profile.expenses_source,
        netMonthlyIncome: Number(profile.net_monthly_income ?? 0),
        estimatedAnnualIncome: monthlyIncome * 12,
        estimatedMonthlyExpenses: Number(profile.estimated_monthly_expenses ?? 0),
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
        // Canonieke spaarquote (savingsRate6m), NIET fireProjection.savingsRate:
        // deze kolom voedt de spaarquote-widget-ontwikkeling (savingsHistory).
        savings_rate: Math.round(savingsRate6m * 10) / 10,
        resilience_score: healthScore.total,
        // Methode-versie van de opgeslagen score (ADR 0010 / FR-7). DEFAULT 1 op
        // de kolom; v2-snapshots schrijven expliciet 2. De basic-fallback-upsert
        // hieronder laat 'm bewust weg (mag terugvallen op de kolom-default).
        score_version: 2,
        // Provenance-parameterset ([Arch F6] #27) — zie POST /api/snapshots. De
        // basic-fallback-upsert hieronder laat 'm bewust weg (kolom nullable).
        params: buildSnapshotParams(fireParams),
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
          return { entry: { userId, created: false, error: basicError.message }, balancePromise: null }
        }
      }

      // Capture per-entity balance snapshots. Silent failures are logged to
      // error_logs (service-role client bypasses RLS) so empty sparklines don't
      // go unnoticed. In de seriële loop was dit fire-and-forget; onder
      // parallelisatie keert de functie te snel terug en zouden losse
      // background-upserts gekilld kunnen worden (lege sparklines). We geven de
      // promise dáárom terug zodat GET 'm ná de pool awaited — inhoud identiek,
      // alleen betrouwbaar geflusht.
      const balancePromise = captureBalanceSnapshots(supabase, userId, today, assets, debts)
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

      return { entry: { userId, created: true }, balancePromise }
    } catch (err) {
      return { entry: { userId, created: false, error: String(err) }, balancePromise: null }
    }
  }

  // Parallelliseer per gebruiker met een GEBONDEN pool (CAP = 5): hoogstens 5
  // gebruikers tegelijk in-flight. Met ~7 reads + 1-2 upserts per gebruiker zijn
  // dat ~35 gelijktijdige reads + ≤10 upserts per venster — ruim binnen
  // PgBouncer transaction-pooling. Hoger dan 5 levert bij deze querymix weinig
  // extra doorstroom maar wel meer piekbelasting. Resultaten komen index-geordend
  // terug (mapWithConcurrency), dus de summary blijft volgorde-onafhankelijk en
  // bit-identiek aan de seriële uitvoering.
  const SNAPSHOT_CONCURRENCY = 5
  const outcomes = await mapWithConcurrency(profiles ?? [], SNAPSHOT_CONCURRENCY, processUser)
  const results = outcomes.map(o => o.entry)

  // Wacht de verzamelde balance-snapshot-upserts af vóór de response (zie
  // processUser): voorkomt dat de snel terugkerende serverless-functie ze killt.
  await Promise.allSettled(
    outcomes.map(o => o.balancePromise).filter((p): p is Promise<void> => p !== null),
  )

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
