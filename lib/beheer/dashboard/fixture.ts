import { JOB_CATALOG, JOB_LIST } from '@/lib/job-catalog'
import type { JobHealth } from '@/lib/job-health'
import type { JobRunRij, JobStand } from '@/lib/job-health-loader'
import type { JobKey, JobStatus } from '@/lib/job-runs'
import { DEFAULT_PLATFORM_STATUS } from '@/lib/platform-status'
import type { DashboardFeiten, FoutenFeit } from './feiten'
import type { FoutsoortBeeld, Voorval } from './fouten'
import { bronOk } from './status'

/**
 * Testgegevens voor het beheerdashboard: een platform waar niets aan de hand
 * is, plus bouwstenen om er één afwijking in te zetten.
 *
 * Alleen voor tests. Geen echte gegevens: namen, tijden en aantallen zijn
 * verzonnen en herkenbaar rond.
 */

export const FIXTURE_NU = '2026-09-29T10:00:00.000Z'

export function run(
  job: JobKey,
  status: JobStatus,
  created_at: string,
  extra: Partial<Pick<JobRunRij, 'summary' | 'error'>> = {},
): JobRunRij {
  return {
    id: `${job}-${created_at}`,
    job,
    status,
    started_at: created_at,
    finished_at: created_at,
    duration_ms: 1200,
    summary: extra.summary ?? null,
    error: extra.error ?? null,
    created_at,
  }
}

export function stand(
  job: JobKey,
  health: JobHealth,
  last: JobRunRij | null,
  lastSuccessAt: string | null = last && last.status !== 'error' ? last.created_at : null,
): JobStand {
  return { job: JOB_CATALOG[job], last, lastSuccessAt, health }
}

/** Elke taak uit de catalogus, net geslaagd. */
export function gezondeStanden(nu: string = FIXTURE_NU): JobStand[] {
  const kort = new Date(Date.parse(nu) - 3 * 3_600_000).toISOString()
  return JOB_LIST.map((job) =>
    stand(job.key, job.maxAgeHours == null ? 'unmonitored' : 'ok', run(job.key, 'success', kort)),
  )
}

/** Vervangt de stand van één taak. */
export function metStand(standen: JobStand[], nieuw: JobStand): JobStand[] {
  return standen.map((s) => (s.job.key === nieuw.job.key ? nieuw : s))
}

export function foutsoort(deel: Partial<FoutsoortBeeld> & Pick<FoutsoortBeeld, 'signature'>): FoutsoortBeeld {
  return {
    context: 'client:render',
    voorbeeld: 'Onverwachte fout in een component',
    niveau: 'error',
    open: true,
    teruggekomen: false,
    aantal: 3,
    recent: 3,
    eerstGezien: '2026-09-25T09:00:00.000Z',
    laatstGezien: '2026-09-28T09:00:00.000Z',
    gebruikers: 0,
    zonderGebruiker: 0,
    teruggekomenSinds: null,
    sindsAfvinken: 0,
    ...deel,
  }
}

/** `gebruiker` is het volgnummer binnen de lezing (zie `naarVoorvallen`); `null` = geen gebruiker. */
export function voorval(
  signature: string,
  created_at: string,
  gebruiker: number | null,
  context = 'client:render',
): Voorval {
  return { signature, context, created_at, gebruiker }
}

export function foutenFeit(soorten: FoutsoortBeeld[] = [], voorvallen: Voorval[] = []): FoutenFeit {
  return {
    soorten,
    voorvallen,
    afgekapt: false,
    vensterVanaf: voorvallen.length > 0 ? voorvallen[voorvallen.length - 1].created_at : null,
    vensterGrootte: 1000,
  }
}

/** Een platform zonder afwijkingen, met elke meting aanwezig en vers. */
export function gezondeFeiten(nu: string = FIXTURE_NU): DashboardFeiten {
  const gisteren = new Date(Date.parse(nu) - 16 * 3_600_000).toISOString()
  return {
    gemetenOp: nu,
    omgeving: 'production',
    platform: bronOk({ status: DEFAULT_PLATFORM_STATUS, gewijzigdOp: '2026-09-02T08:00:00.000Z' }),
    ai: { status: 'ok', sinceAt: null, failureCount: 0, lastSuccessAt: gisteren },
    taken: bronOk({
      standen: gezondeStanden(nu),
      cronSecret: true,
      pushKanaal: true,
      drift: { unknownCrons: [], unscheduledJobs: [] },
    }),
    fouten: bronOk(
      foutenFeit(
        [foutsoort({ signature: 'aaaaaaaaaaaaaaaa', open: false, recent: 0 })],
        [voorval('aaaaaaaaaaaaaaaa', '2026-09-10T09:00:00.000Z', 1)],
      ),
    ),
    koppelingen: bronOk({
      tellingen: {
        exchange_connections: { total: 4, withError: 0, syncfoutGemeten: true, syncfoutLeesfout: false },
        broker_connections: { total: 2, withError: 0, syncfoutGemeten: true, syncfoutLeesfout: false },
        wallet_addresses: { total: 1, withError: 0, syncfoutGemeten: true, syncfoutLeesfout: false },
        bank_connections: { total: 20, withError: 0, syncfoutGemeten: false, syncfoutLeesfout: false },
      },
      probe: { gemetenOp: gisteren, gemeten: 6, bereikbaar: 6, onbereikbaar: [], begrensd: 0, nietMeetbaar: 8 },
      banksync: bronOk({ dagen: 7, pogingen: 12, mislukt: 0, gebruikers: 6, gebruikersLaatsteMislukt: 0, afgekapt: false }),
    }),
    mail: bronOk({ ingericht: true, dagen: 7, verzonden: 5, mislukt: 0, overgeslagen: 0, laatstePoging: gisteren }),
    vitals: bronOk({
      dagen: 7,
      omgeving: 'production',
      metrics: [
        { metric: 'LCP', p75: 1900, metingen: 800 },
        { metric: 'INP', p75: 120, metingen: 640 },
        { metric: 'CLS', p75: 0.04, metingen: 800 },
        { metric: 'FCP', p75: 1200, metingen: 800 },
        { metric: 'TTFB', p75: 500, metingen: 800 },
      ],
    }),
    meldingen: bronOk({ dagen: 7, nieuw: 2, wachtend: 0, vastgelopen: 0, maxPogingen: 5 }),
    krant: bronOk({
      bronnen: { gecontroleerdOp: gisteren, totaal: 12, nietGoed: [] },
      wachtrij: 0,
    }),
    inbakken: { errors: 0, feedback: 0, calculator_reports: 0 },
    fiscaal: { doeljaar: 2027, open: 0, driftOpen: 0 },
  }
}
