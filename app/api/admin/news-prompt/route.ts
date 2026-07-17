import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'news_system_prompt')
    .maybeSingle()

  if (error) {
    return serverError(error, 'admin-news-prompt:GET')
  }

  return NextResponse.json({ prompt: data?.value ?? null })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  if (typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt must be a string' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: 'news_system_prompt',
        value: body.prompt,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'admin-news-prompt:PUT')
  }

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .eq('key', 'news_system_prompt')

  if (error) {
    return serverError(error, 'admin-news-prompt:DELETE')
  }

  return NextResponse.json({ success: true })
}
