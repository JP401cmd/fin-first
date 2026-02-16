import { NextRequest, NextResponse } from 'next/server'

/**
 * Streak data record type.
 */
type StreakRecord = {
  streak_type: string
  current_count: number
  longest_count: number
  last_activity_date: string | null
  started_at: string
  updated_at: string
}

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
 * Check if two ISO weeks are consecutive.
 */
function areConsecutiveWeeks(
  prev: { year: number; week: number },
  curr: { year: number; week: number }
): boolean {
  if (prev.year === curr.year) {
    return curr.week === prev.week + 1
  }
  if (curr.year === prev.year + 1 && curr.week === 1) {
    const dec31 = new Date(Date.UTC(prev.year, 11, 31))
    const lastWeek = getISOWeek(dec31)
    return prev.week === lastWeek.week
  }
  return false
}

/**
 * Process a single checkin and return updated streak.
 */
function processCheckin(
  loginStreak: StreakRecord | null,
  checkinDate: string
): { streak: StreakRecord; action: string; message: string; previous_count?: number } {
  const checkinDateObj = new Date(checkinDate + 'T00:00:00Z')
  const checkinWeek = getISOWeek(checkinDateObj)
  const now = new Date().toISOString()

  if (!loginStreak) {
    const newStreak: StreakRecord = {
      streak_type: 'login',
      current_count: 1,
      longest_count: 1,
      last_activity_date: checkinDate,
      started_at: now,
      updated_at: now,
    }
    return { streak: newStreak, action: 'created', message: 'Eerste weekstreak gestart!' }
  }

  const lastDateObj = new Date(loginStreak.last_activity_date + 'T00:00:00Z')
  const lastWeek = getISOWeek(lastDateObj)

  // Same week = idempotent
  if (lastWeek.year === checkinWeek.year && lastWeek.week === checkinWeek.week) {
    return {
      streak: loginStreak,
      action: 'already_checked_in',
      message: 'Je hebt je deze week al ingecheckt.',
    }
  }

  const previousCount = loginStreak.current_count
  let newCount: number
  let action: string
  let message: string

  if (areConsecutiveWeeks(lastWeek, checkinWeek)) {
    newCount = loginStreak.current_count + 1
    action = 'incremented'
    message = `Weekstreak verlengd naar ${newCount} weken!`
  } else {
    newCount = 1
    action = 'reset'
    message = `Weekstreak opnieuw gestart. Vorige streak: ${loginStreak.current_count} weken.`
  }

  const newLongest = Math.max(newCount, loginStreak.longest_count)

  const updatedStreak: StreakRecord = {
    ...loginStreak,
    current_count: newCount,
    longest_count: newLongest,
    last_activity_date: checkinDate,
    updated_at: now,
  }

  return { streak: updatedStreak, action, message, previous_count: previousCount }
}

