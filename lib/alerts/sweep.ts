import type { JobKey } from '@/lib/job-runs'
import type { JobCatalogEntry } from '@/lib/job-catalog'
import { errorFingerprint, safeContextTag } from '@/lib/alerts/fingerprint'
import type { PushMessage } from '@/lib/alerts/push'

/**
 * De binnenwacht (ADR 0102): één pure functie die uit ruwe rijen bepaalt WELKE
 * meldingen eruit moeten. Alle IO staat in `lib/alerts/store.ts` en de route —
 * hier zit geen client, geen tijd, geen netwerk, zodat elke drempel, throttle
 * en ontdubbeling met een unit-test vast te leggen is.
 *
 * Drie signalen:
 *  - **S1 nieuwe fouten** — `error_logs` sinds het watermerk, gegroepeerd op
 *    fingerprint. Meldt alleen NIEUWE soorten (+ één escalatie bij 10× volume).
 *  - **S2a gefaalde taak** — `job_runs.status='error'`, per taak hoogstens één
 *    alarm per 20 uur via dezelfde `cron_alert_last_<job>`-sleutel als de
 *    bestaande mail, zodat mail en push samen niet twee keer alarm slaan
 *    (zie `THROTTLE_MS` — inclusief wat dat venster niet belooft).
 *  - **S2b uitgebleven taak** — geen geslaagde run binnen `maxAgeHours`. Dit
 *    sluit fase 2 van ADR 0060 en is het enige signaal dat "de cron draaide
 *    helemaal niet" van binnenuit ziet (mits de sweep zélf nog draait — dáárom
 *    hangt er extern een dead man's switch omheen).
 *
 * PAYLOADREGEL (hard, AVG): een melding draagt uitsluitend TELLINGEN, taak-
 * labels, een geknepen context-tag en een deeplink. Nooit `message`, `stack`,
 * `url` of `job_runs.error` — het kanaal loopt buiten onze stack en die velden
 * kunnen gebruikersinvoer en id's bevatten. Vastgelegd in sweep.test.ts.
 */

/**
 * Stiltevenster per fouttype en per taak: **hoogstens één alarm per 20 uur**.
 *
 * Niet 24 uur, sinds de sweep dagelijks draait (19:00 UTC, planlimiet). Een
 * throttle die gelijk is aan de cadans is een val: de ronde van morgen valt dan
 * op de rand van zijn eigen venster, en Vercel start een cron tot ~55 minuten ná
 * het hele uur (gemeten) — dus die rand wordt daadwerkelijk geraakt en er valt
 * een dag stilletjes uit. 20 uur ligt onder de cadans en boven de grootste
 * afstand binnen één etmaal tussen een taak en de sweep (snapshots 02:00 → sweep
 * 19:00 = 17 uur), zodat de mail van `lib/cron-alert.ts` en de push van de sweep
 * elkaar op dezelfde dag nog steeds ontdubbelen.
 *
 * WAT DIT NIET MEER BELOOFT: "hoogstens één alarm per taak per etmaal". Roept de
 * externe pinger de route vaker aan (het runbook schrijft elk kwartier voor), dan
 * vuurt een blijvend falende taak op t=0, 20u, 40u — en dan bevat een rollend
 * etmaal er twee. Dat is de bewuste ruil: liever af en toe een alarm te veel dan
 * een dag die stilletjes wegvalt. `cron-alert.ts` houdt zijn eigen venster op 24
 * uur maar schrijft dezelfde `cron_alert_last_<job>`-sleutel, dus in de praktijk
 * bepaalt het kortste venster van de twee wanneer er weer een alarm mag.
 */
const THROTTLE_MS = 20 * 60 * 60 * 1000
/** Her-alarm zodra een al gemeld fouttype 10× zo vaak voorkomt als bij de melding. */
const ESCALATION_FACTOR = 10
/** Fingerprints zonder nieuw voorval verlopen; houdt de state-blob klein. */
const FINGERPRINT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/**
 * Harde bovengrens op het aantal onthouden fouttypes. Nodig omdat de
 * normalisatie niet élk variabel deel wegmaskeert (zie fingerprint.test.ts):
 * een foutmelding met een hoge kardinaliteit zou de state-blob anders binnen de
 * TTL laten volgroeien. Bij overschrijding blijven de recentst geziene types
 * staan — het oudste type "vergeten" kost hooguit één extra melding.
 */
const MAX_FINGERPRINTS = 500
/** Hoeveel context-tags maximaal in de meldingstekst. */
const MAX_TAGS_IN_BODY = 5

export interface SweepErrorRow {
  context: string | null
  message: string | null
  created_at: string
}

export interface SweepFailedRun {
  job: string
  created_at: string
}

export interface FingerprintState {
  /** Voorvallen sinds de laatste melding-reset. */
  total: number
  /** Wanneer voor dit type voor het laatst gemeld is. */
  alertedAt: string
  /** `total` op het moment van die melding (basis voor de escalatiedrempel). */
  alertedTotal: number
  /** Laatste voorval; stuurt het opruimen. */
  lastSeen: string
}

