import { NextResponse } from 'next/server'
import { unauthorized, forbidden, badRequest } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * GET /api/admin/user-diagnose?userId=...&label=... — financiële kerndata van
 * één gebruiker, voor support-debugging. Superadmin-only; ELKE inzage wordt in
 * de audit-trail gelogd (support.view). Leest via de service-role-client —
 * RLS geeft interactieve sessies bewust geen cross-user leesrecht.
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
  if (!userId) {
    return badRequest('userId is vereist')
  }
  const label = searchParams.get('label') || userId

  const service = getServiceClient()
  const [assetsRes, debtsRes, txCountRes, lastTxRes] = await Promise.all([
    service
      .from('assets')
      .select('asset_type, name, current_value, net_worth_inclusion_pct')
      .eq('user_id', userId)
      .eq('is_active', true),
    service
      .from('debts')
      .select('current_balance, net_worth_inclusion_pct')
      .eq('user_id', userId)
      .eq('is_active', true),
    service.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    service.from('transactions').select('date').eq('user_id', userId).order('date', { ascending: false }).limit(1),
  ])

  type AssetRow = { asset_type: string | null; name: string | null; current_value: number | string; net_worth_inclusion_pct: number | null }
  type DebtRow = { current_balance: number | string; net_worth_inclusion_pct: number | null }
  const assets = (assetsRes.data ?? []) as AssetRow[]
  const debts = (debtsRes.data ?? []) as DebtRow[]

  const assetTotal = assets.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const debtTotal = debts.reduce((s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const cashAccounts = assets
    .filter((a) => a.asset_type === 'cash')
    .map((a) => ({ name: a.name ?? 'Naamloos', value: Number(a.current_value) }))

  const diagnose = {
    assetCount: assets.length,
    assetTotal,
    debtCount: debts.length,
    debtTotal,
    netWorth: assetTotal - debtTotal,
    cashAccounts,
    txCount: txCountRes.count ?? 0,
    lastTxDate: (lastTxRes.data?.[0]?.date as string | undefined) ?? null,
  }

  // Audit: leg de inzage vast (wie keek wanneer naar wiens data).
  await logAdminAction(supabase, {
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'support.view',
    targetUser: userId,
    targetLabel: label,
  })

  return NextResponse.json(diagnose)
}
