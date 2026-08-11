import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { type JobKey } from '@/lib/job-runs'
import { jobLabel } from '@/lib/job-catalog'
import { appBaseUrl, isPushConfigured, sendPush } from '@/lib/alerts/push'

/**
 * Actieve melding wanneer een achtergrondtaak (cron) HARD faalt
 * (`job_runs.status='error'`). Aanvulling op het passieve /beheer/jobs-dashboard:
 * dat toont fouten, dit dúwt ze naar de beheerder.
 *
 * Ontwerpkeuzes (proportioneel, geen nieuwe vendor — Resend, ADR 0058):
 * - Twee kanalen NAAST elkaar achter één throttle (ADR 0102): mail naar
 *   `ALERT_EMAIL`/`OPS_EMAIL` én een push via `lib/alerts/push.ts`. Geen van
 *   beide geconfigureerd -> stille no-op; één van beide volstaat.
 * - Per-taak dag-throttle via `app_settings` (`cron_alert_last_<job>`) tegen een
 *   meldingsstorm bij een dagelijks falende cron. Dezelfde sleutel gebruikt de
 *   meldingen-sweep (lib/alerts/sweep.ts), zodat mail, directe push en sweep
 *   samen hoogstens één alarm per taak per etmaal geven.
 * - Verstuurt via `sendEmail` (mail_log). Alleen taak-label + fouttekst -> geen
 *   PII (geen transactie-/gebruikersdata). De PUSH draagt bewust ook de
 *   fouttekst niet: dat kanaal loopt buiten onze stack (payloadregel ADR 0102).
 * - Best-effort: mag een cron NOOIT laten falen.
 *
 * NB: importeert `JobKey` type-only uit job-runs -> geen runtime-cyclus met de
 * `recordJobRun`-haak die deze helper aanroept.
 */

const THROTTLE_HOURS = 24
const THROTTLE_MS = THROTTLE_HOURS * 60 * 60 * 1000

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
  /** Welke kanalen daadwerkelijk iets afleverden. */
  channels?: { mail: boolean; push: boolean }
  skipped?: 'no-recipient' | 'throttled' | 'send-failed'
}

export async function alertCronFailure(
  service: SupabaseClient,
  params: { job: JobKey; error?: string | null },
  deps?: {
    send?: typeof sendEmail
    now?: () => Date
    recipient?: () => string | null
    push?: typeof sendPush
    pushConfigured?: () => boolean
  },
): Promise<CronAlertResult> {
  try {
    const recipient = (deps?.recipient ?? defaultRecipient)()
    const pushEnabled = (deps?.pushConfigured ?? isPushConfigured)()
    // `no-recipient` blijft de naam van dit pad om het contract met de bestaande
    // tests intact te laten; het betekent nu "geen enkel kanaal geconfigureerd".
    if (!recipient && !pushEnabled) return { sent: false, skipped: 'no-recipient' }

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

    const label = jobLabel(params.job)

    let mailSent = false
    if (recipient) {
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
      mailSent = res.ok
    }

    let pushSent = false
    if (pushEnabled) {
      // Bewust ZONDER fouttekst — alleen label + deeplink (payloadregel ADR 0102).
      const res = await (deps?.push ?? sendPush)({
        title: 'Achtergrondtaak gefaald',
        body: `${label} is met een fout geëindigd. Details staan op /beheer/jobs.`,
        tags: ['x'],
        click: `${appBaseUrl()}/beheer/jobs`,
        priority: 'high',
      })
      pushSent = res.sent
    }

    if (!mailSent && !pushSent) return { sent: false, skipped: 'send-failed' }

    // Throttle-stempel alleen zetten als er daadwerkelijk iets is afgeleverd.
    await service.from('app_settings').upsert({ key: throttleKey, value: now.toISOString() })
    return { sent: true, channels: { mail: mailSent, push: pushSent } }
  } catch {
    // Alerting mag een cron nooit breken.
    return { sent: false }
  }
}
