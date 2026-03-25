import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData } from '@/lib/seed-persona'

const TEST_EMAILS = [
  'ronald@test.trifinity.nl',
  'bas@test.trifinity.nl',
  'leo@test.trifinity.nl',
  'jochen@test.trifinity.nl',
]

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** GET — list test users via SECURITY DEFINER RPC (no service role needed) */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use the SECURITY DEFINER RPC — works with the user's own session
  const { data: rows, error } = await supabase.rpc('get_test_users_with_profiles', {
    test_emails: TEST_EMAILS,
  })

  if (error) {
    console.error('[test-users] RPC error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (rows ?? []).map((r: Record<string, unknown>) => {
    const personaKey = r.persona_key as string | undefined
    const persona = personaKey ? PERSONAS[personaKey as PersonaKey] : null
    return {
      id: r.user_id as string,
      email: r.email as string,
      personaKey,
      personaName: persona?.meta.name ?? null,
      personaSubtitle: persona?.meta.subtitle ?? null,
      onboardingCompleted: r.onboarding_completed ?? false,
      lastKnownPhase: r.last_known_phase ?? null,
      isDemoUser: r.is_demo_user ?? false,
      lastSignIn: r.last_sign_in_at ?? null,
    }
  })

  return NextResponse.json({ users })
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

  // Verify this is a test user via RPC
  const { data: rows } = await supabase.rpc('get_test_users_with_profiles', {
    test_emails: TEST_EMAILS,
  })
  const targetUser = (rows ?? []).find((r: Record<string, unknown>) => r.user_id === userId)
  if (!targetUser) {
    return NextResponse.json({ error: 'Geen testgebruiker' }, { status: 400 })
  }

  if (action === 'reset') {
    // Use service role for cross-user data deletion
    const service = getServiceClient()
    const noop = () => {}
    await deleteAllUserData(service, userId, noop)

    await service
      .from('profiles')
      .update({
        onboarding_completed: false,
        last_known_phase: null,
        is_demo_user: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return NextResponse.json({
      success: true,
      message: `Testgebruiker ${targetUser.email} is gereset. Onboarding kan opnieuw doorlopen worden.`,
    })
  }

  if (action === 'change_password') {
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Wachtwoord moet minimaal 6 tekens zijn' }, { status: 400 })
    }

    const service = getServiceClient()
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
}
