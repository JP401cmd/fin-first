import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  bouwKrantMeting,
  KRANT_METING_KOLOMMEN,
  KRANT_METING_RUNS_MAX,
  KRANT_METING_RUNS_STANDAARD,
  type RuweJobRun,
} from '@/lib/krant/meting-beheer'

/**
 * GET /api/admin/krant-meting?runs=12 — de K1-meting van de schaduweditie
 * (poort: hoe vaak blijft een editie leeg, per profieltype, en de overlap met
 * de LLM-editie op de testaccounts).
 *
 * ADR 0146 — beheer ziet gebruik, geen inhoud. Deze route leest daarom
 * UITSLUITEND `job_runs` (VRIJ_LEESBAAR in de gate: operationele log) met een
 * vaste kolomlijst. Geen `krant_edities`, geen `krant_editie_items`, geen
 * `nieuwsprofiel` — die blijven op de strenge regel en worden hier niet
 * aangeraakt. Daarmee hoeft `editie_id` NIET aan `META_KOLOMMEN` te worden
 * toegevoegd (de openstaande G6 uit de security-run van fase 2).
 *
 * De cijfers zijn die van de cron zelf (`KrantCronSummary`): de verdeling per
 * profieltype is dáár al k=5-onderdrukt voor echte gebruikers
 * (lib/krant/meting.ts) en ongedrukt voor de vijf testaccounts. Hier wordt niets
 * herberekend en niets opnieuw onderdrukt — `bouwKrantMeting` leest de summary
 * defensief terug en telt alleen op wat veilig optelbaar is.
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

  const gevraagd = Number.parseInt(new URL(request.url).searchParams.get('runs') ?? '', 10)
  const runs = Number.isFinite(gevraagd)
    ? Math.min(Math.max(gevraagd, 1), KRANT_METING_RUNS_MAX)
    : KRANT_METING_RUNS_STANDAARD

  const { data, error } = await supabase
    .from('job_runs')
    .select(KRANT_METING_KOLOMMEN)
    .eq('job', 'krant-editie')
    .order('started_at', { ascending: false })
    .limit(runs)
  if (error) return serverError(error, 'admin-krant-meting:GET')

  const meting = bouwKrantMeting((data ?? []) as unknown as RuweJobRun[])
  return NextResponse.json({ ...meting, gevraagdeRuns: runs })
}
