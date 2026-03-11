import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Key helpers ──────────────────────────────────────────────────────────
function checkinKey(userId: string) {
  return `monthly_checkin_${userId}`
}
function prefsKey(userId: string) {
  return `monthly_checkin_prefs_${userId}`
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface CheckinData {
  completedMonths: string[] // e.g. ['2026-01', '2026-02']
}

// ── GET — Check if current month check-in is completed ──────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const monthKey = currentMonthKey()

  // Load check-in data and preferences in parallel
  const [checkinRes, prefsRes] = await Promise.all([
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', checkinKey(user.id))
      .maybeSingle(),
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', prefsKey(user.id))
      .maybeSingle(),
  ])

  const checkinData: CheckinData = checkinRes.data?.value
    ? JSON.parse(checkinRes.data.value)
    : { completedMonths: [] }

  const enabled = prefsRes.data?.value
    ? JSON.parse(prefsRes.data.value).enabled !== false
    : true // enabled by default

  const completed = checkinData.completedMonths.includes(monthKey)

  return NextResponse.json({
    monthKey,
    completed,
    enabled,
    completedMonths: checkinData.completedMonths,
  })
}

// ── POST — Complete check-in for current month ──────────────────────────
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const monthKey = currentMonthKey()
  const key = checkinKey(user.id)

  // Load existing data
  const { data: existing } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  const checkinData: CheckinData = existing?.value
    ? JSON.parse(existing.value)
    : { completedMonths: [] }

  // Add current month if not already completed
  if (!checkinData.completedMonths.includes(monthKey)) {
    checkinData.completedMonths.push(monthKey)
    // Keep last 12 months only
    if (checkinData.completedMonths.length > 12) {
      checkinData.completedMonths = checkinData.completedMonths.slice(-12)
    }
  }

  await supabase
    .from('app_settings')
    .upsert(
      { key, value: JSON.stringify(checkinData), updated_by: user.id },
      { onConflict: 'key' }
    )

  return NextResponse.json({ completed: true, monthKey })
}

// ── PUT — Update check-in preferences ───────────────────────────────────
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const key = prefsKey(user.id)

  await supabase
    .from('app_settings')
    .upsert(
      { key, value: JSON.stringify({ enabled: body.enabled }), updated_by: user.id },
      { onConflict: 'key' }
    )

  return NextResponse.json({ ok: true })
}
