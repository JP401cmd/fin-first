import vercelConfig from '@/vercel.json'
import { JOB_LIST, type JobCatalogEntry } from '@/lib/job-catalog'

/**
 * Actualiteit van de achtergrondtaken + drift tussen `vercel.json` en de
 * taakcatalogus. Puur: geen client, geen klok van zichzelf, geen IO — zodat
 * elke toestand en elke driftvorm met een unit-test vast te leggen is.
 *
 * Twee dingen die de beheerpagina hiervóór niet kon:
 *
 *  1. **Toestand per taak.** `maxAgeHours` stond wél in de catalogus maar werd
 *     alleen door de meldingen-sweep gebruikt. Een taak die had moeten draaien
 *     maar niets deed, zag er op /beheer/jobs identiek uit als een taak die net
 *     was ingericht. `deriveJobHealth` maakt dat verschil expliciet.
 *  2. **Schema uit de bron.** De `schedule`-string in de catalogus is
 *     mensentaal en werd door niets afgedwongen. `vercel.json` is de bron; de
 *     tekst is de duiding. Wijken ze uiteen — een cron zonder catalogus-entry
 *     of een entry zonder cron — dan hoort dat zichtbaar te zijn (en rood in
 *     CI, zie job-health.test.ts).
 */

export interface CronEntry {
  path: string
  schedule: string
}

/** De crons zoals ze werkelijk zijn ingepland. Statisch geïmporteerd, dus altijd
 *  mee-gebundeld (een `fs.readFile` op `process.cwd()` overleeft de serverless
 *  build niet gegarandeerd). */
export const VERCEL_CRONS: readonly CronEntry[] = (vercelConfig.crons ?? []) as CronEntry[]

/** Cron-expressie voor een pad, of `null` als dat pad niet is ingepland. */
export function cronScheduleFor(
  path: string,
  crons: readonly CronEntry[] = VERCEL_CRONS,
): string | null {
  return crons.find((c) => c.path === path)?.schedule ?? null
}

export interface ScheduleDrift {
  /** Cron in `vercel.json` waar geen enkele catalogus-entry naar wijst. */
  unknownCrons: CronEntry[]
  /** Catalogus-entry waarvan het pad niet in `vercel.json` staat. */
  unscheduledJobs: JobCatalogEntry[]
}

/**
 * Drift in beide richtingen. Bewust een vergelijking op PADEN, niet 1-op-1 per
 * taak: `integraties-health` deelt met opzet het pad van `holdings-prices` (het
 * lift mee op de prijs-refresh). Een set-vergelijking ziet dat als "gedekt" —
 * precies goed — terwijl een 1-op-1-koppeling er een valse melding van zou
 * maken.
 */
export function detectScheduleDrift(
  jobs: readonly JobCatalogEntry[] = JOB_LIST,
  crons: readonly CronEntry[] = VERCEL_CRONS,
): ScheduleDrift {
  const jobPaths = new Set(jobs.map((j) => j.path))
  const cronPaths = new Set(crons.map((c) => c.path))
  return {
    unknownCrons: crons.filter((c) => !jobPaths.has(c.path)),
    unscheduledJobs: jobs.filter((j) => !cronPaths.has(j.path)),
  }
}

/**
 * Spreiding waarmee Vercel een cron daadwerkelijk start. GEMETEN, niet
 * aangenomen: 13 opeenvolgende `news-ingest`-runs (`0 5 * * *`) startten 6,6 tot
 * 55,1 minuten ná het hele uur. Vercel plant dus op uur-granulariteit; reken met
 * een vol uur, niet met seconden.
 */
export const CRON_JITTER_HOURS = 1

