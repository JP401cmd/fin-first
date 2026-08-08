import { NextResponse } from 'next/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { loadSpendLimitsSection } from '@/lib/spend-limits/loader'
import { SpendLimitInputSchema } from '@/lib/spend-limits/schema'
import { budgetIsOwn, toSpendLimitRow } from '@/lib/spend-limits/write-helpers'

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

  const row = toSpendLimitRow(parsed.data)

  if (parsed.data.ruleType === 'budget') {
    if (!(await budgetIsOwn(supabase, parsed.data.budgetId))) {
      return badRequest('Kies een geldig budget')
    }
  } else if (!row.counterparty_key) {
    // Een label dat na normalisatie niets overhoudt ("!!!") zou een lege sleutel
    // opleveren, en een lege sleutel matcht per definitie niets. Vang dat hier
    // af met een begrijpelijke melding i.p.v. een pot die stil nul telt.
    return badRequest('Deze tegenpartij levert geen bruikbare zoekterm op. Gebruik letters of cijfers.')
  }

  const { data, error } = await supabase
    .from('spend_limits')
    .insert({ ...row, user_id: user.id })
    .select('id')
    .single()

  if (error) return serverError(error, 'spend-limits:POST')

  return NextResponse.json({ id: data.id }, { status: 201 })
}
