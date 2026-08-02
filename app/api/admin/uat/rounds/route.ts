import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

/**
 * GET /api/admin/uat/rounds — lijst alle UAT-testrondes, nieuwste eerst.
 * POST /api/admin/uat/rounds — start een nieuwe testronde.
 *
 * Superadmin-only (Deel 3 §3.4 van docs/uat/uat-plan.md): géén anon-policies
 * op uat_rounds/uat_results, dus alle IO loopt hier via de service-role-client.
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('uat_rounds')
    .select('*')
    .order('started_at', { ascending: false })

  if (error) {
    return serverError(error, 'admin-uat-rounds:GET', 'Databasefout')
  }

  return NextResponse.json({ rounds: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const body = await req.json().catch(() => null)
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  const environment = typeof body?.environment === 'string' ? body.environment.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes : null

  if (!label || !environment) {
    return badRequest('label en environment zijn verplicht')
  }

  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokaal-dev'

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('uat_rounds')
    .insert({
      label,
      environment,
      notes,
      app_version: appVersion,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return serverError(error, 'admin-uat-rounds:POST', 'Databasefout')
  }

  return NextResponse.json({ round: data })
}
