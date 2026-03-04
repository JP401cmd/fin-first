import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import type { BriefingDirective, FunctionalDirective } from '@/lib/briefing/directives'

function parseJsonSetting<T>(value: string | null | undefined): T[] {
  if (!value) return []
  try { return JSON.parse(value) } catch { return [] }
}

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['briefing_directives', 'briefing_functional_directives'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return NextResponse.json({
    directives: parseJsonSetting<BriefingDirective>(map.briefing_directives),
    functionalDirectives: parseJsonSetting<FunctionalDirective>(map.briefing_functional_directives),
  })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()
  const ts = new Date().toISOString()

  // Save temporal directives
  if ('directives' in body) {
    if (!Array.isArray(body.directives)) {
      return NextResponse.json({ error: 'directives must be an array' }, { status: 400 })
    }
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: 'briefing_directives', value: JSON.stringify(body.directives), updated_at: ts, updated_by: user?.id },
        { onConflict: 'key' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Save functional directives
  if ('functionalDirectives' in body) {
    if (!Array.isArray(body.functionalDirectives)) {
      return NextResponse.json({ error: 'functionalDirectives must be an array' }, { status: 400 })
    }
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: 'briefing_functional_directives', value: JSON.stringify(body.functionalDirectives), updated_at: ts, updated_by: user?.id },
        { onConflict: 'key' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
