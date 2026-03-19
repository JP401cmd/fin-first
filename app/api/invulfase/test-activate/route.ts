import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const INVULFASE_KEY = '_invulfase_active'

/**
 * GET /api/invulfase/test-activate — Test helper to activate invulfase.
 * Sets _invulfase_active = true in feature_preferences.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Read current feature_preferences
  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const currentPrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const updatedPrefs = { ...currentPrefs, [INVULFASE_KEY]: true }

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: updatedPrefs })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ activated: true, userId: user.id })
}