/**
 * Toeslag op `maxAgeHours` voor het oordeel op /beheer/jobs.
 *
 * DE KERN VAN DEZE MODULE — het zijn twee verschillende vragen:
 *
 *  - **De sweep** vraagt eenmalig, op zijn eigen vaste tijdstip: "heeft deze taak
 *    zijn beurt gemist?" Dat mag een krappe drempel hebben, want het antwoord
 *    wordt maar op één moment van de dag gegeven — vlak ná de taak zelf.
 *  - **De pagina** vraagt op een WILLEKEURIG moment: "is deze taak bij?" Daar is
 *    dezelfde drempel te krap. Een taak die gisteren om 18:06 draaide en vandaag
 *    om 18:55, heeft er tussenin 24u49m op zitten zonder dat er iets mis is. Met
 *    de sweep-drempel zou de kaart op ruwweg de helft van de dagen tot bijna een
 *    uur lang rood "Achterstallig" tonen — op precies de pagina die de vraag
 *    "loopt alles nog?" beantwoordt. Vals alarm daar is duurder dan een oordeel
 *    dat een paar uur later komt: het alarm is de sweep, niet de pagina.
 *
 * 3 uur = 24u nominaal + 1u gemeten jitter, min de laagst voorkomende
 * sweep-drempel (23u voor een taak die vlak vóór de sweep draait), plus ruimte
 * voor de looptijd van de taak zelf (`created_at` wordt bij het afronden
 * geschreven). Afgedwongen in job-health.test.ts.
 */
export const PAGE_JITTER_MARGIN_HOURS = 3

/** Vanaf welke leeftijd de PAGINA een taak achterstallig noemt. */
export function pageStaleAfterHours(maxAgeHours: number): number {
  return maxAgeHours + PAGE_JITTER_MARGIN_HOURS
}

export type JobHealth = 'ok' | 'overdue' | 'never' | 'unmonitored' | 'unknown'

export const JOB_HEALTH_META: Record<
  JobHealth,
  { label: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' }
> = {
  ok: { label: 'Actueel', tone: 'positive' },
  overdue: { label: 'Achterstallig', tone: 'negative' },
  never: { label: 'Nog niet uitgevoerd', tone: 'warning' },
  unknown: { label: 'Niet af te lezen', tone: 'warning' },
  unmonitored: { label: 'Niet bewaakt', tone: 'neutral' },
}

/** Weergavevolgorde van de telling bovenaan: van "moet je nu iets mee" naar rustig. */
export const JOB_HEALTH_ORDER: readonly JobHealth[] = [
  'overdue',
  'never',
  'unknown',
  'ok',
  'unmonitored',
]

/**
 * Toestand van één taak, gemeten op een willekeurig moment (de pagina-vraag).
 *
 * Twee dingen die makkelijk door elkaar lopen:
 *  - "laatste run" en "laatste GESLAAGDE run" zijn níét hetzelfde. Het
 *    achterstallig-signaal hangt op de tweede: een taak die elke nacht netjes op
 *    tijd faalt, is niet actueel. `lastRunAt` bepaalt alleen of hij ooit iets
 *    heeft gedaan.
 *  - `'unknown'` komt hier niet uit: dat is geen eigenschap van de taak maar van
 *    de leesactie (een gefaalde query). De aanroeper zet die toestand, zodat een
 *    onleesbare tabel nooit als "nog niet uitgevoerd" op het scherm belandt.
 */
export function deriveJobHealth(params: {
  maxAgeHours: number | null
  lastRunAt: string | null
  lastSuccessAt: string | null
  now: Date
}): Exclude<JobHealth, 'unknown'> {
  const { maxAgeHours, lastRunAt, lastSuccessAt, now } = params
  // Bewust vóór alles: bij `null` doen we geen uitspraak (de sweep kan zijn
  // eigen stilte niet zien — dat is de taak van de externe dead man's switch).
  if (maxAgeHours == null) return 'unmonitored'
  if (!lastRunAt) return 'never'

  const lastMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN
  if (Number.isNaN(lastMs)) return 'overdue'
  return now.getTime() - lastMs > pageStaleAfterHours(maxAgeHours) * 60 * 60 * 1000
    ? 'overdue'
    : 'ok'
}

/** Telling per toestand, inclusief nullen (een lege categorie is ook informatie). */
export function summarizeJobHealth(healths: readonly JobHealth[]): Record<JobHealth, number> {
  const counts: Record<JobHealth, number> = {
    ok: 0,
    overdue: 0,
    never: 0,
    unknown: 0,
    unmonitored: 0,
  }
  for (const h of healths) counts[h] += 1
  return counts
}
