import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ModuleId } from '@/lib/module-registry'
import { getActiveNudges, type NudgeDataState } from '@/lib/nudge-definitions'

/**
 * GET /api/nudges — Module-aware nudges for incomplete data.
 *
 * Returns rule-based suggestions per active module.
 * No AI — purely data-state detection.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Parallel queries for data state detection
    const [
      assetsResult,
      debtsResult,
      budgetsResult,
      transactionsResult,
      holdingsResult,
      goalsResult,
      lifeEventsResult,
      profileResult,
      bankConnectionsResult,
      dismissedResult,
    ] = await Promise.all([
      supabase.from('assets').select('id').eq('user_id', user.id).eq('is_active', true).limit(1),
      supabase.from('debts').select('id').eq('user_id', user.id).eq('is_active', true).limit(1),
      supabase.from('budgets').select('id').eq('user_id', user.id).is('parent_id', null).limit(1),
      supabase.from('transactions').select('id').eq('user_id', user.id).limit(1),
      supabase.from('investment_holdings').select('id, isin').eq('user_id', user.id).eq('is_active', true),
      supabase.from('goals').select('id').eq('user_id', user.id).limit(1),
      supabase.from('life_events').select('id, event_type').eq('user_id', user.id).eq('is_active', true),
      supabase.from('profiles').select('active_modules, expected_return, inflation_rate').eq('id', user.id).maybeSingle(),
      supabase.from('bank_connections').select('id, status').eq('user_id', user.id),
      // Dismissed nudges use the existing next_step_completions table with 'nudge_' prefix
      supabase.from('next_step_completions').select('step_key, dismissed').eq('user_id', user.id).like('step_key', 'nudge_%'),
    ])

    const holdings = holdingsResult.data ?? []
    const lifeEvents = (lifeEventsResult.data ?? []).filter(e => e.event_type !== 'aow')
    const activeModules: ModuleId[] = (profileResult.data?.active_modules as ModuleId[]) ?? []
    const bankConnections = bankConnectionsResult.data ?? []

    // Build dismissed set
    const dismissedNudges = new Set<string>()
    for (const row of dismissedResult.data ?? []) {
      if (row.dismissed) {
        // Strip 'nudge_' prefix to match nudge keys
        dismissedNudges.add(row.step_key.replace(/^nudge_/, ''))
      }
    }

    const state: NudgeDataState = {
      hasAssets: (assetsResult.data?.length ?? 0) > 0,
      hasDebts: (debtsResult.data?.length ?? 0) > 0,
      hasBudgets: (budgetsResult.data?.length ?? 0) > 0,
      hasTransactions: (transactionsResult.data?.length ?? 0) > 0,
      hasActiveBankConnection: bankConnections.some(c => c.status === 'authorized'),
      hasHoldings: holdings.length > 0,
      hasHoldingsWithIsin: holdings.some(h => h.isin !== null && h.isin !== ''),
      hasGoals: (goalsResult.data?.length ?? 0) > 0,
      hasLifeEvents: lifeEvents.length > 0,
      hasFireParams: profileResult.data?.expected_return != null || profileResult.data?.inflation_rate != null,
      activeModules,
      dismissedNudgeIds: dismissedNudges,
    }

    const nudges = getActiveNudges(state)

    return NextResponse.json({ nudges, count: nudges.length })
  } catch (err) {
    console.error('Nudge API error:', err)
    return NextResponse.json({ nudges: [], count: 0 })
  }
}
