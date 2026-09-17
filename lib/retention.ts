/**
 * AVG-bewaartermijnen (single source) — [Arch F3], ADR 0059.
 *
 * Eén plek voor alle retentie-termijnen zodat de retentie-cron
 * (app/api/cron/retention) en de tests dezelfde waarden delen (geen drift).
 * De termijnen zijn een eigenaars-/legal-beslissing (goedgekeurd 2026-07-21,
 * "beide akkoord"): "niet langer bewaren dan noodzakelijk".
 *
 * Toelichting per tabel:
 *  - error_logs      12 mnd — operationele foutdiagnose.
 *  - mail_log        12 mnd — e-mail-deliverability/verzendlog.
 *  - job_runs         6 mnd — cron/job-historie (/beheer/jobs).
 *  - contract_events 24 mnd — abonnement-/consent-events; deels consent-bewijs,
 *                             daarom ruimer.
 *  - ai_token_usage  24 mnd — kosten/facturatie-analyse.
 *  - ai_usage        24 mnd — kosten-analyse (legacy naast ai_token_usage).
 *  - lead_intakes    90 dgn — anonieme funnel-intake (ADR 0022); gepurged door
 *                             de bestaande SECURITY DEFINER-functie
 *                             purge_expired_lead_intakes().
 *
 * Daarnaast, buiten de created_at-lus omdat hij een andere cutoff-kolom heeft:
 *  - error_log_resolutions 12 mnd op `last_seen_at` — zie
 *    {@link ERROR_RESOLUTIONS_RETENTION_MONTHS}.
 *  - user_activity_days 400 dgn op `day` (ADR 0146) — zie
 *    {@link USER_ACTIVITY_RETENTION_DAYS}.
 *  - user_activity_modules 400 dgn op `day` (ADR 0147, fase 2) — dezelfde
 *    termijn en kolom als user_activity_days, dus dezelfde constante.
 *
 * Buiten de tabellen: de privé storage-bucket met schermafbeeldingen bij
 * meldingen (ADR 0152), 90 dagen op `created_at` van het object — zie
 * {@link USER_REPORT_SCREENSHOT_RETENTION_DAYS}.
 */

/** Retentie in MAANDEN per log-/usage-tabel (op basis van `created_at`). */
export const RETENTION_MONTHS = {
  error_logs: 12,
  mail_log: 12,
  job_runs: 6,
  contract_events: 24,
  ai_token_usage: 24,
  ai_usage: 24,
} as const

export type RetentionTable = keyof typeof RETENTION_MONTHS

/**
 * `error_log_resolutions` volgt `error_logs` (12 mnd), maar op een ÁNDERE kolom.
 *
 * Een resolutie hoort bij een foutSOORT, niet bij een logregel — hij overleeft
 * bewust de rijen die hem aanleiding gaven, anders zou "dit is behandeld"
 * stilzwijgend verdwijnen zodra de logregels 12 maanden oud zijn (ADR 0113).
 * Zonder opruimregel zou die tabel echter monotoon groeien. De cutoff staat
 * daarom op `last_seen_at`: een foutsoort die 12 maanden niet meer voorkwam
 * hoeft niet meer als "afgehandeld" geboekt te staan. Komt hij daarna alsnog
 * terug, dan is hij domweg weer nieuw — precies wat je wilt weten.
 */
export const ERROR_RESOLUTIONS_RETENTION_MONTHS = 12

/**
 * lead_intakes: vastgelegd op 90 dagen (ADR 0022). Niet via een created_at-cutoff
 * hier, maar via de DB-functie purge_expired_lead_intakes() (expires_at-gedreven).
 */
export const LEAD_INTAKES_RETENTION_DAYS = 90

/**
 * user_activity_days: 400 dagen (ADR 0146, migratie 20260915121000). Ruim een
 * jaar, zodat MAU jaar-op-jaar te vergelijken blijft. Buiten de created_at-lus
 * omdat de cutoff op de kolom `day` (een `date`) staat — zie
 * {@link retentionCutoffDate}.
 */
export const USER_ACTIVITY_RETENTION_DAYS = 400

/**
 * Schermafbeeldingen bij meldingen (bucket `user-report-screenshots`, ADR 0152):
 * 90 dagen na upload. De melding zelf (`user_reports`, tekst) heeft geen
 * bewaartermijn; het beeld wél, en een kortere dan de tekst — een schermafbeelding
 * van een financieel scherm kan saldi, namen en rekeningnummers dragen, terwijl
 * de tekst van de melder gecureerd is. Triage gebeurt binnen dagen en de Notion-
 * push tekent een 48-uurs signed URL (lib/user-reports/notion.ts), dus na 90
 * dagen leest niemand het beeld nog. Zelfde termijn als lead_intakes (ADR 0022).
 * Gehandhaafd door de retentie-cron via lib/user-data-buckets.ts.
 */
export const USER_REPORT_SCREENSHOT_RETENTION_DAYS = 90

/**
 * ISO-timestamp van de cutoff voor een termijn in DAGEN: objecten/rijen met een
 * `created_at` ouder dan dit worden gepurged. Tegenhanger van
 * {@link retentionCutoffIso} (maanden) en {@link retentionCutoffDate} (kalenderdag).
 */
export function retentionCutoffDaysIso(days: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

/**
 * Cutoff als `YYYY-MM-DD` voor een `date`-kolom: rijen met een dag vóór deze
 * datum worden gepurged. `days` dagen terug vanaf `now`, in UTC gerekend — een
 * afwijking van hooguit een dag ten opzichte van de Amsterdamse kalenderdag is
 * bij een termijn van 400 dagen zonder betekenis.
 */
export function retentionCutoffDate(days: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * ISO-timestamp van de cutoff: rijen met `created_at` ouder dan dit worden
 * gepurged. `months` maanden terug vanaf `now`.
 */
export function retentionCutoffIso(months: number, now: Date = new Date()): string {
  const d = new Date(now)
  // UTC-maandrekening: tijdzone-onafhankelijk en zonder DST-artefact (een lokale
  // setMonth over een zomer/winter-grens zou het UTC-uur verschuiven).
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString()
}
