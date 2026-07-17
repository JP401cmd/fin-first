import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

const CATEGORIES = ['bug', 'idea', 'question', 'other']

/** POST /api/feedback — gebruiker stuurt feedback in. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const message = String(body.message ?? '').trim().slice(0, 4000)
  const category = CATEGORIES.includes(body.category) ? body.category : 'other'
  if (!message) {
    return NextResponse.json({ error: 'Bericht is verplicht' }, { status: 400 })
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    email: user.email,
    category,
    message,
  })
  if (error) {
    return serverError(error, 'feedback:POST')
  }

  return NextResponse.json({ ok: true })
}
