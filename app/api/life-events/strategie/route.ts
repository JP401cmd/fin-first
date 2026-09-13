import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isUuid } from '@/lib/unlinked-cash'
import {
  bouwStrategieRij,
  StrategieBodySchema,
  VERWIJDERBARE_STRATEGIE_TYPES,
} from '@/lib/life-events/strategie-write'

/**
 * /api/life-events/strategie — schrijfroute voor de drie beheerde levensstrategieën: AOW,
 * werk en pensioenpotten (TPR-15 stap 3).
 *
 * ## Waarom deze route
 *
 * De AOW-, werk- en pensioen-editor schreven client-direct naar `life_events` (ADR 0058:
 * muteren hoort via een API-route). Dezelfde editor-body rendert nu op
 * /toekomst/gebeurtenissen én in de plan-review-wizard; beide slaan hier op. De route
 * schrijft uitsluitend deze drie typen, met een gesloten schema per type
 * (`lib/life-events/strategie-write.ts`); vrije gebeurtenissen blijven via hun eigen pad.
 *
 * ## Autorisatie
 *
 * Anon RLS-client mét sessie (nooit service-role). De SELECT-policy op `life_events` is
 * huishoud-gedeeld (`ownership = 'shared'`), INSERT/UPDATE/DELETE strikt eigen rij. Elke
 * lezing en write zet daarom zelf `.eq('user_id', user.id)`: zonder die scoping zou de
 * AOW-rij van de partner als "bestaande rij" gevonden worden, en een update daarop gaf een
 * stille nul-rij-"succes". Een id dat niet van de gebruiker is, niet bestaat of een ander
 * type heeft → 404 (geen bestaans-orakel).
 *
 * ## Welke rij
 *
 *  - `aow` en `werk`: één rij per gebruiker. De eerste actieve eigen rij van dat type wordt
 *    bijgewerkt (dezelfde die de editor toonde); is er geen, dan wordt hij aangemaakt. AOW
 *    ontstaat zo pas bij opslaan (besluit eigenaar 13 sep 2026), nooit als stille default.
 *  - `pension`: per id; zonder id een nieuwe pot achteraan (`sort_order` > 1000, zoals de
 *    editor deed).
 *
 * Het maandbedrag, de duur, het icoon en de indexatie leidt de server af uit de invoer.
 *
 * DELETE ?id= — alleen `werk` en `pension`. AOW verwijderen kan hier niet: zonder AOW-rij
 * rekent de kern met €0 AOW, en de editors bieden dat ook niet aan.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

async function bestaandeRij(
  supabase: Supabase,
  userId: string,
  eventType: 'aow' | 'werk' | 'pension',
  id: string | undefined,
) {
  let query = supabase.from('life_events').select('id, metadata').eq('user_id', userId).eq('event_type', eventType)
  // Zelfde volgorde als de lezers (sort_order), met created_at als vaste tiebreaker bij een
  // (race-)dubbele rij; een unieke index is een open restpunt (schemawijziging).
  query = id
    ? query.eq('id', id)
    : query.eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  return query.limit(1).maybeSingle()
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(StrategieBodySchema, req)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    const potId = body.event_type === 'pension' ? body.id : undefined
    // Pensioen zonder id = altijd een nieuwe pot; AOW/werk zoeken hun eigen rij.
    const zoekBestaand = body.event_type !== 'pension' || potId != null
    const bestaand = zoekBestaand ? await bestaandeRij(supabase, user.id, body.event_type, potId) : null
    if (bestaand?.error) return serverError(bestaand.error, 'life-events:strategie:PUT:read')
    if (potId != null && !bestaand?.data) return notFound('Pensioenpot niet gevonden')

    const rij = bouwStrategieRij(body, bestaand?.data?.metadata)

    if (bestaand?.data) {
      const { data, error } = await supabase
        .from('life_events')
        .update(rij)
        .eq('id', bestaand.data.id)
        .eq('user_id', user.id)
        .eq('event_type', body.event_type)
        .select('id')
        .maybeSingle()
      if (error) return serverError(error, 'life-events:strategie:PUT:update')
      if (!data) return notFound('Gebeurtenis niet gevonden')
      return NextResponse.json({ id: data.id, event: { ...rij, id: data.id } })
    }

    let sortOrder = 0
    if (body.event_type === 'pension') {
      const { data: potten, error: sortError } = await supabase
        .from('life_events')
        .select('sort_order')
        .eq('user_id', user.id)
        .eq('event_type', 'pension')
      if (sortError) return serverError(sortError, 'life-events:strategie:PUT:sort')
      sortOrder = (potten ?? []).reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 1000) + 1
    }

    const { data, error } = await supabase
      .from('life_events')
      .insert({ ...rij, user_id: user.id, sort_order: sortOrder })
      .select('id')
      .single()
    if (error) return serverError(error, 'life-events:strategie:PUT:insert')
    return NextResponse.json({ id: data.id, event: { ...rij, id: data.id, sort_order: sortOrder } }, { status: 201 })
  } catch (err) {
    return serverError(err, 'life-events:strategie:PUT')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return badRequest('Geen gebeurtenis opgegeven')
    if (!isUuid(id)) return notFound('Gebeurtenis niet gevonden')

    const { data, error } = await supabase
      .from('life_events')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .in('event_type', [...VERWIJDERBARE_STRATEGIE_TYPES])
      .select('id')
      .maybeSingle()
    if (error) return serverError(error, 'life-events:strategie:DELETE')
    if (!data) return notFound('Gebeurtenis niet gevonden')
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return serverError(err, 'life-events:strategie:DELETE')
  }
}
