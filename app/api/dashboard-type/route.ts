import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('profiles')
      .select('dashboard_type')
      .eq('id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({ dashboard_type: data.dashboard_type ?? 'widgets' })
  } catch (err) {
    console.error('[dashboard-type GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { dashboard_type } = body

    if (dashboard_type !== 'widgets' && dashboard_type !== 'briefing') {
      return NextResponse.json({ error: 'Invalid dashboard_type' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ dashboard_type })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true, dashboard_type })
  } catch (err) {
    console.error('[dashboard-type PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
