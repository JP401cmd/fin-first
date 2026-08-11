import { Activity, Check, AlertCircle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { isPushConfigured } from '@/lib/alerts/push'
import { JOB_CATALOG, JOB_LIST } from '@/lib/job-catalog'
import {
  JOB_HEALTH_META,
  JOB_HEALTH_ORDER,
  cronScheduleFor,
  deriveJobHealth,
  detectScheduleDrift,
  pageStaleAfterHours,
  summarizeJobHealth,
  type JobHealth,
} from '@/lib/job-health'

export const dynamic = 'force-dynamic'

interface JobRun {
  id: string
  job: string
  status: 'success' | 'error'
  started_at: string
  finished_at: string
  duration_ms: number | null
  summary: unknown
  error: string | null
  created_at: string
}

// Catalogus = single source in lib/job-catalog.ts (gedeeld met de cron-melding
// en de stilte-drempel van de meldingen-sweep); het échte schema komt uit
// vercel.json via lib/job-health.ts. Hier alleen de weergave.

type Db = Awaited<ReturnType<typeof createClient>>

const RUN_COLUMNS =
  'id, job, status, started_at, finished_at, duration_ms, summary, error, created_at'

/**
 * "Geen rij" en "kon niet lezen" zijn twee verschillende uitkomsten. Wie de
 * `error` van een query weggooit, laat een leesfout renderen als "nog niet
 * uitgevoerd" — precies de valse geruststelling die deze pagina moet wegnemen.
 */
type ReadResult<T> = { ok: true; value: T } | { ok: false }

/**
 * Laatste run van één taak.
 *
 * Bewust een gerichte query per taak i.p.v. één venster van N recente rijen:
 * met negen taken en veel historie viel de laatste run van een zeldzame taak
 * (maandsnapshots, 1×/maand) buiten dat venster, waarna de pagina ten onrechte
 * "Nog niet uitgevoerd" toonde. Spiegelt `loadLastSuccessByJob` in
 * lib/alerts/store.ts, dat om dezelfde reden zo werkt.
 */
async function lastRunFor(supabase: Db, job: string): Promise<ReadResult<JobRun | null>> {
  const { data, error } = await supabase
    .from('job_runs')
    .select(RUN_COLUMNS)
    .eq('job', job)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, value: (data as JobRun | null) ?? null }
}

/** Alleen het tijdstip van de laatste GESLAAGDE run — meer heeft het oordeel niet nodig. */
async function lastSuccessAtFor(supabase: Db, job: string): Promise<ReadResult<string | null>> {
  const { data, error } = await supabase
    .from('job_runs')
    .select('created_at')
    .eq('job', job)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, value: (data as { created_at: string } | null)?.created_at ?? null }
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

/** Bewakingsvenster leesbaar: 24 uur blijft uren, 768 uur wordt dagen. */
function fmtWindow(hours: number): string {
  return hours < 48 ? `${hours} uur` : `${Math.round(hours / 24)} dagen`
}

/**
 * Top-level primitieve velden uit een summary, voor de compacte KPI-grid.
 * BOOLEANS HOREN ERBIJ: de sweep meldt `backlog`, `persisted` en `bootstrapped`
 * als boolean, en die vielen stilzwijgend weg terwijl de route belooft ze hier
 * zichtbaar te maken (ADR 0102 — "niet stil laten").
 */
function primitiveEntries(summary: unknown): [string, string][] {
  if (!summary || typeof summary !== 'object') return []
  const out: [string, string][] = []
  for (const [key, value] of Object.entries(summary as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number') out.push([key, String(value)])
    else if (typeof value === 'boolean') out.push([key, value ? 'ja' : 'nee'])
  }
  return out
}

// Stoplichtsemantiek — bewust géén module-accenten: dit is status, geen identiteit.
const TONE_CLASSES: Record<
  (typeof JOB_HEALTH_META)[JobHealth]['tone'],
  { chip: string; dot: string; text: string }
> = {
  positive: { chip: 'bg-positive-bg text-positive', dot: 'bg-positive', text: 'text-positive' },
  negative: { chip: 'bg-negative-bg text-negative', dot: 'bg-negative', text: 'text-negative' },
  warning: { chip: 'bg-warning-bg text-warning', dot: 'bg-warning', text: 'text-warning' },
  neutral: {
    chip: 'bg-[var(--subtle)] text-[var(--ink-4)]',
    dot: 'bg-[var(--ink-4)]',
    text: 'text-[var(--ink-4)]',
  },
}

function StatusBadge({ status }: { status: 'success' | 'error' }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 bg-positive-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-positive">
        <Check className="h-3 w-3" />
        OK
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-negative-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-negative">
      <AlertCircle className="h-3 w-3" />
      Fout
    </span>
  )
}

function HealthChip({ health }: { health: JobHealth }) {
  const meta = JOB_HEALTH_META[health]
  const tone = TONE_CLASSES[meta.tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone.chip}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {meta.label}
    </span>
  )
}

