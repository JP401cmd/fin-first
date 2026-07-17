import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('budgeting_active')
      .eq('id', user.id)
      .single()

    if (error) {
      // Column may not exist yet before migration — default to true
      if (error.message.includes('does not exist')) {
        return Response.json({ budgeting_active: true })
      }
      return serverError(error, 'budgeting-active:GET')
    }
    return Response.json({ budgeting_active: (data as Record<string, unknown>)?.budgeting_active ?? true })
  } catch {
    return Response.json({ budgeting_active: true })
  }
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await req.json()
  const active = body.budgeting_active === true

  const { error } = await supabase
    .from('profiles')
    .update({ budgeting_active: active })
    .eq('id', user.id)

  if (error) return serverError(error, 'budgeting-active:PUT')
  return Response.json({ success: true, budgeting_active: active })
}
