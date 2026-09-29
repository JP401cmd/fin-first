import { NextResponse } from 'next/server'
import { badRequest, forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { krantBronVoor, leestTijdlijn } from '@/lib/krant/tijdlijn-bron'
import { WEEK_KEY, decodeerCursor, heeftNieuw, laadTijdlijnPagina } from '@/lib/krant/tijdlijn-lezen'

/**
 * GET /api/krant/tijdlijn — de EIGEN tijdlijn (Krant 1C fase 2, B31/B32).
 *
 *   ?cursor=…          de volgende pagina van 20 (opaak, uit een vorige respons)
 *   ?week=2026-W40     alleen die archiefweek (optioneel met cursor)
 *   ?peek=1            alleen { nieuw } voor de nieuwsstip in de zijbalk
 *
 * De eerste pagina rendert de server al (app/(app)/nieuws/page.tsx); deze
 * route is voor "meer" en het archief. Lezen via de SESSIE-client onder de
 * own-row-RLS; het id komt uit auth.getUser(), er is geen parameter voor een
 * andere lezer, en er komt geen service-role aan te pas (lib/krant/tijdlijn-lezen.ts).
 * Dezelfde bronkeuze als /nieuws (B40): wie niet de tijdlijn leest, krijgt 403
 * — ook zolang de bèta-vlag dicht staat. Sinds 1E leest de Krant met AI (bron
 * 'ai') dezelfde tijdlijn (`leestTijdlijn`).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const params = new URL(request.url).searchParams
  const cursorTekst = params.get('cursor')
  const cursor = cursorTekst ? decodeerCursor(cursorTekst) : null
  if (cursorTekst && !cursor) return badRequest('Ongeldige cursor')
  const week = params.get('week')
  if (week && !WEEK_KEY.test(week)) return badRequest('Ongeldige week')

  try {
    const { bron } = await krantBronVoor(supabase, user.id)
    if (!leestTijdlijn(bron)) return forbidden()
    if (params.get('peek') === '1') return NextResponse.json({ nieuw: await heeftNieuw(supabase, user.id) })
    const pagina = await laadTijdlijnPagina(supabase, user.id, { cursor, week })
    return NextResponse.json({ pagina })
  } catch (err) {
    return serverError(err, 'krant-tijdlijn:GET')
  }
}
