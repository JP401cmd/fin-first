import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/subscriptions/schedule-action
 *
 * Creates a plannable action in the `actions` table based on Will's
 * subscription advice. Source is 'ai', no recommendation_id (standalone action).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json() as {
    title: string
    description: string
    euroSavingMonthly: number
    freedomDaysPerYear: number
    weekOffset: number // 0 = this week, 1 = next week, etc.
  }

  const { title, description, euroSavingMonthly, freedomDaysPerYear, weekOffset } = body

  if (!title) {
    return NextResponse.json({ error: 'title is verplicht' }, { status: 400 })
  }

  // Compute the Monday of the target week (ISO date string)
  const scheduledWeek = getMondayOffset(Math.max(0, Math.min(weekOffset ?? 0, 12)))

  const { data, error } = await supabase
    .from('actions')
    .insert({
      user_id: user.id,
      recommendation_id: null,
      source: 'ai',
      title,
      description: description || null,
      freedom_days_impact: Math.round(freedomDaysPerYear),
      euro_impact_monthly: euroSavingMonthly,
      scheduled_week: scheduledWeek,
      status: 'open',
    })
    .select('id, scheduled_week')
    .single()

  if (error) {
    console.error('[/api/subscriptions/schedule-action]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ actionId: data.id, scheduledWeek: data.scheduled_week })
}

/** Returns the Monday of the week at `offset` weeks from now (YYYY-MM-DD). */
function getMondayOffset(offset: number): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day // bring to Monday
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  return monday.toISOString().split('T')[0]
}
