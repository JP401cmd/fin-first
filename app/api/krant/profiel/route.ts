import { NextResponse } from 'next/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/supabase/cached-user'
import { profielPutBodySchema } from '@/lib/krant/contract'
import { krantBronVoor, leestTijdlijn } from '@/lib/krant/tijdlijn-bron'
import { isGeblokkeerd } from '@/lib/krant/aanmelden'
import { leesEigenProfiel, rijNaarV1Profiel, schrijfEigenProfiel } from '@/lib/krant/v1-profiel'

/**
 * /api/krant/profiel — het EIGEN nieuwsprofiel, voor de web-app (Krant 2C,
 * ADR 0192): de onboarding van de Krant en /mijn/nieuwsprofiel.
 *
 *   GET  de dertien velden in banden + per veld de herkomst (zelf/afgeleid)
 *   PUT  zet de meegegeven velden en markeert ze als `zelf`
 *
 * ÉÉN BRON MET DE NATIVE API: dezelfde validatie (`profielPutBodySchema`, strikt,
 * rubrieken beperkt tot NEWS_CATEGORIES, max 20) en dezelfde lees/schrijf-
 * helpers (`lib/krant/v1-profiel.ts`) als /api/v1/krant/profiel. Het enige
 * verschil is de sessie: hier de cookie-sessie van de web-app, daar een Bearer.
 *
 * - Sessie-client (anon-sleutel + RLS, eigen rij), NOOIT service-role. De
 *   kolomgrant van migratie 20261004120000 laat een sessie alleen de
 *   profielvelden, `herkomst`, `tijdlijn_gelezen_tot`, `updated_at` en
 *   `user_id` schrijven — `krant_variant`, `afgeleid_at` en
 *   `tijdlijn_vernieuwd_at` kan deze route niet raken. De strikte body weigert
 *   ze bovendien al met een 400.
 * - Elk meegestuurd veld krijgt herkomst `zelf`, ook `null` ("weet ik niet");
 *   overgeslagen velden blijven ongemoeid. Idempotent: upsert op `user_id`.
 * - Achter de gesloten vlag: alleen voor wie de tijdlijn leest
 *   (`krantBronVoor` → leestTijdlijn). Voor ieder ander een 404 — ook GET: dit
 *   is het oppervlak van een scherm dat buiten de bèta niet bestaat. Inzage
 *   blijft via de AVG-export en de native API.
 * - Geen AI: deze route roept geen model aan (bron-scan in
 *   lib/krant/aanmelden.geen-ai.test.ts).
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return unauthorized()
    if (await isGeblokkeerd(supabase, user.id)) return notFound()
    const { bron } = await krantBronVoor(supabase, user.id)
    if (!leestTijdlijn(bron)) return notFound()
    const rij = await leesEigenProfiel(supabase, user.id)
    return NextResponse.json(rijNaarV1Profiel(rij))
  } catch (err) {
    return serverError(err, 'krant-profiel:GET')
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return unauthorized()
    // Eerst de poort, dan de body: buiten de tijdlijn altijd 404, wat de body ook is.
    if (await isGeblokkeerd(supabase, user.id)) return notFound()
    const { bron } = await krantBronVoor(supabase, user.id)
    if (!leestTijdlijn(bron)) return notFound()
    const parsed = await parseBody(profielPutBodySchema, request)
    if (!parsed.ok) return parsed.response
    const rij = await schrijfEigenProfiel(supabase, user.id, parsed.data)
    return NextResponse.json(rijNaarV1Profiel(rij))
  } catch (err) {
    return serverError(err, 'krant-profiel:PUT')
  }
}
