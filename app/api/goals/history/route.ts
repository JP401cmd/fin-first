import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/goals/history?goal_id=xxx
 *
 * Returns the value history for a goal, constructed from:
 * 1. goal_contributions table (cumulative over time)
 * 2. goal_value_history table (if exists)
 * 3. Current goal state as final point
 *
 * Returns: { history: { date, value, source }[], goal: { ... } }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const goalId = searchParams.get('goal_id')

  if (!goalId) {
    return NextResponse.json({ error: 'goal_id is required' }, { status: 400 })
  }

  // Fetch the goal
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single()

  if (goalError || !goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  }

  // Fetch contributions for this goal
  const { data: contributions } = await supabase
    .from('goal_contributions')
    .select('id, amount, date, notes')
    .eq('goal_id', goalId)
    .order('date', { ascending: true })

  // Try to fetch from goal_value_history table (may not exist yet)
  let valueHistory: { value: number; recorded_at: string; source: string }[] = []
  try {
    const { data: histData, error: histError } = await supabase
      .from('goal_value_history')
      .select('value, recorded_at, source')
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: true })

    if (!histError && histData) {
      valueHistory = histData as typeof valueHistory
    }
  } catch {
    // Table might not exist yet — that's OK
  }

  // Build history from multiple sources
  const history: { date: string; value: number; source: string }[] = []
  const seenDates = new Set<string>()

  // Source 1: goal_value_history table (most authoritative)
  for (const h of valueHistory) {
    const date = h.recorded_at.split('T')[0]
    if (!seenDates.has(date)) {
      history.push({ date, value: Number(h.value), source: h.source })
      seenDates.add(date)
    }
  }

  // Source 2: Reconstruct from contributions (if no explicit history)
  if (history.length === 0 && contributions && contributions.length > 0) {
    const sortedContribs = [...contributions].sort((a, b) => a.date.localeCompare(b.date))
    const totalContributed = sortedContribs.reduce((sum, c) => sum + Number(c.amount), 0)
    const initialValue = Math.max(0, Number(goal.current_value) - totalContributed)

    // Initial point at goal creation
    const createdDate = goal.created_at.split('T')[0]
    const firstContribDate = sortedContribs[0].date

    if (createdDate < firstContribDate) {
      history.push({ date: createdDate, value: initialValue, source: 'initial' })
      seenDates.add(createdDate)
    }

    // Cumulative contributions
    let cumulative = initialValue
    for (const contrib of sortedContribs) {
      cumulative += Number(contrib.amount)
      const date = contrib.date
      // Merge same-day contributions
      const existing = history.find(h => h.date === date)
      if (existing) {
        existing.value = cumulative
      } else {
        history.push({ date, value: cumulative, source: 'contribution' })
        seenDates.add(date)
      }
    }
  }

  // If we have linked assets/debts, also try to get valuations
  if (goal.linked_asset_id || goal.linked_debt_id) {
    const entityId = goal.linked_asset_id || goal.linked_debt_id
    const entityType = goal.linked_asset_id ? 'asset' : 'debt'

    const { data: valuations } = await supabase
      .from('valuations')
      .select('value, valuation_date')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('valuation_date', { ascending: true })

    if (valuations && valuations.length > 0) {
      // For linked goals, we want to show the actual linked entity values
      // For debt payoff goals: progress = target - remaining_balance
      for (const v of valuations) {
        const date = v.valuation_date.split('T')[0]
        if (!seenDates.has(date)) {
          let value = Number(v.value)
          if (goal.linked_debt_id) {
            // For debt: current_value = target - remaining balance
            value = Math.max(0, Number(goal.target_value) - value)
          }
          history.push({ date, value, source: 'linked' })
          seenDates.add(date)
        }
      }
    }
  }

  // Ensure we have at least the goal creation date
  const createdDate = goal.created_at.split('T')[0]
  if (!seenDates.has(createdDate) && history.length === 0) {
    history.push({ date: createdDate, value: 0, source: 'initial' })
    seenDates.add(createdDate)
  }

  // Add current value as final point
  const todayDate = new Date().toISOString().split('T')[0]
  if (!seenDates.has(todayDate)) {
    history.push({ date: todayDate, value: Number(goal.current_value), source: 'current' })
  }

  // Sort by date
  history.sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    goal,
    history,
    contributions_count: contributions?.length ?? 0,
  })
}

/**
 * POST /api/goals/history
 * Record a value snapshot for a goal
 * Body: { goal_id, value, source? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { goal_id, value, source = 'manual' } = body

  if (!goal_id || value === undefined) {
    return NextResponse.json({ error: 'goal_id and value are required' }, { status: 400 })
  }

  // Verify goal belongs to user
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id')
    .eq('id', goal_id)
    .eq('user_id', user.id)
    .single()

  if (goalError || !goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  }

  // Try to insert into goal_value_history
  try {
    const { error: insertError } = await supabase
      .from('goal_value_history')
      .insert({
        user_id: user.id,
        goal_id,
        value: Number(value),
        source,
        recorded_at: new Date().toISOString(),
      })

    if (insertError) {
      // Table might not exist yet — return OK anyway since we have fallbacks
      return NextResponse.json({
        success: true,
        recorded: false,
        fallback: 'goal_value_history table not available; using contribution-based history',
      })
    }

    return NextResponse.json({ success: true, recorded: true })
  } catch {
    return NextResponse.json({
      success: true,
      recorded: false,
      fallback: 'goal_value_history table not available; using contribution-based history',
    })
  }
}
