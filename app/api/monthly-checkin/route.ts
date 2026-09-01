import { createClient, getAuthClaims } from '@/lib/supabase/server'
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
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const monthKey = currentMonthKey()

  // Load check-in data and preferences in parallel
  const [checkinRes, prefsRes] = await Promise.all([
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', checkinKey(claims.sub))
      .maybeSingle(),
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', prefsKey(claims.sub))
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
  const alreadyCompleted = checkinData.completedMonths.includes(monthKey)
  if (!alreadyCompleted) {
    checkinData.completedMonths.push(monthKey)
    // Bewaar de laatste DERTIEN maanden — 13, niet 12: de reeks-erkenning kent
    // 12-op-rij als hoogste mijlpaal, en met een cap van 12 zou maand 13+ op
    // rij onmeetbaar zijn en als exact 12 lezen — waarmee "Twaalf op rij" elke
    // volgende maand opnieuw gevierd zou worden (review 1 sep). Met 13 is
    // >12 zichtbaar en is n=12 gegarandeerd de éérste keer.
    if (checkinData.completedMonths.length > 13) {
      checkinData.completedMonths = checkinData.completedMonths.slice(-13)
    }
  }

  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert(
      { key, value: JSON.stringify(checkinData), updated_by: user.id },
      { onConflict: 'key' }
    )
  if (upsertError) {
    // Zonder bevestigde write geen reeks-materiaal teruggeven: de client zou
    // anders een mijlpaal vieren over een maand die niet is opgeslagen
    // (review 1 sep). `completed: false` zonder lijst → standaard-afsluiting.
    console.error('[monthly-checkin] afvinken niet opgeslagen:', upsertError)
    return NextResponse.json({ completed: false, monthKey })
  }

  // `completedMonths` is additief meegegeven (bestaande consumenten lezen
  // alleen `completed`): het afsluitmoment op /core/checkin leidt hieruit de
  // lopende reeks af zonder een tweede rondgang naar GET.
  return NextResponse.json({
    completed: true,
    // Additief: een herhaalde afronding binnen dezelfde maand mag de reeks-
    // mijlpaal niet nogmaals vieren — de client valt dan terug op het
    // standaard-afsluitmoment.
    alreadyCompleted,
    monthKey,
    completedMonths: checkinData.completedMonths,
  })
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