export interface SweepState {
  /** `created_at` van de laatst verwerkte error-rij; `null` = nog niet gestart. */
  errorWatermark: string | null
  fingerprints: Record<string, FingerprintState>
  /** job → ISO van de laatste FOUT-melding (gedeeld met lib/cron-alert.ts). */
  jobAlerts: Record<string, string>
  /** job → ISO van de laatste STILTE-melding. */
  staleAlerts: Record<string, string>
}

export interface SweepInput {
  now: Date
  /** Oplopend op `created_at`, al gefilterd op > watermerk. */
  errorRows: SweepErrorRow[]
  /** `job_runs` met status 'error' uit het laatste etmaal. */
  failedRuns: SweepFailedRun[]
  /** Per taak de `created_at` van de laatste GESLAAGDE run (of null). */
  lastSuccessByJob: Partial<Record<JobKey, string | null>>
  state: SweepState
  jobs: readonly JobCatalogEntry[]
  baseUrl: string
}

export interface SweepSummary {
  errors_scanned: number
  new_error_types: number
  escalations: number
  failed_jobs: number
  stale_jobs: number
  notifications: number
  bootstrapped: boolean
}

export interface SweepResult {
  notifications: PushMessage[]
  state: SweepState
  summary: SweepSummary
}

export function emptySweepState(): SweepState {
  return { errorWatermark: null, fingerprints: {}, jobAlerts: {}, staleAlerts: {} }
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})

function fmtMoment(iso: string | null): string {
  if (!iso) return 'nooit'
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 'onbekend' : dateTimeFmt.format(new Date(ms))
}

function throttled(lastIso: string | undefined, nowMs: number): boolean {
  if (!lastIso) return false
  const last = Date.parse(lastIso)
  return !Number.isNaN(last) && nowMs - last < THROTTLE_MS
}

/**
 * Tags op volgorde van voorvalaantal, niet van binnenkomst. Zonder die sortering
 * kan iemand die veel onbeduidende fouttypes veroorzaakt de écht zware tag uit
 * de eerste vijf duwen ("en 16 andere").
 */
function tagLine(tags: { tag: string; count: number }[]): string {
  const byTag = new Map<string, number>()
  for (const t of tags) byTag.set(t.tag, (byTag.get(t.tag) ?? 0) + t.count)
  const sorted = [...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
  const shown = sorted.slice(0, MAX_TAGS_IN_BODY)
  const rest = sorted.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` en ${rest} andere` : '')
}

