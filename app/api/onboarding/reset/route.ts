import { createClient } from '@/lib/supabase/server'
import { deleteAllUserData } from '@/lib/seed-persona'
import { clearBriefingState } from '@/app/api/briefing/compose/route'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Delete all user financial data (also wipes news_editions + per-user app_settings rows)
    await deleteAllUserData(supabase, user.id)

    // Drop in-memory briefing composition so the user doesn't see stale cards for ~5 min
    clearBriefingState(user.id)

    // Reset profile — core fields first (always exist)
    // last_known_phase is set to null so phase is recomputed on next load
    // feature_preferences cleared for clean restart
    const { error: coreErr } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: false,
        is_demo_user: false,
        full_name: null,
        date_of_birth: null,
        household_type: 'solo',
        temporal_balance: 3,
        net_monthly_income: null,
        number_of_children: 0,
        children_ages: [],
        last_known_phase: null,
        active_modules: null,
        feature_preferences: {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    if (coreErr) throw new Error(`Profiel reset mislukt: ${coreErr.message}`)

    // Reset FIRE + optional fields (may not exist if migrations not applied)
    await supabase
      .from('profiles')
      .update({
        estimated_monthly_expenses: null,
        expected_return: null,
        inflation_rate: null,
        fire_end_strategy: null,
        fire_end_age: null,
        fire_legacy_amount: null,
        retirement_expense_method: null,
        retirement_expense_custom_amount: null,
        widget_prefs: null,
      })
      .eq('id', user.id)
      // Ignore errors — columns may not exist yet

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json({ error: message }, { status: 500 })
  }
}
