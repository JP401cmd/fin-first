import { describe, it, expect } from 'vitest'
import type { JobCatalogEntry } from '@/lib/job-catalog'
import { JOB_CATALOG, JOB_LIST } from '@/lib/job-catalog'
import {
  CRON_JITTER_HOURS,
  VERCEL_CRONS,
  cronScheduleFor,
  deriveJobHealth,
  detectScheduleDrift,
  pageStaleAfterHours,
  summarizeJobHealth,
  type CronEntry,
} from './job-health'

/**
 * Twee dingen worden hier vastgelegd:
 *  1. de toestandsafleiding per taak (actueel / achterstallig / nooit / niet bewaakt);
 *  2. de koppeling tussen `vercel.json` en de taakcatalogus — inclusief de
 *     ijking van `maxAgeHours` op de dagelijkse sweep. Drift hoort in CI op te
 *     vallen, niet pas op /beheer/jobs.
 */

const NOW = new Date('2026-08-11T19:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()

function entry(over: Partial<JobCatalogEntry> = {}): JobCatalogEntry {
  return {
    key: 'retention',
    label: 'AVG-bewaartermijnen',
    schedule: 'Dagelijks 03:45',
    path: '/api/cron/retention',
    description: '',
    maxAgeHours: 26,
    ...over,
  }
}

describe('deriveJobHealth', () => {
  it('een taak met een recente geslaagde run is actueel', () => {
    expect(
      deriveJobHealth({
        maxAgeHours: 26,
        lastRunAt: hoursAgo(15),
        lastSuccessAt: hoursAgo(15),
        now: NOW,
      }),
    ).toBe('ok')
  })

  it('geen geslaagde run binnen het venster (incl. jitter-toeslag) is achterstallig', () => {
    expect(
      deriveJobHealth({
        maxAgeHours: 26,
        lastRunAt: hoursAgo(30),
        lastSuccessAt: hoursAgo(30),
        now: NOW,
      }),
    ).toBe('overdue')
  })

  it('rekent met de jitter-toeslag, niet met de kale sweep-drempel', () => {
    // Precies tussen `maxAgeHours` en `pageStaleAfterHours`: de sweep zou hier
    // alarm slaan (zijn vraag wordt maar één keer per dag gesteld), de pagina niet.
    const between = { maxAgeHours: 26, lastRunAt: hoursAgo(27), lastSuccessAt: hoursAgo(27) }
    expect(deriveJobHealth({ ...between, now: NOW })).toBe('ok')
    expect(pageStaleAfterHours(26)).toBeGreaterThan(27)
  })

  /**
   * De regressie van de code-review, met gemeten cijfers: 13 opeenvolgende
   * `news-ingest`-runs startten 6,6–55,1 min ná het hele uur. Draaide de
   * prijsverversing gisteren om 18:06 en vandaag pas om 18:55, dan is de laatste
   * geslaagde run er tussenin 24u49m oud terwijl er niets aan de hand is. De
   * kaart mag dan geen rood "Achterstallig" tonen.
   */
  it('een gezonde dagelijkse taak wordt niet achterstallig door cron-jitter', () => {
    const gisteren = new Date('2026-08-10T18:06:00.000Z').toISOString()
    const vlakVoorDeRunVanVandaag = new Date('2026-08-11T18:55:00.000Z')
    expect(
      deriveJobHealth({
        maxAgeHours: JOB_CATALOG['holdings-prices'].maxAgeHours,
        lastRunAt: gisteren,
        lastSuccessAt: gisteren,
        now: vlakVoorDeRunVanVandaag,
      }),
    ).toBe('ok')
  })

  it('maar een écht gemiste dag blijft achterstallig', () => {
    const eergisteren = new Date('2026-08-09T18:06:00.000Z').toISOString()
    expect(
      deriveJobHealth({
        maxAgeHours: JOB_CATALOG['holdings-prices'].maxAgeHours,
        lastRunAt: eergisteren,
        lastSuccessAt: eergisteren,
        now: new Date('2026-08-11T18:55:00.000Z'),
      }),
    ).toBe('overdue')
  })

  it('een taak die vandaag faalde maar gisteren slaagde is actueel — niet stil', () => {
    expect(
      deriveJobHealth({
        maxAgeHours: 26,
        lastRunAt: hoursAgo(1), // error
        lastSuccessAt: hoursAgo(25),
        now: NOW,
      }),
    ).toBe('ok')
  })

  it('een taak die wél draait maar nooit slaagt is achterstallig (niet "nooit uitgevoerd")', () => {
    expect(
      deriveJobHealth({ maxAgeHours: 26, lastRunAt: hoursAgo(1), lastSuccessAt: null, now: NOW }),
    ).toBe('overdue')
  })

  it('zonder enige run is de taak "nog niet uitgevoerd"', () => {
    expect(
      deriveJobHealth({ maxAgeHours: 26, lastRunAt: null, lastSuccessAt: null, now: NOW }),
    ).toBe('never')
  })

  it('maxAgeHours null = geen uitspraak, ook zonder runs', () => {
    expect(
      deriveJobHealth({ maxAgeHours: null, lastRunAt: null, lastSuccessAt: null, now: NOW }),
    ).toBe('unmonitored')
    expect(
      deriveJobHealth({
        maxAgeHours: null,
        lastRunAt: hoursAgo(900),
        lastSuccessAt: hoursAgo(900),
        now: NOW,
      }),
    ).toBe('unmonitored')
  })

  it('telt per toestand, inclusief de lege categorieën', () => {
    expect(summarizeJobHealth(['ok', 'ok', 'overdue', 'unknown'])).toEqual({
      ok: 2,
      overdue: 1,
      never: 0,
      unknown: 1,
      unmonitored: 0,
    })
  })
})

describe('detectScheduleDrift', () => {
  const crons: CronEntry[] = [{ path: '/api/cron/retention', schedule: '45 3 * * *' }]

  it('meldt geen drift wanneer catalogus en vercel.json elkaar dekken', () => {
    expect(detectScheduleDrift([entry()], crons)).toEqual({
      unknownCrons: [],
      unscheduledJobs: [],
    })
  })

  it('twee taken op hetzelfde pad (meelifter) geven GEEN valse drift', () => {
    const meelifter = entry({ key: 'integraties-health', label: 'Integraties liveness' })
    const res = detectScheduleDrift([entry(), meelifter], crons)
    expect(res.unknownCrons).toHaveLength(0)
    expect(res.unscheduledJobs).toHaveLength(0)
  })

  it('meldt een catalogus-entry waarvan het pad niet is ingepland', () => {
    const res = detectScheduleDrift([entry({ key: 'snapshots', path: '/api/snapshots/cron' })], crons)
    expect(res.unscheduledJobs.map((j) => j.key)).toEqual(['snapshots'])
  })

  it('meldt een cron waar geen enkele catalogus-entry naar wijst', () => {
    const res = detectScheduleDrift(
      [entry()],
      [...crons, { path: '/api/cron/verweesd', schedule: '0 1 * * *' }],
    )
    expect(res.unknownCrons.map((c) => c.path)).toEqual(['/api/cron/verweesd'])
  })
})

// ── De echte configuratie: dit is de CI-gate ────────────────────────────────

/** `{minuut} {uur} …` → tijdstip, of null bij een niet-vaste expressie. */
function clockFromCron(expr: string): { hour: number; minute: number } | null {
  const [minute, hour] = expr.trim().split(/\s+/)
  if (!/^\d+$/.test(minute ?? '') || !/^\d+$/.test(hour ?? '')) return null
  return { hour: Number(hour), minute: Number(minute) }
}

function isDaily(expr: string): boolean {
  const [, , dom, month, dow] = expr.trim().split(/\s+/)
  return dom === '*' && month === '*' && dow === '*'
}

describe('vercel.json ↔ taakcatalogus', () => {
  it('elke taak is ingepland en elke cron is bekend', () => {
    expect(detectScheduleDrift()).toEqual({ unknownCrons: [], unscheduledJobs: [] })
  })

  it('geen enkele cron draait vaker dan één keer per dag (planlimiet)', () => {
    // Dit plan staat één cron-uitvoering per dag toe. Een `*/15` of een lijst in
    // het minuut-/uurveld glipt er anders zonder slag of stoot weer in.
    for (const cron of VERCEL_CRONS) {
      expect(clockFromCron(cron.schedule), `${cron.path}: ${cron.schedule}`).not.toBeNull()
    }
  })

  it('de meldingen-sweep draait dagelijks om 19:00 — ná de laatste dagelijkse taak', () => {
    const sweep = cronScheduleFor('/api/cron/alerts-sweep')
    expect(sweep).toBe('0 19 * * *')
    const daily = VERCEL_CRONS.filter((c) => isDaily(c.schedule)).map(
      (c) => clockFromCron(c.schedule)!.hour * 60 + clockFromCron(c.schedule)!.minute,
    )
    expect(Math.max(...daily)).toBe(19 * 60)
  })

  it('de mensleesbare schedule-tekst komt overeen met de cron-expressie', () => {
    for (const job of JOB_LIST) {
      const expr = cronScheduleFor(job.path)
      const cron = expr ? clockFromCron(expr) : null
      const text = job.schedule.match(/(\d{1,2}):(\d{2})/)
      if (!cron || !text) continue
      expect(
        { hour: Number(text[1]), minute: Number(text[2]) },
        `${job.key}: "${job.schedule}" vs "${expr}"`,
      ).toEqual(cron)
    }
  })

  it('elke schedule-tekst met een kloktijd zegt er UTC bij', () => {
    // Vercel evalueert cron-expressies in UTC; de pagina toont tijdstempels in
    // Amsterdamse tijd. Zonder dit achtervoegsel leest "Dagelijks 05:00" naast een
    // laatste run van 07:55 als drift, terwijl beide kloppen.
    for (const job of JOB_LIST) {
      if (!/\d{1,2}:\d{2}/.test(job.schedule)) continue
      expect(job.schedule, `${job.key}: "${job.schedule}"`).toContain('UTC')
    }
  })

  /**
   * De ijking uit lib/job-catalog.ts, hier afgedwongen — MÉT de gemeten jitter.
   * Vercel start een cron tot ~55 min ná het hele uur (13 news-ingest-runs, aug
   * 2026), dus zowel de taak als de sweep schuiven. De sweep vraagt eenmalig:
   *
   *   ondergrens = gat + jitter   (sweep laat, taak vroeg → gezond, mag niet stil heten)
   *   bovengrens = gat + 24 − jitter (sweep vroeg, taak laat → gemist, moet stil heten)
   *
   * Een gate die met ideale kloktijden rekent, blijft groen terwijl de echte
   * marge elf minuten is — dat is vertrouwen zonder dekking.
   */
  it('maxAgeHours van elke dagelijkse taak valt binnen het jitter-bestendige sweep-venster', () => {
    const sweep = clockFromCron(cronScheduleFor('/api/cron/alerts-sweep') ?? '')!
    const sweepMinutes = sweep.hour * 60 + sweep.minute

    for (const job of JOB_LIST) {
      const expr = cronScheduleFor(job.path)
      if (!expr || !isDaily(expr) || job.maxAgeHours == null) continue
      const clock = clockFromCron(expr)!
      const gapHours = ((sweepMinutes - (clock.hour * 60 + clock.minute) + 1440) % 1440) / 60

      expect(
        job.maxAgeHours,
        `${job.key}: drempel te krap, een gezonde (late) run zou stil heten`,
      ).toBeGreaterThan(gapHours + CRON_JITTER_HOURS)
      expect(
        job.maxAgeHours,
        `${job.key}: drempel te ruim, een gemiste run blijft een dag onopgemerkt`,
      ).toBeLessThan(gapHours + 24 - CRON_JITTER_HOURS)
    }
  })

  /**
   * De tweede band — die van de PAGINA, die op een willekeurig moment kijkt. Twee
   * opeenvolgende gezonde runs kunnen 24u + jitter uit elkaar liggen; ligt de
   * paginadrempel daaronder, dan kleurt de kaart op ongeveer de helft van de dagen
   * ten onrechte rood.
   */
  it('de paginadrempel overleeft de maximale afstand tussen twee gezonde runs', () => {
    for (const job of JOB_LIST) {
      const expr = cronScheduleFor(job.path)
      if (!expr || !isDaily(expr) || job.maxAgeHours == null) continue
      expect(
        pageStaleAfterHours(job.maxAgeHours),
        `${job.key}: pagina zou een gezonde taak achterstallig noemen`,
      ).toBeGreaterThan(24 + CRON_JITTER_HOURS)
      expect(
        pageStaleAfterHours(job.maxAgeHours),
        `${job.key}: pagina zou een dag stilte helemaal niet meer zien`,
      ).toBeLessThan(48)
    }
  })
})
