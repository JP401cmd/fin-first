import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const TEST_USERS = [
  { email: 'ronald@test.trifinity.nl', persona: 'ronald', name: 'Ronald Hoekstra' },
  { email: 'bas@test.trifinity.nl', persona: 'bas', name: 'Bas Mulder' },
  { email: 'leo@test.trifinity.nl', persona: 'leo', name: 'Leo Pietersen' },
  { email: 'jochen@test.trifinity.nl', persona: 'jochen', name: 'Jochen Brouwer' },
]

/** POST — create test users via Supabase Admin API (GoTrue) */
export async function POST() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceClient()
  const results: { email: string; status: string; error?: string }[] = []

  for (const u of TEST_USERS) {
    // Check if user already exists
    const { data: { users: existing } } = await service.auth.admin.listUsers({ perPage: 1000 })
    const alreadyExists = (existing ?? []).some((e) => e.email === u.email)

    if (alreadyExists) {
      results.push({ email: u.email, status: 'exists' })
      continue
    }

    // Create via GoTrue Admin API — this creates auth.users + auth.identities correctly
    const { data, error } = await service.auth.admin.createUser({
      email: u.email,
      password: 'Test2026!',
      email_confirm: true,
      user_metadata: {
        test_persona_key: u.persona,
        full_name: u.name,
      },
    })

    if (error) {
      results.push({ email: u.email, status: 'error', error: error.message })
      continue
    }

    // The handle_new_user trigger creates a basic profile, but we need to set full_name
    if (data.user) {
      await service
        .from('profiles')
        .update({ full_name: u.name })
        .eq('id', data.user.id)
    }

    results.push({ email: u.email, status: 'created' })
  }

  return NextResponse.json({ results })
}