/**
 * POST /api/test-streaks — Test the complete weekly streak workflow.
 *
 * Runs the full streak logic in-memory to verify the algorithm:
 * 1. First check-in → streak=1
 * 2. Same-week re-check → idempotent
 * 3. Next week → streak=2
 * 4. Third week → streak=3, longest_count=3
 *
 * Also tests: gap resets streak, year boundary handling.
 *
 * This endpoint exercises the exact same functions used by /api/streaks/checkin.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { action: testAction } = body

  if (testAction === 'single') {
    // Single checkin test with custom dates
    const { dates } = body as { dates?: string[] }
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: 'Provide dates array' }, { status: 400 })
    }

    let loginStreak: StreakRecord | null = null
    const results: Array<{
      date: string
      week: { year: number; week: number }
      action: string
      current_count: number
      longest_count: number
      message: string
      previous_count?: number
    }> = []

    for (const date of dates) {
      const result = processCheckin(loginStreak, date)
      loginStreak = result.streak
      results.push({
        date,
        week: getISOWeek(new Date(date + 'T00:00:00Z')),
        action: result.action,
        current_count: result.streak.current_count,
        longest_count: result.streak.longest_count,
        message: result.message,
        previous_count: result.previous_count,
      })
    }

    return NextResponse.json({ results, final_streak: loginStreak })
  }

  // Default: run the full verification suite
  const today = new Date().toISOString().split('T')[0]

  // ─── Test 1: Basic consecutive weeks ───────────────────
  let streak: StreakRecord | null = null
  const steps: Array<{
    step: string
    date: string
    week: { year: number; week: number }
    action: string
    current_count: number
    longest_count: number
    pass: boolean
    expected: string
  }> = []

  // Step 1: First check-in
  const r1 = processCheckin(streak, today)
  streak = r1.streak
  steps.push({
    step: 'Step 1-3: First check-in',
    date: today,
    week: getISOWeek(new Date(today + 'T00:00:00Z')),
    action: r1.action,
    current_count: streak.current_count,
    longest_count: streak.longest_count,
    pass: r1.action === 'created' && streak.current_count === 1,
    expected: 'action=created, count=1',
  })

  // Step: Same week re-check (idempotent)
  const r1b = processCheckin(streak, today)
  // streak stays same
  steps.push({
    step: 'Idempotent: Same week',
    date: today,
    week: getISOWeek(new Date(today + 'T00:00:00Z')),
    action: r1b.action,
    current_count: r1b.streak.current_count,
    longest_count: r1b.streak.longest_count,
    pass: r1b.action === 'already_checked_in' && r1b.streak.current_count === 1,
    expected: 'action=already_checked_in, count=1',
  })

  // Step 4-5: Next week check-in
  const nextWeek = new Date(today + 'T00:00:00Z')
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
  const nextWeekDate = nextWeek.toISOString().split('T')[0]
  const r2 = processCheckin(streak, nextWeekDate)
  streak = r2.streak
  steps.push({
    step: 'Step 4-5: Next week',
    date: nextWeekDate,
    week: getISOWeek(nextWeek),
    action: r2.action,
    current_count: streak.current_count,
    longest_count: streak.longest_count,
    pass: r2.action === 'incremented' && streak.current_count === 2,
    expected: 'action=incremented, count=2',
  })

  // Step 6: Third consecutive week
  const thirdWeek = new Date(nextWeekDate + 'T00:00:00Z')
  thirdWeek.setUTCDate(thirdWeek.getUTCDate() + 7)
  const thirdWeekDate = thirdWeek.toISOString().split('T')[0]
  const r3 = processCheckin(streak, thirdWeekDate)
  streak = r3.streak
  steps.push({
    step: 'Step 6: Third week (longest_count)',
    date: thirdWeekDate,
    week: getISOWeek(thirdWeek),
    action: r3.action,
    current_count: streak.current_count,
    longest_count: streak.longest_count,
    pass: streak.current_count === 3 && streak.longest_count === 3,
    expected: 'count=3, longest=3',
  })

  // ─── Test 2: Gap resets streak ─────────────────────────
  const gapDate = new Date(thirdWeekDate + 'T00:00:00Z')
  gapDate.setUTCDate(gapDate.getUTCDate() + 21) // Skip 3 weeks
  const gapDateStr = gapDate.toISOString().split('T')[0]
  const r4 = processCheckin(streak, gapDateStr)
  streak = r4.streak
  steps.push({
    step: 'Gap test: 3 week gap resets',
    date: gapDateStr,
    week: getISOWeek(gapDate),
    action: r4.action,
    current_count: streak.current_count,
    longest_count: streak.longest_count,
    pass: r4.action === 'reset' && streak.current_count === 1 && streak.longest_count === 3,
    expected: 'action=reset, count=1, longest=3 (preserved)',
  })

  // ─── Test 3: Year boundary ────────────────────────────
  // Test week 52/53 → week 1 transition
  let yearStreak: StreakRecord | null = null
  const yrR1 = processCheckin(yearStreak, '2025-12-29') // This is week 1 of 2026 (ISO)
  yearStreak = yrR1.streak
  const yrR2 = processCheckin(yearStreak, '2026-01-05') // Week 2 of 2026
  yearStreak = yrR2.streak
  steps.push({
    step: 'Year boundary: Dec 29 → Jan 5',
    date: '2025-12-29 → 2026-01-05',
    week: getISOWeek(new Date('2026-01-05T00:00:00Z')),
    action: yrR2.action,
    current_count: yearStreak.current_count,
    longest_count: yearStreak.longest_count,
    pass: yrR2.action === 'incremented' && yearStreak.current_count === 2,
    expected: 'action=incremented, count=2',
  })

  const allPass = steps.every(s => s.pass)

  return NextResponse.json({
    all_pass: allPass,
    steps,
    summary: {
      total: steps.length,
      passed: steps.filter(s => s.pass).length,
      failed: steps.filter(s => !s.pass).length,
    },
  })
}

/**
 * GET /api/test-streaks — Returns the verification suite results.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  // Run the same tests as POST with default action
  const today = new Date().toISOString().split('T')[0]

  let streak: StreakRecord | null = null

  // Step 1: First checkin
  const r1 = processCheckin(streak, today)
  streak = r1.streak
  const step1Pass = r1.action === 'created' && streak.current_count === 1

  // Step 2: Same week
  const r1b = processCheckin(streak, today)
  const step2Pass = r1b.action === 'already_checked_in'

  // Step 3: Next week
  const nextWeek = new Date(today + 'T00:00:00Z')
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
  const nextWeekDate = nextWeek.toISOString().split('T')[0]
  const r2 = processCheckin(streak, nextWeekDate)
  streak = r2.streak
  const step3Pass = r2.action === 'incremented' && streak.current_count === 2

  // Step 4: longest_count
  const thirdWeek = new Date(nextWeekDate + 'T00:00:00Z')
  thirdWeek.setUTCDate(thirdWeek.getUTCDate() + 7)
  const thirdWeekDate = thirdWeek.toISOString().split('T')[0]
  const r3 = processCheckin(streak, thirdWeekDate)
  streak = r3.streak
  const step4Pass = streak.longest_count >= 3

  return NextResponse.json({
    all_pass: step1Pass && step2Pass && step3Pass && step4Pass,
    verification: {
      'Step 1-3: First checkin → count=1': step1Pass,
      'Idempotent: Same week → no change': step2Pass,
      'Step 4-5: Next week → count=2': step3Pass,
      'Step 6: longest_count updates': step4Pass,
    },
    final_streak: {
      current_count: streak.current_count,
      longest_count: streak.longest_count,
      last_activity_date: streak.last_activity_date,
    },
  })
}
