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

/**
 * GET /api/streaks — Get user's streak data.
 *
 * Returns login streak, budget compliance streak, and action completion streak.
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
      const loginStreak = streaks.find(
        (s: { streak_type: string }) => s.streak_type === 'login'
      )

      return NextResponse.json({
        streaks: streaks,
        login_streak: loginStreak ? {
          current_count: loginStreak.current_count,
          longest_count: loginStreak.longest_count,
          last_activity_date: loginStreak.last_activity_date,
        } : {
          current_count: 0,
          longest_count: 0,
          last_activity_date: null,
        },
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
    const loginStreak = storedStreaks.find(s => s.streak_type === 'login')

    return NextResponse.json({
      streaks: storedStreaks,
      login_streak: loginStreak ? {
        current_count: loginStreak.current_count,
        longest_count: loginStreak.longest_count,
        last_activity_date: loginStreak.last_activity_date,
      } : {
        current_count: 0,
        longest_count: 0,
        last_activity_date: null,
      },
      source: storedStreaks.length > 0 ? 'app_settings' : 'empty',
    })
  } catch {
    return NextResponse.json({
      streaks: [],
      login_streak: {
        current_count: 0,
        longest_count: 0,
        last_activity_date: null,
      },
      source: 'empty',
    })
  }
}
