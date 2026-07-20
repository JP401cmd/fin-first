'use client'

// Client-shell voor /beheer/versie — haalt de git/versie/migratie-staat op bij
// /api/admin/version-status en de prod-build-SHA bij PROD/api/version, en toont
// alles alleen-lezen. Geen mutaties, geen destructieve git-acties.
//
// Beheerpagina-conventie (zie jobs/integraties): neutrale ink/border/subtle-
// tokens, GEEN module-accentkleuren en GEEN vrijheidstijd-framing. Status-
// semantiek gaat via stoplicht (groen/amber/rood), niet via accenten.

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  FolderGit2,
  RefreshCw,
  CircleAlert,
  CloudOff,
  Database,
  Loader2,
} from 'lucide-react'
import type {
  VersionStatusResponse,
  GitStateAvailable,
} from '@/lib/version-status/types'

/** Productie-URL — het dashboard vergelijkt lokaal met wat hier live draait. */
const PROD_URL = 'https://fin-first.vercel.app'

type Tone = 'ok' | 'warn' | 'alert' | 'muted'

const TONE: Record<Tone, { badge: string; dot: string; banner: string; text: string }> = {
  ok: {
    badge: 'bg-green-100 text-green-800',
    dot: 'bg-green-500',
    banner: 'border-green-300 bg-green-50',
    text: 'text-green-800',
  },
  warn: {
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
    banner: 'border-amber-300 bg-amber-50',
    text: 'text-amber-800',
  },
  alert: {
    badge: 'bg-red-100 text-red-800',
    dot: 'bg-red-500',
    banner: 'border-red-300 bg-red-50',
    text: 'text-red-800',
  },
  muted: {
    badge: 'bg-[var(--subtle)] text-[var(--ink-3)]',
    dot: 'bg-[var(--ink-4)]',
    banner: 'border-[var(--border-ed)] bg-[var(--subtle)]',
    text: 'text-[var(--ink-3)]',
  },
}

type ProdInfo =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ok'; sha: string; env: string }

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min geleden`
  const uur = Math.round(min / 60)
  if (uur < 24) return `${uur} uur geleden`
  const dag = Math.round(uur / 24)
  if (dag < 30) return `${dag} ${dag === 1 ? 'dag' : 'dagen'} geleden`
  const mnd = Math.round(dag / 30)
  return `${mnd} ${mnd === 1 ? 'maand' : 'maanden'} geleden`
}

// ── Kleine presentatie-primitieven ───────────────────────────────────────────

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-3">
      <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        <Icon className="h-3.5 w-3.5" />
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${TONE[tone].badge}`}
    >
      {children}
    </span>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">{children}</section>
}

// ── Verdict-logica voor de kop-banner ────────────────────────────────────────

function computeGitVerdict(git: GitStateAvailable): { tone: Tone; line: string } {
  const aheadMaster = git.vsMaster?.ahead ?? 0
  const aheadOrigin = git.vsOriginMaster?.ahead ?? 0
  const uncommitted = git.uncommitted.count
  const unpushed = git.unpushed ?? 0

  const parts: string[] = []
  if (git.vsMaster) parts.push(`${aheadMaster} ${aheadMaster === 1 ? 'commit' : 'commits'} vóór master`)
  if (git.vsOriginMaster) parts.push(`${aheadOrigin} vóór origin/master`)
  parts.push(`${uncommitted} ongecommitte ${uncommitted === 1 ? 'bestand' : 'bestanden'}`)
  if (unpushed > 0) parts.push(`${unpushed} ongepusht`)

  const clean = uncommitted === 0 && unpushed === 0 && aheadMaster === 0 && aheadOrigin === 0
  const tone: Tone = clean ? 'ok' : 'warn'

  const branchLabel = git.detached ? 'detached HEAD' : `branch ${git.branch}`
  const line = clean
    ? `Schone werkboom op ${branchLabel}, in sync met master.`
    : `Localhost (${branchLabel}) staat ${parts.join(', ')}.`
  return { tone, line }
}

// ── Hoofd-component ──────────────────────────────────────────────────────────

