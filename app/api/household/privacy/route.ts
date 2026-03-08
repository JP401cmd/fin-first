import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Privacy categories and valid visibility levels
 */
const PRIVACY_CATEGORIES = ['vermogen', 'schulden', 'budgetten', 'transacties', 'inkomen'] as const
type PrivacyCategory = typeof PRIVACY_CATEGORIES[number]
type PrivacyLevel = 'volledig' | 'totalen' | 'verborgen'
const VALID_LEVELS: PrivacyLevel[] = ['volledig', 'totalen', 'verborgen']

const DEFAULT_PRIVACY: Record<PrivacyCategory, PrivacyLevel> = {
  vermogen: 'totalen',
  schulden: 'totalen',
  budgetten: 'totalen',
  transacties: 'totalen',
  inkomen: 'totalen',
}

/**
 * GET /api/household/privacy
 * Returns the current user's privacy settings for their household.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Find user's household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role, privacy_settings')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  // Use stored privacy_settings or fall back to app_settings
  let privacySettings = membership.privacy_settings

  // If privacy_settings column doesn't exist yet, try app_settings fallback
  if (!privacySettings) {
    const { data: appSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `household_privacy:${user.id}`)
      .single()

    privacySettings = appSetting?.value ?? DEFAULT_PRIVACY
  }

  return NextResponse.json({
    householdId: membership.household_id,
    privacySettings: privacySettings,
    defaults: DEFAULT_PRIVACY,
  })
}

/**
 * PATCH /api/household/privacy
 * Update the current user's privacy settings.
 * Each user controls what their partner can see.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const { privacySettings } = body

  if (!privacySettings || typeof privacySettings !== 'object') {
    return NextResponse.json({ error: 'Ongeldige privacy-instellingen' }, { status: 400 })
  }

  // Validate all categories and levels
  for (const cat of PRIVACY_CATEGORIES) {
    if (!(cat in privacySettings)) {
      return NextResponse.json(
        { error: `Ontbrekende categorie: ${cat}` },
        { status: 400 },
      )
    }
    if (!VALID_LEVELS.includes(privacySettings[cat])) {
      return NextResponse.json(
        { error: `Ongeldig niveau voor ${cat}: ${privacySettings[cat]}. Kies uit: ${VALID_LEVELS.join(', ')}` },
        { status: 400 },
      )
    }
  }

  // Find user's household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('id, household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  // Try to update household_members.privacy_settings column first
  const { error: memberError } = await supabase
    .from('household_members')
    .update({ privacy_settings: privacySettings })
    .eq('id', membership.id)

  if (memberError) {
    // Fallback: store in app_settings if column doesn't exist
    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert({
        key: `household_privacy:${user.id}`,
        value: privacySettings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Privacy-instellingen opgeslagen',
    privacySettings,
  })
}
