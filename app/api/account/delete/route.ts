import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { deleteAllUserData } from '@/lib/seed-persona'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST /api/account/delete
 *
 * Two modes (auth is always required — 401 otherwise):
 *
 *  - default ("reset"): wipes all user financial data (full cascade) and
 *    resets the profile to a clean onboarding state, then signs out. The
 *    auth.users record is kept, so the user can start over.
 *
 *  - mode: 'delete' (full account deletion): wipes all user data AND deletes
 *    the auth.users record via the service-role admin API, after verifying a
 *    typed confirmation (`confirm` must equal the user's own e-mail). After
 *    this the user can no longer log in. Irreversible.
 *
 * Both modes return { success, deletionSummary }.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const body = (await request.json().catch(() => ({}))) as
    | { mode?: string; confirm?: string }
    | null
  const fullDelete = body?.mode === 'delete'

  // Full deletion requires the user to retype their own e-mail as confirmation.
  if (fullDelete) {
    const confirm = (body?.confirm ?? '').trim().toLowerCase()
    if (!confirm || confirm !== (user.email ?? '').toLowerCase()) {
      return Response.json(
        { error: 'Bevestiging komt niet overeen met je e-mailadres' },
        { status: 400 },
      )
    }
  }

  try {
    // Step 1: Delete all user financial data (badges, streaks, holdings, etc.)
    const deletionSummary = await deleteAllUserData(supabase, user.id)

    if (fullDelete) {
      // Step 2a: Remove the auth account itself (service-role). DB-level
      // ON DELETE CASCADE on auth.users(id) clears anything left.
      const service = getServiceClient()
      const { error: authDeleteError } = await service.auth.admin.deleteUser(user.id)
      if (authDeleteError) {
        return serverError(authDeleteError, 'account-delete:POST')
      }
      // Best-effort sign-out of the current session cookies.
      await supabase.auth.signOut().catch(() => {})

      return Response.json({
        success: true,
        message: 'Account permanently deleted',
        deletionSummary,
      })
    }

    // Step 2b (reset path): reset the profile to a clean onboarding state.
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
    return serverError(err, 'account-delete:POST')
  }
}
