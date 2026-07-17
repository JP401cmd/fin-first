import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'
import { localMonthBounds } from '@/lib/month-range'
import { resolveFireParams } from '@/lib/fire-params'

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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
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
        .eq('user_id', user.id)
        .limit(1),
      supabase
        .from('budgets')
        .select('id, name, default_limit')
        .eq('user_id', user.id)
        .is('parent_id', null),
      supabase
        .from('assets')
        .select('id, current_value, net_worth_inclusion_pct')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('id, current_balance, net_worth_inclusion_pct')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('net_worth_snapshots')
        .select('id')
        .eq('user_id', user.id)
        .limit(1),
      supabase
        .from('profiles')
        .select('full_name, date_of_birth, household_type, expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('goals')
        .select('id')
        .eq('user_id', user.id)
        .limit(1),
      // Try to fetch dismissed steps (table may not exist yet)
      supabase
        .from('next_step_completions')
        .select('step_key, dismissed')
        .eq('user_id', user.id),
      // Budget spending this month (for alert detection)
      supabase
        .from('transactions')
        .select('budget_id, amount')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lt('date', monthEnd)
        .lt('amount', 0),
      // Monthly income/expenses for FIRE check
      supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lt('date', monthEnd),
      // PSD2 bank connection check (#813) — active bank connections via TrueLayer/PSD2
      supabase
        .from('bank_connections')
        .select('id')
        .eq('user_id', user.id)
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
      const spendingByBudget = new Map<string, number>()
      for (const tx of budgetSpendingResult.data) {
        if (tx.budget_id) {
          const current = spendingByBudget.get(tx.budget_id) ?? 0
          spendingByBudget.set(tx.budget_id, current + Math.abs(tx.amount))
        }
      }
      for (const budget of budgetsResult.data) {
        const spent = spendingByBudget.get(budget.id) ?? 0
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
