import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { DEFAULT_TIER_MATRIX, type TierFeatureMatrix } from '@/lib/tier-config'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  // Load tier feature matrix from app_settings
  const { data: matrixRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'tier_feature_matrix')
    .maybeSingle()

  let matrix: TierFeatureMatrix = DEFAULT_TIER_MATRIX
  if (matrixRow?.value) {
    try {
      const parsed = JSON.parse(matrixRow.value)
      if (parsed && typeof parsed === 'object') {
        matrix = { ...DEFAULT_TIER_MATRIX, ...parsed }
      }
    } catch {
      // use defaults
    }
  }

  // Get user counts per tier
  const { data: tierCounts } = await supabase
    .from('profiles')
    .select('commercial_tier')

  const counts: Record<string, number> = { gratis: 0, connected: 0, ai: 0 }
  const total = tierCounts?.length ?? 0
  for (const row of tierCounts ?? []) {
    const tier = (row.commercial_tier as string) ?? 'gratis'
    counts[tier] = (counts[tier] ?? 0) + 1
  }

  return NextResponse.json({ matrix, counts, total })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { matrix } = body as { matrix: TierFeatureMatrix }

  if (!matrix || typeof matrix !== 'object') {
    return NextResponse.json({ error: 'Invalid matrix' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: 'tier_feature_matrix',
        value: JSON.stringify(matrix),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' }
    )

  if (error) {
    return serverError(error, 'admin-tier-config:PUT')
  }

  return NextResponse.json({ success: true })
}
