import type { JobKey } from '@/lib/job-runs'

/**
 * Canonieke catalogus van achtergrondtaken — single source voor:
 *  - de kaarten op /beheer/jobs (label, schema, pad, omschrijving),
 *  - het taak-label in de cron-fout-melding (lib/cron-alert.ts),
 *  - de stilte-drempel van de meldingen-sweep (lib/alerts/sweep.ts).
 *
 * Bewust een `Record<JobKey, …>`: een nieuwe `JobKey` compileert rood tot hij
 * hier is ingedeeld. Vóór deze module leefden label en catalogus los van elkaar
 * (JOB_LABELS in cron-alert.ts naast JOB_CATALOG in de beheerpagina) — dat is
 * precies de drift die één bron voorkomt.
 */

export interface JobCatalogEntry {
  key: JobKey
  label: string
  /** Mensleesbaar schema; het echte schema staat in vercel.json. */
  schedule: string
  path: string
  description: string
  /**
   * Maximale leeftijd van de laatste GESLAAGDE run voordat de taak "stil" heet.
   * Ruim boven het schema gekozen (schema + marge), zodat een enkele late run
   * geen vals alarm geeft. `null` = niet bewaken.
   */
  maxAgeHours: number | null
}

export const JOB_CATALOG: Record<JobKey, JobCatalogEntry> = {
  'holdings-prices': {
    key: 'holdings-prices',
    label: 'Prijsverversing',
    schedule: 'Dagelijks 18:00',
    path: '/api/holdings/refresh-prices/cron',
    description: 'Beurskoersen + crypto-prijzen bijwerken, inclusief exchange- en wallet-sync.',
    maxAgeHours: 26,
  },
  snapshots: {
    key: 'snapshots',
    label: 'Maandsnapshots',
    schedule: '1e van de maand, 02:00',
    path: '/api/snapshots/cron',
    description: 'Maandelijkse netto-vermogen-snapshot per gebruiker.',
    // Langste maand (31d) + een dag marge.
    maxAgeHours: 768,
  },
  'news-ingest': {
    key: 'news-ingest',
    label: 'Nieuws-ingest',
    schedule: 'Dagelijks 05:00',
    path: '/api/news-ingest/cron',
    description: 'RSS- en webbronnen ophalen, AI-categoriseren en opslaan.',
    maxAgeHours: 26,
  },
  'integraties-health': {
    key: 'integraties-health',
    label: 'Integraties liveness',
    schedule: 'Dagelijks 18:00 (meelift op prijs-refresh)',
    path: '/api/holdings/refresh-prices/cron',
    description:
      'Publieke health-probes van externe koppelingen (Bitvavo, Kraken, Coinbase, CoinGecko, Blockchair, TrueLayer).',
    maxAgeHours: 26,
  },
  'briefing-email': {
    key: 'briefing-email',
    label: 'Briefing-e-mail',
    schedule: 'Maandag 07:00',
    path: '/api/briefing/email/cron',
    description:
      'Wekelijkse briefing-e-mail (opt-in) van de bevroren weeksnapshot — vrijheidstijd-first, euro-vrij, met brug terug naar Fin.',
    maxAgeHours: 170,
  },
  'web-vitals-retention': {
    key: 'web-vitals-retention',
    label: 'Webprestaties-retentie',
    schedule: 'Dagelijks 03:30',
    path: '/api/web-vitals/retention/cron',
    description:
      'Verwijdert web_vitals-metingen ouder dan de retentietermijn (180 dagen) zodat de RUM-tabel niet ongebreideld groeit.',
    maxAgeHours: 26,
  },
  retention: {
    key: 'retention',
    label: 'AVG-bewaartermijnen',
    schedule: 'Dagelijks 03:45',
    path: '/api/cron/retention',
    description:
      'Purget log-/usage-rijen ouder dan de vastgelegde bewaartermijn (error_logs/mail_log 12m, job_runs 6m, contract_events/ai_token_usage/ai_usage 24m) en verlopen lead_intakes (90d). Zie ADR 0059.',
    maxAgeHours: 26,
  },
  'user-reports-notion-sync': {
    key: 'user-reports-notion-sync',
    label: 'Meldingen → Notion-sync',
    schedule: 'Dagelijks 06:00',
    path: '/api/cron/user-reports-notion-sync',
    description:
      'Herstelt meldingen van testgebruikers (bug/vraag/aanbeveling) die live niet naar de Notion-queue gepusht konden worden; stopt na 5 pogingen per melding.',
    maxAgeHours: 26,
  },
  'alerts-sweep': {
    key: 'alerts-sweep',
    label: 'Meldingen-sweep',
    schedule: 'Elk kwartier',
    path: '/api/cron/alerts-sweep',
    description:
      'Bewaakt nieuwe unieke fouten (error_logs) en gefaalde of uitgebleven achtergrondtaken, en duwt daar hoogstens één gebundelde melding per signaalsoort over uit. Zie ADR 0102.',
    // Bewust NIET bewaakt: de sweep kan zijn eigen stilte niet zien. Dat is de
    // taak van de externe dead man's switch (zie beheerders-runbook).
    maxAgeHours: null,
  },
}

/** Catalogus in weergavevolgorde (insertion order van het Record). */
export const JOB_LIST: readonly JobCatalogEntry[] = Object.values(JOB_CATALOG)

/** Label voor een job-key; valt terug op de key zelf voor onbekende waarden. */
export function jobLabel(job: string): string {
  return (JOB_CATALOG as Record<string, JobCatalogEntry | undefined>)[job]?.label ?? job
}
