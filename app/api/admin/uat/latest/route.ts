import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

/**
 * GET /api/admin/uat/latest — de laatst bekende status per instantie
 * (scenario_id, sub, platform) over ÁLLE testrondes samen.
 *
 * Geen enkele ronde is hier de bron: per instantie wint de meest recente
 * registratie (op tested_at), zodat de plaat een doorlopend "laatst bekend"-
 * overzicht toont in plaats van de resultaten van één ronde. De antwoordvorm is
 * gelijk aan /api/admin/uat/results ({ results }) zodat de client dezelfde
 * plaat/kopband/go-no-go eroverheen kan leggen. Superadmin-only, service-role-
 * client (ADR 0006).
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('uat_results')
    .select('*')
    .order('tested_at', { ascending: true })

  if (error) {
    console.error('[api/admin/uat/latest] GET resultaten ophalen mislukte', error)
    return NextResponse.json({ error: 'Databasefout' }, { status: 500 })
  }

  // Laatste registratie per (scenario_id, sub, platform) wint: door oplopend op
  // tested_at te itereren overschrijft elke nieuwere registratie de oudere, dus
  // na de loop bevat de map per instantie de meest recente rij.
  const latestByKey = new Map<string, (typeof data)[number]>()
  for (const row of data ?? []) {
    latestByKey.set(`${row.scenario_id}|${row.sub}|${row.platform}`, row)
  }

  return NextResponse.json({ results: [...latestByKey.values()] })
}
