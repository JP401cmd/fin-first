import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { krantBronVoor, leestTijdlijn } from '@/lib/krant/tijdlijn-bron'
import { parseBody } from '@/lib/api/parse-body'
import { vereisBearer } from '@/lib/supabase/bearer'
import { profielPutBodySchema } from '@/lib/krant/contract'
import { leesEigenProfiel, rijNaarV1Profiel, schrijfEigenProfiel } from '@/lib/krant/v1-profiel'

/**
 * /api/v1/krant/profiel — het EIGEN nieuwsprofiel (Krant 3A, ADR 0187).
 *
 *   GET  de dertien velden in banden + per veld de herkomst (zelf/afgeleid)
 *   PUT  zet de meegegeven velden en markeert ze als `zelf` — alleen voor wie
 *        de tijdlijn leest (`krantBronVoor` → 'tijdlijn'), anders 403
 *
 * Beide via de Bearer-client onder de own-row-RLS; het id komt uit het
 * geverifieerde token, er is geen parameter voor een andere lezer. PUT is
 * strikt (`z.strictObject`): krant_variant, afgeleid_at, tijdlijn_* en elke
 * onbekende sleutel zijn een 400 — en de kolomgrant van migratie
 * 20261004120000 zou ze daarna alsnog weigeren.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await vereisBearer(request, { muteren: false })
  if (!auth.ok) return auth.response
  try {
    const rij = await leesEigenProfiel(auth.client, auth.userId)
    return NextResponse.json(rijNaarV1Profiel(rij))
  } catch (err) {
    return serverError(err, 'krant-v1:profiel:GET')
  }
}

export async function PUT(request: Request) {
  const auth = await vereisBearer(request, { muteren: true })
  if (!auth.ok) return auth.response
  const parsed = await parseBody(profielPutBodySchema, request)
  if (!parsed.ok) return parsed.response
  try {
    // Schrijven alleen voor wie de tijdlijn leest (security G2, zoals PUT
    // /api/krant/tijdlijn/gelezen): buiten de bèta maakt niemand zo een
    // nieuwsprofiel-rij aan of zet hij 'zelf'-waarden. Inzage (GET) blijft open.
    // Sinds 1E (ADR 0190) is 'ai' de tijdlijn mét de AI-laag: ook die lezer schrijft (security-run 0.92.27, G3).
    const { bron } = await krantBronVoor(auth.client, auth.userId)
    if (!leestTijdlijn(bron)) return forbidden()
    const rij = await schrijfEigenProfiel(auth.client, auth.userId, parsed.data)
    return NextResponse.json(rijNaarV1Profiel(rij))
  } catch (err) {
    return serverError(err, 'krant-v1:profiel:PUT')
  }
}
