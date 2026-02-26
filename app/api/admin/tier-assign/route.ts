import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import type { CommercialTier } from '@/lib/tier-config'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

/** POST — assign a user to a tier */
export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { userId, tier } = body as { userId: string; tier: CommercialTier }

  if (!userId || !tier || !['gratis', 'connected', 'ai'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const service = getServiceClient()

  // Get current tier
  const { data: profile } = await service
    .from('profiles')
    .select('commercial_tier')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }

  const oldTier = profile.commercial_tier as string

  // Update tier
  const { error: updateError } = await service
    .from('profiles')
    .update({ commercial_tier: tier })
    .eq('id', userId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Log the assignment
  await service.from('tier_assignments_log').insert({
    target_user: userId,
    assigned_by: adminUser.id,
    old_tier: oldTier,
    new_tier: tier,
  })

  return NextResponse.json({ success: true, oldTier, newTier: tier })
}

/** GET — recent assignment log + user lookup by email */
export async function GET(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')

  const service = getServiceClient()

  if (email) {
    // Look up user by email via auth.users
    const { data: usersData, error: usersError } = await service.auth.admin.listUsers()
    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const authUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )

    if (!authUser) {
      return NextResponse.json({ user: null })
    }

    const { data: profile } = await service
      .from('profiles')
      .select('id, full_name, commercial_tier')
      .eq('id', authUser.id)
      .maybeSingle()

    return NextResponse.json({
      user: profile
        ? {
            id: profile.id,
            email: authUser.email,
            name: profile.full_name,
            currentTier: profile.commercial_tier,
          }
        : null,
    })
  }

  // Return recent log (last 10)
  const { data: log } = await service
    .from('tier_assignments_log')
    .select('id, target_user, assigned_by, old_tier, new_tier, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  // Get profile names for target users
  const userIds = [...new Set((log ?? []).map((l) => l.target_user))]
  let profileMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      profileMap[p.id] = p.full_name ?? p.id
    }
  }

  const enrichedLog = (log ?? []).map((entry) => ({
    ...entry,
    targetName: profileMap[entry.target_user] ?? entry.target_user,
  }))

  return NextResponse.json({ log: enrichedLog })
}