export function VersieClient() {
  const [data, setData] = useState<VersionStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prod, setProd] = useState<ProdInfo>({ state: 'loading' })

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/version-status', { cache: 'no-store' })
      if (!res.ok) {
        setError(res.status === 403 ? 'Geen toegang (superadmin vereist).' : 'Kon de versie-staat niet laden.')
        setData(null)
        return
      }
      setData((await res.json()) as VersionStatusResponse)
    } catch {
      setError('Kon de versie-staat niet laden.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProd = useCallback(async () => {
    setProd({ state: 'loading' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(`${PROD_URL}/api/version`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok) {
        setProd({ state: 'error' })
        return
      }
      const json = (await res.json()) as { sha?: string; env?: string }
      setProd({ state: 'ok', sha: json.sha ?? 'onbekend', env: json.env ?? 'onbekend' })
    } catch {
      setProd({ state: 'error' })
    } finally {
      clearTimeout(timer)
    }
  }, [])

  const refresh = useCallback(() => {
    void loadStatus()
    void loadProd()
  }, [loadStatus, loadProd])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="space-y-8">
      {/* Kop + Ververs */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">Versie &amp; git</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Waar staat localhost t.o.v. master en prod, en klopt de migratie-staat — in één blik.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Ververs
        </button>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 border border-dashed border-[var(--border-ed)] px-4 py-8 text-sm text-[var(--ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Staat ophalen…
        </div>
      )}

      {data && (
        <>
          <VerdictBanner data={data} prod={prod} />
          {data.git.available ? (
            <>
              <GitStatePanel git={data.git} />
              <WorktreesPanel git={data.git} />
              <CommitsPanel git={data.git} />
            </>
          ) : (
            <Panel>
              <div className="flex items-start gap-3">
                <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ink-4)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">Git-staat is alleen lokaal beschikbaar</p>
                  <p className="mt-1 text-sm text-[var(--ink-3)]">{data.git.reason}</p>
                  <p className="mt-1 text-xs text-[var(--ink-4)]">
                    Op productie draait er geen git — daar toont deze pagina de deploy-SHA en de
                    migratie-staat. De git-panels verschijnen wanneer je dit dashboard lokaal opent.
                  </p>
                </div>
              </div>
            </Panel>
          )}
          <DeployPanel data={data} prod={prod} onRetryProd={loadProd} />
          <MigrationsPanel data={data} />
          <Spiekbrief />
          <p className="text-right font-mono text-[10px] text-[var(--ink-4)]">
            gemeten {relativeTime(data.generatedAt)} · {data.cwd}
          </p>
        </>
      )}
    </div>
  )
}

// ── Kop-banner ───────────────────────────────────────────────────────────────

function VerdictBanner({ data, prod }: { data: VersionStatusResponse; prod: ProdInfo }) {
  let tone: Tone = 'muted'
  let line: string

  if (data.git.available) {
    const v = computeGitVerdict(data.git)
    tone = v.tone
    line = v.line
  } else {
    line = 'Git-staat niet beschikbaar op deze host — zie deploy- en migratie-panelen hieronder.'
  }

  // Alleen migraties NIEUWER dan alles wat is toegepast zijn een echt actiesignaal
  // → escaleer naar rood. Wholesale lineage-divergentie (driftOlder) doet dat NIET.
  const pendingNewer = data.migrations.pendingNewer.length
  if (pendingNewer > 0) {
    tone = 'alert'
    line += ` ${pendingNewer} migratie${pendingNewer === 1 ? '' : 's'} nog niet toegepast.`
  }

  // Prod-vergelijking als losse zin.
  if (data.git.available && data.git.headSha) {
    if (prod.state === 'ok') {
      if (prod.sha === data.git.headSha) line += ' Prod draait op dezelfde commit.'
      else if (data.git.commits.some((c) => c.sha === prod.sha)) line += ' Localhost is nieuwer dan prod.'
      else line += ' Localhost en prod wijken af.'
    } else if (prod.state === 'error') {
      line += ' Prod-SHA onbekend.'
    }
  }

  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'alert' ? CircleAlert : AlertTriangle
  return (
    <div className={`flex items-start gap-3 border px-4 py-3 ${TONE[tone].banner}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[tone].text}`} />
      <p className={`text-sm font-medium leading-relaxed ${tone === 'muted' ? 'text-[var(--ink-2)]' : TONE[tone].text}`}>
        {line}
      </p>
    </div>
  )
}

