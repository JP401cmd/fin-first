import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

const VALID_ROLES = ['user', 'superadmin']

/** POST — wijzig de rol van een gebruiker (user ↔ superadmin). */
export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  if (!adminUser) {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const userId = body.userId as string | undefined
  const role = body.role as string | undefined

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId en role zijn vereist' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Ongeldige rol' }, { status: 400 })
  }
  // Lockout-bescherming: je eigen rol wijzig je niet (voorkomt zelf-degradatie).
  if (userId === adminUser.id) {
    return NextResponse.json({ error: 'Je kunt je eigen rol niet wijzigen.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: target } = await service
    .from('profiles')
    .select('role, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (!target) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }

  // Laatste-superadmin-bescherming: degradeer nooit de enige superadmin.
  if (target.role === 'superadmin' && role !== 'superadmin') {
    const { count } = await service
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'superadmin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Dit is de laatste superadmin — wijs er eerst een andere aan.' },
        { status: 400 },
      )
    }
  }

  const { error } = await service.from('profiles').update({ role }).eq('id', userId)
  if (error) {
    return serverError(error, 'admin-users-role:POST')
  }

  await logAdminAction(service, {
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'user.role',
    targetUser: userId,
    targetLabel: target.full_name ?? userId,
    detail: { from: target.role, to: role },
  })

  return NextResponse.json({ success: true, role })
}
