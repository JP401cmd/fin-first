import { NextResponse } from 'next/server'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { laadGebruikersActiviteit } from '@/lib/beheer/gebruik'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/admin/users/activity?userId=... — gebruiksprofiel van één gebruiker
 * (ADR 0146): actieve dagen, AI-gebruik per functie, ingerichte apps, aantallen
 * records en sync-status. NOOIT bedragen, namen van rekeningen of andere
 * inhoud — zie `lib/beheer/gebruik.ts`. Superadmin-only; de inzage wordt gelogd.
 */
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId || !UUID_RE.test(userId)) {
    return badRequest('Ongeldige gebruiker')
  }

  const service = getServiceClient()
  try {
    const activiteit = await laadGebruikersActiviteit(service, userId)

    // Label server-side afgeleid, niet uit de querystring: een auditregel hoort
    // niet te zeggen wat de client beweert, en zo belandt er geen e-mailadres in
    // de access-logs. Faalt de lookup, dan blijft de uuid het label.
    let targetLabel = userId
    try {
      const { data } = await service.auth.admin.getUserById(userId)
      if (data?.user?.email) targetLabel = data.user.email
    } catch {
      // uuid als label volstaat
    }

    await logAdminAction(service, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'user.activity',
      targetUser: userId,
      targetLabel,
    })

    return NextResponse.json(activiteit)
  } catch (err) {
    return serverError(err, 'admin-users-activity:GET')
  }
}
