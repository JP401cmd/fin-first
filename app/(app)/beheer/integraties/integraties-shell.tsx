'use client'

// View-shell voor /beheer/integraties — drie tabs (?view=):
//   inventaris  — alle integraties met merged scan-feiten + DB-telemetrie
//   liveness    — on-demand probe + laatste cron-resultaat
//   contracten  — versieregister, formaat-contracten en drift-events
//
// Beheerpagina: neutrale ink/border/subtle-tokens, géén module-accentkleuren,
// géén vrijheidstijd-framing. Spiegelt jobs-page, architectuur-shell en de
// horizon-strategie-runner.

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  List,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  IntegrationsModel,
  IntegrationWithFacts,
  IntegrationKind,
} from '@/lib/architecture/integrations-model'
import { INTEGRATIONS } from '@/lib/architecture/integrations-model'
import { INTEGRATION_VERSIONS } from '@/lib/integrations/version-registry'
import { FORMAT_CONTRACTS } from '@/lib/parsers/format-contracts'

type View = 'inventaris' | 'liveness' | 'contracten'

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

interface ProbeResult {
  success: boolean
  results: Array<{
    id: string
    ok: boolean | null
    latencyMs: number | null
    status: number | null
    error?: string
    code?: string
  }>
  summary: { total: number; reachable: number; unreachable: number; notProbeable: number }
}

interface DriftEvent {
  id: string
  kind: string
  surface: string
  severity: 'warn' | 'error'
  fingerprint: string
  diff: unknown
  occurrences: number
  first_seen_at: string
  last_seen_at: string
}

interface Props {
  model: IntegrationsModel
  tableCounts: Record<string, { total: number; withError: number } | null>
  lastHealthRun: JobRun | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
const dateFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return `${ms} ms`
}

/** Naam van een integratie op id (versieregister heeft zelf geen naam). */
function integrationName(id: string): string {
  return INTEGRATIONS.find((e) => e.id === id)?.name ?? id
}

const VIEWS: Array<{ id: View; label: string; icon: typeof List }> = [
  { id: 'inventaris', label: 'Inventaris', icon: List },
  { id: 'liveness', label: 'Liveness', icon: Activity },
  { id: 'contracten', label: 'Contracten', icon: FileCheck },
]

function isView(v: string | null): v is View {
  return v === 'inventaris' || v === 'liveness' || v === 'contracten'
}

function StatusBadge({ status }: { status: 'success' | 'error' }) {
  const isOk = status === 'success'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
        isOk ? 'bg-[var(--subtle)] text-positive' : 'bg-[var(--subtle)] text-negative'
      }`}
    >
      {isOk ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {isOk ? 'OK' : 'Fout'}
    </span>
  )
}

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-3">
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────

export function IntegratiesShell({ model, tableCounts, lastHealthRun }: Props) {
  const [view, setView] = useState<View>('inventaris')

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (isView(v)) setView(v)
  }, [])

  const switchView = useCallback((next: View) => {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'inventaris') url.searchParams.delete('view')
    else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url.toString())
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Integraties-weergave">
        {VIEWS.map((v) => {
          const Icon = v.icon
          const active = view === v.id
          return (
            <button
              key={v.id}
              id={`tab-${v.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${v.id}`}
              onClick={() => switchView(v.id)}
              className={`inline-flex items-center gap-2 border px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {v.label}
            </button>
          )
        })}
      </div>

      {view === 'inventaris' && (
        <div id="panel-inventaris" role="tabpanel" aria-labelledby="tab-inventaris">
          <InventarisTab model={model} tableCounts={tableCounts} />
        </div>
      )}
      {view === 'liveness' && (
        <div id="panel-liveness" role="tabpanel" aria-labelledby="tab-liveness">
          <LivenessTab model={model} lastHealthRun={lastHealthRun} />
        </div>
      )}
      {view === 'contracten' && (
        <div id="panel-contracten" role="tabpanel" aria-labelledby="tab-contracten">
          <ContractenTab />
        </div>
      )}
    </div>
  )
}

// ── Tab: Inventaris ───────────────────────────────────────────────────────────

