import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { HORIZON_V2_FLAG, isHorizonV2Enabled } from '@/lib/horizon-engine/flag'

/**
 * Per-gebruiker toggle voor de grootboek-engine v2 op /toekomst.
 * Schrijft `profiles.feature_preferences.horizon_engine_v2`. **Default AAN sinds de
 * cutover (C3); een expliciete `false` is de opt-out.** Alleen de eigen rij; raakt
 * geen andere gebruikers. Omkeerbaar.
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
  // Default-aware (default AAN): consistent met isHorizonV2Enabled.
  return NextResponse.json({ enabled: isHorizonV2Enabled(data as { feature_preferences?: Record<string, unknown> | null }) })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: { enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  const enabled = body.enabled === true

  const { data } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
  const fp = { ...((data?.feature_preferences ?? {}) as Record<string, unknown>), [HORIZON_V2_FLAG]: enabled }

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, feature_preferences: fp, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  return NextResponse.json({ enabled })
}
