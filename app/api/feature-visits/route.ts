import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { CLIENT_WRITABLE_FEATURE_SLUGS } from '@/lib/feature-visit-slugs'

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

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  try {
    const { data: visits, error } = await supabase
      .from('user_feature_visits')
      .select('feature_slug, visit_count, first_visited_at')
      .eq('user_id', claims.sub)
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
 * Body-contract van POST — een gesloten enum, geen vrije string.
 *
 * `user_feature_visits` is een gedeeld markeringsregister met meerdere
 * slug-families in één tabel, en niet elke familie is even onschuldig. De
 * `*_setup_completed`-markers zijn POORTEN: `lib/app-setup-status.ts` en
 * `lib/account-status.ts` lezen ze om te bepalen of een setup-gate nog
 * verschijnt. Met de oude `typeof x === 'string'`-check kon een client
 * zichzelf met één fetch een `budgetteren_setup_completed` toekennen en die
 * gate overslaan — een marker die uitsluitend door de server-routes onder
 * `app/api/<app>/setup` gezet hoort te worden. De enum sluit dat af; welke slugs
 * er wél in mogen staat met motivering in `lib/feature-visit-slugs.ts`, met
 * een drift-test ernaast.
 *
 * `.strict()` omdat het register een unieke sleutel op (user_id, feature_slug)
 * heeft en verder niets van de client overneemt: een onbekende sleutel in de
 * body betekent dat de call-site iets anders bedoelt dan deze route doet.
 */
const FeatureVisitSchema = z
  .object({
    feature_slug: z.enum(CLIENT_WRITABLE_FEATURE_SLUGS),
  })
  .strict()

/**
 * POST /api/feature-visits — Record a feature visit.
 *
 * Body: { "feature_slug": "guide_nieuws" }
 *
 * If the feature has been visited before, increments visit_count.
 * If this is the first visit, creates a new record with visit_count=1.
 *
 * Falls back gracefully if the user_feature_visits table doesn't exist yet.
 */
export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  // Zod + de gedeelde 400-envelope (ADR 0044) — vervangt de handgeschreven
  // `NextResponse.json({ error }, { status: 400 })` die hier stond.
  const parsed = await parseBody(FeatureVisitSchema, req)
  if (!parsed.ok) return parsed.response
  const featureSlug = parsed.data.feature_slug

  try {
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
        return serverError(updateError, 'feature-visits:POST')
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
        return serverError(insertError, 'feature-visits:POST')
      }

      return NextResponse.json({
        visit: created,
        action: 'created',
        source: 'database',
      })
    }
  } catch (err) {
    return serverError(err, 'feature-visits:POST')
  }
}
