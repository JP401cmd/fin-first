import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_SPLIT_MODES = ['equal', 'income_ratio', 'custom', 'one_carries_all'] as const

/**
 * GET /api/household/settings
 * Returns household settings including split mode.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Find user's household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  const { data: household } = await supabase
    .from('households')
    .select('id, name, split_mode, custom_split_pct, primary_payer_id, created_by')
    .eq('id', membership.household_id)
    .single()

  if (!household) {
    return NextResponse.json({ error: 'Huishouden niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({
    householdId: household.id,
    name: household.name,
    splitMode: household.split_mode,
    customSplitPct: household.custom_split_pct,
    primaryPayerId: household.primary_payer_id,
    myRole: membership.role,
    isOwner: membership.role === 'owner',
  })
}

/**
 * PATCH /api/household/settings
 * Update household split mode and related settings.
 * Only the household owner can update settings.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const { splitMode, customSplitPct, primaryPayerId } = body

  // Find user's household and verify ownership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'Alleen de eigenaar kan instellingen wijzigen' }, { status: 403 })
  }

  // Validate split mode
  if (splitMode && !VALID_SPLIT_MODES.includes(splitMode)) {
    return NextResponse.json(
      { error: `Ongeldige verdeling. Kies uit: ${VALID_SPLIT_MODES.join(', ')}` },
      { status: 400 },
    )
  }

  // Validate custom split percentage
  if (splitMode === 'custom' && (customSplitPct === undefined || customSplitPct === null)) {
    return NextResponse.json(
      { error: 'Aangepast percentage is verplicht bij custom verdeling' },
      { status: 400 },
    )
  }

  if (customSplitPct !== undefined && customSplitPct !== null) {
    const pct = Number(customSplitPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return NextResponse.json(
        { error: 'Percentage moet tussen 0 en 100 liggen' },
        { status: 400 },
      )
    }
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (splitMode) updates.split_mode = splitMode
  if (customSplitPct !== undefined) updates.custom_split_pct = customSplitPct
  if (primaryPayerId !== undefined) updates.primary_payer_id = primaryPayerId

  const { error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', membership.household_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Huishouden-instellingen bijgewerkt',
    splitMode: splitMode ?? undefined,
    customSplitPct: customSplitPct ?? undefined,
    primaryPayerId: primaryPayerId ?? undefined,
  })
}
