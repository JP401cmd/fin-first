import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/streaks — Get user's streak data.
 *
 * Returns login streak, budget compliance streak, and action completion streak.
 * Falls back gracefully if the user_streaks table doesn't exist yet.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const { data: streaks, error } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      // Table probably doesn't exist yet — return empty data
      return NextResponse.json({
        streaks: [],
        login_streak: {
          current_count: 0,
          longest_count: 0,
          last_activity_date: null,
        },
        source: 'empty',
        message: 'Streaks tabel nog niet beschikbaar',
      })
    }

    // Find login streak specifically
    const loginStreak = (streaks ?? []).find(
      (s: { streak_type: string }) => s.streak_type === 'login'
    )

    return NextResponse.json({
      streaks: streaks ?? [],
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