export function runSweep(input: SweepInput): SweepResult {
  const { now, errorRows, failedRuns, lastSuccessByJob, state, jobs, baseUrl } = input
  const nowMs = now.getTime()
  const nowIso = now.toISOString()
  const notifications: PushMessage[] = []

  const next: SweepState = {
    errorWatermark: state.errorWatermark,
    fingerprints: { ...state.fingerprints },
    jobAlerts: { ...state.jobAlerts },
    staleAlerts: { ...state.staleAlerts },
  }

  // ── S1 — nieuwe unieke fouten ──────────────────────────────────────────────
  // Watermerk numeriek bijhouden: `created_at` komt als timestamptz met offset
  // binnen, dus tekstvergelijking is niet betrouwbaar. Opgeslagen als ISO-Z.
  let watermarkMs = state.errorWatermark ? Date.parse(state.errorWatermark) : NaN
  const groups = new Map<string, { tag: string; count: number }>()

  for (const row of errorRows) {
    const ms = Date.parse(row.created_at)
    if (!Number.isNaN(ms) && (Number.isNaN(watermarkMs) || ms > watermarkMs)) watermarkMs = ms
    const fp = errorFingerprint(row.context, row.message)
    const g = groups.get(fp)
    if (g) g.count += 1
    else groups.set(fp, { tag: safeContextTag(row.context), count: 1 })
  }
  if (!Number.isNaN(watermarkMs)) next.errorWatermark = new Date(watermarkMs).toISOString()

  // Eerste run: alleen het watermerk zetten. Zonder deze stap zou de sweep bij
  // ingebruikname de complete foutgeschiedenis als "nieuw" melden.
  const bootstrapped = state.errorWatermark == null
  if (bootstrapped && next.errorWatermark == null) next.errorWatermark = nowIso

  const newTags: { tag: string; count: number }[] = []
  const escalations: string[] = []
  let newCount = 0

  if (!bootstrapped) {
    for (const [fp, g] of groups) {
      const prev = next.fingerprints[fp]
      const stillThrottled = prev && throttled(prev.alertedAt, nowMs)

      if (!prev || !stillThrottled) {
        // Nieuw fouttype, of eentje die na het stiltevenster terugkomt.
        next.fingerprints[fp] = {
          total: g.count,
          alertedAt: nowIso,
          alertedTotal: g.count,
          lastSeen: nowIso,
        }
        newTags.push({ tag: g.tag, count: g.count })
        newCount += g.count
        continue
      }

      const total = prev.total + g.count
      if (total >= prev.alertedTotal * ESCALATION_FACTOR) {
        escalations.push(`${g.tag}: ${total}× (was ${prev.alertedTotal}×)`)
        next.fingerprints[fp] = {
          total,
          alertedAt: nowIso,
          alertedTotal: total,
          lastSeen: nowIso,
        }
      } else {
        next.fingerprints[fp] = { ...prev, total, lastSeen: nowIso }
      }
    }
  }

  // Verlopen fingerprints opruimen (state blijft klein en leesbaar).
  for (const [fp, fpState] of Object.entries(next.fingerprints)) {
    const seen = Date.parse(fpState.lastSeen)
    if (!Number.isNaN(seen) && nowMs - seen > FINGERPRINT_TTL_MS) delete next.fingerprints[fp]
  }
  // Cap: bij overschrijding alleen de recentst geziene types bewaren.
  const fpEntries = Object.entries(next.fingerprints)
  if (fpEntries.length > MAX_FINGERPRINTS) {
    fpEntries.sort((a, b) => Date.parse(b[1].lastSeen) - Date.parse(a[1].lastSeen))
    next.fingerprints = Object.fromEntries(fpEntries.slice(0, MAX_FINGERPRINTS))
  }

  if (newTags.length > 0) {
    const uniek = newTags.length === 1 ? '1 nieuw fouttype' : `${newTags.length} nieuwe fouttypes`
    const voorval = newCount === 1 ? '1 voorval' : `${newCount} voorvallen`
    notifications.push({
      title: 'Nieuwe fouten in TriFinity',
      body: `${uniek} (${voorval}) sinds de vorige controle.\nContext: ${tagLine(newTags)}`,
      tags: ['rotating_light'],
      click: `${baseUrl}/beheer/errors`,
      priority: 'high',
    })
  }

  if (escalations.length > 0) {
    notifications.push({
      title: 'Bekende fout escaleert',
      body: `Sterk toegenomen volume:\n${escalations.slice(0, MAX_TAGS_IN_BODY).join('\n')}`,
      tags: ['chart_with_upwards_trend'],
      click: `${baseUrl}/beheer/errors`,
      priority: 'high',
    })
  }

  // ── S2a — gefaalde achtergrondtaken ────────────────────────────────────────
  const latestFailure = new Map<string, number>()
  for (const run of failedRuns) {
    const ms = Date.parse(run.created_at)
    if (Number.isNaN(ms)) continue
    const known = latestFailure.get(run.job)
    if (known == null || ms > known) latestFailure.set(run.job, ms)
  }

  const failedLines: string[] = []
  for (const [job, ms] of latestFailure) {
    if (throttled(next.jobAlerts[job], nowMs)) continue
    const entry = jobs.find((j) => j.key === job)
    failedLines.push(`${entry?.label ?? job} · ${fmtMoment(new Date(ms).toISOString())}`)
    next.jobAlerts[job] = nowIso
  }

  if (failedLines.length > 0) {
    notifications.push({
      title: 'Achtergrondtaak gefaald',
      // Bewust GEEN `job_runs.error`-tekst: die staat op /beheer/jobs en in de mail.
      body: `${failedLines.length === 1 ? 'Eén taak is' : `${failedLines.length} taken zijn`} met een fout geëindigd:\n${failedLines.join('\n')}`,
      tags: ['x'],
      click: `${baseUrl}/beheer/jobs`,
      priority: 'high',
    })
  }

  // ── S2b — uitgebleven achtergrondtaken ─────────────────────────────────────
  const staleLines: string[] = []
  for (const job of jobs) {
    if (job.maxAgeHours == null) continue
    if (throttled(next.staleAlerts[job.key], nowMs)) continue

    const lastIso = lastSuccessByJob[job.key] ?? null
    const lastMs = lastIso ? Date.parse(lastIso) : NaN
    const ageMs = Number.isNaN(lastMs) ? Number.POSITIVE_INFINITY : nowMs - lastMs
    if (ageMs <= job.maxAgeHours * 60 * 60 * 1000) continue

    staleLines.push(`${job.label} · laatste succes ${fmtMoment(lastIso)}`)
    next.staleAlerts[job.key] = nowIso
  }

  if (staleLines.length > 0) {
    notifications.push({
      title: 'Achtergrondtaak is stil',
      body: `${staleLines.length === 1 ? 'Eén taak draaide' : `${staleLines.length} taken draaiden`} niet binnen het verwachte venster:\n${staleLines.join('\n')}`,
      tags: ['mute'],
      click: `${baseUrl}/beheer/jobs`,
      priority: 'high',
    })
  }

  return {
    notifications,
    state: next,
    summary: {
      errors_scanned: errorRows.length,
      new_error_types: newTags.length,
      escalations: escalations.length,
      failed_jobs: failedLines.length,
      stale_jobs: staleLines.length,
      notifications: notifications.length,
      bootstrapped,
    },
  }
}
