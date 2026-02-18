import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

const VALID_STREAK_TYPES = ['login', 'budget_compliance', 'action_completion'] as const
type StreakType = typeof VALID_STREAK_TYPES[number]

/**
 * Get ISO week number for a date.
 * ISO 8601: Week 1 is the week containing the first Thursday of the year.
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNum }
}

/**
 * Check if two ISO weeks are consecutive.
 * Handles year boundaries (e.g., week 52/53 of year X → week 1 of year X+1).
 */
function areConsecutiveWeeks(
  prev: { year: number; week: number },
  curr: { year: number; week: number }
): boolean {
  if (prev.year === curr.year) {
    return curr.week === prev.week + 1
  }
  // Year boundary: last week of prev year → first week of curr year
  if (curr.year === prev.year + 1 && curr.week === 1) {
    // Check if prev was the last week of its year
    const dec31 = new Date(Date.UTC(prev.year, 11, 31))
    const lastWeek = getISOWeek(dec31)
    return prev.week === lastWeek.week
  }
  return false
}

/**
 * Core streak calculation logic (shared between DB and app_settings paths).
 */
function calculateStreak(
  existing: { current_count: number; longest_count: number; last_activity_date: string | null },
  checkinDate: string
): { newCount: number; newLongest: number; action: string; message: string } {
  const checkinDateObj = new Date(checkinDate + 'T00:00:00Z')
  const checkinWeek = getISOWeek(checkinDateObj)

  if (!existing.last_activity_date) {
    return {
      newCount: 1,
      newLongest: Math.max(1, existing.longest_count),
      action: 'created',
      message: 'Eerste weekstreak gestart!',
    }
  }

  const lastDateObj = new Date(existing.last_activity_date + 'T00:00:00Z')
  const lastWeek = getISOWeek(lastDateObj)

  // Same ISO week — already checked in this week (idempotent)
  if (lastWeek.year === checkinWeek.year && lastWeek.week === checkinWeek.week) {
    return {
      newCount: existing.current_count,
      newLongest: existing.longest_count,
      action: 'already_checked_in',
      message: 'Je hebt je deze week al ingecheckt.',
    }
  }

  let newCount: number
  let action: string
  let message: string

  if (areConsecutiveWeeks(lastWeek, checkinWeek)) {
    // Consecutive week — increment
    newCount = existing.current_count + 1
    action = 'incremented'
    message = `Weekstreak verlengd naar ${newCount} weken!`
  } else {
    // Gap in streak — reset to 1
    newCount = 1
    action = 'reset'
    message = `Weekstreak opnieuw gestart. Vorige streak: ${existing.current_count} weken.`
  }

  return {
    newCount,
    newLongest: Math.max(newCount, existing.longest_count),
    action,
    message,
  }
}

/**
 * POST /api/streaks/checkin — Record a weekly check-in for any streak type.
 *
 * Streak logic (WEEKLY — per app spec "Weekstreak"):
 * - If no streak exists yet, creates one with current_count=1
 * - If last_activity_date is in the same ISO week, returns current streak (idempotent)
 * - If last_activity_date is in the previous ISO week, increments current_count (consecutive week)
 * - If last_activity_date is older than the previous week, resets current_count to 1
 * - Always updates longest_count if current_count exceeds it
 * - Always sets last_activity_date to the check-in date
 *
 * Optional query parameters:
 * - ?date=YYYY-MM-DD — Simulate a check-in on a specific date (for testing)
 * - ?type=login|budget_compliance|action_completion — Streak type (default: login)
 *
 * Falls back to app_settings if user_streaks table doesn't exist.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Allow simulating a specific date for testing
  const url = new URL(request.url)
  const simulateDate = url.searchParams.get('date')
  const checkinDate = simulateDate || new Date().toISOString().split('T')[0]

  // Validate date format if provided
  if (simulateDate && !/^\d{4}-\d{2}-\d{2}$/.test(simulateDate)) {
    return NextResponse.json({ error: 'Ongeldige datum. Gebruik YYYY-MM-DD formaat.' }, { status: 400 })
  }

  // Parse streak type (default: login)
  const streakTypeParam = url.searchParams.get('type') || 'login'
  if (!VALID_STREAK_TYPES.includes(streakTypeParam as StreakType)) {
    return NextResponse.json({
      error: `Ongeldig streak-type. Kies uit: ${VALID_STREAK_TYPES.join(', ')}`,
    }, { status: 400 })
  }
  const streakType = streakTypeParam as StreakType

  const checkinDateObj = new Date(checkinDate + 'T00:00:00Z')
  const checkinWeek = getISOWeek(checkinDateObj)

  try {
    // Try user_streaks table first
    const { data: existing, error: fetchError } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .eq('streak_type', streakType)
      .maybeSingle()

    if (!fetchError) {
      // Table exists — use real database
      return await handleDbStreak(supabase, user.id, existing, checkinDate, checkinWeek, streakType)
    }

    // Fallback: use app_settings
    return await handleAppSettingsStreak(supabase, user.id, checkinDate, checkinWeek, streakType)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Handle streak using the real user_streaks database table.
 */
