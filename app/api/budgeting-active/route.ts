import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ budgeting_active: (data as Record<string, unknown>)?.budgeting_active ?? true })
  } catch {
    return Response.json({ budgeting_active: true })
  }
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const active = body.budgeting_active === true

  const { error } = await supabase
    .from('profiles')
    .update({ budgeting_active: active })
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true, budgeting_active: active })
}
