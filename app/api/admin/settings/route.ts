import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? '***' : ''
  return key.slice(0, 7) + '***' + key.slice(-4)
}

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings: Record<string, string | object> = {}
  for (const row of data ?? []) {
    if (row.key === 'anthropic_api_key' || row.key === 'openai_api_key') {
      settings[row.key] = row.value ? maskApiKey(row.value) : ''
    } else if (row.key === 'feature_phase_matrix') {
      try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
    } else {
      settings[row.key] = row.value
    }
  }

  return NextResponse.json(settings)
}

const ALLOWED_KEYS = [
  'ai_provider',
  'ai_model_anthropic',
  'ai_model_openai',
  'anthropic_api_key',
  'openai_api_key',
  'ai_system_prompt_override',
  'feature_phase_matrix',
]

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  for (const key of ALLOWED_KEYS) {
    if (!(key in body)) continue
    let value = body[key]

    // Don't overwrite API keys if the masked value is sent back
    if ((key === 'anthropic_api_key' || key === 'openai_api_key') && typeof value === 'string' && value.includes('***')) {
      continue
    }

    // Stringify object values (e.g. feature_phase_matrix)
    if (typeof value === 'object' && value !== null) {
      value = JSON.stringify(value)
    }

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
