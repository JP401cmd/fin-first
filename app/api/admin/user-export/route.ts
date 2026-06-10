import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * GET /api/admin/user-export?userId=...&label=... — AVG-export (inzageverzoek):
 * de financiële kerndata van één gebruiker als JSON-download. Superadmin-only;
 * de export wordt gelogd in de audit-trail (data.export). Leest via de
 * superadmin-RLS op de financiële tabellen.
 *
 * NB: dekt profiel + bezittingen + schulden + transacties (de financiële kern).
 * Een volledige export over álle tabellen volgt hetzelfde patroon.
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

  const [profileRes, assetsRes, debtsRes, txRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('assets').select('*').eq('user_id', userId),
    supabase.from('debts').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profileRes.data ?? null,
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
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
