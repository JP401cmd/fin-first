import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/feature-visits — Get user's feature visit records.
 *
 * Returns all features the user has visited, including visit counts
 * and first-visited timestamps. Used by the discover carousel to
 * track which features have been explored.
 *
 * Falls back gracefully if the user_feature_visits table doesn't exist yet.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const { data: visits, error } = await supabase
      .from('user_feature_visits')
      .select('feature_slug, visit_count, first_visited_at')
      .eq('user_id', user.id)
      .order('first_visited_at', { ascending: false })

    if (error) {
      // Table probably doesn't exist yet — return empty data
      return NextResponse.json({
        visits: [],
        source: 'empty',
        message: 'Feature visits tabel nog niet beschikbaar',
      })
    }

    return NextResponse.json({
      visits: visits ?? [],
      source: 'database',
    })
  } catch {
    return NextResponse.json({
      visits: [],
      source: 'empty',
    })
  }
}

/**
 * POST /api/feature-visits — Record a feature visit.
 *
 * Body: { "feature_slug": "vermogensverloop" }
 *
 * If the feature has been visited before, increments visit_count.
 * If this is the first visit, creates a new record with visit_count=1.
 * Uses UPSERT with ON CONFLICT to handle both cases atomically.
 *
 * Falls back gracefully if the user_feature_visits table doesn't exist yet.
 */
export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const featureSlug = body.feature_slug

    if (!featureSlug || typeof featureSlug !== 'string') {
      return NextResponse.json(
        { error: 'feature_slug is verplicht' },
        { status: 400 }
      )
    }

    // First, try to get existing visit record
    const { data: existing, error: selectError } = await supabase
      .from('user_feature_visits')
      .select('id, visit_count, first_visited_at')
      .eq('user_id', user.id)
      .eq('feature_slug', featureSlug)
      .maybeSingle()

    if (selectError) {
      // Table probably doesn't exist yet
      return NextResponse.json({
        visit: null,
        source: 'empty',
        message: 'Feature visits tabel nog niet beschikbaar',
      })
    }

    if (existing) {
      // Increment visit count
      const { data: updated, error: updateError } = await supabase
        .from('user_feature_visits')
        .update({ visit_count: existing.visit_count + 1 })
        .eq('id', existing.id)
        .select('feature_slug, visit_count, first_visited_at')
        .single()

      if (updateError) {
        return NextResponse.json(
          { error: 'Kon bezoek niet bijwerken: ' + updateError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        visit: updated,
        action: 'incremented',
        source: 'database',
      })
    } else {
      // Create new visit record
      const { data: created, error: insertError } = await supabase
        .from('user_feature_visits')
        .insert({
          user_id: user.id,
          feature_slug: featureSlug,
        })
        .select('feature_slug, visit_count, first_visited_at')
        .single()

      if (insertError) {
        return NextResponse.json(
          { error: 'Kon bezoek niet opslaan: ' + insertError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        visit: created,
        action: 'created',
        source: 'database',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
