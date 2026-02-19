import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = await isGoCardlessEnabled(supabase)
  return NextResponse.json({ enabled })
}
