import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

const AI_FEATURE_KEYS = ['news_max_refreshes_per_week'] as const

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', AI_FEATURE_KEYS as unknown as string[])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  return NextResponse.json(settings)
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  for (const key of AI_FEATURE_KEYS) {
    if (!(key in body)) continue
    const value = String(body[key])

    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString(), updated_by: user?.id },
        { onConflict: 'key' }
      )

    if (error) {
      return NextResponse.json({ error: `Failed to update ${key}: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
