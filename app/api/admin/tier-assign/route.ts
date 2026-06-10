import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

type ServiceClient = ReturnType<typeof getServiceClient>
type AuthUser = Awaited<
  ReturnType<ServiceClient['auth']['admin']['listUsers']>
>['data']['users'][number]

/**
 * Zoek een auth-gebruiker op e-mail, gepagineerd. `listUsers()` levert
 * standaard maar 50 gebruikers per pagina — zonder pagineren zou een lookup
 * boven 50 accounts stil falen ("niet gevonden" terwijl ze bestaan).
 */
async function findAuthUserByEmail(
  service: ServiceClient,
  email: string,
): Promise<AuthUser | null> {
  const target = email.trim().toLowerCase()
  if (!target) return null
  const perPage = 200
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []
    const found = users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found
    if (users.length < perPage) return null
  }
  return null
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
    const authUser = await findAuthUserByEmail(service, email)
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

  // Determine new subscriptions.
  // Alleen de betaalde add-ons (connected/ai) worden hier beheerd. Eventuele
  // andere entries die al op het profiel staan (bv. legacy 'kern'/'wil'/'horizon'
  // uit oude seeds) blijven behouden — een add-on toggelen mag nooit andere data
  // uit active_subscriptions verwijderen.
  const ADDONS = ['connected', 'ai']
  let newSubs: string[]
  if (subscriptions !== undefined) {
    // New format: explicit subscriptions array — neem alleen de add-on-selectie over.
    const requestedAddons = subscriptions.filter((s) => ADDONS.includes(s))
    const preserved = oldSubs.filter((s) => !ADDONS.includes(s))
    newSubs = [...preserved, ...requestedAddons]
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

  await logAdminAction(service, {
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'subscription.update',
    targetUser: targetUserId,
    targetLabel: email ?? targetUserId,
    detail: { from: oldLabel, to: newLabel },
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
    // Look up user by email via auth.users (gepagineerd)
    let authUser: AuthUser | null
    try {
      authUser = await findAuthUserByEmail(service, email)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Zoeken mislukt' },
        { status: 500 },
      )
    }

    if (!authUser) {
      return NextResponse.json({ user: null })
    }

    const { data: profile } = await service
      .from('profiles')
      .select('id, full_name, role, blocked_at, active_subscriptions, commercial_tier')
      .eq('id', authUser.id)
      .maybeSingle()

    return NextResponse.json({
      user: profile
        ? {
            id: profile.id,
            email: authUser.email,
            name: profile.full_name,
            role: (profile.role as string) ?? 'user',
            blockedAt: (profile.blocked_at as string | null) ?? null,
            createdAt: authUser.created_at ?? null,
            lastSignInAt: authUser.last_sign_in_at ?? null,
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
