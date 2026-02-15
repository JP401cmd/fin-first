import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/streaks/checkin — Record a daily login check-in.
 *
 * Streak logic:
 * - If no login streak exists yet, creates one with current_count=1
 * - If last_activity_date is today, returns current streak (idempotent)
 * - If last_activity_date is yesterday, increments current_count (consecutive day)
 * - If last_activity_date is older than yesterday, resets current_count to 1
 * - Always updates longest_count if current_count exceeds it
 * - Always sets last_activity_date to today
 *
 * Falls back gracefully if the user_streaks table doesn't exist yet.
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  try {
    // Try to fetch existing login streak
    const { data: existing, error: fetchError } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .eq('streak_type', 'login')
      .maybeSingle()

    if (fetchError) {
      // Table probably doesn't exist
      return NextResponse.json({
        error: 'Streaks tabel nog niet beschikbaar. Migratie moet eerst worden toegepast.',
        table_missing: true,
      }, { status: 503 })
    }

    if (!existing) {
      // First login ever — create new streak
      const { data: created, error: insertError } = await supabase
        .from('user_streaks')
        .insert({
          user_id: user.id,
          streak_type: 'login',
          current_count: 1,
          longest_count: 1,
          last_activity_date: today,
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      return NextResponse.json({
        streak: created,
        action: 'created',
        message: 'Eerste login streak gestart!',
      })
    }

    // Streak exists — check if we need to update
    const lastDate = existing.last_activity_date

    if (lastDate === today) {
      // Already checked in today — idempotent return
      return NextResponse.json({
        streak: existing,
        action: 'already_checked_in',
        message: 'Je hebt je vandaag al ingecheckt.',
      })
    }

    // Calculate if yesterday was the last activity
    const lastActivityDate = new Date(lastDate + 'T00:00:00')
    const todayDate = new Date(today + 'T00:00:00')
    const diffDays = Math.floor(
      (todayDate.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    let newCount: number
    if (diffDays === 1) {
      // Consecutive day — increment
      newCount = existing.current_count + 1
    } else {
      // Gap in streak — reset to 1
      newCount = 1
    }

    const newLongest = Math.max(newCount, existing.longest_count)

    const { data: updated, error: updateError } = await supabase
      .from('user_streaks')
      .update({
        current_count: newCount,
        longest_count: newLongest,
        last_activity_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      streak: updated,
      action: diffDays === 1 ? 'incremented' : 'reset',
      previous_count: existing.current_count,
      message: diffDays === 1
        ? `Streak verlengd naar ${newCount} dagen!`
        : `Streak opnieuw gestart. Vorige streak: ${existing.current_count} dagen.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