function EnvChip({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const tone = ok ? TONE_CLASSES.positive : TONE_CLASSES.warning
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      <span className="font-mono text-[11px] text-[var(--ink-3)]">{label}</span>
      <span className={`text-[11px] ${tone.text}`}>{detail}</span>
    </span>
  )
}

export default async function BeheerJobsPage() {
  const supabase = await createClient()
  const now = new Date()

  const [recentRes, jobRows] = await Promise.all([
    supabase.from('job_runs').select(RUN_COLUMNS).order('created_at', { ascending: false }).limit(15),
    Promise.all(
      JOB_LIST.map(async (job) => {
        const lastRes = await lastRunFor(supabase, job.key)
        const last = lastRes.ok ? lastRes.value : null

        // Laatste run én laatste GESLAAGDE run zijn twee dingen: het
        // achterstallig-signaal hangt op de tweede. De tweede query vuurt alleen
        // als hij iets kan toevoegen — niet bij een geslaagde laatste run (zelfde
        // rij), niet zonder runs (gegarandeerd leeg) en niet bij een taak die we
        // toch niet bewaken (uitkomst wordt genegeerd).
        let lastSuccessAt = last?.status === 'success' ? last.created_at : null
        let readFailed = !lastRes.ok
        if (last && last.status !== 'success' && job.maxAgeHours != null) {
          const successRes = await lastSuccessAtFor(supabase, job.key)
          if (successRes.ok) lastSuccessAt = successRes.value
          else readFailed = true
        }

        const health: JobHealth = readFailed
          ? 'unknown'
          : deriveJobHealth({
              maxAgeHours: job.maxAgeHours,
              lastRunAt: last?.created_at ?? null,
              lastSuccessAt,
              now,
            })
        return { job, last, lastSuccessAt, health }
      }),
    ),
  ])

  const recentFailed = Boolean(recentRes.error)
  const recent = (recentRes.data ?? []) as JobRun[]
  const counts = summarizeJobHealth(jobRows.map((r) => r.health))
  const drift = detectScheduleDrift()
  const hasDrift = drift.unknownCrons.length > 0 || drift.unscheduledJobs.length > 0
  const cronSecretSet = Boolean(process.env.CRON_SECRET)
  const ntfyTopicSet = Boolean(process.env.NTFY_TOPIC?.trim())
  const pushConfigured = isPushConfigured()
  // Geen runs én geen leesfout: dan is de tabel écht leeg.
  const noRuns = jobRows.every((r) => !r.last && r.health !== 'unknown') && !recentFailed

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Achtergrondtaken</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Loopt alles nog? Per taak het ingeplande schema, de laatste uitvoering en of hij
          binnen zijn verwachte venster geslaagd is.
        </p>
      </div>

      {/* Actualiteit in één oogopslag */}
      <section className="mb-4 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          {JOB_HEALTH_ORDER.map((health) => {
            const meta = JOB_HEALTH_META[health]
            const tone = TONE_CLASSES[meta.tone]
            const value = counts[health]
            return (
              <div key={health} className="flex items-baseline gap-2">
                <span
                  className={`inline-block h-2 w-2 translate-y-[-1px] rounded-full ${value > 0 ? tone.dot : 'bg-[var(--border-ed)]'}`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-lg tabular-nums ${value > 0 ? tone.text : 'text-[var(--ink-4)]'}`}
                >
                  {value}
                </span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  {meta.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Inrichting — waarom een taak stil kan zijn zonder dat er iets kapot is */}
      <section className="mb-6 border-l-2 border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <EnvChip
            ok={cronSecretSet}
            label="CRON_SECRET"
            detail={cronSecretSet ? 'ingesteld' : 'ontbreekt'}
          />
          {/* Bewust op het KANAAL gelabeld en niet op één env-var: `isPushConfigured()`
              geeft ook null wanneer NTFY_SERVER geen https is. Een chip die dan
              "NTFY_TOPIC ontbreekt" zegt, stuurt de beheerder de verkeerde kant op. */}
          <EnvChip
            ok={pushConfigured}
            label="Duw-kanaal (ntfy)"
            detail={
              pushConfigured
                ? 'ingericht'
                : ntfyTopicSet
                  ? 'NTFY_TOPIC staat, kanaal geweigerd — controleer NTFY_SERVER (https vereist)'
                  : 'NTFY_TOPIC ontbreekt'
            }
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
          Zonder <span className="font-mono">CRON_SECRET</span> weigeren de meeste cron-routes
          zichzelf met een 500 <em>vóórdat</em> ze een regel in <span className="font-mono">job_runs</span>{' '}
          schrijven: &laquo;nog niet uitgevoerd&raquo; kan dus ook betekenen dat de taak nooit aan
          bod kwam. Zonder duw-kanaal is de meldingen-sweep een stille no-op — hij logt zijn run,
          maar stuurt niets.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-4)]">
          Cron-expressies worden door Vercel in <strong>UTC</strong> uitgevoerd; de tijdstempels
          hieronder staan in Amsterdamse tijd. Een taak van 05:00 UTC hoort in de zomer dus een
          laatste run rond 07:00 te tonen — dat is geen drift. Vercel start een cron bovendien tot
          ongeveer een uur ná het hele uur; het actualiteitsoordeel rekent daarmee.
        </p>
      </section>

      {hasDrift && (
        <section className="mb-6 border-l-2 border-warning bg-warning-bg px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-warning">
            Schema-drift tussen vercel.json en de taakcatalogus
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-[var(--ink-2)]">
            {drift.unscheduledJobs.map((job) => (
              <li key={job.key}>
                <span className="font-medium">{job.label}</span> staat in de catalogus, maar{' '}
                <span className="font-mono">{job.path}</span> is niet ingepland in{' '}
                <span className="font-mono">vercel.json</span> — deze taak draait niet vanzelf.
              </li>
            ))}
            {drift.unknownCrons.map((cron) => (
              <li key={cron.path}>
                <span className="font-mono">{cron.path}</span> ({cron.schedule}) is wél ingepland,
                maar geen enkele catalogus-entry wijst ernaar — deze cron wordt hier niet bewaakt.
              </li>
            ))}
          </ul>
        </section>
      )}

      {noRuns && (
        <div className="mb-8 border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen uitvoeringen geregistreerd.</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Elke cron logt vanaf de volgende run automatisch zijn resultaat hier.
          </p>
        </div>
      )}

      {/* Per-job kaarten */}
      <div className="space-y-3">
        {jobRows.map(({ job, last, lastSuccessAt, health }) => {
          const entries = last ? primitiveEntries(last.summary) : []
          const cron = cronScheduleFor(job.path)
          return (
            <section key={job.key} className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-[var(--ink)]">{job.label}</h3>
                    <HealthChip health={health} />
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{job.description}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    {job.schedule} ·{' '}
                    {cron ? (
                      <span className="normal-case tracking-normal">{cron} (UTC)</span>
                    ) : (
                      <span className="normal-case tracking-normal text-negative">niet ingepland</span>
                    )}{' '}
                    · {job.path}
                  </p>
                  {health === 'overdue' && job.maxAgeHours != null && (
                    <p className="mt-1.5 text-xs text-negative">
                      {lastSuccessAt
                        ? `Laatste geslaagde uitvoering ${fmtDateTime(lastSuccessAt)} — dat is langer dan ${fmtWindow(pageStaleAfterHours(job.maxAgeHours))} geleden.`
                        : `Nog nooit geslaagd geëindigd — verwacht binnen ${fmtWindow(pageStaleAfterHours(job.maxAgeHours))}.`}
                    </p>
                  )}
                  {health === 'unknown' && (
                    <p className="mt-1.5 text-xs text-warning">
                      De uitvoeringen van deze taak konden niet worden gelezen — deze kaart zegt
                      dus niets over de toestand van de taak zelf.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {last ? (
                    <>
                      <div className="flex items-center justify-end gap-2">
                        <StatusBadge status={last.status} />
                        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
                          <Clock className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                          {fmtDateTime(last.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--ink-4)]">
                        {fmtDuration(last.duration_ms)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs italic text-[var(--ink-4)]">Nog niet uitgevoerd</span>
                  )}
                </div>
              </div>

              {last && entries.length > 0 && (
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-dotted border-[var(--border-ed)] pt-3">
                  {entries.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-1.5">
                      <dt className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">{k}</dt>
                      <dd className="font-mono text-sm tabular-nums text-[var(--ink)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {last?.error && (
                <p className="mt-3 border-l-2 border-negative bg-negative-bg px-3 py-2 text-xs text-negative">
                  {last.error}
                </p>
              )}

              {last && Boolean(last.summary) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
                    Volledige samenvatting
                  </summary>
                  <pre className="mt-2 overflow-x-auto bg-[var(--subtle)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                    {JSON.stringify(last.summary, null, 2)}
                  </pre>
                </details>
              )}
            </section>
          )
        })}
      </div>

      {recentFailed && (
        <p className="mt-8 border-l-2 border-warning bg-warning-bg px-4 py-3 text-xs text-[var(--ink-2)]">
          De recente uitvoeringen konden niet worden gelezen. Dat zegt niets over de taken zelf —
          alleen dat deze pagina er nu geen zicht op heeft.
        </p>
      )}

      {/* Recente uitvoeringen */}
      {recent.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-4 pb-3">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Recente uitvoeringen
            </span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left">
                <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Datum</th>
                <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Taak</th>
                <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Status</th>
                <th className="py-2 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Duur</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((run) => {
                const meta = JOB_CATALOG[run.job as keyof typeof JOB_CATALOG]
                return (
                  <tr key={run.id} className="border-b border-dotted border-[var(--border-ed)] hover:bg-[var(--subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                      {fmtDateTime(run.created_at)}
                    </td>
                    <td className="py-2 pr-4 text-[var(--ink-2)]">{meta?.label ?? run.job}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--ink-3)]">
                      {fmtDuration(run.duration_ms)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