const API_KINDS: IntegrationKind[] = ['api', 'oauth']
const FILE_KINDS: IntegrationKind[] = ['csv', 'mt940', 'ofx', 'json']

function InventarisTab({
  model,
  tableCounts,
}: {
  model: IntegrationsModel
  tableCounts: Props['tableCounts']
}) {
  const apiEntries = model.entries.filter((e) => API_KINDS.includes(e.kind))
  const fileEntries = model.entries.filter((e) => FILE_KINDS.includes(e.kind))

  return (
    <div className="space-y-8">
      <InventarisGroup title="API-koppelingen" entries={apiEntries} tableCounts={tableCounts} />
      <InventarisGroup title="Bestandsimport" entries={fileEntries} tableCounts={tableCounts} />
    </div>
  )
}

function InventarisGroup({
  title,
  entries,
  tableCounts,
}: {
  title: string
  entries: IntegrationWithFacts[]
  tableCounts: Props['tableCounts']
}) {
  return (
    <section>
      <SectionLine>{title}</SectionLine>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
              <th className="px-3 py-2 font-medium">Naam</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Auth</th>
              <th className="px-3 py-2 font-medium">Versie</th>
              <th className="px-3 py-2 font-medium">Base-URL</th>
              <th className="px-3 py-2 font-medium">Bron</th>
              <th className="px-3 py-2 font-medium">Docs</th>
              <th className="px-3 py-2 font-medium">DB-tabel</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]"
              >
                <td className="px-3 py-2 font-medium text-[var(--ink)]">{entry.name}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--ink-3)]">
                    {entry.kind}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-[var(--ink-2)]">
                  {entry.authMethod}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                  {entry.apiVersionPinned ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {entry.baseUrl == null ? (
                    <span className="italic text-[var(--ink-4)]">dynamisch</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-[11px] text-[var(--ink-2)]">
                        {entry.baseUrl}
                      </code>
                      {entry.baseUrlDrift && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-500"
                          aria-label={`Drift: gescand ${entry.scannedBaseUrl ?? 'onbekend'}`}
                        />
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {entry.sourceFiles.length === 0 ? (
                    <span className="text-[var(--ink-4)]">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {entry.sourceFiles.map((sf, i) => (
                        <code
                          key={sf}
                          className={`font-mono text-[10px] ${
                            entry.sourceFilesExist[i] ? 'text-[var(--ink-3)]' : 'text-red-600'
                          }`}
                          title={
                            entry.sourceFilesExist[i] ? sf : `${sf} — niet op schijf gevonden`
                          }
                        >
                          {sf}
                        </code>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {entry.docsUrl ? (
                    <a
                      href={entry.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                    >
                      docs
                    </a>
                  ) : (
                    <span className="text-[var(--ink-4)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <DbTableCell dbTable={entry.dbTable} tableCounts={tableCounts} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DbTableCell({
  dbTable,
  tableCounts,
}: {
  dbTable: string | null
  tableCounts: Props['tableCounts']
}) {
  if (dbTable == null) {
    return <span className="text-[var(--ink-4)]">—</span>
  }
  const counts = tableCounts[dbTable]
  return (
    <div className="flex flex-col gap-0.5">
      <code className="font-mono text-[11px] text-[var(--ink-2)]">{dbTable}</code>
      {counts === null ? (
        <span className="text-xs text-[var(--ink-4)]">n.v.t.</span>
      ) : (
        <span
          className={`font-mono text-[10px] tabular-nums ${
            counts.withError > 0
              ? 'text-red-600'
              : counts.total === 0
                ? 'text-[var(--ink-4)]'
                : 'text-[var(--ink-3)]'
          }`}
        >
          {counts.total} totaal · {counts.withError} met fout
        </span>
      )}
    </div>
  )
}

// ── Tab: Liveness ─────────────────────────────────────────────────────────────

function LivenessTab({
  model,
  lastHealthRun,
}: {
  model: IntegrationsModel
  lastHealthRun: JobRun | null
}) {
  const [running, setRunning] = useState(false)
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)

  const runProbe = useCallback(async () => {
    setRunning(true)
    setProbeError(null)
    try {
      const res = await fetch('/api/admin/integraties/health', { method: 'POST' })
      const json = (await res.json()) as ProbeResult & { message?: string }
      if (!res.ok || !json.success) {
        setProbeError(json.message ?? 'Health-probe mislukt')
        setProbeResult(null)
      } else {
        setProbeResult(json)
      }
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'Verbinding mislukt')
      setProbeResult(null)
    } finally {
      setRunning(false)
    }
  }, [])

  const resultById = new Map(probeResult?.results.map((r) => [r.id, r]) ?? [])
  const allGreen = probeResult ? probeResult.summary.unreachable === 0 : false
  const probeableTotal = probeResult
    ? probeResult.summary.total - probeResult.summary.notProbeable
    : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-3)]">
          Test de publieke endpoints van de koppelingen. Integraties die credentials vereisen,
          worden niet automatisch geprobed.
        </p>
        <button
          type="button"
          onClick={runProbe}
          disabled={running}
          className="inline-flex items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? 'Bezig…' : 'Test alle verbindingen'}
        </button>
      </div>

      {probeError && (
        <p className="border-l-2 border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {probeError}
        </p>
      )}

      {probeResult && (
        <div
          className={`flex flex-wrap items-center gap-4 border px-4 py-3 text-sm font-semibold ${
            allGreen
              ? 'border-[var(--border-ed)] bg-[var(--subtle)] text-positive'
              : 'border-[var(--border-ed)] bg-[var(--subtle)] text-negative'
          }`}
        >
          <span>
            {probeResult.summary.reachable}/{probeableTotal} bereikbaar ·{' '}
            {probeResult.summary.notProbeable} niet probeerbaar
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
              <th className="px-3 py-2 font-medium">Naam</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Latency</th>
              <th className="px-3 py-2 font-medium">HTTP-code / opmerking</th>
            </tr>
          </thead>
          <tbody>
            {model.entries.map((entry) => {
              const r = resultById.get(entry.id)
              return (
                <tr
                  key={entry.id}
                  className="border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]"
                >
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{entry.name}</td>
                  <td className="px-3 py-2">
                    {!r ? (
                      <span className="text-[var(--ink-4)]">—</span>
                    ) : r.ok === true ? (
                      <CheckCircle2 className="h-4 w-4 text-positive" aria-label="Bereikbaar" />
                    ) : r.ok === false ? (
                      <XCircle className="h-4 w-4 text-negative" aria-label="Onbereikbaar" />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
                          creds vereist
                        </span>
                        <a
                          href="/mijn/koppelingen"
                          className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                        >
                          koppelen
                        </a>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {r && r.ok !== null ? fmtMs(r.latencyMs) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {!r ? (
                      <span className="text-[var(--ink-4)]">—</span>
                    ) : r.ok === false ? (
                      <span className="text-red-600">{r.error ?? `HTTP ${r.status ?? '?'}`}</span>
                    ) : r.ok === true ? (
                      <span className="font-mono tabular-nums text-[var(--ink-3)]">
                        {r.status ?? 'OK'}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-4)]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--ink-3)]" />
          <span className="text-sm font-medium text-[var(--ink)]">Laatste automatische check</span>
          {lastHealthRun ? <StatusBadge status={lastHealthRun.status} /> : null}
        </div>
        {lastHealthRun === null ? (
          <p className="mt-2 text-sm italic text-[var(--ink-4)]">
            Nog niet automatisch uitgevoerd.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--ink-3)]">
              <span>
                Datum:{' '}
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {fmtDateTime(lastHealthRun.created_at)}
                </span>
              </span>
              <span>
                Duur:{' '}
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {fmtMs(lastHealthRun.duration_ms)}
                </span>
              </span>
            </div>
            {lastHealthRun.error && (
              <p className="border-l-2 border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {lastHealthRun.error}
              </p>
            )}
            {Boolean(lastHealthRun.summary) && (
              <details>
                <summary className="cursor-pointer text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
                  Volledige samenvatting
                </summary>
                <pre className="mt-2 overflow-x-auto bg-[var(--subtle)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                  {JSON.stringify(lastHealthRun.summary, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Tab: Contracten ───────────────────────────────────────────────────────────

function ContractenTab() {
  const [driftEvents, setDriftEvents] = useState<DriftEvent[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    sb.from('contract_events')
      .select(
        'id, kind, surface, severity, fingerprint, diff, occurrences, first_seen_at, last_seen_at',
      )
      .in('severity', ['warn', 'error'])
      .is('resolved_at', null)
      .order('last_seen_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // tabel bestaat mogelijk nog niet → stille lege staat
          setDriftEvents([])
        } else {
          setDriftEvents((data ?? []) as DriftEvent[])
        }
      })
    return () => { cancelled = true }
  }, [])

  const versionEntries = Object.values(INTEGRATION_VERSIONS)
  const formatEntries = Object.entries(FORMAT_CONTRACTS)

  return (
    <div className="space-y-8">
      {/* A. Versieregister */}
      <section>
        <SectionLine>Versieregister</SectionLine>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th className="px-3 py-2 font-medium">Integratie</th>
                <th className="px-3 py-2 font-medium">Versie</th>
                <th className="px-3 py-2 font-medium">Base-URL</th>
                <th className="px-3 py-2 font-medium">Docs</th>
                <th className="px-3 py-2 font-medium">Changelog</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Laatste check</th>
              </tr>
            </thead>
            <tbody>
              {versionEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]"
                >
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">
                    {integrationName(entry.id)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                    {entry.pinnedApiVersion ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <code className="font-mono text-[11px] text-[var(--ink-2)]">
                      {entry.baseUrl}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    {entry.docsUrl ? (
                      <a
                        href={entry.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                      >
                        docs
                      </a>
                    ) : (
                      <span className="text-[var(--ink-4)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {entry.changelogUrl ? (
                      <a
                        href={entry.changelogUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                      >
                        changelog
                      </a>
                    ) : (
                      <span className="text-[var(--ink-4)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {entry.statusPageUrl ? (
                      <a
                        href={entry.statusPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                      >
                        status
                      </a>
                    ) : (
                      <span className="text-[var(--ink-4)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                    {fmtDate(entry.lastCheckedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* B. Formaat-contracten */}
      <section>
        <SectionLine>Formaat-contracten</SectionLine>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {formatEntries.map(([id, contract]) => (
            <div key={id} className="border border-[var(--border-ed)] bg-[var(--paper)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--ink)]">{contract.label}</span>
                <code className="font-mono text-[10px] text-[var(--ink-4)]">{id}</code>
              </div>
              {contract.delimiter && (
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  Delimiter:{' '}
                  <code className="font-mono">
                    {contract.delimiter === '\t' ? '\\t' : contract.delimiter}
                  </code>
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                {contract.requiredHeaders.length} verplichte kolommen
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
                  Kolomnamen tonen
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {contract.requiredHeaders.map((h) => (
                    <code
                      key={h}
                      className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]"
                    >
                      {h}
                    </code>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      {/* C. Drift-events */}
      <section>
        <SectionLine>Drift-events</SectionLine>
        {driftEvents === null ? (
          <p className="text-sm text-[var(--ink-4)]">Laden…</p>
        ) : driftEvents.length === 0 ? (
          <p className="text-sm italic text-[var(--ink-4)]">Nog geen drift-events.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {driftEvents.map((event) => (
              <div
                key={event.id}
                className="border border-[var(--border-ed)] bg-[var(--paper)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        event.severity === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {event.severity}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-[var(--ink-2)]">
                      {event.surface}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                    {event.occurrences}×
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                  kind: {event.kind} · laatste: {fmtDateTime(event.last_seen_at)}
                </p>
                {event.diff != null && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
                      Diff tonen
                    </summary>
                    <pre className="mt-2 overflow-x-auto bg-[var(--subtle)] p-2 font-mono text-[10px] leading-relaxed text-[var(--ink-2)]">
                      {JSON.stringify(event.diff, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
