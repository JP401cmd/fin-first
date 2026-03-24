import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * PUT /api/invulfase/skip — Toggle skip state for a checklist item.
 *
 * Body: { key: string, skipped: boolean }
 * Stores in profiles.feature_preferences._invulfase_skipped (string[])
 */
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { key?: string; skipped?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }

  if (typeof body.key !== 'string' || typeof body.skipped !== 'boolean') {
    return NextResponse.json(
      { error: 'key (string) en skipped (boolean) zijn verplicht' },
      { status: 400 },
    )
  }

  // Read current feature_preferences
  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const currentPrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const currentSkipped = Array.isArray(currentPrefs._invulfase_skipped)
    ? (currentPrefs._invulfase_skipped as string[])
    : []

  // Update skipped array
  let newSkipped: string[]
  if (body.skipped) {
    newSkipped = currentSkipped.includes(body.key)
      ? currentSkipped
      : [...currentSkipped, body.key]
  } else {
    newSkipped = currentSkipped.filter(k => k !== body.key)
  }

  const updatedPrefs = { ...currentPrefs, _invulfase_skipped: newSkipped }

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: updatedPrefs })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ skipped: newSkipped })
}
