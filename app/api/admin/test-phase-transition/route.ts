import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

const VALID_PHASES = ['recovery', 'stability', 'momentum', 'mastery']

export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { oldPhase } = await req.json()

  if (oldPhase !== null && (!oldPhase || !VALID_PHASES.includes(oldPhase))) {
    return Response.json({ error: 'Ongeldige fase' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ last_known_phase: oldPhase })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
