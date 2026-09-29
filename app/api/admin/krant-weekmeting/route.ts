import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  bouwWeekreeks,
  WEEKMETING_KOLOMMEN,
  WEEKMETING_WEKEN_MAX,
  WEEKMETING_WEKEN_STANDAARD,
  type RuweWeekmetingRun,
} from '@/lib/krant/weekmeting'

/**
 * GET /api/admin/krant-weekmeting?weken=12 — de weekreeks van de Krant-meting
 * (B41): per afgesloten week het record dat de weekcron zelf vastlegde.
 *
 * ADR 0146 — beheer ziet gebruik, geen inhoud. Deze route leest UITSLUITEND
 * `job_runs` (VRIJ_LEESBAAR in de gate: operationele log) met een vaste
 * kolomlijst, net als `GET /api/admin/krant-meting`. Het record bevat alleen
 * tellingen; de verdeling per profieltype is bij het schrijven al
 * k=5-onderdrukt. Hier wordt niets herberekend: `bouwWeekreeks` leest de
 * summary defensief terug en houdt per week de laatste run.
 *
 * Een handmatige herhaling van de weekcron meet dezelfde week opnieuw; daarom
 * leest de route ruim (vier runs per week) en ontdubbelt op week.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const gevraagd = Number.parseInt(new URL(request.url).searchParams.get('weken') ?? '', 10)
  const weken = Number.isFinite(gevraagd)
    ? Math.min(Math.max(gevraagd, 1), WEEKMETING_WEKEN_MAX)
    : WEEKMETING_WEKEN_STANDAARD

  const { data, error } = await supabase
    .from('job_runs')
    .select(WEEKMETING_KOLOMMEN)
    .eq('job', 'krant-weekmeting')
    .order('started_at', { ascending: false })
    .limit(weken * 4)
  if (error) return serverError(error, 'admin-krant-weekmeting:GET')

  const reeks = bouwWeekreeks((data ?? []) as unknown as RuweWeekmetingRun[]).slice(0, weken)
  return NextResponse.json({ weken: reeks, gevraagdeWeken: weken })
}
