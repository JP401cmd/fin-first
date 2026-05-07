import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FP_KEY = 'retirement_aspirations'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })

  const fp = (data?.feature_preferences ?? {}) as Record<string, unknown>
  const aspirations = fp[FP_KEY] ?? null
  return NextResponse.json({ aspirations })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const aspirations = (body as { aspirations?: unknown })?.aspirations
  if (!aspirations || typeof aspirations !== 'object' || Array.isArray(aspirations)) {
    return NextResponse.json({ error: 'aspirations moet een object zijn' }, { status: 400 })
  }

  // Merge: lees huidige feature_preferences, overschrijf alleen onze key.
  const { data: current, error: readErr } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  if (readErr) {
    return NextResponse.json({ error: 'Fout bij laden profiel' }, { status: 500 })
  }

  const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
  fp[FP_KEY] = aspirations

  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ feature_preferences: fp })
    .eq('id', user.id)

  if (writeErr) {
    return NextResponse.json({ error: 'Opslaan mislukt', details: writeErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
