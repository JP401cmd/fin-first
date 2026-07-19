import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Types ────────────────────────────────────────────────────────────

type PartnerNotifMode = 'all_shared' | 'threshold' | 'categories' | 'disabled'

interface PartnerNotifPrefs {
  mode: PartnerNotifMode
  threshold: number
  categories: string[]
}

const DEFAULT_PREFS: PartnerNotifPrefs = {
  mode: 'all_shared',
  threshold: 100,
  categories: [],
}

const VALID_MODES: PartnerNotifMode[] = ['all_shared', 'threshold', 'categories', 'disabled']

// ── GET — Load partner notification preferences ─────────────────────

export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `partner_notif_prefs_${claims.sub}`)
      .maybeSingle()

    if (data?.value) {
      const parsed = JSON.parse(data.value) as PartnerNotifPrefs
      return NextResponse.json({
        mode: parsed.mode || DEFAULT_PREFS.mode,
        threshold: parsed.threshold ?? DEFAULT_PREFS.threshold,
        categories: parsed.categories || DEFAULT_PREFS.categories,
      })
    }

    return NextResponse.json(DEFAULT_PREFS)
  } catch (err) {
    console.error('Partner notification prefs GET error:', err)
    return NextResponse.json({ error: 'Fout bij laden voorkeuren' }, { status: 500 })
  }
}

// ── PUT — Save partner notification preferences ─────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { mode, threshold, categories } = body as Partial<PartnerNotifPrefs>

    // Validate mode
    const safeMode = VALID_MODES.includes(mode as PartnerNotifMode)
      ? (mode as PartnerNotifMode)
      : DEFAULT_PREFS.mode

    // Validate threshold
    const safeThreshold = typeof threshold === 'number' && threshold >= 0
      ? Math.round(threshold)
      : DEFAULT_PREFS.threshold

    // Validate categories (array of strings)
    const safeCategories = Array.isArray(categories)
      ? categories.filter((c): c is string => typeof c === 'string')
      : DEFAULT_PREFS.categories

    const prefs: PartnerNotifPrefs = {
      mode: safeMode,
      threshold: safeThreshold,
      categories: safeCategories,
    }

    await supabase
      .from('app_settings')
      .upsert(
        {
          key: `partner_notif_prefs_${user.id}`,
          value: JSON.stringify(prefs),
        },
        { onConflict: 'key' }
      )

    return NextResponse.json({ success: true, ...prefs })
  } catch (err) {
    console.error('Partner notification prefs PUT error:', err)
    return NextResponse.json({ error: 'Fout bij opslaan voorkeuren' }, { status: 500 })
  }
}
