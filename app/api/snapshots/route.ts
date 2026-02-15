import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SWR = 0.04

/**
 * GET /api/snapshots
 * Returns all net worth snapshots for the authenticated user,
 * enriched with computed freedom_percentage based on real asset/debt data.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch snapshots
  const { data: snapshots, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch current expenses to compute freedom_percentage for each snapshot
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const { data: expenses } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', user.id)
    .lt('amount', 0)
    .gte('date', twelveMonthsAgo)
    .lt('date', monthEnd)

  const yearlyExpenses = Math.abs((expenses ?? []).reduce((s, t) => s + Number(t.amount), 0))
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0

  // Enrich snapshots with computed freedom_percentage
  const enriched = (snapshots ?? []).map(s => {
    const netWorth = Number(s.net_worth)
    const totalAssets = Number(s.total_assets)
    const totalDebts = Number(s.total_debts)
    const computedNetWorth = totalAssets - totalDebts
    const freedom_percentage = fireTarget > 0
      ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
      : 0

    return {
      ...s,
      net_worth_matches: Math.abs(netWorth - computedNetWorth) < 0.01,
      freedom_percentage: Math.round(freedom_percentage * 10) / 10,
      fire_target: fireTarget,
      yearly_expenses: yearlyExpenses,
    }
  })

  return NextResponse.json({
    snapshots: enriched,
    count: enriched.length,
    fire_target: fireTarget,
    yearly_expenses: yearlyExpenses,
  })
}

/**
 * POST /api/snapshots
 * Creates a new net worth snapshot from real calculated asset/debt data.
 * The snapshot values are computed server-side from actual database records.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch real asset and debt data
  const [assetsResult, debtsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('current_value')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  if (assetsResult.error) {
    return NextResponse.json({ error: assetsResult.error.message }, { status: 500 })
  }
  if (debtsResult.error) {
    return NextResponse.json({ error: debtsResult.error.message }, { status: 500 })
  }

  const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  const today = new Date().toISOString().split('T')[0]

  // Upsert the snapshot (one per user per day)
  const { data: snapshot, error } = await supabase
    .from('net_worth_snapshots')
    .upsert({
      user_id: user.id,
      snapshot_date: today,
      total_assets: totalAssets,
      total_debts: totalDebts,
      net_worth: netWorth,
    }, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compute freedom_percentage from real expense data
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const { data: expenses } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', user.id)
    .lt('amount', 0)
    .gte('date', twelveMonthsAgo)
    .lt('date', monthEnd)

  const yearlyExpenses = Math.abs((expenses ?? []).reduce((s, t) => s + Number(t.amount), 0))
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0
  const freedomPercentage = fireTarget > 0
    ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
    : 0

  return NextResponse.json({
    snapshot: {
      ...snapshot,
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_target: fireTarget,
      yearly_expenses: yearlyExpenses,
      net_worth_verified: netWorth === totalAssets - totalDebts,
    },
    calculation: {
      total_assets: totalAssets,
      total_debts: totalDebts,
      net_worth: netWorth,
      formula: 'net_worth = total_assets - total_debts',
      freedom_percentage: Math.round(freedomPercentage * 10) / 10,
      fire_target: fireTarget,
      swr: SWR,
    },
  })
}
