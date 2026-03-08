import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export interface CheckinSnapshot {
  reflection: string
  monthKey: string
  savedAt: string
  metrics: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlySavings: number
    completedActions: number
    activeGoals: number
    fireAge: number | null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { reflection, monthKey, metrics } = body

  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const key = `checkin_snapshot_${user.id}_${monthStr}`

  const snapshot: CheckinSnapshot = {
    reflection: reflection || '',
    monthKey: monthKey || '',
    savedAt: now.toISOString(),
    metrics: metrics || {
      netWorth: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlySavings: 0,
      completedActions: 0,
      activeGoals: 0,
      fireAge: null,
    },
  }

  await supabase
    .from('app_settings')
    .upsert(
      {
        key,
        value: JSON.stringify(snapshot),
        user_id: user.id,
      },
      { onConflict: 'key' }
    )

  return NextResponse.json({ ok: true })
}

// GET — Load previous check-in snapshot for deltas
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  // Find the most recent snapshot that's NOT the current month
  const now = new Date()
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentKey = `checkin_snapshot_${user.id}_${currentMonthStr}`

  // Fetch all snapshots for this user (up to 12)
  const { data: snapshots } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('user_id', user.id)
    .like('key', `checkin_snapshot_${user.id}_%`)
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
