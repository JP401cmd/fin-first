import { createClient } from '@/lib/supabase/server'
import { deleteAllUserData } from '@/lib/seed-persona'

/**
 * POST /api/account/delete
 *
 * Deletes all user data (full cascade) and signs out the user.
 * This performs application-level deletion of all financial data,
 * user badges, streaks, feature visits, holdings, and profile data.
 *
 * Note: The auth.users record is NOT deleted (requires service_role key).
 * Database-level ON DELETE CASCADE on auth.users(id) would handle that
 * if the auth user were deleted via admin API.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Step 1: Delete all user financial data (including badges, streaks, holdings, etc.)
    const deletionSummary = await deleteAllUserData(supabase, user.id)

    // Step 2: Delete or reset the profile
    const { error: profileError } = await supabase
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

    if (profileError) {
      console.error('Profile reset error:', profileError)
    }

    // Step 3: Sign out the user
    await supabase.auth.signOut()

    return Response.json({
      success: true,
      message: 'Account data deleted successfully',
      deletionSummary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
