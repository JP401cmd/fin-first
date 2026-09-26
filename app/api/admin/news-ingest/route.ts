import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getModel } from '@/lib/ai/config'
import { bepaalIngestUitkomst, runNewsIngest } from '@/lib/news-ingest'
import { DUIDING_MAX_PER_RUN_HANDMATIG, DUIDING_TIJDBUDGET_MS_HANDMATIG } from '@/lib/krant/duiding'

// ── POST — Manual news ingestion (admin-triggered) ───────────────────
//
// Dunne wrapper om de gedeelde pipeline in lib/news-ingest.ts — dezelfde
// code draait in de dagelijkse cron (/api/news-ingest/cron). De duidingsstap
// krijgt hier een kleinere batch en een tijdbudget van 60 s (ADR 0171): de
// ingest zelf kost 70–90 s, dus de knop komt ruim binnen de duur terug.

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  // De beheerder is de actor: zijn tokens horen bij hem, niet bij een cron-venster
  // op /beheer/jobs. Eén keer hier bepalen in plaats van per aanroep achteraf.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const modelOpts = { userId: user?.id }

  try {
    // AI-model voor verrijking — zonder model draait de ingest door zonder extractie
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null
    try {
      model = await getModel(supabase, 'nieuws_ingest', modelOpts)
    } catch {
      // AI model not configured — proceed without enrichment
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let duidingModel: any = null
    try {
      duidingModel = await getModel(supabase, 'nieuws_duiding', modelOpts)
    } catch {
      // Zonder model wordt alleen de wachtrij geteld
    }

    const { summary, health } = await runNewsIngest(supabase, model, {
      duidingModel,
      duidingMaxPerRun: DUIDING_MAX_PER_RUN_HANDMATIG,
      duidingTijdBudgetMs: DUIDING_TIJDBUDGET_MS_HANDMATIG,
    })

    // Dezelfde afleiding als de cron (bepaalIngestUitkomst): ook de handmatige
    // knop hoort te zeggen dat een stap niets opleverde. Deze route schrijft
    // geen job_runs-regel, dus de status gaat alleen mee in het antwoord.
    const { status, verlies } = bepaalIngestUitkomst(summary, health)

    return NextResponse.json({ success: true, status, summary: { ...summary, verlies } })
  } catch (err) {
    return serverError(err, 'admin-news-ingest:POST')
  }
}

// ── GET — Ingest-status: laatste cron-runs + per-bron gezondheid ──────

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const [runsRes, healthRes] = await Promise.all([
    supabase
      .from('job_runs')
      .select('status, started_at, finished_at, duration_ms, summary, error')
      .eq('job', 'news-ingest')
      .order('started_at', { ascending: false })
      .limit(5),
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'news_source_health')
      .maybeSingle(),
  ])

  let sourceHealth = null
  try {
    if (healthRes.data?.value) {
      sourceHealth = typeof healthRes.data.value === 'string'
        ? JSON.parse(healthRes.data.value)
        : healthRes.data.value
    }
  } catch {
    // corrupt health-blob — toon gewoon niets
  }

  return NextResponse.json({
    runs: runsRes.data || [],
    sourceHealth,
  })
}
