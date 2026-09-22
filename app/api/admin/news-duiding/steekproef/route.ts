import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import {
  leesSteekproefRegister,
  steekproefBodySchema,
  POORT_STEEKPROEF_KEY,
} from '@/lib/krant/duiding-beheer'

/**
 * POST /api/admin/news-duiding/steekproef — beheer legt de wekelijkse
 * handmatige steekproef (G7) vast: van hoeveel vrijgegeven samenvattingen er
 * deze week zijn nagelezen en hoeveel daarvan niet door de beugel konden.
 *
 * WAAROM EEN ROUTE EN GEEN BEREKENING: G1–G6 draait de code zelf; G7 is een
 * menselijk oordeel en kan dus niet uit de rijen worden afgeleid. `g7Gehaald`
 * leidt daarna wél af — uit dit register, zonder een teller op te hogen.
 *
 * Opslag: één `app_settings`-rij (`krant_poort_steekproef`), een object week →
 * telling. De schrijving is een READ-MODIFY-WRITE op dat object: een tweede
 * registratie van dezelfde week OVERSCHRIJFT die week (een correctie), andere
 * weken blijven staan. Daarmee is de route idempotent op (week, waarden) —
 * dezelfde invoer twee keer versturen verandert niets.
 *
 * AUDIT BIJ OVERSCHRIJVEN (security-review 1F fase 2, bevinding 3): omdat het
 * register alleen de LAATSTE telling per week bewaart, zou een gefaalde week
 * achteraf spoorloos op "gehaald" te zetten zijn — en G7 is de menselijke helft
 * van een poort die beslist of de Krant naar lezers mag. Elke schrijving gaat
 * daarom ook naar `admin_actions_log`, mét de vorige telling ernaast, in
 * dezelfde vorm als de terugtrek-route hiernaast.
 *
 * Privacy: alleen tellingen plus de beheerder-id en het moment. Geen
 * artikel-id's, geen kop, geen samenvatting — `app_settings` staat al op
 * VRIJ_LEESBAAR in de ADR 0146-gate en die gate wordt hiervoor niet verruimd.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const parsed = await parseBody(steekproefBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { week, gecontroleerd, fouten } = parsed.data
  // GEEN ondergrens op de registratie (eindreview 1F fase 2, M3). Een week met
  // minder dan STEEKPROEF_OMVANG nalezingen mag worden vastgelegd; hij telt
  // alleen niet mee voor de poort, en dat besluit valt op één plek:
  // `steekproefWeekGehaald`. Hier stond een 400 die de invoer verwierp met de
  // tekst "telt pas mee vanaf …" — drie lagen (uitleg, formulier, route) die
  // drie verschillende dingen zeiden. Wat een beheerder daadwerkelijk nalas is
  // een feit; het weigeren ervan maakt de poort niet strenger, alleen blinder.

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', POORT_STEEKPROEF_KEY)
    .maybeSingle()
  if (error) return serverError(error, 'admin-news-duiding-steekproef:POST')

  const register = leesSteekproefRegister(data?.value)
  const nu = new Date().toISOString()
  const vorige = register[week] ?? null
  register[week] = { gecontroleerd, fouten, op: nu }

  const { error: schrijfFout } = await supabase.from('app_settings').upsert(
    {
      key: POORT_STEEKPROEF_KEY,
      value: JSON.stringify(register),
      updated_at: nu,
      updated_by: user.id,
    },
    { onConflict: 'key' },
  )
  if (schrijfFout) return serverError(schrijfFout, 'admin-news-duiding-steekproef:POST')

  // Ná de geslaagde schrijving: een auditregel zonder schrijving zou een
  // poortoordeel suggereren dat niet is vastgelegd. `vorige` maakt een stille
  // correctie zichtbaar; is er niets overschreven, dan staat er null.
  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: 'nieuws.duiding.steekproef',
    targetLabel: week,
    detail: {
      week,
      gecontroleerd,
      fouten,
      vorige: vorige ? { gecontroleerd: vorige.gecontroleerd, fouten: vorige.fouten, op: vorige.op } : null,
    },
  })

  return NextResponse.json({ steekproef: register })
}
