import { NextResponse } from 'next/server'
import { errorResponse, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { mapWithConcurrency } from '@/lib/concurrency'
import { resolveActiveModules } from '@/lib/modules/resolve'
import { laadKandidaten } from '@/lib/krant/editie-loader'
import { runEditieVoor } from '@/lib/krant/editie-run'
import { geldendeEditieId, ruimSchaduwOp } from '@/lib/krant/editie-schrijver'
import { onderdrukPerProfieltype, telProfieltype, type OnderdrukteTelling, type ProfieltypeTelling } from '@/lib/krant/meting'

// De run loopt over alle profielen; per gebruiker ~7 reads + 2 writes. Zelfde
// conventie als app/api/news-ingest/cron/route.ts; het eigen tijdbudget
// hieronder stopt ruim vóór deze grens.
export const maxDuration = 300

/** Ruim binnen maxDuration: wat niet past, komt bij de volgende run (idempotent per week). */
export const KRANT_CRON_TIJDBUDGET_MS = 240_000
/** Gelijktijdige gebruikers; de reads zijn licht, de service-client is gedeeld. */
export const KRANT_CRON_CONCURRENCY = 3

/**
 * GET /api/krant/cron — de weekeditie van de Krant zonder AI, in de schaduw (K1).
 *
 * Maandag 06:00 UTC (vercel.json), ná de dagelijkse ingest + duiding van
 * 05:00. Voor elke gebruiker met de module `nieuws` (resolveActiveModules —
 * null = alle modules) leidt hij het nieuwsprofiel af uit de eigen data (B8),
 * draait de matcher (ADR 0172) en schrijft een editie met bron 'schaduw' in
 * krant_edities/krant_editie_items (ADR 0173). Geen lezer ziet daar iets van;
 * `news_editions` en het LLM-pad blijven onaangeraakt (keuze 8, B10).
 *
 * Spiegelt het cron-patroon van briefing/email en cron/retention:
 *  - CRON_SECRET, fail-closed in productie; geen job_runs-write vóór de auth;
 *  - service-role-client (leest ALLE profielen — daarom draagt elke query in
 *    lib/krant/profiel-afleiding.ts en editie-loader.ts een eigen user_id-scope);
 *  - recordJobRun('krant-editie', …) → /beheer/jobs.
 *
 * Idempotent per ISO-week: een gebruiker met een geldende schaduweditie voor
 * deze week wordt overgeslagen, zodat een tweede aanroep (handmatige GET met
 * het secret ná een run die op het tijdbudget afbrak) de rest afmaakt zonder
 * dubbele edities. De check is applicatieniveau (check-then-act): twee
 * gelijktijdige aanroepen kunnen dezelfde gebruiker twee edities geven —
 * aanvaard risico voor een schaduw die niemand leest (ADR 0173).
 *
 * De K1-meting zit in de summary (ADR 0146: gebruik, geen inhoud): lege edities
 * per profieltype (zonder id; voor echte gebruikers k=5-onderdrukt, zie
 * lib/krant/meting.ts) en, voor testaccounts, de overlap met de LLM-editie uit
 * news_cache plus hun ongedrukte verdeling (fictieve persona's). Geen
 * editie-inhoud, geen profiel.
 */

/** De service-role-client, of null zolang de omgeving 'm niet draagt (→ 500, geen run). */
function getServiceClientOrNull() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return getServiceClient()
}

export interface KrantCronSummary {
  week: string
  gebruikers: number
  edities: number
  leeg: number
  overgeslagen: number
  fouten: number
  opgeruimd: number
  kandidaten: number
  kandidatenOngeldig: number
  tijdBudgetOp: boolean
  /** Echte gebruikers: per profieltype, k=5-onderdrukt tegen de totalen `edities`/`leeg`. */
  perProfieltype: Record<string, OnderdrukteTelling>
  testaccounts: {
    gemeten: number
    overlapBeide: number
    alleenMatcher: number
    alleenModel: number
    /** De vijf persona's: fictief, dus ongedrukt — de meting per profieltype van de K1-poort. */
    perProfieltype: Record<string, ProfieltypeTelling>
  }
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()
  const service = getServiceClientOrNull()

