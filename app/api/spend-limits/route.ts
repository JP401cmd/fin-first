import { NextResponse } from 'next/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { loadSpendLimitsSection } from '@/lib/spend-limits/loader'
import { SpendLimitInputSchema } from '@/lib/spend-limits/schema'
import {
  budgetsAreOwn,
  collectInputBudgetIds,
  replaceSpendLimitRules,
  toSpendLimitRow,
} from '@/lib/spend-limits/write-helpers'

/**
 * Grenzenpotten — lijst + aanmaken.
 *
 * Intern heet dit `spend-limits`; "Grenzenpot" is uitsluitend een weergavenaam
 * (lib/spend-limits/copy.ts). "Pot" was al bezet door `profiles.pot_rules`.
 *
 * Toegang: alle DB-toegang loopt via de INGELOGDE client, dus onder de own-row
 * RLS van `spend_limits`. Nooit de service-role — er is hier geen enkele reden
 * om RLS te omzeilen, en de aggregaat-RPC's die de uitkomst voeden zijn
 * SECURITY INVOKER en zouden onder service-role juist over ÁLLE gebruikers
 * rekenen.
 */

/**
 * GET — alle niet-gearchiveerde grenzenpotten met hun doorgerekende uitkomst.
 * Dezelfde loader die de transactiepagina server-side gebruikt, zodat pagina en
 * API per definitie hetzelfde getal tonen.
 */
export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  try {
    return NextResponse.json(await loadSpendLimitsSection(supabase))
  } catch (err) {
    return serverError(err, 'spend-limits:GET')
  }
}

/** POST — nieuwe grenzenpot. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(SpendLimitInputSchema, req)
  if (!parsed.ok) return parsed.response

  if (!(await budgetsAreOwn(supabase, collectInputBudgetIds(parsed.data)))) {
    return badRequest('Kies een geldig budget')
  }

  const { data, error } = await supabase
    .from('spend_limits')
    .insert({ ...toSpendLimitRow(parsed.data), user_id: user.id })
    .select('id')
    .single()

  if (error) return serverError(error, 'spend-limits:POST')

  // De pot bestaat nu, de regels nog niet. Faalt die tweede stap — bijvoorbeeld
  // omdat elk tegenpartij-label na normalisatie leeg blijft ("!!!") en de CHECK
  // `spend_limit_rules_not_empty` toeslaat — dan zou er een REGELLOZE pot
  // achterblijven die stil nul telt. Die ruimen we op: liever geen pot dan een
  // pot die er goed uitziet en niets meet.
  const rulesResult = await replaceSpendLimitRules(supabase, data.id, parsed.data)
  if (rulesResult.error) {
    await supabase.from('spend_limits').delete().eq('id', data.id).eq('user_id', user.id)
    return badRequest(
      'Deze regels leveren geen bruikbare zoekterm op. Kies een budget of gebruik letters of cijfers in de tegenpartij.',
    )
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
