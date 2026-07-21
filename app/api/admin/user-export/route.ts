import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { ADMIN_EXPORT_TABLES } from '@/lib/user-data-tables'

/**
 * GET /api/admin/user-export?userId=...&label=... — AVG-inzageverzoek: de
 * VOLLEDIGE data van één gebruiker als JSON-download. Superadmin-only; de export
 * wordt gelogd in de audit-trail (data.export). Leest via de service-role-client —
 * RLS geeft interactieve sessies bewust geen cross-user leesrecht.
 *
 * Dekt profiel + álle persoonlijke user-tabellen (ADMIN_EXPORT_TABLES, de single
 * source uit lib/user-data-tables.ts — dezelfde lijst die de wipe bewaakt, zodat
 * export en verwijdering niet wegdriften). Dit is de exhaustieve variant naast de
 * zelf-service-export (/api/account/export).
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const {
    data: { user: admin },
  } = await supabase.auth.getUser()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId is vereist' }, { status: 400 })
  }
  const label = searchParams.get('label') || userId

  const service = getServiceClient()

  const profileRes = await service.from('profiles').select('*').eq('id', userId).maybeSingle()

  // Volledige persoonlijke tabellen-set via service-role (RLS omzeild, bewust).
  const tableResults = await Promise.all(
    ADMIN_EXPORT_TABLES.map(async (table) => {
      const { data } = await service.from(table).select('*').eq('user_id', userId)
      return [table, data ?? []] as const
    }),
  )
  const tables: Record<string, unknown> = {}
  for (const [table, rows] of tableResults) {
    tables[table] = rows
  }

  const payload = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profileRes.data ?? null,
    tables,
  }

  await logAdminAction(supabase, {
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'data.export',
    targetUser: userId,
    targetLabel: label,
  })

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="trifinity-export-${userId.slice(0, 8)}.json"`,
    },
  })
}
