import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { DEFAULT_EXTRACTION_PROMPT } from '@/lib/ai/extraction-system-prompt'

// ── GET — Return the current extraction prompt (override or default) ──

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'extraction_system_prompt')
    .maybeSingle()

  if (error) {
    return serverError(error, 'admin-extraction-prompt:GET')
  }

  return NextResponse.json({
    prompt: data?.value ?? DEFAULT_EXTRACTION_PROMPT,
    isOverride: !!data?.value,
    defaultPrompt: DEFAULT_EXTRACTION_PROMPT,
  })
}

// ── PUT — Override the extraction prompt ──────────────────────────

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
        key: 'extraction_system_prompt',
        value: body.prompt,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'admin-extraction-prompt:PUT')
  }

  return NextResponse.json({ success: true })
}

// ── DELETE — Reset to the hardcoded default ──────────────────────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .eq('key', 'extraction_system_prompt')

  if (error) {
    return serverError(error, 'admin-extraction-prompt:DELETE')
  }

  return NextResponse.json({ success: true })
}
