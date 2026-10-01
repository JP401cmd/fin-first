import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

const blokkeerSchema = z.object({ userId: z.uuid(), blocked: z.boolean() }).strict()

/**
 * Hoe lang een blokkade in Supabase Auth duurt: in de praktijk voor altijd, tot
 * beheer deblokkeert (dan `'none'`). Honderd jaar in uren, het formaat van GoTrue.
 */
export const BLOKKADE_BAN_DUUR = '876000h'

/**
 * POST — blokkeer of deblokkeer een account.
 *
 * Twee lagen: `profiles.blocked_at` (de app-shell, de Krant-routes en de API v1
 * lezen die) én een ban in Supabase Auth. Zonder die ban bleef een bewaard
 * refresh-token werken en kon een geblokkeerde gebruiker de overige cookie-API-
 * routes blijven aanroepen (concern `blokkade-geen-api-barriere`, security-run
 * 0.92.28). Met de ban stoppen inloggen en het verversen van de sessie direct;
 * een al uitgegeven access-token verloopt binnen de JWT-expiry (≤ 1 uur, het
 * geaccepteerde venster van ADR 0052). De app-shell sluit hem wél direct af
 * via blocked_at. Volgorde: blocked_at, audit-regel, ban. Faalt de ban, dan
 * staat de blokkade in de app al en krijgt beheer een fout om het opnieuw te
 * proberen.
 */
export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  if (!adminUser) {
    return unauthorized()
  }

  const parsed = await parseBody(blokkeerSchema, req)
  if (!parsed.ok) return parsed.response
  const { userId, blocked } = parsed.data

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
    return serverError(error, 'admin-users-block:POST')
  }

  // De audit-regel direct na de toestandswijziging, vóór de ban: ook als de ban
  // daarna faalt, staat de (de)blokkade in het spoor (eindreview 0.92.29). Een
  // tweede regel bij een nieuwe poging is onschuldig.
  await logAdminAction(service, {
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: blocked ? 'user.block' : 'user.unblock',
    targetUser: userId,
    targetLabel: target.full_name ?? userId,
  })

  const { error: banFout } = await service.auth.admin.updateUserById(userId, {
    ban_duration: blocked ? BLOKKADE_BAN_DUUR : 'none',
  })
  if (banFout) {
    return serverError(banFout, 'admin-users-block:POST:ban')
  }

  return NextResponse.json({ success: true, blockedAt })
}
