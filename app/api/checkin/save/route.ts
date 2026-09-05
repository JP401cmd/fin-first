import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export interface CheckinSnapshot {
  reflection: string
  monthKey: string
  savedAt: string
  userId: string
  userName: string | null
  householdId: string | null
  metrics: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlySavings: number
    completedActions: number
    activeGoals: number
    fireAge: number | null
  }
  details?: {
    netWorthChange?: number
    freedomDaysWon?: number
    /** De maand waar de terugblik van deze check-in over ging, met zijn eigen
     *  vergelijkingsbasis. `metrics` hierboven draagt de LOPENDE maand op het
     *  moment van opslaan; deze velden de afgeronde maand ervoor (B-016). */
    prevMonthIncome?: number
    prevMonthExpenses?: number
    prevMonthSavings?: number
    monthBeforePrevExpenses?: number
    assets?: { name: string; type: string; value: number }[]
    debts?: { name: string; type: string; balance: number }[]
    goals?: { name: string; current: number; target: number; completed: boolean; icon?: string | null }[]
    budgets?: { name: string; icon: string | null; limit: number; spent: number }[]
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { reflection, monthKey, metrics, details } = body

  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const key = `checkin_snapshot_${user.id}_${monthStr}`

  // Fetch user profile name + household membership in parallel
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('household_members').select('household_id').eq('user_id', user.id).maybeSingle(),
  ])

  const userName = profileRes.data?.full_name || null
  const householdId = membershipRes.data?.household_id || null

  const snapshot: CheckinSnapshot = {
    reflection: reflection || '',
    monthKey: monthKey || '',
    savedAt: now.toISOString(),
    userId: user.id,
    userName,
    householdId,
    metrics: metrics || {
      netWorth: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlySavings: 0,
      completedActions: 0,
      activeGoals: 0,
      fireAge: null,
    },
    details: details || undefined,
  }

  // Save personal snapshot
  await supabase
    .from('app_settings')
    .upsert(
      {
        key,
        value: JSON.stringify(snapshot),
        updated_by: user.id,
      },
      { onConflict: 'key' }
    )

  // If user is in a household, also save a household-scoped copy so partner can see it
  if (householdId) {
    const householdKey = `checkin_household_${householdId}_${user.id}_${monthStr}`
    await supabase
      .from('app_settings')
      .upsert(
        {
          key: householdKey,
          value: JSON.stringify(snapshot),
          updated_by: user.id,
        },
        { onConflict: 'key' }
      )
  }

  return NextResponse.json({ ok: true })
}

// GET — Load previous check-in snapshot for deltas, and optionally full history
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode') // 'history' returns all check-ins for both partners

  if (mode === 'history') {
    return handleHistory(supabase, claims.sub)
  }

  // Single month snapshot lookup (for read-only view)
  const month = searchParams.get('month')
  if (month) {
    const snapshotKey = `checkin_snapshot_${claims.sub}_${month}`
    const { data: snapshot } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', snapshotKey)
      .maybeSingle()
    if (!snapshot?.value) return NextResponse.json({ found: false, snapshot: null })
    try {
      return NextResponse.json({ found: true, snapshot: JSON.parse(snapshot.value) })
    } catch {
      return NextResponse.json({ found: false, snapshot: null })
    }
  }

  // Default: find previous snapshot for delta display
  const now = new Date()
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentKey = `checkin_snapshot_${claims.sub}_${currentMonthStr}`

  // Fetch all snapshots for this user (up to 12)
  const { data: snapshots } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('updated_by', claims.sub)
    .like('key', `checkin_snapshot_${claims.sub}_%`)
    .order('key', { ascending: false })
    .limit(12)

  // Find the previous snapshot (not current month)
  const previous = (snapshots || []).find(s => s.key !== currentKey)

  if (!previous) {
    return NextResponse.json({ hasPrevious: false, previous: null })
  }

  try {
    const parsed = JSON.parse(previous.value) as CheckinSnapshot
    return NextResponse.json({ hasPrevious: true, previous: parsed })
  } catch {
    return NextResponse.json({ hasPrevious: false, previous: null })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleHistory(supabase: any, userId: string) {
  // 1. Fetch own snapshots
  const { data: ownSnapshots } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('updated_by', userId)
    .like('key', `checkin_snapshot_${userId}_%`)
    .order('key', { ascending: false })
    .limit(24)

  const ownParsed: CheckinSnapshot[] = (ownSnapshots || [])
    .map((s: { value: string }) => {
      try { return JSON.parse(s.value) as CheckinSnapshot } catch { return null }
    })
    .filter(Boolean)

  // Backfill userId for old snapshots that don't have it
  for (const snap of ownParsed) {
    if (!snap.userId) snap.userId = userId
  }

  // 2. Check if user is in a household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()

  let partnerSnapshots: CheckinSnapshot[] = []

  if (membership?.household_id) {
    // Get all household members (to find partner IDs)
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', membership.household_id)

    const partnerIds = (members || [])
      .map((m: { user_id: string }) => m.user_id)
      .filter((id: string) => id !== userId)

    // Fetch household-scoped snapshots from partners
    if (partnerIds.length > 0) {
      const { data: householdSnaps } = await supabase
        .from('app_settings')
        .select('key, value, updated_by')
        .like('key', `checkin_household_${membership.household_id}_%`)
        .order('key', { ascending: false })
        .limit(48)

      // Filter to partner snapshots only (not own)
      partnerSnapshots = (householdSnaps || [])
        .filter((s: { updated_by: string }) => s.updated_by !== userId)
        .map((s: { value: string }) => {
          try { return JSON.parse(s.value) as CheckinSnapshot } catch { return null }
        })
        .filter(Boolean)
    }
  }

  // 3. Combine and sort by savedAt descending
  const all = [...ownParsed, ...partnerSnapshots].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  )

  return NextResponse.json({
    checkins: all,
    hasHousehold: !!membership?.household_id,
  })
}
