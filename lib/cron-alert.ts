import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { type JobKey } from '@/lib/job-runs'

/**
 * Actieve melding wanneer een achtergrondtaak (cron) HARD faalt
 * (`job_runs.status='error'`). Aanvulling op het passieve /beheer/jobs-dashboard:
 * dat toont fouten, dit dúwt ze naar de beheerder.
 *
 * Ontwerpkeuzes (proportioneel, geen nieuwe vendor — Resend, ADR 0058):
 * - Recipient uit `ALERT_EMAIL` (of `OPS_EMAIL`); niet gezet -> stille no-op.
 * - Per-taak dag-throttle via `app_settings` (`cron_alert_last_<job>`) tegen een
 *   mailstorm bij een dagelijks falende cron.
 * - Verstuurt via `sendEmail` (mail_log). Alleen taak-label + fouttekst -> geen
 *   PII (geen transactie-/gebruikersdata).
 * - Best-effort: mag een cron NOOIT laten falen.
 *
 * NB: importeert `JobKey` type-only uit job-runs -> geen runtime-cyclus met de
 * `recordJobRun`-haak die deze helper aanroept.
 */

const THROTTLE_HOURS = 24
const THROTTLE_MS = THROTTLE_HOURS * 60 * 60 * 1000

/** Mensvriendelijke labels — type dwingt af dat elke JobKey gedekt is. */
const JOB_LABELS: Record<JobKey, string> = {
  'holdings-prices': 'Prijsverversing',
  snapshots: 'Maandsnapshots',
  'news-ingest': 'Nieuws-ingest',
  'integraties-health': 'Integraties liveness',
  'briefing-email': 'Briefing-e-mail',
  'web-vitals-retention': 'Webprestaties-retentie',
  retention: 'AVG-bewaartermijnen',
}

function defaultRecipient(): string | null {
  return process.env.ALERT_EMAIL || process.env.OPS_EMAIL || null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type CronAlertResult = {
  sent: boolean
  skipped?: 'no-recipient' | 'throttled' | 'send-failed'
}

export async function alertCronFailure(
  service: SupabaseClient,
  params: { job: JobKey; error?: string | null },
  deps?: {
    send?: typeof sendEmail
    now?: () => Date
    recipient?: () => string | null
  },
): Promise<CronAlertResult> {
  try {
    const recipient = (deps?.recipient ?? defaultRecipient)()
    if (!recipient) return { sent: false, skipped: 'no-recipient' }

    const now = (deps?.now ?? (() => new Date()))()
    const throttleKey = `cron_alert_last_${params.job}`

    // Dag-throttle: laatste alert voor deze taak recenter dan THROTTLE_HOURS?
    const { data: last } = await service
      .from('app_settings')
      .select('value')
      .eq('key', throttleKey)
      .maybeSingle()
    const lastAt = typeof last?.value === 'string' ? Date.parse(last.value) : NaN
    if (!Number.isNaN(lastAt) && now.getTime() - lastAt < THROTTLE_MS) {
      return { sent: false, skipped: 'throttled' }
    }

    const label = JOB_LABELS[params.job] ?? params.job
    const errText = escapeHtml((params.error ?? 'onbekende fout').slice(0, 500))
    const send = deps?.send ?? sendEmail
    const res = await send({
      to: recipient,
      subject: `[TriFinity] Cron-fout: ${label}`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:480px;">
  <p>De achtergrondtaak <strong>${escapeHtml(label)}</strong> (<code>${escapeHtml(params.job)}</code>) is met een fout geëindigd.</p>
  <p><strong>Fout:</strong> ${errText}</p>
  <p style="font-size:13px;color:#57534e;">Bekijk details op <strong>/beheer/jobs</strong>. Deze melding wordt per taak maximaal 1× per ${THROTTLE_HOURS} uur verstuurd.</p>
</div>`,
    })

    if (!res.ok) return { sent: false, skipped: 'send-failed' }

    // Throttle-stempel alleen zetten als de mail daadwerkelijk uitging.
    await service.from('app_settings').upsert({ key: throttleKey, value: now.toISOString() })
    return { sent: true }
  } catch {
    // Alerting mag een cron nooit breken.
    return { sent: false }
  }
}
