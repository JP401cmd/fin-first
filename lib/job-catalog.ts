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
  /**
   * Mensleesbaar schema; het echte schema staat in vercel.json.
   *
   * ALTIJD IN UTC, net als de cron-expressie zelf — Vercel evalueert cron-
   * expressies in UTC, niet in de zone van de gebruiker. Zonder die achtervoegsel
   * leest "Dagelijks 05:00" naast een laatste run van 07:55 (Amsterdam) als drift
   * terwijl er niets aan de hand is. Afgedwongen in lib/job-health.test.ts.
   */
  schedule: string
  path: string
  description: string
  /**
   * Maximale leeftijd van de laatste GESLAAGDE run voordat de taak "stil" heet —
   * de drempel van de **meldingen-sweep** (S2b). `null` = niet bewaken.
   *
   * LET OP: dit is de drempel voor ÉÉN vraag, gesteld op één moment. De pagina
   * /beheer/jobs stelt een andere vraag (op een willekeurig moment) en telt daar
   * een eigen toeslag bij op — zie `deriveJobHealth` in lib/job-health.ts. Beide
   * banden staan daar uitgerekend; hier alleen de sweep-band:
   *
   *   drempel ∈ (gat + jitter, gat + 24u − jitter − looptijd)
   *
   * met `gat` = sweeptijd − looptijdstip, en `jitter` de spreiding waarmee Vercel
   * een cron daadwerkelijk start. Die spreiding is GEMETEN, niet aangenomen: 13
   * opeenvolgende `news-ingest`-runs (`0 5 * * *`) startten 6 tot 55 minuten ná
   * het hele uur — uur-granulariteit. Daarom staan de taken van 18:00 UTC op 23
   * en niet op 24 of 26: met 26 blijft een gemiste dag onopgemerkt tot de dag
   * daarna, en 24 laat maar 11 minuten over — te weinig, omdat `created_at` pas
   * bij het AFRONDEN wordt geschreven (lib/job-runs.ts) en de prijsverversing een
   * exchange- en wallet-sync doet. "Schema + ruime marge" was de juiste regel bij
   * een kwartier-sweep, niet meer bij een dagelijkse.
   */
  maxAgeHours: number | null
}

export const JOB_CATALOG: Record<JobKey, JobCatalogEntry> = {
  'holdings-prices': {
    key: 'holdings-prices',
    label: 'Prijsverversing',
    schedule: 'Dagelijks 18:00 UTC',
    path: '/api/holdings/refresh-prices/cron',
    description: 'Beurskoersen + crypto-prijzen bijwerken, inclusief exchange- en wallet-sync.',
    // Band (2u, 23u): gat naar de sweep is 1u, jitter 1u, en de bovengrens houdt
    // ruimte voor de looptijd van de sync. 24 zou maar 11 minuten overlaten.
    maxAgeHours: 23,
  },
  snapshots: {
    key: 'snapshots',
    label: 'Maandsnapshots',
    schedule: '1e van de maand, 02:00 UTC',
    path: '/api/snapshots/cron',
    description: 'Maandelijkse netto-vermogen-snapshot per gebruiker.',
    // Langste maand (31d) + een dag marge.
    maxAgeHours: 768,
  },
  'news-ingest': {
    key: 'news-ingest',
    label: 'Nieuws-ingest',
    schedule: 'Dagelijks 05:00 UTC',
    path: '/api/news-ingest/cron',
    description: 'RSS- en webbronnen ophalen, AI-categoriseren en opslaan.',
    maxAgeHours: 26,
  },
  'integraties-health': {
    key: 'integraties-health',
    label: 'Integraties liveness',
    schedule: 'Dagelijks 18:00 UTC (meelift op prijs-refresh)',
    path: '/api/holdings/refresh-prices/cron',
    description:
      'Publieke health-probes van externe koppelingen (Bitvavo, Kraken, Coinbase, CoinGecko, Blockchair, TrueLayer).',
    // Lift mee op de 18:00-run, dus dezelfde ijking als holdings-prices.
    maxAgeHours: 23,
  },
  'briefing-email': {
    key: 'briefing-email',
    label: 'Briefing-e-mail',
    schedule: 'Maandag 07:00 UTC',
    path: '/api/briefing/email/cron',
    description:
      'Wekelijkse briefing-e-mail (opt-in) van de bevroren weeksnapshot — vrijheidstijd-first, euro-vrij, met brug terug naar Fin.',
    maxAgeHours: 170,
  },
  'web-vitals-retention': {
    key: 'web-vitals-retention',
    label: 'Webprestaties-retentie',
    schedule: 'Dagelijks 03:30 UTC',
    path: '/api/web-vitals/retention/cron',
    description:
      'Verwijdert web_vitals-metingen ouder dan de retentietermijn (180 dagen) zodat de RUM-tabel niet ongebreideld groeit.',
    maxAgeHours: 26,
  },
  retention: {
    key: 'retention',
    label: 'AVG-bewaartermijnen',
    schedule: 'Dagelijks 03:45 UTC',
    path: '/api/cron/retention',
    description:
      'Purget log-/usage-rijen ouder dan de vastgelegde bewaartermijn (error_logs/mail_log 12m, job_runs 6m, contract_events/ai_token_usage/ai_usage 24m), error_log_resolutions 12m op last_seen_at (ADR 0113) en verlopen lead_intakes (90d). Zie ADR 0059.',
    maxAgeHours: 26,
  },
  'user-reports-notion-sync': {
    key: 'user-reports-notion-sync',
    label: 'Meldingen → Notion-sync',
    schedule: 'Dagelijks 06:00 UTC',
    path: '/api/cron/user-reports-notion-sync',
    description:
      'Herstelt meldingen van testgebruikers (bug/vraag/aanbeveling) die live niet naar de Notion-queue gepusht konden worden; stopt na 5 pogingen per melding.',
    maxAgeHours: 26,
  },
  'alerts-sweep': {
    key: 'alerts-sweep',
    label: 'Meldingen-sweep',
    // 19:00 UTC valt ná de laatste dagelijkse taak (prijsverversing 18:00 UTC),
    // zodat één ronde de uitkomst van álle dagelijkse taken meeneemt. Let op: dat
    // is 21:00 Amsterdamse tijd in de zomer, 20:00 in de winter — de ordening
    // klopt hoe dan ook, want álle crons draaien op dezelfde UTC-klok. De cadans
    // zelf is een PLANLIMIET: dit Vercel-plan staat één cron-uitvoering per dag
    // toe, en dit was de enige cron die daarboven zat. `vercel.json` kent geen
    // commentaar — daarom staat de reden hier. Sub-dagelijkse detectie komt
    // sindsdien uitsluitend van de externe pinger (buitenwacht, ADR 0102 +
    // runbook): die roept dezelfde route aan en zit niet aan de planlimiet vast.
    schedule: 'Dagelijks 19:00 UTC',
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