async function handleDbStreak(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  existing: Record<string, unknown> | null,
  checkinDate: string,
  checkinWeek: { year: number; week: number },
  streakType: StreakType
) {
  if (!existing) {
    // First ever — create new streak
    const { data: created, error: insertError } = await supabase
      .from('user_streaks')
      .insert({
        user_id: userId,
        streak_type: streakType,
        current_count: 1,
        longest_count: 1,
        last_activity_date: checkinDate,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      streak: created,
      streak_type: streakType,
      action: 'created',
      week: checkinWeek,
      source: 'database',
      message: 'Eerste weekstreak gestart!',
    })
  }

  const { newCount, newLongest, action, message } = calculateStreak(
    {
      current_count: existing.current_count as number,
      longest_count: existing.longest_count as number,
      last_activity_date: existing.last_activity_date as string,
    },
    checkinDate
  )

  if (action === 'already_checked_in') {
    return NextResponse.json({
      streak: existing,
      streak_type: streakType,
      action,
      week: checkinWeek,
      source: 'database',
      message,
    })
  }

  const { data: updated, error: updateError } = await supabase
    .from('user_streaks')
    .update({
      current_count: newCount,
      longest_count: newLongest,
      last_activity_date: checkinDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id as string)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    streak: updated,
    streak_type: streakType,
    action,
    previous_count: existing.current_count,
    week: checkinWeek,
    source: 'database',
    message,
  })
}

/**
 * Handle streak using the app_settings fallback (key-value store).
 */
async function handleAppSettingsStreak(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  checkinDate: string,
  checkinWeek: { year: number; week: number },
  streakType: StreakType
) {
  const settingsKey = `streaks_${userId}`

  // Fetch existing streaks from app_settings
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey)
    .maybeSingle()

  const storedStreaks: StreakRecord[] = (settingsData?.value as StreakRecord[]) ?? []
  const targetStreak = storedStreaks.find(s => s.streak_type === streakType)

  const now = new Date().toISOString()

  if (!targetStreak) {
    // First ever — create new streak
    const newStreak: StreakRecord = {
      streak_type: streakType,
      current_count: 1,
      longest_count: 1,
      last_activity_date: checkinDate,
      started_at: now,
      updated_at: now,
    }

    const updatedStreaks = [...storedStreaks, newStreak]
    await supabase.from('app_settings').upsert(
      { key: settingsKey, value: updatedStreaks },
      { onConflict: 'key' }
    )

    return NextResponse.json({
      streak: newStreak,
      streak_type: streakType,
      action: 'created',
      week: checkinWeek,
      source: 'app_settings',
      message: 'Eerste weekstreak gestart!',
    })
  }

  // Calculate streak change
  const { newCount, newLongest, action, message } = calculateStreak(
    {
      current_count: targetStreak.current_count,
      longest_count: targetStreak.longest_count,
      last_activity_date: targetStreak.last_activity_date,
    },
    checkinDate
  )

  if (action === 'already_checked_in') {
    return NextResponse.json({
      streak: targetStreak,
      streak_type: streakType,
      action,
      week: checkinWeek,
      source: 'app_settings',
      message,
    })
  }

  // Update the streak in the array
  const previousCount = targetStreak.current_count
  const updatedStreaks = storedStreaks.map(s => {
    if (s.streak_type === streakType) {
      return {
        ...s,
        current_count: newCount,
        longest_count: newLongest,
        last_activity_date: checkinDate,
        updated_at: now,
      }
    }
    return s
  })

  await supabase.from('app_settings').upsert(
    { key: settingsKey, value: updatedStreaks },
    { onConflict: 'key' }
  )

  const updatedStreak = updatedStreaks.find(s => s.streak_type === streakType)!

  return NextResponse.json({
    streak: updatedStreak,
    streak_type: streakType,
    action,
    previous_count: previousCount,
    week: checkinWeek,
    source: 'app_settings',
    message,
  })
}
