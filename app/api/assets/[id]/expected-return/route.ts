import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, conflict, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isUuid } from '@/lib/unlinked-cash'
import { assetReturnBandError, isWithinAssetReturnBand } from '@/lib/asset-parameter-bands'

/**
 * PATCH /api/assets/[id]/expected-return — alleen het rendement (`assets.expected_return`,
 * PERCENT: 7 = 7%) van één eigen bezitting (TPR-15, laag 2 "Voor wie wil" van de plan-review).
 *
 * ## Waarom een eigen, smalle route
 *
 * Het bezittingenformulier schrijft `expected_return` mee in een client-directe update van de
 * hele rij (grandfathered, ADR 0058). De plan-review wil alleen dit ene getal wijzigen, zonder
 * de rest van de rij te kennen. Zelfde vorm als `PATCH /api/assets/[id]/sale-config`: een
 * gesloten schema dat uitsluitend deze kolom schrijft.
 *
 * ## Autorisatie
 *
 * Anon RLS-client mét sessie (nooit service-role). De SELECT-policy op `assets` is
 * huishoud-gedeeld, de UPDATE-policy strikt eigen-rij: daarom lezen én schrijven met een
 * expliciete `.eq('user_id', user.id)` en 404 bij 0 rijen — een partnerrij geeft nooit een
 * stille "succes" en ook geen bestaans-orakel (malformed id → dezelfde 404).
 *
 * ## Validatie — dezelfde regels als het formulier
 *
 * - Band PER TYPE (`lib/asset-parameter-bands.ts`, gedeeld met `POST /api/assets` en het
 *   formulier; de DB-CHECK is alleen de ruime vangrail). Daarvoor is het type nodig: één
 *   eigen-rij-lezing vooraf, en de update pint dat type (`.eq('asset_type', …)`), zodat een
 *   gelijktijdige typewissel niet onder de verkeerde band wordt geschreven (0 rijen → 404).
 * - Afschrijvend bezit (`depreciation_rate > 0`): het formulier zet `expected_return` dan op 0
 *   en toont het veld niet. Die invariant blijft staan → 409; ook in de update zelf gefilterd.
 * - "Geen eigen rendement" (NULL → terugvalrendement) is hier bewust NIET uit te drukken: de
 *   kolom is NOT NULL DEFAULT 0 (TPR-02, schemawijziging op een eigen kaart).
 */

// zod 4: `z.number()` weigert zelf al NaN en ±Infinity.
const BodySchema = z.object({ expected_return: z.number() }).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Anon RLS-client mét de sessie van de aanroeper — nooit service-role.
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    if (!isUuid(id)) return notFound('Bezitting niet gevonden')

    const parsed = await parseBody(BodySchema, req)
    if (!parsed.ok) return parsed.response
    const expectedReturn = parsed.data.expected_return

    const { data: bezit, error: readError } = await supabase
      .from('assets')
      .select('id, asset_type, depreciation_rate')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) return serverError(readError, 'assets:expected-return:PATCH:read')
    if (!bezit) return notFound('Bezitting niet gevonden')

    if (Number(bezit.depreciation_rate) > 0) {
      return conflict('Deze bezitting schrijft af. Pas het afschrijvingspercentage aan in het bezittingenformulier.')
    }
    if (!isWithinAssetReturnBand(bezit.asset_type, expectedReturn)) {
      return badRequest(assetReturnBandError(bezit.asset_type))
    }

    const { data, error } = await supabase
      .from('assets')
      .update({ expected_return: expectedReturn })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('asset_type', bezit.asset_type)
      .or('depreciation_rate.is.null,depreciation_rate.lte.0')
      .select('id')
      .maybeSingle()

    if (error) return serverError(error, 'assets:expected-return:PATCH:update')
    // 0 rijen = intussen weg, van type gewisseld of afschrijvend geworden.
    if (!data) return notFound('Bezitting niet gevonden')

    return NextResponse.json({ id: data.id, expected_return: expectedReturn })
  } catch (err) {
    return serverError(err, 'assets:expected-return:PATCH')
  }
}
