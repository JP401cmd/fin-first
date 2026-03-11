import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET — List all check-in snapshots and monthly_checkin records for the current user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: rows } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .or(`key.like.checkin_snapshot_${user.id}_%,key.eq.monthly_checkin_${user.id},key.like.checkin_household_%_${user.id}_%,key.eq.monthly_checkin_prefs_${user.id}`)
    .order('key', { ascending: false })

  const snapshots: { key: string; monthKey: string; savedAt: string; reflection: string }[] = []
  let completedMonths: string[] = []
  let hasPrefs = false

  for (const row of rows || []) {
    if (row.key.startsWith('checkin_snapshot_')) {
      try {
        const parsed = JSON.parse(row.value)
        snapshots.push({
          key: row.key,
          monthKey: parsed.monthKey || '',
          savedAt: parsed.savedAt || row.updated_at || '',
          reflection: parsed.reflection || '',
        })
      } catch { /* skip */ }
    } else if (row.key === `monthly_checkin_${user.id}`) {
      try {
        completedMonths = JSON.parse(row.value).completedMonths || []
      } catch { /* skip */ }
    } else if (row.key === `monthly_checkin_prefs_${user.id}`) {
      hasPrefs = true
    }
  }

  return NextResponse.json({ snapshots, completedMonths, hasPrefs })
}

// DELETE — Remove specific check-in snapshot(s) or all check-in data
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { month, all } = body // month = '2026-03' or all = true

  if (all) {
    // Delete all check-in data for this user
    const { data: rows } = await supabase
      .from('app_settings')
      .select('key')
      .or(`key.like.checkin_snapshot_${user.id}_%,key.eq.monthly_checkin_${user.id},key.like.checkin_household_%_${user.id}_%,key.eq.monthly_checkin_prefs_${user.id}`)

    const keys = (rows || []).map(r => r.key)
    if (keys.length > 0) {
      await supabase.from('app_settings').delete().in('key', keys)
    }

    return NextResponse.json({ deleted: keys.length })
  }

  if (month) {
    // Delete snapshot for specific month
    const snapshotKey = `checkin_snapshot_${user.id}_${month}`
    await supabase.from('app_settings').delete().eq('key', snapshotKey)

    // Also remove month from completedMonths array
    const checkinKey = `monthly_checkin_${user.id}`
    const { data: existing } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', checkinKey)
      .maybeSingle()

    if (existing?.value) {
      try {
        const data = JSON.parse(existing.value)
        data.completedMonths = (data.completedMonths || []).filter((m: string) => m !== month)
        await supabase
          .from('app_settings')
          .upsert({ key: checkinKey, value: JSON.stringify(data), updated_by: user.id }, { onConflict: 'key' })
      } catch { /* skip */ }
    }

    // Delete household copy too
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membership?.household_id) {
      const householdKey = `checkin_household_${membership.household_id}_${user.id}_${month}`
      await supabase.from('app_settings').delete().eq('key', householdKey)
    }

    return NextResponse.json({ deleted: 1, month })
  }

  return NextResponse.json({ error: 'Geef "month" of "all" op' }, { status: 400 })
}
