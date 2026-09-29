import { NextResponse } from 'next/server'
import { errorResponse, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { mapWithConcurrency } from '@/lib/concurrency'
import { resolveActiveModules } from '@/lib/modules/resolve'
import { laadKandidaten } from '@/lib/krant/editie-loader'
import { ruimTijdlijnOp, ververs } from '@/lib/krant/tijdlijn-run'
import { inTijdlijnBeta } from '@/lib/krant/tijdlijn-beta'

export const maxDuration = 300

/** Ruim binnen maxDuration: wat niet past, komt bij de volgende run of de vernieuwknop. */
export const TIJDLIJN_CRON_TIJDBUDGET_MS = 240_000
export const TIJDLIJN_CRON_CONCURRENCY = 3

/**
 * GET /api/krant/tijdlijn/cron — de dagelijkse verversing van de tijdlijn-bèta
 * (Krant 1C, U11: "automatisch na de ingest", naast de knop uit fase 2).
 *
 * Dagelijks 06:30 UTC (vercel.json), ná de ingest + duiding van 05:00. Eigen
 * cron in plaats van een staart aan de ingest: het tijdbudget van de ingest
 * knelt al (de duiding wordt uitgesteld), en wat na 06:30 geduid wordt komt
 * de dag erna of via de knop.
 *
 * Voor wie: `nieuwsprofiel.krant_variant = 'tijdlijn'` én de module nieuws.
 * Tweede slot, bovenop de kolomgrant van migratie 20261004120000 (alleen de
 * service-role zet krant_variant): zolang TIJDLIJN_BETA_OPEN false staat,
 * draait hij uitsluitend voor superadmins (`inTijdlijnBeta`) — een per ongeluk
 * gezette variant bij een gewone lezer levert dan geen verwerking op vóór
 * /privacy 2.4 live is. De rol is hier een verwerkingsslot, geen beheerrecht:
 * de route leest dezelfde profielkolommen als de weekcron (/api/krant/cron) en
 * geen inhoud van anderen (ADR 0146).
 *
 * Per lezer: `ververs` (profiel afleiden → matcher in tijdlijnmodus → een
 * verversing met bron 'tijdlijn', ook als die leeg is) en de opruimstap van
 * 120 dagen (B32). Geen idempotentie per dag nodig: een tweede run voegt alleen
 * toe wat er nog niet stond (gezien = de eigen tijdlijn; de partiële unieke
 * index vangt een race met de knop).
 *
 * Spiegelt /api/krant/cron: CRON_SECRET fail-closed in productie, geen
 * job_runs-write vóór de auth, service-role-client, en een summary met alleen
 * tellingen (ADR 0146) → /beheer/jobs als 'krant-tijdlijn'.
 */

function getServiceClientOrNull() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return getServiceClient()
}

export interface TijdlijnCronSummary {
  /** Lezers met krant_variant 'tijdlijn' die deze run in aanmerking kwamen. */
  lezers: number
  /** Lezers met de variant maar buiten de bèta (vlag dicht, geen superadmin) of zonder module nieuws. */
  buitenBeta: number
  verversingen: number
  /** Verversingen die niets toevoegden. */
  leeg: number
  /** Nieuwe berichten over alle lezers. */
  berichten: number
  opgeruimd: number
  /** Verversingen die de unieke index weigerde (race met de knop): niets verloren, de volgende run neemt de rest mee. */
  overgeslagen: number
  fouten: number
  kandidaten: number
  kandidatenOngeldig: number
  tijdBudgetOp: boolean
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()
  const service = getServiceClientOrNull()

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
  if (!isAuthorized) {
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }
  if (!service) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }

  const now = new Date()
  const summary: TijdlijnCronSummary = {
    lezers: 0,
    buitenBeta: 0,
    verversingen: 0,
    leeg: 0,
    berichten: 0,
    opgeruimd: 0,
    overgeslagen: 0,
    fouten: 0,
    kandidaten: 0,
    kandidatenOngeldig: 0,
    tijdBudgetOp: false,
  }

  try {
    const { data: varianten, error: variantFout } = await service.from('nieuwsprofiel').select('user_id').eq('krant_variant', 'tijdlijn')
    if (variantFout) {
      await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, error: variantFout.message })
      return serverError(variantFout, 'krant-tijdlijn-cron:GET')
    }
    const ids = ((varianten ?? []) as Array<{ user_id: string }>).map((v) => v.user_id)

    let lezers: string[] = []
    if (ids.length > 0) {
      const { data: profielen, error: profielFout } = await service
        .from('profiles')
        .select('id, role, active_modules, onboarding_completed')
        .in('id', ids)
      if (profielFout) {
        await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, error: profielFout.message })
        return serverError(profielFout, 'krant-tijdlijn-cron:GET')
      }
      lezers = ((profielen ?? []) as Array<{ id: string; role: string | null; active_modules: string[] | null; onboarding_completed: boolean | null }>)
        .filter((p) => p.onboarding_completed === true && resolveActiveModules(p).includes('nieuws'))
        .filter((p) => inTijdlijnBeta(p.role))
        .map((p) => p.id)
    }
    summary.lezers = lezers.length
    summary.buitenBeta = ids.length - lezers.length

    if (lezers.length > 0) {
      const [{ artikelen, ongeldig }, aowRows] = await Promise.all([laadKandidaten(service, now), getAowLeeftijden(service)])
      summary.kandidaten = artikelen.length
      summary.kandidatenOngeldig = ongeldig

      await mapWithConcurrency(lezers, TIJDLIJN_CRON_CONCURRENCY, async (userId) => {
        if (Date.now() - startMs > TIJDLIJN_CRON_TIJDBUDGET_MS) {
          summary.tijdBudgetOp = true
          return
        }
        try {
          const uitkomst = await ververs(service, { userId, now, aowRows, kandidaten: artikelen })
          summary.verversingen++
          summary.berichten += uitkomst.items
          if (uitkomst.leeg) summary.leeg++
          summary.opgeruimd += await ruimTijdlijnOp(service, userId, now)
        } catch (err) {
          // 23505 op de partiële unieke index = de knop was deze lezer net voor:
          // de compensatie in schrijfEditie haalde deze verversing weg en er is
          // niets dubbel. Geen fout (eindreview L6).
          if (err instanceof Error && /23505|duplicate key/i.test(err.message)) {
            summary.overgeslagen++
            return
          }
          summary.fouten++
          console.error('[krant/tijdlijn-cron] lezer mislukt:', userId, err)
        }
      })
    }

    await recordJobRun(service, {
      job: 'krant-tijdlijn',
      status: 'success',
      startedAt,
      summary,
      error: summary.fouten > 0 ? `${summary.fouten} lezer(s) faalden` : summary.tijdBudgetOp ? 'tijdbudget op — rest volgt bij de volgende run' : null,
    })
    return NextResponse.json({ success: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[krant/tijdlijn-cron] failed:', message)
    await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, summary, error: message })
    return serverError(err, 'krant-tijdlijn-cron:GET')
  }
}
