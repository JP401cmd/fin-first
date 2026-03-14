import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { UNIFIED_FEATURES } from '@/lib/feature-registry'
import type { PhaseId } from '@/lib/feature-registry'

const VALID_PHASES: PhaseId[] = ['recovery', 'stability', 'momentum', 'mastery']

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'unified_feature_matrix')
    .maybeSingle()

  let overrides: Record<string, { unlockPhase?: string }> = {}
  if (data?.value) {
    try {
      overrides = JSON.parse(data.value)
    } catch {
      // keep empty
    }
  }

  // Return unified features with any admin overrides applied
  const features = UNIFIED_FEATURES.map(f => ({
    ...f,
    effectivePhase: overrides[f.id]?.unlockPhase ?? f.defaultPhase,
    hasOverride: !!overrides[f.id],
  }))

  return NextResponse.json({ features, overrides })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const overrides = body.overrides as Record<string, { unlockPhase?: string }> | undefined

  if (!overrides || typeof overrides !== 'object') {
    return NextResponse.json({ error: 'Invalid overrides' }, { status: 400 })
  }

  // Validate overrides
  const validatedOverrides: Record<string, { unlockPhase: string }> = {}
  for (const [featureId, override] of Object.entries(overrides)) {
    const feat = UNIFIED_FEATURES.find(f => f.id === featureId)
    if (!feat) continue // ignore unknown features

    if (override.unlockPhase && VALID_PHASES.includes(override.unlockPhase as PhaseId)) {
      // Only store if different from default
      if (override.unlockPhase !== feat.defaultPhase) {
        validatedOverrides[featureId] = { unlockPhase: override.unlockPhase }
      }
    }
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: 'unified_feature_matrix',
        value: JSON.stringify(validatedOverrides),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, overrides: validatedOverrides })
}
