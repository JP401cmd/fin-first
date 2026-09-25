import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { errorResponse, serverError } from '@/lib/api/respond'
import { getModel } from '@/lib/ai/config'
import { bepaalIngestUitkomst, runNewsIngest } from '@/lib/news-ingest'
import { DUIDING_MAX_PER_RUN_CRON, DUIDING_TIJDBUDGET_MS_CRON } from '@/lib/krant/duiding'
import { recordJobRun } from '@/lib/job-runs'

// De duidingsstap (ADR 0171) doet tot DUIDING_MAX_PER_RUN_CRON modelcalls van
// 3–5 s; dat past niet in de standaardduur. Zelfde conventie als
// app/api/holdings/refresh-prices/cron/route.ts.
export const maxDuration = 300

/**
 * GET /api/news-ingest/cron
 *
 * Scheduled endpoint for automatic daily news article ingestion.
 * Designed to be called by:
 * - Vercel Cron Jobs (see vercel.json)
 * - External cron service
 *
 * Uses service role key (not user auth) to write to the news_articles table.
 * Protected by CRON_SECRET environment variable — verplicht in productie.
 *
 * De pipeline zelf leeft in lib/news-ingest.ts (gedeeld met de handmatige
 * admin-ingest). ALLE uitkomsten — ook auth- en configuratiefouten — worden
 * naar job_runs gelogd zodat een falende cron zichtbaar is op de beheerpagina
 * i.p.v. stilletjes nooit te draaien.
 *
 * Recommended schedule: daily at 06:00 CET (before users check news)
 */

function getServiceClientOrNull() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString()
  const service = getServiceClientOrNull()

  // ── Auth: verify CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend
  // secret mag het ingest-endpoint niet openbaar maken.
  if (!cronSecret && isProduction) {
    if (service) {
      await recordJobRun(service, {
        job: 'news-ingest',
        status: 'error',
        startedAt,
        error: 'CRON_SECRET ontbreekt in productie — cron geweigerd',
      })
    }
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  const isAuthorized =
    !cronSecret || // dev mode zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    if (service) {
      await recordJobRun(service, {
        job: 'news-ingest',
        status: 'error',
        startedAt,
        error: 'Unauthorized — CRON_SECRET kwam niet overeen',
      })
    }
    // Bewust NIET `unauthorized()`: die zegt 'Niet ingelogd', maar hier gaat het om
    // een verkeerd CRON_SECRET van een machine die nooit inlogt. Wel de gedeelde
    // envelope (ADR 0044); 401 blijft de status, spiegelt /api/cron/retention.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }

  // ── Supabase service role client ──────────────────────────────
  if (!service) {
    return NextResponse.json(
      {
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
        description: 'This endpoint requires the service role key to ingest news articles.',
      },
      { status: 500 },
    )
  }

  try {
    // AI-model voor verrijking — zonder model draait de ingest door zonder extractie
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model = await getModel(service as any, 'nieuws_ingest')
    } catch {
      // AI model not configured — proceed without enrichment
    }

    // Eigen feature-sleutel voor de duiding: aparte kostenpost op
    // /beheer/ai-verbruik, zelfde kill-switch en token-logging (ADR 0171).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let duidingModel: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      duidingModel = await getModel(service as any, 'nieuws_duiding')
    } catch {
      // Zonder model wordt alleen de wachtrij geteld — de ingest draait door
    }

    const { summary, health } = await runNewsIngest(service, model, {
      duidingModel,
      duidingMaxPerRun: DUIDING_MAX_PER_RUN_CRON,
      duidingTijdBudgetMs: DUIDING_TIJDBUDGET_MS_CRON,
    })

    // De status volgt de UITKOMST, niet het uitblijven van een exception. Tot
    // 25 sep 2026 stond hier onvoorwaardelijk 'success': de run waarin het
    // AI-tegoed leeg was duidde 0 van 2 rijen en verloor de hele bronklasse
    // `web_lijst` (33 -> 0), en meldde zich toch groen. De AI-stappen blijven
    // niet-fataal — alleen het resultaatverlies wordt nu gemeld. 'partial'
    // alarmeert bewust niet (zie recordJobRun); de reden gaat mee in de
    // summary, zodat /beheer/jobs kan laten zien WELKE stap wat verloor.
    const { status, verlies } = bepaalIngestUitkomst(summary, health)
    const gemeld = { ...summary, verlies }

    await recordJobRun(service, { job: 'news-ingest', status, startedAt, summary: gemeld })

    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
      summary: gemeld,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    await recordJobRun(service, { job: 'news-ingest', status: 'error', startedAt, error: message })
    return serverError(err, 'news-ingest:GET')
  }
}