// ── Git-staat ────────────────────────────────────────────────────────────────

function GitStatePanel({ git }: { git: GitStateAvailable }) {
  const stat = (label: string, value: React.ReactNode, tone: Tone = 'muted') => (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--border-ed)] py-2 last:border-b-0">
      <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${tone === 'muted' ? 'text-[var(--ink)]' : TONE[tone].text}`}>
        {value}
      </span>
    </div>
  )

  const aheadBehind = (ab: { ahead: number; behind: number } | null, missing: string) =>
    ab ? `${ab.ahead} vóór · ${ab.behind} achter` : missing

  return (
    <Panel>
      <SectionLabel icon={GitBranch}>Git-staat</SectionLabel>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          {stat('Branch', git.detached ? 'detached HEAD' : git.branch)}
          {stat('HEAD', git.headShort ?? '—')}
          {stat('Upstream', git.upstream ?? 'geen')}
          {stat(
            'Ongepusht',
            git.unpushed == null ? 'n.v.t.' : `${git.unpushed}`,
            (git.unpushed ?? 0) > 0 ? 'warn' : 'muted',
          )}
        </div>
        <div>
          {stat('vs master', aheadBehind(git.vsMaster, 'master ontbreekt'), (git.vsMaster?.ahead ?? 0) > 0 ? 'warn' : 'muted')}
          {stat(
            'vs origin/master',
            aheadBehind(git.vsOriginMaster, 'niet gefetcht'),
            (git.vsOriginMaster?.ahead ?? 0) > 0 ? 'warn' : 'muted',
          )}
          {stat(
            'Ongecommit',
            `${git.uncommitted.count} ${git.uncommitted.count === 1 ? 'bestand' : 'bestanden'}`,
            git.uncommitted.count > 0 ? 'warn' : 'ok',
          )}
        </div>
      </div>

      {git.uncommitted.count > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
            Toon gewijzigde bestanden{git.uncommitted.truncated ? ` (eerste ${git.uncommitted.files.length})` : ''}
          </summary>
          <ul className="mt-2 space-y-0.5">
            {git.uncommitted.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 font-mono text-xs text-[var(--ink-2)]">
                <span className="w-6 shrink-0 text-[var(--ink-4)]">{f.status.trim() || '·'}</span>
                <span className="truncate">{f.path}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}

// ── Worktrees ────────────────────────────────────────────────────────────────

function WorktreesPanel({ git }: { git: GitStateAvailable }) {
  return (
    <Panel>
      <SectionLabel icon={FolderGit2}>Werkbomen · welke map is welke sessie</SectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-left">
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Pad</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Branch</th>
              <th className="py-2 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">HEAD</th>
            </tr>
          </thead>
          <tbody>
            {git.worktrees.map((w, i) => (
              <tr
                key={i}
                className={`border-b border-dotted border-[var(--border-ed)] ${w.isCurrent ? 'bg-[var(--subtle)]' : ''}`}
              >
                <td className="py-2 pr-4 font-mono text-xs text-[var(--ink-2)]">
                  <span className="flex items-center gap-2">
                    {w.isCurrent && <Badge tone="ok">hier</Badge>}
                    <span className="truncate">{w.path}</span>
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-[var(--ink-2)]">
                  {w.bare ? 'bare' : w.branch ?? 'detached'}
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--ink-4)]">{w.head}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-4)]">
        Elke werkboom is een aparte map met een eigen HEAD, maar ze delen één `.git` en één historie. De
        gemarkeerde rij is de map waarin dit dashboard nu draait.
      </p>
    </Panel>
  )
}

// ── Commits ──────────────────────────────────────────────────────────────────

function CommitsPanel({ git }: { git: GitStateAvailable }) {
  return (
    <Panel>
      <SectionLabel icon={GitCommitHorizontal}>Recente commits</SectionLabel>
      <ul className="space-y-2">
        {git.commits.map((c) => (
          <li key={c.sha} className="flex items-baseline gap-3">
            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-4)]">{c.short}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-2)]">{c.subject}</span>
            <span className="hidden shrink-0 text-xs text-[var(--ink-4)] sm:inline">{c.author}</span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--ink-4)]">{relativeTime(c.date)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ── Deploy / omgeving ────────────────────────────────────────────────────────

function DeployPanel({
  data,
  prod,
  onRetryProd,
}: {
  data: VersionStatusResponse
  prod: ProdInfo
  onRetryProd: () => void
}) {
  const localSha = data.git.available ? data.git.headSha : null

  let verdict: { tone: Tone; label: string }
  if (prod.state === 'loading') verdict = { tone: 'muted', label: 'prod ophalen…' }
  else if (prod.state === 'error') verdict = { tone: 'muted', label: 'onbekend' }
  else if (!localSha) verdict = { tone: 'muted', label: 'geen lokale HEAD om te vergelijken' }
  else if (prod.sha === localSha) verdict = { tone: 'ok', label: 'gelijk' }
  else if (data.git.available && data.git.commits.some((c) => c.sha === prod.sha))
    verdict = { tone: 'warn', label: 'localhost is nieuwer' }
  else verdict = { tone: 'warn', label: 'wijkt af' }

  const shortProd = prod.state === 'ok' ? (prod.sha.length > 7 ? prod.sha.slice(0, 9) : prod.sha) : null

  return (
    <Panel>
      <SectionLabel icon={GitBranch}>Deploy &amp; omgeving</SectionLabel>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--border-ed)] py-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Localhost HEAD</span>
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {data.git.available ? data.git.headShort ?? '—' : 'n.v.t.'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--border-ed)] py-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Prod SHA</span>
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {prod.state === 'ok' ? shortProd : prod.state === 'loading' ? '…' : 'onbekend'}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
        {prod.state === 'ok' && (
          <span className="font-mono text-[11px] text-[var(--ink-4)]">prod-omgeving: {prod.env}</span>
        )}
        {prod.state === 'error' && (
          <button
            type="button"
            onClick={onRetryProd}
            className="text-[11px] text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            opnieuw proberen
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-4)]">
        Vercel deploy-status (building/ready) is hier niet gekoppeld — dat vergt een Vercel-token en
        valt buiten scope. Getoond wordt enkel de build-SHA van {PROD_URL}.
      </p>
    </Panel>
  )
}

// ── Supabase-migraties ───────────────────────────────────────────────────────

function MigrationsPanel({ data }: { data: VersionStatusResponse }) {
  const m = data.migrations
  const appliedCount = m.applied?.length ?? null
  const lineageNoise = m.driftOlder.length + m.unknownApplied.length
  const inSync =
    m.pendingNewer.length === 0 && lineageNoise === 0 && !m.rpcError && !m.filesUnavailable

  return (
    <Panel>
      <SectionLabel icon={Database}>Supabase-migraties</SectionLabel>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Bestanden</span>
          <span className="font-mono text-lg tabular-nums text-[var(--ink)]">
            {m.filesUnavailable ? '—' : m.files.length}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Toegepast</span>
          <span className="font-mono text-lg tabular-nums text-[var(--ink)]">
            {appliedCount ?? '—'}
          </span>
        </div>
        <div className="ml-auto">
          {m.rpcError ? (
            <Badge tone="muted">toegepaste lijst onbekend</Badge>
          ) : inSync ? (
            <Badge tone="ok">in sync</Badge>
          ) : m.pendingNewer.length > 0 ? (
            <Badge tone="alert">{m.pendingNewer.length} nog niet toegepast</Badge>
          ) : (
            <Badge tone="muted">lineage-divergentie</Badge>
          )}
        </div>
      </div>

      {m.filesUnavailable && (
        <p className="mt-3 text-xs text-[var(--ink-4)]">
          De migratie-bestanden zitten niet in deze (serverless) build — telling en drift zijn alleen
          lokaal betrouwbaar.
        </p>
      )}
      {m.rpcError && (
        <p className="mt-3 text-xs text-amber-700">
          De toegepaste-versies-RPC gaf geen antwoord; drift kon niet worden bepaald.
        </p>
      )}

      {/* Het echte actiesignaal: bestanden nieuwer dan alles wat is toegepast. */}
      {m.pendingNewer.length > 0 && (
        <div className="mt-3 border-l-2 border-red-300 bg-red-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-red-800">
            Nog niet toegepast — nieuwer dan de DB
          </p>
          <ul className="mt-1 space-y-0.5">
            {m.pendingNewer.map((v) => (
              <li key={v} className="font-mono text-xs tabular-nums text-red-700">
                {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rustige, ingeklapte informatieve noot voor lineage-ruis — geen rood. */}
      {lineageNoise > 0 && (
        <details className="mt-3 border-l-2 border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
          <summary className="cursor-pointer text-xs text-[var(--ink-3)]">
            Lineage-divergentie: {lineageNoise} bestand{lineageNoise === 1 ? '' : 'en'} buiten de
            toegepaste historie (informatief — de map is hernummerd t.o.v. de DB)
          </summary>
          {m.driftOlder.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
                Lokaal bestand ≤ laatst toegepaste, niet in de DB ({m.driftOlder.length})
              </p>
              <ul className="mt-1 space-y-0.5">
                {m.driftOlder.map((v) => (
                  <li key={v} className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.unknownApplied.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
                Toegepast zonder bestand ({m.unknownApplied.length})
              </p>
              <ul className="mt-1 space-y-0.5">
                {m.unknownApplied.map((v) => (
                  <li key={v} className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </Panel>
  )
}

// ── Spiekbrief ───────────────────────────────────────────────────────────────

function Spiekbrief() {
  return (
    <details className="border border-[var(--border-ed)] bg-[var(--paper)]" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--ink)]">
        Spiekbrief — hoe hangt dit samen?
      </summary>
      <div className="space-y-5 border-t border-[var(--border-ed)] px-4 py-4 text-sm leading-relaxed text-[var(--ink-2)]">
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink)]">Twee gescheiden werelden</h4>
          <p>
            <strong>CODE</strong> woont in git; <strong>DATA</strong> woont in Supabase. Ze staan los
            van elkaar. Een commit terugdraaien raakt je databasegegevens niet, en een database-wipe
            raakt je code niet. &quot;Ik ben werk kwijt&quot; is dus altijd één van twee dingen:
            ongecommitte code in een andere map, óf gewiste data in de gedeelde database.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink)]">Wat is localhost?</h4>
          <p>
            Localhost = de dev-server die de code van jóuw huidige map draait, gekoppeld aan de
            gedeelde Supabase-database. Localhost is dus niet &quot;master&quot; en niet &quot;prod&quot; — het is
            simpelweg de map waarin je nu werkt. Welke map dat is, zie je in het werkbomen-paneel
            (rij &quot;hier&quot;).
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink)]">De reis van een wijziging</h4>
          <p className="font-mono text-[13px] text-[var(--ink)]">
            wijzigen → <span className="text-[var(--ink-3)]">commit</span> (vastleggen in je branch) →{' '}
            <span className="text-[var(--ink-3)]">push</span> (naar origin) → merge naar{' '}
            <strong>master</strong> = prod, of een branch = preview-deploy.
          </p>
          <p className="mt-1">
            Ongecommit werk zit nergens veilig behalve op die ene schijf. Gecommit-maar-ongepusht zit
            alleen lokaal. Pas ná push staat het op de server.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink)]">Worktrees (parallelle sessies)</h4>
          <p>
            Meerdere Claude-sessies werken vaak in aparte werkbomen: aparte mappen die één `.git`
            delen. Elke map heeft zijn eigen bestanden en HEAD, maar dezelfde commit-historie. Werk
            uit sessie A verschijnt pas in map B ná commit + (soms) merge — niet vanzelf.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-semibold text-[var(--ink)]">Weer overzicht krijgen</h4>
          <ul className="ml-4 list-disc space-y-1 font-mono text-[13px]">
            <li>
              <code>git worktree list</code> — welke mappen/sessies bestaan er?
            </li>
            <li>
              <code>git status</code> — heb ik hier ongecommit werk?
            </li>
            <li>
              <code>git log origin/master..HEAD</code> — wat heb ik lokaal dat prod nog niet heeft?
            </li>
          </ul>
          <p className="mt-1 text-[var(--ink-3)]">
            Dit dashboard beantwoordt precies deze drie vragen bovenaan — dit is de hand-versie.
          </p>
        </div>
      </div>
    </details>
  )
}
