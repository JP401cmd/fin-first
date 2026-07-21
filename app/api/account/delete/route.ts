import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
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

  // Service-role client voor de RLS-afgeschermde persoonlijke tabellen
  // (net_worth_history/feedback) en — bij full-delete — de retentie-tabellen +
  // de auth-delete zelf. Alleen bouwen als de key gezet is; anders vallen die
  // stappen best-effort weg (dev/preview zonder service-key).
  const hasServiceKey =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const service = hasServiceKey ? getServiceClient() : undefined

  if (fullDelete && !service) {
    return serverError(
      new Error('SUPABASE_SERVICE_ROLE_KEY not configured'),
      'account-delete:POST',
    )
  }

  try {
    // Step 1: Delete all user data. Bij full-delete óók de retentie-/log-tabellen
    // (fullErase) zodat er na de AVG-wissing geen identifier achterblijft.
    const deletionSummary = await deleteAllUserData(supabase, user.id, undefined, {
      service,
      fullErase: fullDelete,
    })

    if (fullDelete && service) {
      // Step 2a: Remove the auth account itself (service-role). DB-level
      // ON DELETE CASCADE on auth.users(id) clears anything left.
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
