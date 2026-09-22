import { NextResponse } from 'next/server'
import { conflict, forbidden, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { terugtrekBodySchema } from '@/lib/krant/duiding-beheer'
import { herberekenNaTerugtrekking } from '@/lib/krant/editie-herberekening'

/**
 * POST /api/admin/news-duiding/terugtrekken — beheer trekt een geduide
 * duiding terug (B4: automatisch vrijgeven, achteraf terugtrekken; ADR 0171).
 *
 * Volgorde en garanties:
 *  1. Gate op de INGELOGDE client: 401 zonder sessie, 403 zonder superadmin —
 *     vóór er iets gelezen of geschreven wordt.
 *  2. zod via `parseBody` (id + reden uit de CHECK-lijst; bij 'anders' een
 *     toelichting).
 *  3. Eén geconditioneerde UPDATE op `news_articles` (`id` + status 'geduid'):
 *     status, tijdstip, wie en waarom gaan in dezelfde schrijfactie, dus de
 *     audit van B4 staat op de rij zelf en kan niet los raken van de status
 *     (de CHECK `news_articles_teruggetrokken_volledig_check` eist tijdstip +
 *     reden). De duiding-jsonb blijft staan: de meting leest er het
 *     mechanisme van om "fout getal bij een rekenend mechanisme" te tellen.
 *  4. Idempotent: is de rij al teruggetrokken, dan 200 met
 *     `alTeruggetrokken: true` — de oorspronkelijke wie/wanneer/waarom blijft
 *     staan en er komt geen tweede auditregel. De herberekening draait in die
 *     tak wél opnieuw (zelf idempotent: hij vindt alleen nog niet-vervangen
 *     edities mét het artikel), zodat een herhaalde klik na een time-out of
 *     een mislukte herberekening de edities alsnog rechtzet. Alleen 'geduid' is
 *     terug te trekken; elke andere status geeft 409. Er is GEEN terugweg naar
 *     'geduid': de analyse legt die niet, en een versie-bump laat
 *     'teruggetrokken' bewust staan (lib/krant/duiding.ts). Een foute
 *     terugtrekking herstel je alleen met een bewuste SQL-correctie.
 *  5. `admin_actions_log` (actie `nieuws.duiding.terugtrekken`) met reden en
 *     toelichting — naast de rij-audit, voor het beheer-brede overzicht.
 *  6. De edities van de lopende week waarin het artikel stond worden opnieuw
 *     berekend (1B, `herberekenNaTerugtrekking`). Die draait op de
 *     service-role over meta-kolommen en geeft alleen een AANTAL terug — beheer
 *     ziet geen editie-inhoud (ADR 0146). Faalt de herberekening, dan blijft de
 *     terugtrekking staan (die is het belangrijkste) en meldt de respons dat.
 *
 * Foutvorm: de helpers uit lib/api/respond.ts; nooit een rauwe DB-fout.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// De herberekening draait per geraakte lezer de volledige editieketen.
export const maxDuration = 120

/**
 * Herbereken de edities van de lopende week zonder dit artikel. Faalt dat, dan
 * blijft de terugtrekking staan (die is het belangrijkste): server-side
 * loggen, de client krijgt `null` — geen foutdetail.
 */
async function herbereken(id: string): Promise<number | null> {
  try {
    return (await herberekenNaTerugtrekking(getServiceClient(), id)).edities
  } catch (err) {
    console.error('[admin-news-duiding-terugtrekken:herberekening]', err instanceof Error ? err.message : err)
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const parsed = await parseBody(terugtrekBodySchema, request)
  if (!parsed.ok) return parsed.response
  const { id, reden, toelichting } = parsed.data

  const nu = new Date().toISOString()
  const { data: geraakt, error: updateFout } = await supabase
    .from('news_articles')
    .update({
      duiding_status: 'teruggetrokken',
      teruggetrokken_at: nu,
      teruggetrokken_door: user.id,
      teruggetrokken_reden: reden,
    })
    .eq('id', id)
    .eq('duiding_status', 'geduid')
    .select('id, title')
  if (updateFout) return serverError(updateFout, 'admin-news-duiding-terugtrekken:POST')

  if (!geraakt || geraakt.length === 0) {
    const { data: huidig, error: leesFout } = await supabase
      .from('news_articles')
      .select('id, duiding_status')
      .eq('id', id)
      .maybeSingle()
    if (leesFout) return serverError(leesFout, 'admin-news-duiding-terugtrekken:POST')
    if (!huidig) return notFound('Artikel niet gevonden')
    if (huidig.duiding_status !== 'teruggetrokken') {
      return conflict('Alleen een geduide duiding kun je terugtrekken', 'niet_geduid')
    }
    const edities = await herbereken(id)
    return NextResponse.json({
      status: 'teruggetrokken',
      alTeruggetrokken: true,
      edities,
      herberekeningMislukt: edities === null,
    })
  }

  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: 'nieuws.duiding.terugtrekken',
    targetLabel: geraakt[0].title ?? null,
    detail: { articleId: id, reden, toelichting: toelichting || null },
  })

  const edities = await herbereken(id)
  return NextResponse.json({
    status: 'teruggetrokken',
    alTeruggetrokken: false,
    edities,
    herberekeningMislukt: edities === null,
  })
}
