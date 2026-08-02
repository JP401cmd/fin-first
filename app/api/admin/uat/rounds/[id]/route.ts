import { NextResponse } from 'next/server'
import { forbidden, badRequest, notFound } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

/**
 * PATCH /api/admin/uat/rounds/[id] — sluit of heropen een UAT-testronde.
 * Body: { action: 'close' | 'reopen', notes?: string }.
 * 'close' zet closed_at=now() (de ronde wordt read-only voor /api/admin/uat/results);
 * 'reopen' zet closed_at=null. `notes` wordt — indien meegegeven — overschreven,
 * zodat het go/no-go-oordeel van het sluitmoment als snapshot vastligt (§3.5).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json().catch(() => null)
  const action = body?.action
  if (action !== 'close' && action !== 'reopen') {
    return badRequest("action moet 'close' of 'reopen' zijn")
  }

  const updates: Record<string, unknown> = {
    closed_at: action === 'close' ? new Date().toISOString() : null,
  }
  if (typeof body?.notes === 'string') {
    updates.notes = body.notes
  }

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('uat_rounds')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    // Een mislukte update betekent hier in de praktijk 'ronde bestaat niet'
    // (.single() faalt op 0 rijen); de echte DB-fout blijft server-side.
    console.error('[api/admin/uat/rounds/[id]] PATCH bijwerken mislukte', error)
    return notFound('Ronde niet gevonden')
  }

  return NextResponse.json({ round: data })
}
