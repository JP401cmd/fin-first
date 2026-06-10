import { Activity, Check, AlertCircle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

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

const JOB_CATALOG = [
  {
    key: 'holdings-prices',
    label: 'Prijsverversing',
    schedule: 'Dagelijks 18:00',
    path: '/api/holdings/refresh-prices/cron',
    description: 'Beurskoersen + crypto-prijzen bijwerken, inclusief exchange- en wallet-sync.',
  },
  {
    key: 'snapshots',
    label: 'Maandsnapshots',
    schedule: '1e van de maand, 02:00',
    path: '/api/snapshots/cron',
    description: 'Maandelijkse netto-vermogen-snapshot per gebruiker.',
  },
  {
    key: 'news-ingest',
    label: 'Nieuws-ingest',
    schedule: 'Dagelijks 05:00',
    path: '/api/news-ingest/cron',
    description: 'RSS- en webbronnen ophalen, AI-categoriseren en opslaan.',
  },
] as const

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

/** Top-level primitieve velden uit een summary, voor de compacte KPI-grid. */
function primitiveEntries(summary: unknown): [string, string | number][] {
  if (!summary || typeof summary !== 'object') return []
  return Object.entries(summary as Record<string, unknown>).filter(
    (e): e is [string, string | number] =>
      typeof e[1] === 'string' || typeof e[1] === 'number',
  )
}

function StatusBadge({ status }: { status: 'success' | 'error' }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-800">
        <Check className="h-3 w-3" />
        OK
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-800">
      <AlertCircle className="h-3 w-3" />
      Fout
    </span>
  )
}

export default async function BeheerJobsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('job_runs')
    .select('id, job, status, started_at, finished_at, duration_ms, summary, error, created_at')
    .order('created_at', { ascending: false })
    .limit(60)

  const runs = (data ?? []) as JobRun[]
  const lastByJob = new Map<string, JobRun>()
  for (const run of runs) {
    if (!lastByJob.has(run.job)) lastByJob.set(run.job, run)
  }
  const recent = runs.slice(0, 15)

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Achtergrondtaken</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Laatste uitvoering, status en duur van de geplande crons.
        </p>
      </div>

      {runs.length === 0 && (
        <div className="mb-8 border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen uitvoeringen geregistreerd.</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Elke cron logt vanaf de volgende run automatisch zijn resultaat hier.
          </p>
        </div>
      )}

      {/* Per-job kaarten */}
      <div className="space-y-3">
        {JOB_CATALOG.map((job) => {
          const last = lastByJob.get(job.key)
          const entries = last ? primitiveEntries(last.summary) : []
          return (
            <section key={job.key} className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[var(--ink)]">{job.label}</h3>
                    {last && <StatusBadge status={last.status} />}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{job.description}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    {job.schedule} · {job.path}
                  </p>
                </div>
                <div className="text-right">
                  {last ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
                        <Clock className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                        {fmtDateTime(last.created_at)}
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
                <p className="mt-3 border-l-2 border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
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
                const meta = JOB_CATALOG.find((j) => j.key === run.job)
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
