import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { RETENTION_MONTHS, retentionCutoffIso, type RetentionTable } from '@/lib/retention'

// Node-runtime: we lezen de service-role-key server-side.
export const runtime = 'nodejs'

/**
 * GET /api/cron/retention — [Arch F3] Recht 4 (bewaartermijnen, AVG).
 *
 * Dagelijkse retentie-purge (ADR 0059). Verwijdert log-/usage-rijen ouder dan de
 * vastgelegde termijn (lib/retention.ts, single source) en roept de bestaande
 * SECURITY DEFINER-functie purge_expired_lead_intakes() aan (lead_intakes 90d,
 * ADR 0022). Alle tabellen zijn RLS-afgeschermd → wissen kan alleen via de
 * service-role.
 *
 * Beschermd door CRON_SECRET (fail-closed in productie), spiegelt
 * /api/web-vitals/retention/cron en /api/snapshots/cron. De uitkomst wordt in
 * `job_runs` gelogd en is zichtbaar op /beheer/jobs.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend secret
  // mag dit service-role-endpoint niet openbaar maken (fail-closed).
  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const isAuthorized =
    !cronSecret || // dev mag zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = getServiceClient()
  const now = new Date()

  const deleted: Record<string, number> = {}
  const errors: string[] = []

  // Retentie-deletes op `created_at` per tabel (termijnen uit lib/retention.ts).
  for (const [table, months] of Object.entries(RETENTION_MONTHS) as [RetentionTable, number][]) {
    const cutoff = retentionCutoffIso(months, now)
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
    if (error) {
      // Nooit een rauwe error.message naar de client; server-side gelogd + in job_runs.
      console.error(`[cron:retention] ${table}: ${error.message}`)
      errors.push(table)
      deleted[table] = 0
    } else {
      deleted[table] = count ?? 0
    }
  }

  // lead_intakes (90d, ADR 0022) via de bestaande SECURITY DEFINER-functie.
  const { error: leadErr } = await supabase.rpc('purge_expired_lead_intakes')
  if (leadErr) {
    console.error(`[cron:retention] purge_expired_lead_intakes: ${leadErr.message}`)
    errors.push('lead_intakes')
  }

  const summary = {
    deleted,
    lead_intakes_purged: !leadErr,
    errors: errors.length,
  }

  await recordJobRun(supabase, {
    job: 'retention',
    status: errors.length > 0 ? 'error' : 'success',
    startedAt,
    summary,
    error: errors.length > 0 ? `retentie mislukt voor: ${errors.join(', ')}` : null,
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Retentie deels mislukt', summary }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...summary })
}
