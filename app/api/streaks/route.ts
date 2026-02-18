import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Streak data stored in app_settings when user_streaks table doesn't exist.
 */
type StreakRecord = {
  streak_type: string
  current_count: number
  longest_count: number
  last_activity_date: string | null
  started_at: string
  updated_at: string
}

type StreakSummary = {
  current_count: number
  longest_count: number
  last_activity_date: string | null
  at_risk: boolean // true if streak will break if user doesn't act this week
  risk_message: string | null
}

const STREAK_TYPES = ['login', 'budget_compliance', 'action_completion'] as const

/**
 * Get ISO week number for a date.
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNum }
}

/**
 * Check if a streak is at risk of breaking.
 * A streak is at risk if:
 * - The current count > 0
 * - The last activity was in the PREVIOUS ISO week (i.e., the user must act THIS week or lose the streak)
 */
function checkStreakAtRisk(streak: { current_count: number; last_activity_date: string | null }, streakType: string): { at_risk: boolean; risk_message: string | null } {
  if (!streak.last_activity_date || streak.current_count === 0) {
    return { at_risk: false, risk_message: null }
  }

  const now = new Date()
  const currentWeek = getISOWeek(now)
  const lastDate = new Date(streak.last_activity_date + 'T00:00:00Z')
  const lastWeek = getISOWeek(lastDate)

  // If last activity is in the current week, no risk
  if (lastWeek.year === currentWeek.year && lastWeek.week === currentWeek.week) {
    return { at_risk: false, risk_message: null }
  }

  // If last activity is in the previous week, streak is at risk (must act this week)
  const isPreviousWeek = (
    (lastWeek.year === currentWeek.year && lastWeek.week === currentWeek.week - 1) ||
    (currentWeek.year === lastWeek.year + 1 && currentWeek.week === 1)
  )

  if (isPreviousWeek && streak.current_count > 0) {
    const typeLabels: Record<string, string> = {
      login: 'login-streak',
      budget_compliance: 'budget-streak',
      action_completion: 'actie-streak',
    }
    const label = typeLabels[streakType] || 'streak'
    return {
      at_risk: true,
      risk_message: `Je ${label} van ${streak.current_count} ${streak.current_count === 1 ? 'week' : 'weken'} staat op het spel!`,
    }
  }

  // If more than one week gap, streak is already broken (will reset on next checkin)
  return { at_risk: false, risk_message: null }
}

/**
 * Build streak summary from a streak record (or default zeros).
 */
function buildStreakSummary(record: StreakRecord | null | undefined, streakType: string): StreakSummary {
  const base = {
    current_count: record?.current_count ?? 0,
    longest_count: record?.longest_count ?? 0,
    last_activity_date: record?.last_activity_date ?? null,
  }
  const { at_risk, risk_message } = checkStreakAtRisk(base, streakType)
  return { ...base, at_risk, risk_message }
}

/**
 * GET /api/streaks — Get user's streak data for all 3 streak types.
 *
 * Returns login streak, budget compliance streak, and action completion streak.
 * Each streak includes at_risk warning when the streak may break.
 * Falls back to app_settings if user_streaks table doesn't exist.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Try user_streaks table first
    const { data: streaks, error } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)

    if (!error && streaks) {
      // Table exists — use real data
      const findStreak = (type: string) =>
        streaks.find((s: { streak_type: string }) => s.streak_type === type)

      const loginStreak = buildStreakSummary(findStreak('login'), 'login')
      const budgetStreak = buildStreakSummary(findStreak('budget_compliance'), 'budget_compliance')
      const actionStreak = buildStreakSummary(findStreak('action_completion'), 'action_completion')

      // Any streak at risk?
      const warnings = [loginStreak, budgetStreak, actionStreak]
        .filter(s => s.at_risk && s.risk_message)
        .map(s => s.risk_message!)

      return NextResponse.json({
        streaks: streaks,
        login_streak: loginStreak,
        budget_streak: budgetStreak,
        action_streak: actionStreak,
        warnings,
        source: 'database',
      })
    }

    // Fallback: read from app_settings
    const settingsKey = `streaks_${user.id}`
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    const storedStreaks: StreakRecord[] = (settingsData?.value as StreakRecord[]) ?? []
    const findStored = (type: string) => storedStreaks.find(s => s.streak_type === type)

    const loginStreak = buildStreakSummary(findStored('login'), 'login')
    const budgetStreak = buildStreakSummary(findStored('budget_compliance'), 'budget_compliance')
    const actionStreak = buildStreakSummary(findStored('action_completion'), 'action_completion')

    const warnings = [loginStreak, budgetStreak, actionStreak]
      .filter(s => s.at_risk && s.risk_message)
      .map(s => s.risk_message!)

    return NextResponse.json({
      streaks: storedStreaks,
      login_streak: loginStreak,
      budget_streak: budgetStreak,
      action_streak: actionStreak,
      warnings,
      source: storedStreaks.length > 0 ? 'app_settings' : 'empty',
    })
  } catch {
    const emptyStreak: StreakSummary = {
      current_count: 0,
      longest_count: 0,
      last_activity_date: null,
      at_risk: false,
      risk_message: null,
    }
    return NextResponse.json({
      streaks: [],
      login_streak: emptyStreak,
      budget_streak: emptyStreak,
      action_streak: emptyStreak,
      warnings: [],
      source: 'empty',
    })
  }
}
