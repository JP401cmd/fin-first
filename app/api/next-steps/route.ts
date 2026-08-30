import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'
import { localMonthBounds } from '@/lib/month-range'
import { resolveFireParams } from '@/lib/fire-params'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'
import { BUDGET_OR_SPLIT_FILTER, BUDGET_SPENDING_TX_COLUMNS } from '@/lib/budget-spending-fetch'

/**
 * GET /api/next-steps — Get user's next recommended steps.
 *
 * Returns a prioritized list of actions the user should take next,
 * based on their ACTUAL financial data state (not static defaults).
 *
 * Smart prioritization algorithm (Feature #255):
 * Priority 1: No transactions imported yet (import first)
 * Priority 2: No assets added (add wealth)
 * Priority 3: Budget categories over limit (needs attention)
 * Priority 4: No goals set (set goals)
 * Priority 5: FIRE target unreachable (try scenarios)
 * Priority 6+: Other steps (budgets, debts, profile, snapshots)
 *
 * Maximum 1-2 suggestions shown per page.
 *
 * Steps that are already completed (based on real data) or dismissed
 * are removed from the suggestion list, making recommendations dynamic.
 */
export async function GET() {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  try {
    // Query actual user data state in parallel
    const now = new Date()
    const { start: monthStart, end: monthEnd } = localMonthBounds(now)

    const [
      transactionsResult,
      budgetsResult,
      assetsResult,
      debtsResult,
      snapshotsResult,
      profileResult,
      goalsResult,
      dismissedResult,
      // Additional queries for smart prioritization
      budgetSpendingResult,
      monthlyTxResult,
      // PSD2 bank connection check (#813)
      bankConnectionsResult,
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('id')
        .eq('user_id', claims.sub)
        .limit(1),
      // Álle budgetten, niet alleen de parents: de canonieke besteed-som heeft
      // de hele boom nodig voor de richting (child erft parent-type) én voor de
      // parent-rollup. De parents worden hieronder in JS gefilterd.
      supabase
        .from('budgets')
        .select('id, name, default_limit, parent_id, budget_type')
        .eq('user_id', claims.sub),
      supabase
        .from('assets')
        .select('id, current_value, net_worth_inclusion_pct')
        .eq('user_id', claims.sub)
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('id, current_balance, net_worth_inclusion_pct')
        .eq('user_id', claims.sub)
        .eq('is_active', true),
      supabase
        .from('net_worth_snapshots')
        .select('id')
        .eq('user_id', claims.sub)
        .limit(1),
      supabase
        .from('profiles')
        .select('full_name, date_of_birth, household_type, expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income')
        .eq('id', claims.sub)
        .maybeSingle(),
      supabase
        .from('goals')
        .select('id')
        .eq('user_id', claims.sub)
        .limit(1),
      // Try to fetch dismissed steps (table may not exist yet)
      supabase
        .from('next_step_completions')
        .select('step_key, dismissed')
        .eq('user_id', claims.sub),
      // Budget spending this month (for alert detection)
      // `id`/`transaction_type`/`is_split` horen bij de rijselectie van de
      // canonieke besteed-som; `.lt('amount', 0)` is weg omdat de norm een
      // inkomst AFTREKT i.p.v. 'm uit te sluiten (en een teruggave dus een
      // budget van zijn limiet af duwt, niet erlangs).
      supabase
        .from('transactions')
        .select(BUDGET_SPENDING_TX_COLUMNS)
        // Rijen mét budget_id óf split-ouders — zie BUDGET_OR_SPLIT_FILTER voor
        // waarom een kale `.not('budget_id','is',null)` de split-ouders zou
        // wegsnijden en filter-loos lezen op max_rows kan afkappen.
        .or(BUDGET_OR_SPLIT_FILTER)
        .eq('user_id', claims.sub)
        .gte('date', monthStart)
        .lt('date', monthEnd),
      // Monthly income/expenses for FIRE check
      supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', claims.sub)
        .gte('date', monthStart)
        .lt('date', monthEnd),
      // PSD2 bank connection check (#813) — active bank connections via TrueLayer/PSD2
      supabase
        .from('bank_connections')
        .select('id')
        .eq('user_id', claims.sub)
        .eq('status', 'active')
        .limit(1),
    ])

    // Determine what the user has done based on real data
    const hasTransactions = (transactionsResult.data?.length ?? 0) > 0
    const hasBudgets = (budgetsResult.data?.length ?? 0) > 0
    const hasAssets = (assetsResult.data?.length ?? 0) > 0
    const hasDebts = (debtsResult.data?.length ?? 0) > 0
    const hasSnapshots = (snapshotsResult.data?.length ?? 0) > 0
    const hasGoals = (goalsResult.data?.length ?? 0) > 0
    const hasBankConnection = (bankConnectionsResult.data?.length ?? 0) > 0
    const profileComplete = !!(
      profileResult.data?.full_name &&
      profileResult.data?.date_of_birth &&
      profileResult.data?.household_type
    )

    // Calculate budget alerts (budgets over their limit this month)
    let alertBudgetCount = 0
    if (budgetsResult.data && budgetSpendingResult.data) {
      const allBudgets = budgetsResult.data
      const txRows = budgetSpendingResult.data

      // Split-regels: zonder deze levert een gesplitste transactie niets aan de
      // budgetten waarover ze verdeeld is.
      const splitTxIds = txRows.filter(t => t.is_split).map(t => t.id)
      let splitRows: Array<{ budget_id: string | null; amount: number }> = []
      if (splitTxIds.length > 0) {
        const { data: splitData } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount')
          .in('transaction_id', splitTxIds)
        splitRows = (splitData ?? []) as Array<{ budget_id: string | null; amount: number }>
      }

      // Canonieke besteed-som (lib/budget-spending.ts) i.p.v. een eigen
      // `Math.abs`-som: die telde transfers als besteding mee en negeerde de
      // richting, waardoor deze route een budget "over de limiet" kon noemen
      // dat op /core/budgets ruim binnen zijn limiet staat.
      const budgetTypes = buildBudgetTypeMap(
        allBudgets.map(b => ({
          id: b.id,
          parent_id: b.parent_id ?? null,
          // DB-default; NULL mag nooit inkomsten-semantiek geven.
          budget_type: b.budget_type ?? 'expense',
        })),
      )
      const spendingByBudget = buildBudgetSpendingMap(txRows, splitRows, budgetTypes)

      const childIdsByParent: Record<string, string[]> = {}
      for (const b of allBudgets) {
        if (b.parent_id) (childIdsByParent[b.parent_id] ??= []).push(b.id)
      }

      // Alleen de parents tellen als "categorie over limiet" — zoals vóór deze
      // wijziging, toen de query zelf al op `parent_id is null` filterde.
      for (const budget of allBudgets.filter(b => !b.parent_id)) {
        const spent = spentForBudget(budget.id, childIdsByParent[budget.id] ?? [], spendingByBudget)
        if (budget.default_limit && spent > budget.default_limit) {
          alertBudgetCount++
        }
      }
    }

    // Calculate FIRE reachability
    let fireUnreachable = false
    if (hasTransactions && hasAssets) {
      // Vermogen gewogen met net_worth_inclusion_pct (dashboard-bron) i.p.v.
      // ongewogen som.
      const totalAssets = (assetsResult.data ?? []).reduce(
        (sum, a) => sum + Number(a.current_value ?? 0) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      const totalDebts = (debtsResult.data ?? []).reduce(
        (sum, d) => sum + Number(d.current_balance ?? 0) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const netWorth = totalAssets - totalDebts
      const monthlyTxs = monthlyTxResult.data ?? []
      const monthlyIncome = monthlyTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const monthlyExpenses = Math.abs(monthlyTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
      const monthlySavings = monthlyIncome - monthlyExpenses
      const yearlyExpenses = monthlyExpenses * 12
      // Gepersonaliseerde effectiveSwr i.p.v. de klassieke 0.04 — zelfde
      // FIRE-doel als /toekomst (was ~28% te laag bij 4%).
      const fireParams = resolveFireParams(profileResult.data ?? {})
      const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / fireParams.effectiveSwr : 0

      // FIRE is unreachable if: target exists but savings <= 0 and haven't reached target
      // OR if it would take > 50 years (600 months) to reach
      if (fireTarget > 0 && netWorth < fireTarget) {
        if (monthlySavings <= 0) {
          fireUnreachable = true
        } else {
          // Simulate to check if reachable within 50 years — gebruikersrendement
          // en -inflatie (resolveFireParams).
          const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
          const monthlyReturn = realReturn / 12
          let projected = netWorth
          let months = 0
          while (projected < fireTarget && months < 600) {
            projected = projected * (1 + monthlyReturn) + monthlySavings
            months++
          }
          if (months >= 600) {
            fireUnreachable = true
          }
        }
      }
    }

    // Build dismissed set from database (if table exists)
    const dismissedKeys = new Set<string>()
    const completedByDb = new Set<string>()
    if (dismissedResult.data && !dismissedResult.error) {
      for (const row of dismissedResult.data) {
        if (row.dismissed) {
          dismissedKeys.add(row.step_key)
        } else {
          completedByDb.add(row.step_key)
        }
      }
    }

    // Build step list with smart prioritization (Feature #255):
    // Priority 1: No transactions (import first)
    // Priority 2: No assets (add wealth)
    // Priority 3: Budget alerts (needs attention)
    // Priority 4: No goals (set goals)
    // Priority 5: FIRE unreachable (try scenarios)
    // Priority 6+: Other steps (budgets, debts, profile, snapshots)
    //
    // A step is "completed" if either:
    // 1. The real data state shows it's done (e.g., hasTransactions for import_transactions)
    // 2. The user explicitly marked it as completed via POST /api/next-steps/complete
    const steps = [
      {
        key: 'connect_bank_psd2',
        title: 'Koppel je bank voor automatisch inzicht',
        description: 'Verbind je bankrekening via PSD2 en je transacties worden automatisch geïmporteerd en gecategoriseerd.',
        category: 'onboarding',
        priority: 0,
        href: '/core/cash/connect',
        icon: 'zap',
        completed: hasBankConnection || completedByDb.has('connect_bank_psd2'),
        dismissed: dismissedKeys.has('connect_bank_psd2'),
      },
      {
        key: 'import_transactions',
        title: 'Importeer je bankafschriften',
        description: 'Upload je bankafschriften (MT940/CSV/OFX) om inzicht te krijgen in je inkomsten en uitgaven.',
        category: 'onboarding',
        priority: 1,
        href: '/core/cash/import',
        icon: 'receipt',
        completed: hasTransactions || completedByDb.has('import_transactions'),
        dismissed: dismissedKeys.has('import_transactions'),
      },
      {
        key: 'add_assets',
        title: 'Voeg je bezittingen toe',
        description: 'Registreer je spaargeld, beleggingen en andere bezittingen.',
        category: 'financial',
        priority: 2,
        href: '/core/assets',
        icon: 'piggybank',
        completed: hasAssets || completedByDb.has('add_assets'),
        dismissed: dismissedKeys.has('add_assets'),
      },
      {
        key: 'budget_attention',
        title: alertBudgetCount > 0
          ? `${alertBudgetCount} budget${alertBudgetCount > 1 ? 'ten' : ''} ${alertBudgetCount > 1 ? 'hebben' : 'heeft'} aandacht nodig`
          : 'Budgetten bekijken',
        description: alertBudgetCount > 0
          ? `${alertBudgetCount} van je budgetten overschrijdt de limiet. Bekijk je uitgaven.`
          : 'Bekijk of je budgetten binnen de limiet blijven.',
        category: 'attention',
        priority: 3,
        href: '/core/budgets',
        icon: 'cart',
        completed: alertBudgetCount === 0 || completedByDb.has('budget_attention'),
        dismissed: dismissedKeys.has('budget_attention'),
      },
      {
        key: 'set_goals',
        title: 'Stel een financieel doel',
        description: 'Definieer een concreet doel om naartoe te werken, zoals een spaardoel of schuld aflossen.',
        category: 'growth',
        priority: 4,
        href: '/will',
        icon: 'target',
        completed: hasGoals || completedByDb.has('set_goals'),
        dismissed: dismissedKeys.has('set_goals'),
      },
      {
        key: 'fire_unreachable',
        title: 'FIRE-doel niet haalbaar',
        description: 'Je huidige spaarquote is onvoldoende om financiële vrijheid te bereiken. Verken scenario\'s om je plan te verbeteren.',
        category: 'horizon',
        priority: 5,
        href: '/horizon',
        icon: 'compass',
        completed: !fireUnreachable || completedByDb.has('fire_unreachable'),
        dismissed: dismissedKeys.has('fire_unreachable'),
      },
      {
        key: 'set_budgets',
        title: 'Stel je budgetten in',
        description: 'Maak budgetten aan om grip te krijgen op je uitgaven per categorie.',
        category: 'onboarding',
        priority: 6,
        href: '/core/budgets',
        icon: 'cart',
        completed: hasBudgets || completedByDb.has('set_budgets'),
        dismissed: dismissedKeys.has('set_budgets'),
      },
      {
        key: 'register_debts',
        title: 'Schulden registreren',
        description: 'Registreer eventuele leningen en schulden voor een compleet overzicht.',
        category: 'financial',
        priority: 7,
        href: '/core/debts',
        icon: 'building',
        completed: hasDebts || completedByDb.has('register_debts'),
        dismissed: dismissedKeys.has('register_debts'),
      },
      {
        key: 'complete_profile',
        title: 'Profiel aanvullen',
        description: 'Vul je persoonlijke gegevens en huishoudprofiel in voor gepersonaliseerde inzichten.',
        category: 'onboarding',
        priority: 8,
        href: '/identity',
        icon: 'target',
        completed: profileComplete || completedByDb.has('complete_profile'),
        dismissed: dismissedKeys.has('complete_profile'),
      },
      {
        key: 'create_snapshot',
        title: 'Maak je eerste vermogenssnapshot',
        description: 'Leg je huidige vermogenspositie vast om je voortgang over tijd te volgen.',
        category: 'financial',
        priority: 9,
        href: '/core',
        icon: 'chart',
        completed: hasSnapshots || completedByDb.has('create_snapshot'),
        dismissed: dismissedKeys.has('create_snapshot'),
      },
    ]

    // Separate pending, completed and dismissed
    const pendingSteps = steps.filter(s => !s.completed && !s.dismissed)
    const completedSteps = steps.filter(s => s.completed)
    const dismissedSteps = steps.filter(s => s.dismissed && !s.completed)

    // Return the first pending step as the primary suggestion
    // Maximum 2 suggestions returned in pending_steps for display (Feature #255)
    const nextStep = pendingSteps.length > 0 ? pendingSteps[0] : null

    return NextResponse.json({
      next_step: nextStep,
      pending_steps: pendingSteps,
      completed_steps: completedSteps.map(s => s.key),
      dismissed_steps: dismissedSteps.map(s => s.key),
      completed_count: completedSteps.length,
      dismissed_count: dismissedSteps.length,
      total_steps: steps.length,
      data_state: {
        has_bank_connection: hasBankConnection,
        has_transactions: hasTransactions,
        has_budgets: hasBudgets,
        has_assets: hasAssets,
        has_debts: hasDebts,
        has_snapshots: hasSnapshots,
        has_goals: hasGoals,
        profile_complete: profileComplete,
        alert_budget_count: alertBudgetCount,
        fire_unreachable: fireUnreachable,
      },
      source: 'database',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({
      error: message,
      next_step: {
        key: 'import_transactions',
        title: 'Importeer je bankafschriften',
        description: 'Upload je bankafschriften om te beginnen.',
        category: 'onboarding',
        priority: 1,
        href: '/core/cash/import',
        icon: 'receipt',
        completed: false,
      },
      pending_steps: [],
      completed_steps: [],
      dismissed_steps: [],
      completed_count: 0,
      dismissed_count: 0,
      total_steps: 0,
      source: 'fallback',
    }, { status: 500 })
  }
}
