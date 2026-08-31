import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { computeFireProjection, ageAtDate, type FinancialInput } from '@/lib/horizon-data'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'
import { BUDGET_SPENDING_TX_COLUMNS, fetchSpendingSplits } from '@/lib/budget-spending-fetch'
import { resolveFireParams } from '@/lib/fire-params'
import { yearlyMustExpensesFromBudgets } from '@/lib/budget-utils'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { captureBalanceSnapshots } from '@/lib/balance-snapshot'
import { logError } from '@/lib/log-error'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { resolveSavingsSource, savingsRateFromAggregates } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses, resolveAmountWithBasis } from '@/lib/effective-financials'
import { resolveBudgetBasisFromProfile } from '@/lib/cashflow-settings'
import { budgetShareFractionById, selectBudgetsForBasisForUser } from '@/lib/household/budget-share'
import { fetchRealizedBudgetAmounts } from '@/lib/budget-realized'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { recordJobRun } from '@/lib/job-runs'
import { mapWithConcurrency } from '@/lib/concurrency'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  loadHouseholdSharesByUser,
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

  // Huishouden + aandeel per gebruiker, vooraf (niet per gebruiker in de pool).
  // Nodig omdat de service-role-client RLS passeert: de huishoud-verbrede scope
  // van `bank_accounts` moet hier met de hand mee, én er is geen sessie waaruit
  // `resolveUnlinkedCashShare` het aandeel kan afleiden. Faalt de leesronde, dan
  // is de map leeg en valt iedereen terug op alleen-eigen-rijen — hooguit een
  // gedeeld saldo te weinig, nooit dat van een vreemde.
  const householdShareByUser = await loadHouseholdSharesByUser(
    supabase,
    (profiles ?? []).map(p => p.id),
  )

  // Grondslag-selectie per gebruiker (ADR 0103), vooraf en gebatcht — zelfde
  // patroon als het huishoud-aandeel hierboven, dus géén extra query per
  // gebruiker in de pool. BEWUST een aparte, tolerante query en geen extra kolom
  // op de profielselect: `cashflow_basis_prefs` bestaat pas na migratie
  // 20260811160000, en één onbekende kolom zou daar de HELE profielquery laten
  // falen — en dus de complete cron. Faalt deze query, dan is de map leeg en
  // telt voor iedereen elk budget mee (de kosteloze default).
  const basisPrefsByUser = new Map<string, Record<string, unknown>>()
  {
    const { data: prefsRows } = await supabase
      .from('profiles')
      .select('id, cashflow_basis_prefs')
      .in('id', (profiles ?? []).map(p => p.id))
      .then((r) => r, (error) => {
        console.error('[snapshots-cron] grondslag-selectie laden mislukt:', error)
        return { data: null }
      })
    for (const row of (prefsRows ?? []) as Array<{ id: string; cashflow_basis_prefs?: unknown }>) {
      basisPrefsByUser.set(row.id, { cashflow_basis_prefs: row.cashflow_basis_prefs })
    }
  }

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
        basisBudgetsResult,
        monthTxResult,
        bankAccountsResult,
        realizedWindow,
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
        // Budgetrijen voor de GRONDSLAG (ADR 0103). De query hierboven blijft
        // BEWUST own-row (verbreden zou `yearlyMustExpenses` en de
        // health-score-budgetten meeverschuiven); deze draagt de huishoud-scope
        // met de hand mee omdat een service-role-client de policy passeert —
        // zelfde patroon als `selectUnlinkedBankAccountsForUser` hierboven.
        selectBudgetsForBasisForUser(
          supabase,
          userId,
          householdShareByUser.get(userId)?.householdId ?? null,
        ),
        // Huidige-maand-transacties met budget_id voor budget-discipline. De
        // kolomlijst is die van het canonieke bestedingscontract
        // (BUDGET_SPENDING_TX_COLUMNS): zonder
        // transaction_type/is_income/is_split kan `buildBudgetCategories` haar
        // transfer- en split-regels niet toepassen.
        supabase
          .from('transactions')
          .select(BUDGET_SPENDING_TX_COLUMNS)
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
          householdShareByUser.get(userId)?.householdId ?? null,
        ),
        // GEREALISEERDE budgetbedragen (ADR 0103) — dezelfde grondslag als de
        // twee sessie-paden. Zie de toelichting bij `cronBudgetBasis` hieronder
        // voor waarom dit de ONGECACHETE variant mét expliciete scope is.
        fetchRealizedBudgetAmounts(supabase, {
          userId,
          householdId: householdShareByUser.get(userId)?.householdId ?? null,
        }),
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

      // Gewogen op het huishoud-aandeel uit de vooraf geladen map: een gedeelde
      // rekening telt in de snapshot van elke partner voor zijn eigen deel, zodat
      // de reeks niet permanent 200% van het saldo vastlegt. Zonder huishouden
      // (of bij een gefaalde map) is het aandeel 100 resp. fail-closed 50.
      const unlinkedCash = unlinkedCashTotal(bankAccountsResult.data, {
        perspective: 'personal',
        mySharePct: householdShareByUser.get(userId)?.mySharePct ?? 100,
      })

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

      // Canonieke grondslag (parent/child-oprol + orphan-tak) i.p.v. de
      // parents-only-som die hier stond. De budgets-query hierboven haalde de
      // children al op — deze migratie kost dus GEEN extra query, ook niet op
      // dit cron-pad dat voor alle gebruikers draait.
      const allBudgets = budgetsResult.data ?? []
      const yearlyMustExpenses = yearlyMustExpensesFromBudgets(allBudgets)

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
      // Budgetgrondslag (ADR 0103) — de snapshot legt HISTORIE vast en moet dus
      // op dezelfde grondslag staan als het dashboard. BEWUST NIET via
      // `loadBudgetBasis`: die resolvet het huishoud-aandeel uit de SESSIE
      // (`auth.getUser()`), en deze cron draait service-role — daar zou hij op de
      // fail-closed 50 % uitkomen. Het aandeel komt hier uit de vooraf gebatchte
      // `householdShareByUser`, dezelfde bron die de losse-cash-weging gebruikt.
      const cronBudgetShare = {
        perspective: 'personal' as const,
        mySharePct: householdShareByUser.get(userId)?.mySharePct ?? 100,
      }
      const cronBudgetRows = (basisBudgetsResult.data ?? []) as unknown as BudgetBasisRow[]
      // GRONDSLAG-PARITEIT MET DE SESSIE-PADEN (gat gesloten, migratie
      // 20260811180000). Er zijn DRIE schrijvers naar dezelfde datum-gekeyde rij
      // in `net_worth_snapshots`: POST /api/snapshots, GET /api/snapshots/auto
      // (beide sessie) en deze cron. Tot deze migratie schreven de eerste twee de
      // REALISATIE en deze cron de PLANNING, omdat `tx_month_aggregate` SECURITY
      // INVOKER is en op de RLS van `transactions` leunt — een RLS die onder
      // service-role (`auth.uid()` is NULL) volledig vervalt. De reeks droeg
      // daardoor twee grondslagen door elkaar, en `savings_rate`,
      // `freedom_percentage` en `fire_age` konden verspringen zonder financiële
      // gebeurtenis. Een tijdreeks corrigeert zoiets nooit zelf.
      //
      // De RPC draagt nu `p_user_id`/`p_household_id`: een puur RESTRICTIEF extra
      // AND-filter dat de SELECT-policy `View own or shared transactions` naspeelt.
      // Voor een authenticated aanroeper geldt RLS er onverkort bovenop (een vreemd
      // id levert daar 0 rijen); hier, op service-role, is het de enige afbakening.
      //
      // DRIE DINGEN OM NIET STIL TE VERANDEREN:
      //   1. Dit is `fetchRealizedBudgetAmounts` (ongecachet), NOOIT
      //      `getRealizedBudgetAmounts`. Die tweede is `cache()`-gewrapt op de
      //      supabase-client, en deze cron deelt ÉÉN service-client over alle
      //      gebruikers — gebruiker 2 zou de realisatie van gebruiker 1 krijgen.
      //   2. De scope draagt óók de `householdId`, niet alleen de `userId`. Het
      //      sessie-pad haalt het aggregaat RLS-breed op (dus inclusief de
      //      gedeelde boekingen van de partner); alleen op `user_id` afbakenen zou
      //      een gedeeld budget waarop de partner het meeste boekt hier structureel
      //      te laag laten meetellen. Zelfde bron als de budget- en cash-scope
      //      hierboven: `householdShareByUser`.
      //   3. Drie RPC-chunks per gebruiker — identiek aan het sessie-pad, en niet
      //      te bundelen. De chunking bestaat omdat de per-budget-dimensie voor
      //      ÉÉN gebruiker al tegen de 1000-rijen-cap loopt; over gebruikers heen
      //      batchen zou die cap juist gegarandeerd overschrijden en stil te lage
      //      sommen opleveren. Binnen de pool van 5 zijn dat ≤15 gelijktijdige
      //      RPC's, naast de ~7 reads per gebruiker die er al waren.
      //
      // Faalt de ophaal (of één chunk), dan levert hij het lege venster en valt
      // elke post zichtbaar terug op zijn geplande limiet — het gedrag van vóór
      // deze wijziging, nooit een halve waarheid onder de naam "gemeten".
      const cronBudgetBasis = resolveBudgetBasisFromProfile(
        basisPrefsByUser.get(userId) ?? null,
        cronBudgetRows,
        {
          shareFractionById: budgetShareFractionById(cronBudgetRows, cronBudgetShare),
          realized: realizedWindow,
        },
      )
      const cronAnnualIncome = resolveAmountWithBasis(
        profile.income_source,
        Number(profile.net_monthly_income ?? 0) * 12,
        monthlyIncome * 12,
        cronBudgetBasis.income.annualTotal,
      )
      const cronExpenses = resolveAmountWithBasis(
        profile.expenses_source,
        Number(profile.estimated_monthly_expenses ?? 0),
        monthlyExpenses,
        cronBudgetBasis.expenses.monthlyTotal,
      )
      const { income: effectiveMonthlyIncome } = resolveEffectiveIncomeExpenses(
        profile,
        monthlyIncome,
        monthlyExpenses,
        { income: cronBudgetBasis.income.monthlyTotal, expenses: cronBudgetBasis.expenses.monthlyTotal },
      )
      const { effectiveSavingsRatePct: savingsRate6m } = resolveSavingsSource({
        incomeSource: profile.income_source,
        expensesSource: profile.expenses_source,
        netMonthlyIncome: Number(profile.net_monthly_income ?? 0),
        estimatedAnnualIncome: monthlyIncome * 12,
        estimatedMonthlyExpenses: Number(profile.estimated_monthly_expenses ?? 0),
        savingsRate6m: savingsRateFromTx,
        basis: {
          income: cronAnnualIncome.basis,
          expenses: cronExpenses.basis,
          annualIncome: cronAnnualIncome.amount,
          monthlyExpenses: cronExpenses.amount,
        },
      })
      // DSTI-teller: Σ maandlasten over de actieve schulden (select bevat monthly_payment).
      const debtMonthlyPayments = debts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0)
      // Split-regels bij de gesplitste maandtransacties. De ouderrijen zijn hier
      // al expliciet op `user_id` gescoopt (service-role: RLS scoopt niets), dus
      // `fetchSpendingSplits` erft die scoping een-op-een; zonder splits draait
      // er geen query.
      const monthTxRows = (monthTxResult.data ?? []) as unknown as HealthScoreTransaction[]
      const monthSplits = await fetchSpendingSplits(supabase, monthTxRows)
      // GRONDSLAG-BREUK, BEWUST ZONDER BACKFILL (eigenaar-besluit 30 aug 2026):
      // de budget-discipline-pijler van `resilience_score` draait vanaf nu op de
      // canonieke bestedingssom (inkomsten gaan eraf, transfers tellen niet mee).
      // Bestaande snapshot-rijen blijven staan: historie voor 30 aug 2026 op de
      // oude grondslag (ongefilterde som van |amount|), bewust geaccepteerd.
      const healthScore = computeHealthScoreFromInputs(
        buildHealthScoreInput(
          {
            savingsRate6m,
            totalAssets: weightedAssets + unlinkedCash,
            totalDebts,
            freedomPct: freedomPercentage,
            // Peer-relatieve fire_progress: leeftijd uit profiel; koers uit
            // dezelfde scalar-FIRE-projectie die fire_age op de rij voedt.
            currentAge: profile.date_of_birth ? ageAtDate(profile.date_of_birth) : null,
            fireAgeFractional: fireProjection.fireAge,
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
            transactions: monthTxRows,
            splits: monthSplits,
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