  // ── Auth: CRON_SECRET ─────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
  if (!isAuthorized) {
    // Bewust NIET `unauthorized()` ('Niet ingelogd'): een machine met een fout
    // secret. Zelfde envelope en status als /api/cron/retention.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }
  if (!service) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }

  const now = new Date()
  const week = amsterdamWeekKey(now)
  const summary: KrantCronSummary = {
    week,
    gebruikers: 0,
    edities: 0,
    leeg: 0,
    overgeslagen: 0,
    fouten: 0,
    opgeruimd: 0,
    kandidaten: 0,
    kandidatenOngeldig: 0,
    tijdBudgetOp: false,
    perProfieltype: {},
    testaccounts: { gemeten: 0, overlapBeide: 0, alleenMatcher: 0, alleenModel: 0, perProfieltype: {} },
  }
  // Ongedrukte tellingen van echte gebruikers; alleen de onderdrukte vorm verlaat de run.
  const perProfieltypeRuw: Record<string, ProfieltypeTelling> = {}
  const totaalEcht: ProfieltypeTelling = { edities: 0, leeg: 0 }

  try {
    const { data: profielen, error: profielenFout } = await service
      .from('profiles')
      .select('id, is_demo_user, active_modules')
      .eq('onboarding_completed', true)
    if (profielenFout) {
      await recordJobRun(service, { job: 'krant-editie', status: 'error', startedAt, error: profielenFout.message })
      return serverError(profielenFout, 'krant-cron:GET')
    }

    const lezers = (profielen ?? []).filter((p) => resolveActiveModules(p).includes('nieuws'))
    summary.gebruikers = lezers.length

    const [{ artikelen, ongeldig }, aowRows] = await Promise.all([laadKandidaten(service, now), getAowLeeftijden(service)])
    summary.kandidaten = artikelen.length
    summary.kandidatenOngeldig = ongeldig

    await mapWithConcurrency(lezers, KRANT_CRON_CONCURRENCY, async (lezer) => {
      const userId = lezer.id as string
      if (Date.now() - startMs > KRANT_CRON_TIJDBUDGET_MS) {
        summary.tijdBudgetOp = true
        return
      }
      try {
        if (await geldendeEditieId(service, userId, week, 'schaduw')) {
          summary.overgeslagen++
          return
        }
        const uitkomst = await runEditieVoor(service, {
          userId,
          weekKey: week,
          bron: 'schaduw',
          now,
          aowRows,
          kandidaten: artikelen,
          meetOverlap: lezer.is_demo_user === true,
        })
        summary.edities++
        if (uitkomst.leeg) summary.leeg++
        if (lezer.is_demo_user === true) {
          telProfieltype(summary.testaccounts.perProfieltype, uitkomst.profielType, uitkomst.leeg)
        } else {
          telProfieltype(perProfieltypeRuw, uitkomst.profielType, uitkomst.leeg)
          totaalEcht.edities++
          if (uitkomst.leeg) totaalEcht.leeg++
        }
        if (uitkomst.overlap) {
          summary.testaccounts.gemeten++
          summary.testaccounts.overlapBeide += uitkomst.overlap.beide
          summary.testaccounts.alleenMatcher += uitkomst.overlap.alleenMatcher
          summary.testaccounts.alleenModel += uitkomst.overlap.alleenModel
        }
        summary.opgeruimd += await ruimSchaduwOp(service, userId, now)
      } catch (err) {
        summary.fouten++
        console.error('[krant/cron] gebruiker mislukt:', userId, err)
      }
    })

    summary.perProfieltype = onderdrukPerProfieltype(perProfieltypeRuw, totaalEcht)
    await recordJobRun(service, {
      job: 'krant-editie',
      status: 'success',
      startedAt,
      summary,
      error: summary.fouten > 0 ? `${summary.fouten} gebruiker(s) faalden` : summary.tijdBudgetOp ? 'tijdbudget op — rest volgt bij de volgende run' : null,
    })
    return NextResponse.json({ success: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[krant/cron] failed:', message)
    await recordJobRun(service, { job: 'krant-editie', status: 'error', startedAt, summary, error: message })
    return serverError(err, 'krant-cron:GET')
  }
}
