import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getModel } from '@/lib/ai/config'
import { runNewsIngest } from '@/lib/news-ingest'
import { recordJobRun } from '@/lib/job-runs'

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      model = await getModel(service as any)
    } catch {
      // AI model not configured — proceed without enrichment
    }

    const { summary } = await runNewsIngest(service, model)

    await recordJobRun(service, { job: 'news-ingest', status: 'success', startedAt, summary })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[news-ingest/cron] Ingestion failed:', message)
    await recordJobRun(service, { job: 'news-ingest', status: 'error', startedAt, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
