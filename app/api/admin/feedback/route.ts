import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  const { data } = await supabase
    .from('feedback')
    .select('id, email, category, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  return NextResponse.json({ items: data ?? [] })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  const body = await req.json().catch(() => ({}))
  const id = body.id as string | undefined
  const status = body.status === 'reviewed' ? 'reviewed' : 'new'
  if (!id) {
    return NextResponse.json({ error: 'id is vereist' }, { status: 400 })
  }
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id)
  if (error) {
    return serverError(error, 'admin-feedback:PATCH')
  }
  return NextResponse.json({ ok: true, status })
}
