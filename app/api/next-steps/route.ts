import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/next-steps — Get user's next recommended steps.
 *
 * Returns a prioritized list of actions the user should take next,
 * based on their ACTUAL financial data state (not static defaults).
 *
 * Also checks for dismissed steps and excludes them from suggestions.
 *
 * The logic checks real data in the database:
 * - Has the user imported transactions?
 * - Has the user set up budgets?
 * - Has the user added assets?
 * - Has the user registered debts?
 * - Has the user created net worth snapshots?
 * - Has the user completed their profile?
 * - Has the user set any goals?
 *
 * Steps that are already completed (based on real data) or dismissed
 * are removed from the suggestion list, making recommendations dynamic.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Query actual user data state in parallel
    const [
      transactionsResult,
      budgetsResult,
      assetsResult,
      debtsResult,
      snapshotsResult,
      profileResult,
      goalsResult,
      dismissedResult,
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .limit(1),
      supabase
        .from('budgets')
        .select('id')
        .eq('user_id', user.id)
        .is('parent_id', null)
        .limit(1),
      supabase
        .from('assets')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1),
      supabase
        .from('debts')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1),
      supabase
        .from('net_worth_snapshots')
        .select('id')
        .eq('user_id', user.id)
        .limit(1),
      supabase
        .from('profiles')
        .select('full_name, date_of_birth, household_type')
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
    ])

    // Determine what the user has done based on real data
    const hasTransactions = (transactionsResult.data?.length ?? 0) > 0
    const hasBudgets = (budgetsResult.data?.length ?? 0) > 0
    const hasAssets = (assetsResult.data?.length ?? 0) > 0
    const hasDebts = (debtsResult.data?.length ?? 0) > 0
    const hasSnapshots = (snapshotsResult.data?.length ?? 0) > 0
    const hasGoals = (goalsResult.data?.length ?? 0) > 0
    const profileComplete = !!(
      profileResult.data?.full_name &&
      profileResult.data?.date_of_birth &&
      profileResult.data?.household_type
    )

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

    // Build step list based on actual data state AND explicit completions from DB
    // A step is "completed" if either:
    // 1. The real data state shows it's done (e.g., hasTransactions for import_transactions)
    // 2. The user explicitly marked it as completed via POST /api/next-steps/complete
    const steps = [
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
        key: 'set_budgets',
        title: 'Stel je budgetten in',
        description: 'Maak budgetten aan om grip te krijgen op je uitgaven per categorie.',
        category: 'onboarding',
        priority: 2,
        href: '/core/budgets',
        icon: 'cart',
        completed: hasBudgets || completedByDb.has('set_budgets'),
        dismissed: dismissedKeys.has('set_budgets'),
      },
      {
        key: 'add_assets',
        title: 'Voeg je bezittingen toe',
        description: 'Registreer je spaargeld, beleggingen en andere bezittingen.',
        category: 'financial',
        priority: 3,
        href: '/core/assets',
        icon: 'piggybank',
        completed: hasAssets || completedByDb.has('add_assets'),
        dismissed: dismissedKeys.has('add_assets'),
      },
      {
        key: 'register_debts',
        title: 'Schulden registreren',
        description: 'Registreer eventuele leningen en schulden voor een compleet overzicht.',
        category: 'financial',
        priority: 4,
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
        priority: 5,
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
        priority: 6,
        href: '/core',
        icon: 'chart',
        completed: hasSnapshots || completedByDb.has('create_snapshot'),
        dismissed: dismissedKeys.has('create_snapshot'),
      },
      {
        key: 'set_goals',
        title: 'Stel een financieel doel',
        description: 'Definieer een concreet doel om naartoe te werken, zoals een spaardoel of schuld aflossen.',
        category: 'growth',
        priority: 7,
        href: '/will',
        icon: 'target',
        completed: hasGoals || completedByDb.has('set_goals'),
        dismissed: dismissedKeys.has('set_goals'),
      },
    ]

    // Separate pending, completed and dismissed
    const pendingSteps = steps.filter(s => !s.completed && !s.dismissed)
    const completedSteps = steps.filter(s => s.completed)
    const dismissedSteps = steps.filter(s => s.dismissed && !s.completed)

    // Return the first pending step as the primary suggestion
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
        has_transactions: hasTransactions,
        has_budgets: hasBudgets,
        has_assets: hasAssets,
        has_debts: hasDebts,
        has_snapshots: hasSnapshots,
        has_goals: hasGoals,
        profile_complete: profileComplete,
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
