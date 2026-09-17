import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import {
  BANK_SKIP_REDENEN,
  readOpenAfronding,
  withAfrondingVoortgang,
  type AfrondingVoortgang,
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

  // Welke koppelingen komen uit DEZE onboarding? (ADR 0158)
  //
  // De eerste ophaal op het homescherm mag alleen deze aanraken. Zonder die
  // binding zou hij afgaan op gebruikerstoestand en daarmee ook een koppeling
  // meesleuren die de gebruiker binnen hetzelfde 24-uursvenster ergens anders
  // legt — wat stil het correctiemoment van ADR 0069 sluit. Onherstelbaar.
  //
  // Server-bepaald, net als de budget-telling in GET hierboven en om dezelfde
  // reden (ADR 0058): de client mag deze ids niet aanleveren, anders kan hij
  // de grens zelf oprekken. Expliciete `user_id`-filter.
  //
  // Niet-fataal: faalt de telling, dan blijft de lijst leeg en gebeurt er
  // hooguit géén automatische ophaal. De afronding mag daar niet op stuklopen.
  let voortgang: AfrondingVoortgang = parsed.data
  if (voortgang.stap === 'klaar' && voortgang.bank === 'gekoppeld') {
    const { data: koppelingen } = await supabase
      .from('bank_connection_accounts')
      .select('id')
      .eq('user_id', claims.sub)
      .eq('is_active', true)
    if (koppelingen?.length) {
      voortgang = { ...voortgang, bankKoppelingen: koppelingen.map((k) => k.id as string) }
    }
  }

  const next = withAfrondingVoortgang(current, voortgang)

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: next })
    .eq('id', claims.sub)

  if (writeError) return serverError(writeError, 'onboarding-afronding:POST:write')

  return NextResponse.json({ ok: true, open: parsed.data.stap !== 'klaar' })
}
