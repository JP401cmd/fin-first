import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

/** POST — assign subscriptions to a user */
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

  // Support both old format (email + tier) and new format (email + subscriptions)
  const email = body.email as string | undefined
  const userId = body.userId as string | undefined
  const subscriptions = body.subscriptions as string[] | undefined
  const legacyTier = body.tier as string | undefined

  const service = getServiceClient()

  // Resolve user ID from email if needed
  let targetUserId = userId
  if (!targetUserId && email) {
    const { data: usersData } = await service.auth.admin.listUsers()
    const authUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (!authUser) {
      return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
    }
    targetUserId = authUser.id
  }

  if (!targetUserId) {
    return NextResponse.json({ error: 'userId of email is vereist' }, { status: 400 })
  }

  // Get current state
  const { data: profile } = await service
    .from('profiles')
    .select('active_subscriptions, commercial_tier')
    .eq('id', targetUserId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }

  const oldSubs = (profile.active_subscriptions as string[]) ?? []

  // Determine new subscriptions
  let newSubs: string[]
  if (subscriptions !== undefined) {
    // New format: explicit subscriptions array
    const validSubs = ['connected', 'ai']
    newSubs = subscriptions.filter(s => validSubs.includes(s))
  } else if (legacyTier) {
    // Legacy format: single tier → convert to subscriptions
    if (legacyTier === 'ai') newSubs = ['ai']
    else if (legacyTier === 'connected') newSubs = ['connected']
    else newSubs = []
  } else {
    return NextResponse.json({ error: 'subscriptions of tier is vereist' }, { status: 400 })
  }

  // Update subscriptions
  const { error: updateError } = await service
    .from('profiles')
    .update({
      active_subscriptions: newSubs,
      // Keep commercial_tier in sync for backward compat
      commercial_tier: newSubs.includes('ai') ? 'ai' : newSubs.includes('connected') ? 'connected' : 'gratis',
    })
    .eq('id', targetUserId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Log the assignment
  const oldLabel = oldSubs.length === 0 ? 'gratis' : oldSubs.join('+')
  const newLabel = newSubs.length === 0 ? 'gratis' : newSubs.join('+')
  await service.from('tier_assignments_log').insert({
    target_user: targetUserId,
    assigned_by: adminUser.id,
    old_tier: oldLabel,
    new_tier: newLabel,
  })

  return NextResponse.json({ success: true, oldSubscriptions: oldSubs, newSubscriptions: newSubs })
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
      .select('id, full_name, active_subscriptions, commercial_tier')
      .eq('id', authUser.id)
      .maybeSingle()

    return NextResponse.json({
      user: profile
        ? {
            id: profile.id,
            email: authUser.email,
            name: profile.full_name,
            subscriptions: (profile.active_subscriptions as string[]) ?? [],
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
