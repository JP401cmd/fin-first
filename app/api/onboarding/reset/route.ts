import { createClient } from '@/lib/supabase/server'
import { deleteAllUserData } from '@/lib/seed-persona'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Delete all user financial data (includes user_badges, user_streaks tables)
    await deleteAllUserData(supabase, user.id)

    // Clear app_settings fallback entries for badges and streaks
    await Promise.all([
      supabase.from('app_settings').delete().eq('key', `earned_badges_${user.id}`),
      supabase.from('app_settings').delete().eq('key', `streaks_${user.id}`),
    ])

    // Reset profile to minimal state
    await supabase
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json({ error: message }, { status: 500 })
  }
}
