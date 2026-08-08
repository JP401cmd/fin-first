import { NextResponse } from 'next/server'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { SpendLimitInputSchema } from '@/lib/spend-limits/schema'
import { budgetIsOwn, toSpendLimitRow } from '@/lib/spend-limits/write-helpers'

/**
 * Grenzenpot — wijzigen (incl. pauzeren) en archiveren.
 *
 * Toegang: de ingelogde client, dus onder own-row RLS. De `.eq('user_id', …)`
 * in de queries is bewust dubbelop — RLS is de beveiligingsgrens, dit is de
 * vangrail die een gemiste policy zichtbaar maakt als 404 in plaats van als
 * stille cross-user-write. "Bestaat niet" en "is van iemand anders" geven
 * hetzelfde antwoord, zodat er geen existence-oracle ontstaat.
 *
 * LET OP — RETROACTIEF: de uitkomst per periode wordt niet opgeslagen maar
 * on-the-fly herrekend (ADR 0089). Een gewijzigde regel of grens werkt dus met
 * terugwerkende kracht en kan een lopende reeks breken of herstellen. De UI
 * waarschuwt daarvoor bij het bewerken; hier is geen versionering.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badRequest('Ongeldig ID-formaat')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(SpendLimitInputSchema, req)
  if (!parsed.ok) return parsed.response

  const update = toSpendLimitRow(parsed.data)

  if (parsed.data.ruleType === 'budget') {
    if (!(await budgetIsOwn(supabase, parsed.data.budgetId))) {
      return badRequest('Kies een geldig budget')
    }
  } else if (!update.counterparty_key) {
    return badRequest('Deze tegenpartij levert geen bruikbare zoekterm op. Gebruik letters of cijfers.')
  }

  const { data, error } = await supabase
    .from('spend_limits')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .select('id')
    .maybeSingle()

  if (error) return serverError(error, 'spend-limits:PATCH')
  // Naam-neutraal: de weergavenaam is een profielvoorkeur (grenzenpot ⇄
  // schaamtepot) en die opvragen voor de tekst van een 404 is een extra query
  // niet waard. `notFound()` gebruikt de app-brede standaardtekst.
  if (!data) return notFound()

  return NextResponse.json({ id: data.id })
}

/**
 * DELETE — ARCHIVEREN, niet hard verwijderen (spiegelt /api/budgets/[id]).
 * De rij blijft bestaan zodat een pot later teruggehaald kan worden en een
 * eventuele latere audit-weergave niet in een gat kijkt; de loader filtert op
 * `is_archived = false`, dus hij verdwijnt overal uit beeld.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badRequest('Ongeldig ID-formaat')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase
    .from('spend_limits')
    .update({ is_archived: true, is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .select('id')
    .maybeSingle()

  if (error) return serverError(error, 'spend-limits:DELETE')
  // Naam-neutraal, zie PATCH hierboven.
  if (!data) return notFound()

  return NextResponse.json({ archived: true })
}
