import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import {
  BANK_SKIP_REDENEN,
  readOpenAfronding,
  withAfrondingVoortgang,
} from '@/lib/onboarding/afronding'

/**
 * POST /api/onboarding/afronding — zet de afrondingsstappen van de onboarding
 * (budget inrichten → bank koppelen) een stap verder. Zie
 * `lib/onboarding/afronding.ts` voor waarom die stappen ná de onboarding-opslag
 * draaien en waarom er een markering bestaat.
 *
 * OPSLAG — onder één sleutel in `profiles.module_guide_state` (geen nieuwe
 * kolom, geen migratie). Eigen rij via de anon-RLS-client, read-modify-write
 * zodat de welkomstgids, coachmarks en rondleiding-vlag blijven staan.
 * Spiegelt `app/api/coachmark`.
 *
 * GEEN HEROPENING — de route schuift alleen een markering door die nog open
 * staat. Een gebruiker zonder (of met een verlopen/afgeronde) markering kan
 * hiermee niet terug de onboarding in worden gestuurd; de call is dan een
 * no-op met `open: false`.
 */

const VoortgangSchema = z.discriminatedUnion('stap', [
  z.object({
    stap: z.literal('bank'),
    budget: z.enum(['opgeslagen', 'overgeslagen']),
  }),
  z.object({
    stap: z.literal('klaar'),
    bank: z.union([
      z.literal('gekoppeld'),
      z.object({ overgeslagen: z.enum(BANK_SKIP_REDENEN) }),
    ]),
  }),
])

/**
 * GET — waar hervat een voltooide onboarding? Geeft de open stap, en schuift
 * `budget` zelf door naar `bank` als er al een budgetplan staat.
 *
 * Waarom server-side: het wegschrijven van de markering na "Budget opslaan" is
 * best-effort. Mislukt dat en sluit iemand de app, dan hervat de pagina op de
 * budgetstap terwijl het plan al bestaat — en een tweede opslag botst op de
 * unieke slug-index. De telling op `budgets` hoort niet in de client (ADR 0058),
 * dus die doet deze route, met een expliciete `user_id`-filter.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', claims.sub)
    .maybeSingle()
  if (error) return serverError(error, 'onboarding-afronding:GET:read')

  const current = data?.module_guide_state ?? null
  const stap = readOpenAfronding(current)
  if (stap !== 'budget') return NextResponse.json({ stap })

  const { count, error: countError } = await supabase
    .from('budgets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', claims.sub)
  if (countError) return serverError(countError, 'onboarding-afronding:GET:budgets')
  if (!count) return NextResponse.json({ stap })

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: withAfrondingVoortgang(current, { stap: 'bank', budget: 'opgeslagen' }) })
    .eq('id', claims.sub)
  if (writeError) return serverError(writeError, 'onboarding-afronding:GET:write')

  return NextResponse.json({ stap: 'bank' })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(VoortgangSchema, request)
  if (!parsed.ok) return parsed.response

  const { data, error: readError } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', claims.sub)
    .maybeSingle()

  if (readError) return serverError(readError, 'onboarding-afronding:POST:read')

  const current = data?.module_guide_state ?? null
  if (readOpenAfronding(current) === null) {
    return NextResponse.json({ ok: true, open: false })
  }

  const next = withAfrondingVoortgang(current, parsed.data)

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: next })
    .eq('id', claims.sub)

  if (writeError) return serverError(writeError, 'onboarding-afronding:POST:write')

  return NextResponse.json({ ok: true, open: parsed.data.stap !== 'klaar' })
}
