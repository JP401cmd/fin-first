import { createClient } from '@/lib/supabase/server'
import {
  getUsage,
  MAX_GENERATIONS_PER_WEEK,
  MAX_REFINEMENTS_PER_WEEK,
} from '@/lib/calculator/rate-limit'

/**
 * GET /api/calculators/usage
 *
 * Lever de huidige wekelijkse AI-rekenhulp-verbruikssnapshot voor de
 * ingelogde gebruiker plus de hard-gecodeerde plafonds. De UI-badge
 * `<RateLimitBadge>` toont op basis hiervan "nog X van Y generaties
 * deze week".
 *
 * Authenticatie: standaard Supabase-cookie. Een niet-ingelogde aanroep
 * krijgt 401 zodat de client weet niet door te tellen. We exposen géén
 * andermans-usage; de tabel is RLS-beschermd, maar we filteren ook
 * expliciet op `user.id` in `getUsage()`.
 *
 * Respons:
 *   200 { generations, refinements, maxGenerations, maxRefinements }
 *   401 Unauthorized
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const usage = await getUsage(supabase, user.id)

  return Response.json(
    {
      generations: usage.generations,
      refinements: usage.refinements,
      maxGenerations: MAX_GENERATIONS_PER_WEEK,
      maxRefinements: MAX_REFINEMENTS_PER_WEEK,
    },
    { status: 200 },
  )
}
