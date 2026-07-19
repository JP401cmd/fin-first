import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export type Perspective = 'personal' | 'household' | 'partner'

/**
 * GET /api/perspective
 * Returns the user's current selected perspective and household info.
 */
export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  let selectedPerspective: Perspective = 'personal'
  let householdType = 'solo'

  // First try with selected_perspective column
  const { data: profileFull, error: fullError } = await supabase
    .from('profiles')
    .select('household_type, selected_perspective')
    .eq('id', claims.sub)
    .single()

  if (!fullError && profileFull) {
    householdType = profileFull.household_type ?? 'solo'
    const stored = (profileFull as Record<string, unknown>).selected_perspective as string | null
    if (stored && ['personal', 'household', 'partner'].includes(stored)) {
      selectedPerspective = stored as Perspective
    }
  } else {
    // Fallback: column might not exist, try without it
    const { data: profileBasic } = await supabase
      .from('profiles')
      .select('household_type')
      .eq('id', claims.sub)
      .single()

    if (profileBasic) {
      householdType = profileBasic.household_type ?? 'solo'
    }
  }

  const isHousehold = householdType === 'samen' || householdType === 'gezin'

  // Check if household tables exist and if user has a household
  let hasHousehold = false
  let partnerName: string | null = null

  const { data: members, error: membersError } = await supabase
    .from('household_members')
    .select('user_id, role')

  if (!membersError && members && members.length > 0) {
    hasHousehold = true

    // Try to get partner's name
    const partnerId = members.find((m: { user_id: string }) => m.user_id !== claims.sub)?.user_id
    if (partnerId) {
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', partnerId)
        .single()
      partnerName = partnerProfile?.full_name ?? null
    }
  }

  // Available perspectives depend on household status
  const availablePerspectives: Array<{ id: Perspective; label: string; description: string }> = [
    {
      id: 'personal',
      label: 'Persoonlijk',
      description: 'Alleen jouw financiën',
    },
  ]

  if (isHousehold || hasHousehold) {
    availablePerspectives.push({
      id: 'household',
      label: 'Huishouden',
      description: 'Gecombineerd overzicht',
    })
    availablePerspectives.push({
      id: 'partner',
      label: partnerName ?? 'Partner',
      description: 'Overzicht van je partner',
    })
  }

  // If current perspective is not available, reset to personal
  if (!availablePerspectives.find(p => p.id === selectedPerspective)) {
    selectedPerspective = 'personal'
  }

  return NextResponse.json({
    selectedPerspective,
    availablePerspectives,
    householdType,
    isHousehold: isHousehold || hasHousehold,
    hasHousehold,
    partnerName,
  })
}

/**
 * PATCH /api/perspective
 * Update the user's selected perspective.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const body = await request.json()
  const { perspective } = body

  if (!perspective || !['personal', 'household', 'partner'].includes(perspective)) {
    return NextResponse.json(
      { error: 'Ongeldige perspectief. Kies uit: personal, household, partner' },
      { status: 400 }
    )
  }

  // Try to update selected_perspective in profiles
  const { error } = await supabase
    .from('profiles')
    .update({
      selected_perspective: perspective,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    // If column doesn't exist, return success with localStorage fallback hint
    if (error.message.includes('does not exist')) {
      return NextResponse.json({
        selectedPerspective: perspective,
        stored: false,
        fallback: 'localStorage',
        message: 'Perspectief voorkeurskolom bestaat nog niet. Voorkeur wordt lokaal opgeslagen.',
      })
    }
    return serverError(error, 'perspective:PATCH')
  }

  return NextResponse.json({
    selectedPerspective: perspective,
    stored: true,
    message: 'Perspectief voorkeur opgeslagen.',
  })
}
