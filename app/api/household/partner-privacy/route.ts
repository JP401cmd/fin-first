import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { normalisePrivacySettings, type PrivacySettings } from '@/lib/household-data'

/**
 * GET /api/household/partner-privacy
 *
 * Returns the PARTNER's privacy settings — i.e., what the partner allows
 * the current user to see. This is used by client-side pages to filter
 * out partner data that should be hidden or aggregated.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Find household members
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, privacy_settings')

  if (!members || members.length < 2) {
    return NextResponse.json({
      hasPartner: false,
      partnerPrivacy: null,
    })
  }

  const partnerMember = members.find(m => m.user_id !== claims.sub)
  if (!partnerMember) {
    return NextResponse.json({
      hasPartner: false,
      partnerPrivacy: null,
    })
  }

  // Get partner's privacy settings
  let partnerPrivacy: PrivacySettings
  const rawPrivacy = partnerMember.privacy_settings as Record<string, string> | null

  if (rawPrivacy) {
    partnerPrivacy = normalisePrivacySettings(rawPrivacy)
  } else {
    // Fallback: try app_settings
    const { data: appSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `household_privacy:${partnerMember.user_id}`)
      .single()
    partnerPrivacy = normalisePrivacySettings(appSetting?.value ?? null)
  }

  // Determine which categories are hidden
  const hiddenCategories = (Object.entries(partnerPrivacy) as [keyof PrivacySettings, string][])
    .filter(([, level]) => level === 'hidden')
    .map(([cat]) => cat)

  return NextResponse.json({
    hasPartner: true,
    partnerPrivacy,
    hiddenCategories,
  })
}
