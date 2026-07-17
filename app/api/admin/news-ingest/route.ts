import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getModel } from '@/lib/ai/config'
import { runNewsIngest } from '@/lib/news-ingest'

// ── POST — Manual news ingestion (admin-triggered) ───────────────────
//
// Dunne wrapper om de gedeelde pipeline in lib/news-ingest.ts — dezelfde
// code draait in de dagelijkse cron (/api/news-ingest/cron).

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  try {
    // AI-model voor verrijking — zonder model draait de ingest door zonder extractie
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null
    try {
      model = await getModel(supabase, 'nieuws_ingest')
    } catch {
      // AI model not configured — proceed without enrichment
    }

    const { summary } = await runNewsIngest(supabase, model)

    return NextResponse.json({ success: true, summary })
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
