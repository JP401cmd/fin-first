import { pageStaleAfterHours } from '@/lib/job-health'
import type { JobStand } from '@/lib/job-health-loader'
import type { ProbeFeit } from './feiten'

/**
 * De bereikbaarheidsmeting van externe diensten (taak `integraties-health`).
 *
 * DEZE TAAK IS EEN METING, EN DAT MAAKT HAAR ANDERS. Haar uitvoering eindigt op
 * `error` zodra één dienst onbereikbaar is. Voor de gewone taakbewaking telt
 * `error` als "niet geslaagd": de klok van de laatste geslaagde uitvoering blijft
 * dan staan. Bij een storing die langer dan een dag duurt, zou de meting daardoor
 * "achterstallig" heten terwijl ze elke dag draait, en zou het signaal over de
 * onbereikbare dienst verdwijnen op het moment dat het het meest zegt.
 *
 * Daarom twee vragen, los van elkaar:
 *  - leverde de laatste uitvoering een meetuitkomst? (`heeftMeetuitkomst`)
 *  - is die uitvoering recent genoeg? (`metingVers`, zelfde venster als de taak)
 *
 * Puur: geen IO.
 */

export const PROBE_TAAK = 'integraties-health'

interface ProbeSummary {
  probed?: unknown
  ok?: unknown
  failed?: unknown
  rateLimited?: unknown
  failures?: unknown
}

function leesSummary(summary: unknown): { probed: number; ok: number; rest: ProbeSummary } | null {
  if (!summary || typeof summary !== 'object') return null
  const s = summary as ProbeSummary
  if (typeof s.probed !== 'number' || typeof s.ok !== 'number') return null
  return { probed: s.probed, ok: s.ok, rest: s }
}

/** Droeg de laatste uitvoering een uitkomst in de vorm van `summarizeProbes`? */
export function heeftMeetuitkomst(stand: JobStand | undefined): boolean {
  return leesSummary(stand?.last?.summary) !== null
}

/**
 * Is de laatste uitvoering recent genoeg om iets over nu te zeggen? Telt de
 * laatste uitvoering, ongeacht haar status, tegen het venster van de taak plus
 * de marge van `/beheer/jobs` (`pageStaleAfterHours`).
 */
export function metingVers(stand: JobStand | undefined, nu: Date): boolean {
  if (!stand?.last || stand.health === 'unknown') return false
  if (stand.job.maxAgeHours == null) return true
  const ms = Date.parse(stand.last.created_at)
  if (Number.isNaN(ms)) return false
  return nu.getTime() - ms <= pageStaleAfterHours(stand.job.maxAgeHours) * 3_600_000
}

/**
 * De uitkomst van de bereikbaarheidsmeting, uit de summary van haar laatste run
 * (`summarizeProbes`, lib/integrations/health-probe.ts).
 *
 * `probed` in die summary telt ALLE integraties, ook die zonder publiek
 * meetpunt. "6 van 14 bereikbaar" zou dan als uitval lezen terwijl er 8 niet te
 * meten zijn. Gemeten is daarom bereikbaar plus onbereikbaar; de rest is niet
 * meetbaar en staat er apart bij.
 */
export function probeUit(standen: readonly JobStand[]): ProbeFeit | null {
  const last = standen.find((s) => s.job.key === PROBE_TAAK)?.last
  const gelezen = leesSummary(last?.summary)
  if (!last || !gelezen) return null
  const { probed, ok, rest } = gelezen
  const failures = rest.failures && typeof rest.failures === 'object' ? Object.keys(rest.failures as object) : []
  const onbereikbaar = typeof rest.failed === 'number' ? rest.failed : failures.length
  return {
    gemetenOp: last.created_at,
    gemeten: ok + onbereikbaar,
    bereikbaar: ok,
    onbereikbaar: failures.sort(),
    begrensd: typeof rest.rateLimited === 'number' ? rest.rateLimited : 0,
    nietMeetbaar: Math.max(0, probed - ok - onbereikbaar),
  }
}
