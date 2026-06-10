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

/** POST — blokkeer of deblokkeer een account (zet/wist profiles.blocked_at). */
export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const userId = body.userId as string | undefined
  const blocked = body.blocked

  if (!userId || typeof blocked !== 'boolean') {
    return NextResponse.json({ error: 'userId en blocked (boolean) zijn vereist' }, { status: 400 })
  }
  // Lockout-bescherming: jezelf blokkeren kan niet.
  if (userId === adminUser.id) {
    return NextResponse.json({ error: 'Je kunt jezelf niet blokkeren.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: target } = await service
    .from('profiles')
    .select('role, blocked_at, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (!target) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }
  // Een superadmin blokkeren kan niet — wijzig eerst de rol naar gebruiker.
  if (blocked && target.role === 'superadmin') {
    return NextResponse.json(
      { error: 'Een superadmin kun je niet blokkeren — zet de rol eerst op gebruiker.' },
      { status: 400 },
    )
  }

  const blockedAt = blocked ? new Date().toISOString() : null
  const { error } = await service
    .from('profiles')
    .update({ blocked_at: blockedAt })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction(service, {
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: blocked ? 'user.block' : 'user.unblock',
    targetUser: userId,
    targetLabel: target.full_name ?? userId,
  })

  return NextResponse.json({ success: true, blockedAt })
}
