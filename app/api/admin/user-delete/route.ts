import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { deleteAllUserData } from '@/lib/seed-persona'
import { logAdminAction } from '@/lib/admin-audit'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

/**
 * POST /api/admin/user-delete — AVG-verwijdering (recht op vergetelheid) door
 * een superadmin. Onomkeerbaar. Wist alle data van de doelgebruiker én het
 * auth-account (service-role), na een type-to-confirm van het doel-e-mailadres.
 * Gelogd in de audit-trail (user.delete) vóór de verwijdering.
 *
 * Veiligheid: je verwijdert nooit jezelf of een andere superadmin (degradeer
 * die eerst). De bevestiging moet exact het e-mailadres van de doelgebruiker zijn.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  const {
    data: { user: admin },
  } = await supabase.auth.getUser()
  if (!admin) {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const userId = body.userId as string | undefined
  const confirm = String(body.confirm ?? '').trim().toLowerCase()
  if (!userId) {
    return NextResponse.json({ error: 'userId is vereist' }, { status: 400 })
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: 'Je kunt jezelf niet verwijderen.' }, { status: 400 })
  }

  const service = getServiceClient()

  // Doel ophalen (e-mail voor de bevestiging) en rol-guard.
  const { data: targetAuth } = await service.auth.admin.getUserById(userId)
  const targetEmail = targetAuth?.user?.email ?? null
  if (!targetEmail) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }
  if (confirm !== targetEmail.toLowerCase()) {
    return NextResponse.json(
      { error: 'Bevestiging komt niet overeen met het e-mailadres van de gebruiker.' },
      { status: 400 },
    )
  }

  const { data: targetProfile } = await service
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (targetProfile?.role === 'superadmin') {
    return NextResponse.json(
      { error: 'Een superadmin kun je niet verwijderen — zet de rol eerst op gebruiker.' },
      { status: 400 },
    )
  }

  // Audit eerst (zodat de actie vastligt, ook als de delete halverwege faalt).
  await logAdminAction(supabase, {
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'user.delete',
    targetUser: userId,
    targetLabel: targetEmail,
  })

  try {
    const deletionSummary = await deleteAllUserData(service, userId)
    const { error: authErr } = await service.auth.admin.deleteUser(userId)
    if (authErr) {
      return serverError(authErr, 'admin-user-delete:POST')
    }
    return NextResponse.json({ success: true, deletionSummary })
  } catch (err) {
    return serverError(err, 'admin-user-delete:POST')
  }
}
