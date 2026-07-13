import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { PERSONAS, TEST_EMAILS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData } from '@/lib/seed-persona'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** GET — list test users with their current state */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const service = getServiceClient()

    // Gerichte lookup via de SECURITY DEFINER-RPC i.p.v. admin.listUsers() te
    // pagineren: die lijst-call breekt zodra één auth.users-rij NULL-tokens
    // bevat ("Database error finding users"). De RPC SELECT raakt die kolommen
    // niet aan en is robuust tegen die auth-datacorruptie.
    interface AuthUserRow {
      id: string
      email: string | null
      last_sign_in_at: string | null
      raw_user_meta_data: { test_persona_key?: string } | null
    }
    const { data: rows, error: listError } = await service.rpc('admin_lookup_users_by_emails', {
      p_emails: TEST_EMAILS,
    })

    if (listError) {
      console.error('[test-users] lookup failed:', listError)
      return NextResponse.json(
        { error: 'Testgebruikers ophalen mislukt door een serverfout.' },
        { status: 500 },
      )
    }

    const testUsers = ((rows as AuthUserRow[] | null) ?? [])
      .map((u) => {
        const personaKey = u.raw_user_meta_data?.test_persona_key
        const persona = personaKey ? PERSONAS[personaKey as PersonaKey] : null
        return {
          id: u.id,
          email: u.email,
          personaKey,
          personaName: persona?.meta.name ?? null,
          personaSubtitle: persona?.meta.subtitle ?? null,
          lastSignIn: u.last_sign_in_at ?? null,
        }
      })

    // Get profile status
    const profileIds = testUsers.map((u) => u.id)
    if (profileIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const { data: profiles } = await service
      .from('profiles')
      .select('id, onboarding_completed, last_known_phase, is_demo_user')
      .in('id', profileIds)

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

    const enriched = testUsers.map((u) => {
      const profile = profileMap.get(u.id)
      return {
        ...u,
        onboardingCompleted: profile?.onboarding_completed ?? false,
        lastKnownPhase: profile?.last_known_phase ?? null,
        isDemoUser: profile?.is_demo_user ?? false,
      }
    })

    return NextResponse.json({ users: enriched })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    console.error('[test-users] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** POST — reset or change password for a test user */
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, userId, newPassword } = body as {
    action: 'reset' | 'change_password'
    userId: string
    newPassword?: string
  }

  try {
    const service = getServiceClient()

    // Verify this is a test user
    const { data: { user: targetUser }, error: getUserError } = await service.auth.admin.getUserById(userId)
    if (getUserError || !targetUser || !TEST_EMAILS.includes(targetUser.email ?? '')) {
      return NextResponse.json({ error: 'Geen testgebruiker' }, { status: 400 })
    }

    if (action === 'reset') {
      const noop = () => {}
      await deleteAllUserData(service, userId, noop)

      // Reset profile to pre-onboarding state + clear welcome flag
      await service
        .from('profiles')
        .update({
          onboarding_completed: false,
          last_known_phase: null,
          is_demo_user: false,
          feature_preferences: {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      // Also clear any app_settings entries for this user (sovereignty level, checkins, etc.)
      await service
        .from('app_settings')
        .delete()
        .like('key', `%${userId}%`)

      return NextResponse.json({
        success: true,
        message: `Testgebruiker ${targetUser.email} is gereset. Onboarding kan opnieuw doorlopen worden.`,
      })
    }

    if (action === 'change_password') {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'Wachtwoord moet minimaal 6 tekens zijn' }, { status: 400 })
      }

      const { error } = await service.auth.admin.updateUserById(userId, {
        password: newPassword,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Wachtwoord van ${targetUser.email} is gewijzigd.`,
      })
    }

    return NextResponse.json({ error: 'Ongeldige actie' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
