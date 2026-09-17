import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import {
  ERROR_RESOLUTIONS_RETENTION_MONTHS,
  RETENTION_MONTHS,
  USER_ACTIVITY_RETENTION_DAYS,
  retentionCutoffDate,
  retentionCutoffIso,
  type RetentionTable,
} from '@/lib/retention'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { purgeUserScopedBuckets } from '@/lib/user-data-buckets'

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
    // Bewust NIET `unauthorized()`: die zegt 'Niet ingelogd', maar hier gaat het om
    // een verkeerd CRON_SECRET van een machine die nooit inlogt. Wel de gedeelde
    // envelope (ADR 0044), en 401 blijft de status — de cron-auth-matrix (fout
    // secret → 401) is vastgelegd in route.test.ts.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }

  const startedAt = new Date().toISOString()
  const supabase = getServiceClient()
  const now = new Date()

  const deleted: Record<string, number> = {}
  const errors: string[] = []
  // Tabellen die bewust nog op hun migratie wachten (ADR 0146: user_activity_days
  // pas ná de /privacy-tekst). Niets te purgen en geen storing — een rode
  // job_run elke nacht zou echte retentiefouten in de ruis laten verdwijnen.
  const overgeslagen: string[] = []

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

  // error_log_resolutions: zelfde termijn als error_logs, maar op `last_seen_at`
  // in plaats van `created_at` — een resolutie hoort bij een foutSOORT en
  // overleeft bewust zijn logregels (ADR 0113). Daarom buiten de lus hierboven.
  {
    const cutoff = retentionCutoffIso(ERROR_RESOLUTIONS_RETENTION_MONTHS, now)
    const { count, error } = await supabase
      .from('error_log_resolutions')
      .delete({ count: 'exact' })
      .lt('last_seen_at', cutoff)
    if (error) {
      console.error(`[cron:retention] error_log_resolutions: ${error.message}`)
      errors.push('error_log_resolutions')
      deleted.error_log_resolutions = 0
    } else {
      deleted.error_log_resolutions = count ?? 0
    }
  }

  // user_activity_days: 400 dagen op de kolom `day` (een `date`, geen
  // created_at-timestamp) — daarom buiten de lus (ADR 0146).
  {
    const cutoff = retentionCutoffDate(USER_ACTIVITY_RETENTION_DAYS, now)
    const { count, error } = await supabase
      .from('user_activity_days')
      .delete({ count: 'exact' })
      .lt('day', cutoff)
    if (error && isOntbrekendSchema(error)) {
      overgeslagen.push('user_activity_days')
    } else if (error) {
      console.error(`[cron:retention] user_activity_days: ${error.message}`)
      errors.push('user_activity_days')
      deleted.user_activity_days = 0
    } else {
      deleted.user_activity_days = count ?? 0
    }
  }

  // user_activity_modules: dezelfde 400 dagen op dezelfde `date`-kolom `day`
  // (ADR 0147, fase 2 — gebruik per app-deel). Tabel nog niet uitgerold (de
  // migratie wacht op /privacy) = overgeslagen, geen storing — net als bij
  // user_activity_days hierboven. Elke ándere fout blijft een storing.
  {
    const cutoff = retentionCutoffDate(USER_ACTIVITY_RETENTION_DAYS, now)
    const { count, error } = await supabase
      .from('user_activity_modules')
      .delete({ count: 'exact' })
      .lt('day', cutoff)
    if (error && isOntbrekendSchema(error)) {
      overgeslagen.push('user_activity_modules')
    } else if (error) {
      console.error(`[cron:retention] user_activity_modules: ${error.message}`)
      errors.push('user_activity_modules')
      deleted.user_activity_modules = 0
    } else {
      deleted.user_activity_modules = count ?? 0
    }
  }

  // lead_intakes (90d, ADR 0022) via de bestaande SECURITY DEFINER-functie.
  const { error: leadErr } = await supabase.rpc('purge_expired_lead_intakes')
  if (leadErr) {
    console.error(`[cron:retention] purge_expired_lead_intakes: ${leadErr.message}`)
    errors.push('lead_intakes')
  }

  // Storage-buckets met gebruikersuploads (ADR 0152): geen tabel, dus buiten de
  // created_at-lus. In élke user-scoped bucket gaan de wezen weg (account bestaat
  // niet meer); in de screenshots-bucket ook wat ouder is dan 90 dagen.
  // lib/user-data-buckets.ts is de enige plek die de buckets aanraakt. Een fout
  // is een storing — er is geen FK-cascade die dit later alsnog opruimt.
  const storageWees: Record<string, number> = {}
  try {
    const perBucket = await purgeUserScopedBuckets(supabase, now)
    for (const [bucket, veeg] of Object.entries(perBucket)) {
      deleted[`storage:${bucket}`] = veeg.verlopen
      storageWees[bucket] = veeg.wees
      if (veeg.overgeslagenPrefixen.length > 0) {
        console.warn(
          `[cron:retention] storage:${bucket}: ${veeg.overgeslagenPrefixen.length} niet-UUID-prefix(en) ongemoeid gelaten`,
        )
      }
    }
  } catch (err) {
    console.error('[cron:retention] storage-buckets:', err)
    errors.push('storage-buckets')
  }

  const summary = {
    deleted,
    storage_wees: storageWees,
    lead_intakes_purged: !leadErr,
    errors: errors.length,
    ...(overgeslagen.length > 0 ? { overgeslagen } : {}),
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
