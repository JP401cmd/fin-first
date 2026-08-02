import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { getUsage } from '@/lib/calculator/rate-limit'

/**
 * GET /api/calculators/usage
 *
 * Lever de huidige wekelijkse AI-rekenhulp-verbruikssnapshot voor de
 * ingelogde gebruiker plus de geldende plafonds. De UI-badge
 * `<RateLimitBadge>` toont op basis hiervan "nog X van Y generaties
 * deze week".
 *
 * Authenticatie: standaard Supabase-cookie. Een niet-ingelogde aanroep
 * krijgt 401 zodat de client weet niet door te tellen. We exposen géén
 * andermans-usage: `ai_calculator_week_usage()` leidt de gebruiker af uit
 * `auth.uid()` en draait als `security invoker`, dus de own-row RLS-policy
 * filtert daar bovenop mee.
 *
 * De plafonds komen mee uit diezelfde RPC en staan niet meer als constante in
 * TypeScript. Anders zou een migratie die de rem verandert deze badge stil
 * laten liegen — de database is sinds ADR 0076 de enige bron van de limiet.
 *
 * Respons:
 *   200 { generations, refinements, maxGenerations, maxRefinements }
 *   401 { error: 'Niet ingelogd' }
 *   500 { error }  — verbruik niet leesbaar; de badge verbergt zich dan
 *                    liever dan een verzonnen stand te tonen
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const usage = await getUsage(supabase)
  if (usage.error) {
    return serverError(usage.error, 'calculators-usage:GET')
  }

  return Response.json(
    {
      generations: usage.generations,
      refinements: usage.refinements,
      maxGenerations: usage.maxGenerations,
      maxRefinements: usage.maxRefinements,
    },
    { status: 200 },
  )
}
