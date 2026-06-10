'use client'

// Orchestrator van de architectuurplaat: lens-keuze, selectie (element óf
// relatie), zoeken, hash-deeplink, wijzigingen-strook en de schuifbare plaat
// met detailkaart. Lenzen verschijnen alleen als hun data beschikbaar is.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  ARCHI_KIND_META,
  ARCHI_REL_NL,
  type ArchiKind,
  type ArchiRelType,
  type ArchimateModel,
} from '@/lib/architecture/archimate-model'
import { ARCHI_FLOWS, getFlowHighlight } from '@/lib/architecture/archimate-flows'
import {
  ARCHI_CONCERNS,
  type ArchiConcernSeverity,
  concernCountByElement,
  getConcernsFor,
} from '@/lib/architecture/archimate-concerns'
import type { AdrFact, ArchInsights, TableWriter } from '@/lib/architecture/facts'
import { ArchimatePlaat, type PlaatOverlay } from './archimate-plaat'
import { ArchimateDetail } from './archimate-detail'
import { ArchimateEdgeDetail } from './archimate-edge-detail'

export interface ArchDiff {
  baseline: boolean
  previousDate: string | null
  hasChanges: boolean
  sections: Array<{ label: string; added: string[]; removed: string[] }>
}

type LensId = 'lagen' | 'stromen' | 'datatoegang' | 'aandachtspunten' | 'churn'
type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

const LEGEND_LAYERS: ArchiKind[] = ['motiv', 'bizproc', 'appsvc', 'appcomp', 'appfunc', 'tech', 'data', 'ext']

const LEGEND_RELS: Array<{ type: ArchiRelType; dash?: string; start?: string; end?: string }> = [
  { type: 'realization', dash: '5 4', end: 'tri' },
  { type: 'serving', end: 'arrow' },
  { type: 'assignment', start: 'ball', end: 'arrow' },
  { type: 'access', dash: '1.5 3.5', end: 'acc' },
  { type: 'aggregation', start: 'dia-open' },
]

const SEVERITY_LABEL: Record<ArchiConcernSeverity, string> = {
  info: 'Bewust',
  debt: 'Schuld',
  risk: 'Risico',
}
const SEVERITY_COLOR: Record<ArchiConcernSeverity, string> = {
  info: 'var(--ink-3)',
  debt: 'var(--color-horizon-600)',
  risk: 'var(--negative)',
}

function RelSample({ rel }: { rel: (typeof LEGEND_RELS)[number] }) {
  const mk = (kind: string) => `lgm-${rel.type}-${kind}`
  return (
    <svg width="26" height="12" aria-hidden="true" className="shrink-0">
      <defs>
        <marker id={mk('arrow')} markerWidth="11" markerHeight="11" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke="#5f5b54" strokeWidth="1.3" />
        </marker>
        <marker id={mk('tri')} markerWidth="13" markerHeight="11" refX="9" refY="5" orient="auto">
          <path d="M1,1 L9,5 L1,9 Z" fill="var(--paper)" stroke="#5f5b54" strokeWidth="1.2" />
        </marker>
        <marker id={mk('acc')} markerWidth="11" markerHeight="11" refX="7" refY="4" orient="auto">
          <path d="M1,1 L7,4 L1,7" fill="none" stroke="#5f5b54" strokeWidth="1.2" />
        </marker>
        <marker id={mk('diamond')} markerWidth="15" markerHeight="11" refX="1" refY="5" orient="auto">
          <path d="M1,5 L6,1 L11,5 L6,9 Z" fill="#5f5b54" />
        </marker>
        <marker id={mk('dia-open')} markerWidth="15" markerHeight="11" refX="1" refY="5" orient="auto">
          <path d="M1,5 L6,1 L11,5 L6,9 Z" fill="var(--paper)" stroke="#5f5b54" strokeWidth="1.1" />
        </marker>
        <marker id={mk('ball')} markerWidth="9" markerHeight="9" refX="3" refY="4" orient="auto">
          <circle cx="3.5" cy="4" r="2.6" fill="#5f5b54" />
        </marker>
      </defs>
      <path
        d="M2,6 L22,6"
        fill="none"
        stroke="#5f5b54"
        strokeWidth="1.4"
        strokeDasharray={rel.dash}
        markerStart={rel.start ? `url(#${mk(rel.start)})` : undefined}
        markerEnd={rel.end ? `url(#${mk(rel.end)})` : undefined}
      />
    </svg>
  )
}

interface ClientProps {
  model: ArchimateModel
  insights: ArchInsights
  diff: ArchDiff | null
  generatedDate: string
}

export function ArchitectuurClient({ model, insights, diff, generatedDate }: ClientProps) {
  const [selection, setSelection] = useState<Selection>(null)
  const [lens, setLens] = useState<LensId>('lagen')
  const [flowId, setFlowId] = useState<string>(ARCHI_FLOWS[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const plaatRef = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model])
  const concernCounts = useMemo(() => concernCountByElement(), [])

  // Beschikbare lenzen — alleen tonen waar data voor is.
  const lenses = useMemo(() => {
    const all: Array<{ id: LensId; label: string; available: boolean }> = [
      { id: 'lagen', label: 'Lagen', available: true },
      { id: 'stromen', label: 'Stromen', available: ARCHI_FLOWS.length > 0 },
      { id: 'datatoegang', label: 'Datatoegang', available: insights.tableAccess !== null },
      { id: 'aandachtspunten', label: 'Aandachtspunten', available: ARCHI_CONCERNS.length > 0 },
      { id: 'churn', label: 'Activiteit', available: insights.churn !== null },
    ]
    return all.filter((l) => l.available)
  }, [insights])

  const activeFlow = useMemo(() => ARCHI_FLOWS.find((f) => f.id === flowId) ?? ARCHI_FLOWS[0], [flowId])

  // Deeplink: #node-id of #rel:edge-id selecteert bij laden.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    if (hash.startsWith('rel:')) {
      const eid = hash.slice(4)
      if (model.edges.some((e) => e.id === eid)) setSelection({ kind: 'edge', id: eid })
    } else if (model.nodes.some((n) => n.id === hash)) {
      setSelection({ kind: 'node', id: hash })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const writeHash = useCallback((sel: Selection) => {
    const base = window.location.pathname + window.location.search
    const url = !sel ? base : sel.kind === 'edge' ? `#rel:${sel.id}` : `#${sel.id}`
    window.history.replaceState(null, '', url)
  }, [])

  const scrollToDetail = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    detailRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [])

  const selectNode = useCallback(
    (id: string, scroll = true) => {
      const sel: Selection = { kind: 'node', id }
      setSelection(sel)
      writeHash(sel)
      if (scroll) scrollToDetail()
    },
    [writeHash, scrollToDetail],
  )
  const selectEdge = useCallback(
    (id: string, scroll = true) => {
      const sel: Selection = { kind: 'edge', id }
      setSelection(sel)
      writeHash(sel)
      if (scroll) scrollToDetail()
    },
    [writeHash, scrollToDetail],
  )
  const clearSelection = useCallback(() => {
    setSelection(null)
    writeHash(null)
  }, [writeHash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [clearSelection])

  // ── Overlay per lens ──
  const overlay: PlaatOverlay | undefined = useMemo(() => {
    if (lens === 'stromen' && activeFlow) {
      const { nodeIds, edgeIds } = getFlowHighlight(model, activeFlow)
      return { emphasisNodeIds: nodeIds, emphasisEdgeIds: edgeIds, dimOthers: true }
    }
    if (lens === 'aandachtspunten') {
      const badge = new Map<string, string>()
      for (const [id, n] of concernCounts) badge.set(id, String(n))
      return { emphasisNodeIds: new Set(concernCounts.keys()), dimOthers: true, nodeBadge: badge }
    }
    if (lens === 'datatoegang' && insights.tableAccess) {
      // Accentueer de datalaag + services; badge multi-writer tabellen.
      const emphasis = new Set<string>()
      for (const n of model.nodes) if (n.kind === 'data' || n.kind === 'appsvc') emphasis.add(n.id)
      const badge = new Map<string, string>()
      for (const n of model.nodes) {
        if (n.kind !== 'data') continue
        const writers = n.items.filter((t) => insights.tableAccess!.multiWriter.includes(t)).length
        if (writers > 0) badge.set(n.id, '!')
      }
      return { emphasisNodeIds: emphasis, dimOthers: true, nodeBadge: badge }
    }
    if (lens === 'churn' && insights.churn) {
      const tone = churnTone(model, insights.churn)
      return { nodeTone: tone }
    }
    return undefined
  }, [lens, activeFlow, model, concernCounts, insights])

  // ── Zoekresultaten ──
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return model.nodes
      .filter((n) => {
        if (n.title.toLowerCase().includes(q)) return true
        return n.items.some((it) => it.toLowerCase().includes(q))
      })
      .slice(0, 8)
  }, [query, model])

  // ── Detail-data afgeleid uit selectie ──
  const selectedNode = selection?.kind === 'node' ? byId.get(selection.id) ?? null : null
  const selectedEdge = selection?.kind === 'edge' ? model.edges.find((e) => e.id === selection.id) ?? null : null

  const detailConcerns = selectedNode ? getConcernsFor(selectedNode.id) : []
  const detailAdrs: AdrFact[] = selectedNode
    ? insights.adrs.filter((a) => a.elements.includes(selectedNode.id))
    : []
  const detailTableTouch = selectedNode ? tableTouchForNode(selectedNode.id, model, insights) : []
  const detailTableWriters: TableWriter[] = selectedNode ? tableWritersForNode(selectedNode, insights) : []

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span aria-hidden="true" className="mr-2.5 inline-block h-px w-7 bg-[var(--rule-soft)] align-middle" />
          ArchiMate · gegenereerd {generatedDate}
        </p>
        <h2 className="mt-2 font-serif text-2xl font-bold text-[var(--ink)]">
          De architectuur in <em className="font-serif italic font-normal text-[var(--ink-2)]">één</em> plaat
        </h2>
        <p className="mt-3 max-w-[60ch] border-l-2 border-[var(--rule-soft)] pl-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Motivatie → business → applicatieservices → de applicatie met haar modules → technologie → data →
          externe partijen. De topologie is gecureerd in{' '}
          <code className="font-mono not-italic text-[12px]">lib/architecture/archimate-model.ts</code>; de tellingen
          komen uit de dagelijkse snapshot (<code className="font-mono not-italic text-[12px]">npm run arch:diagram</code>) en lopen dus vanzelf mee.
        </p>
      </header>

      {/* ── wijzigingen sinds de vorige snapshot ── */}
      <section className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Wijzigingen · snapshot {generatedDate}
          </h3>
          {insights.statsHistory.length > 1 && <TrendStrip history={insights.statsHistory} />}
        </div>
        {!diff || diff.baseline ? (
          <p className="mt-1.5 font-serif italic text-sm text-[var(--ink-3)]">Eerste snapshot (baseline).</p>
        ) : !diff.hasChanges ? (
          <p className="mt-1.5 font-serif italic text-sm text-[var(--ink-3)]">
            Geen wijzigingen sinds {diff.previousDate ?? 'de vorige snapshot'}.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-xs text-[var(--ink-2)]">
            {diff.sections.map((s) => (
              <li key={s.label} className="leading-relaxed">
                <span className="font-medium text-[var(--ink)]">{s.label}</span>
                {s.added.length > 0 && (
                  <>
                    {' '}
                    <span className="text-positive">+</span> {s.added.join(', ')}
                  </>
                )}
                {s.removed.length > 0 && (
                  <>
                    {' '}
                    <span className="text-negative">−</span> {s.removed.join(', ')}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── lens-keuze + zoeken ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Lens">
          {lenses.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              onClick={() => setLens(l.id)}
              className={`border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                lens === l.id
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek element, route, tabel…"
            aria-label="Zoek op de plaat"
            className="w-56 border border-[var(--border-ed)] bg-[var(--paper)] py-1.5 pl-8 pr-3 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)] focus:border-[var(--ink)]"
          />
          {results.length > 0 && (
            <ul className="absolute right-0 z-10 mt-1 max-h-72 w-72 overflow-auto border border-[var(--ink)] bg-[var(--paper)] shadow-[var(--shadow-md,0_8px_24px_rgba(0,0,0,0.1))]">
              {results.map((n) => {
                const m = ARCHI_KIND_META[n.kind]
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectNode(n.id)
                        setQuery('')
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
                    >
                      <i aria-hidden="true" className="h-2 w-2.5 shrink-0 border" style={{ backgroundColor: m.fill, borderColor: m.stroke }} />
                      <span className="min-w-0 truncate">{n.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]">{m.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── lens-paneel ── */}
      {lens === 'stromen' && activeFlow && (
        <section className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3.5">
          <div className="flex flex-wrap gap-1.5">
            {ARCHI_FLOWS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFlowId(f.id)}
                className={`border px-2.5 py-1 text-xs transition-colors ${
                  f.id === activeFlow.id
                    ? 'border-[var(--color-horizon-500)] bg-[var(--color-horizon-50)] text-[var(--color-horizon-700)]'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                }`}
              >
                {f.title}
              </button>
            ))}
          </div>
          <p className="mt-3 max-w-[68ch] font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">{activeFlow.lead}</p>
          <ol className="mt-3 space-y-2">
            {activeFlow.steps.map((s, i) => {
              const n = byId.get(s.elementId)
              return (
                <li key={`${s.elementId}-${i}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-[var(--color-horizon-600)] font-mono text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => selectNode(s.elementId)}
                      className="text-left text-sm font-medium text-[var(--ink)] underline-offset-2 hover:underline"
                    >
                      {s.label}
                      {n && <span className="ml-1.5 font-serif text-xs font-normal italic text-[var(--ink-3)]">— {n.title}</span>}
                    </button>
                    {s.artifact && <span className="ml-2 font-mono text-[11px] text-[var(--color-horizon-700)]">{s.artifact}</span>}
                    {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{s.detail}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {lens === 'aandachtspunten' && (
        <section className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3.5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            {ARCHI_CONCERNS.length} aandachtspunten — verankerd op de plaat
          </h3>
          <ul className="mt-2.5 space-y-2">
            {ARCHI_CONCERNS.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectNode(c.elementIds[0])}
                  className="group flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left transition-colors hover:bg-[var(--subtle)]"
                  style={{ borderColor: SEVERITY_COLOR[c.severity] }}
                >
                  <span
                    className="mt-0.5 shrink-0 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-white"
                    style={{ backgroundColor: SEVERITY_COLOR[c.severity] }}
                  >
                    {SEVERITY_LABEL[c.severity]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--ink)]">{c.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--ink-2)]">{c.detail}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--ink-4)]">
                      {c.elementIds.map((id) => byId.get(id)?.title ?? id).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lens === 'datatoegang' && insights.tableAccess && (
        <section className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3.5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Datatoegang</h3>
          <p className="mt-1.5 max-w-[68ch] font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
            Welke API-domeinen welke tabellen lezen en schrijven — gescand uit de route-bestanden. Klik een data-object
            op de plaat om te zien wie erin schrijft.
          </p>
          {insights.tableAccess.multiWriter.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">
              <span className="font-medium text-[var(--negative)]">Koppelrisico</span> — tabellen die door meer dan één
              domein geschreven worden:{' '}
              <span className="font-mono text-[var(--ink)]">{insights.tableAccess.multiWriter.join(', ')}</span>
            </p>
          )}
        </section>
      )}

      {lens === 'churn' && insights.churn && (
        <section className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3.5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Activiteit · laatste {insights.churn.sinceDays} dagen
          </h3>
          <p className="mt-1.5 max-w-[68ch] font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
            Warmer = meer commits. Zo zie je waar de wijzigingsdruk zit — en waar testdekking achterloopt.
          </p>
          <div className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Drukste gebieden</p>
              {insights.churn.areas.slice(0, 6).map((a) => (
                <div key={a.path} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-mono text-[var(--ink-2)]">{a.path}</span>
                  <span className="tabular-nums text-[var(--ink)]">{a.commits}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Grootste bestanden</p>
              {insights.churn.hotFiles.slice(0, 6).map((h) => (
                <div key={h.file} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-mono text-[var(--ink-2)]">{h.file.split('/').pop()}</span>
                  <span className="shrink-0 tabular-nums text-[var(--ink-3)]">
                    {h.loc.toLocaleString('nl-NL')}r · {h.commits}c
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── legenda ── */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Lagen</span>
          {LEGEND_LAYERS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
              <i aria-hidden="true" className="inline-block h-2.5 w-3 border" style={{ backgroundColor: ARCHI_KIND_META[k].fill, borderColor: ARCHI_KIND_META[k].stroke }} />
              {ARCHI_KIND_META[k].label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Relaties</span>
          {LEGEND_RELS.map((r) => (
            <span key={r.type} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
              <RelSample rel={r} />
              {ARCHI_REL_NL[r.type]}
            </span>
          ))}
        </div>
      </div>

      {/* ── export ── */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => exportPlaat('svg', plaatRef.current, generatedDate)}
          className="border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          Exporteer SVG
        </button>
        <button
          type="button"
          onClick={() => exportPlaat('png', plaatRef.current, generatedDate)}
          className="border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          Exporteer PNG
        </button>
      </div>

      {/* ── de plaat ── */}
      <div className="relative">
        <div
          ref={plaatRef}
          className="overflow-x-auto border border-[var(--border-ed)] bg-[var(--paper)] p-2"
          onScroll={(e) => {
            if (!scrolled && e.currentTarget.scrollLeft > 0) setScrolled(true)
          }}
        >
          <ArchimatePlaat
            model={model}
            selectedNodeId={selection?.kind === 'node' ? selection.id : null}
            selectedEdgeId={selection?.kind === 'edge' ? selection.id : null}
            onSelectNode={(id) => selectNode(id)}
            onSelectEdge={(id) => selectEdge(id)}
            overlay={overlay}
          />
        </div>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3.5 top-3.5 border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-3)] transition-opacity duration-200 ${scrolled ? 'opacity-0' : 'opacity-100'}`}
        >
          sleep →
        </span>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        Klik element of relatie · <kbd className="border border-[var(--border-ed)] bg-[var(--paper)] px-1">Tab</kbd>+
        <kbd className="border border-[var(--border-ed)] bg-[var(--paper)] px-1">Enter</kbd> = verdiepen ·{' '}
        <kbd className="border border-[var(--border-ed)] bg-[var(--paper)] px-1">Esc</kbd> = wissen
      </p>

      {/* ── verdieping ── */}
      <div ref={detailRef}>
        {selectedNode ? (
          <ArchimateDetail
            model={model}
            insights={insights}
            node={selectedNode}
            concerns={detailConcerns}
            adrs={detailAdrs}
            tableTouch={detailTableTouch}
            tableWriters={detailTableWriters}
            onSelectNode={(id) => selectNode(id, false)}
            onSelectEdge={(id) => selectEdge(id, false)}
            onOpenFlow={(id) => {
              setFlowId(id)
              setLens('stromen')
            }}
            onClear={clearSelection}
          />
        ) : selectedEdge ? (
          <ArchimateEdgeDetail
            model={model}
            insights={insights}
            edge={selectedEdge}
            onSelectNode={(id) => selectNode(id, false)}
            onClear={clearSelection}
          />
        ) : (
          <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Verdieping</p>
            <p className="mt-2 font-serif italic text-sm text-[var(--ink-3)]">
              Klik een element of relatie op de plaat — de toelichting verschijnt hier.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Trend-sparkline (Wave 3-data; verschijnt zodra statsHistory groeit) ──
function TrendStrip({ history }: { history: ArchInsights['statsHistory'] }) {
  const series: Array<{ key: keyof Omit<ArchInsights['statsHistory'][number], 'date'>; label: string }> = [
    { key: 'api', label: 'API' },
    { key: 'components', label: 'Comp.' },
    { key: 'tables', label: 'Tab.' },
  ]
  return (
    <div className="flex items-center gap-3">
      {series.map((s) => {
        const values = history.map((h) => h[s.key])
        const last = values[values.length - 1]
        const first = values[0]
        const delta = last - first
        return (
          <span key={s.key} className="inline-flex items-baseline gap-1 font-mono text-[10px] text-[var(--ink-3)]">
            <Sparkline values={values} />
            <span className="uppercase tracking-[0.05em]">{s.label}</span>
            <span className="tabular-nums text-[var(--ink)]">{last}</span>
            {delta !== 0 && (
              <span className={delta > 0 ? 'text-positive' : 'text-negative'}>
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 36
  const h = 11
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--ink-3)" strokeWidth="1" />
    </svg>
  )
}

// ── Datatoegang-helpers ──
function tableTouchForNode(
  nodeId: string,
  model: ArchimateModel,
  insights: ArchInsights,
): { name: string; write: boolean }[] {
  if (!insights.tableAccess) return []
  // Voor een service: union van de tabellen van zijn contract-domeinen.
  const domains = new Set<string>()
  for (const e of model.edges) {
    if (e.from === nodeId && e.contractDomains) for (const d of e.contractDomains) domains.add(d)
  }
  if (domains.size === 0) return []
  const merged = new Map<string, boolean>()
  for (const d of domains) {
    for (const t of insights.tableAccess.byDomain[d] ?? []) {
      merged.set(t.name, (merged.get(t.name) ?? false) || t.write)
    }
  }
  return [...merged.entries()].map(([name, write]) => ({ name, write })).sort((a, b) => a.name.localeCompare(b.name))
}

function tableWritersForNode(
  node: { kind: string; items: string[] },
  insights: ArchInsights,
): TableWriter[] {
  if (!insights.tableAccess || node.kind !== 'data') return []
  // Aggregeer per domein over alle tabellen van dit data-object.
  const byDomain = new Map<string, TableWriter>()
  for (const tableName of node.items) {
    for (const w of insights.tableAccess.byTable[tableName] ?? []) {
      const existing = byDomain.get(w.domain)
      if (existing) {
        existing.write = existing.write || w.write
        existing.routes = [...new Set([...existing.routes, ...w.routes])]
      } else {
        byDomain.set(w.domain, { ...w, routes: [...w.routes] })
      }
    }
  }
  return [...byDomain.values()].sort(
    (a, b) => Number(b.write) - Number(a.write) || a.label.localeCompare(b.label),
  )
}

// ── Export naar SVG / PNG ──
// CSS-custom-properties (var(--ink) etc.) worden geresolved zodat het bestand
// ook buiten de app de juiste kleuren toont.
function resolveCssVars(svgString: string): string {
  const root = getComputedStyle(document.documentElement)
  return svgString.replace(/var\((--[a-z0-9-]+)\)/gi, (_match, name: string) => {
    const v = root.getPropertyValue(name).trim()
    return v || 'transparent'
  })
}
function serializePlaat(host: HTMLDivElement): { svg: string; width: number; height: number } | null {
  const svg = host.querySelector('svg')
  if (!svg) return null
  const vb = svg.viewBox.baseVal
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(vb.width))
  clone.setAttribute('height', String(vb.height))
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(vb.x))
  bg.setAttribute('y', String(vb.y))
  bg.setAttribute('width', String(vb.width))
  bg.setAttribute('height', String(vb.height))
  bg.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#ffffff')
  clone.insertBefore(bg, clone.firstChild)
  return { svg: resolveCssVars(new XMLSerializer().serializeToString(clone)), width: vb.width, height: vb.height }
}
function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
function exportPlaat(format: 'svg' | 'png', host: HTMLDivElement | null, date: string) {
  if (!host) return
  const out = serializePlaat(host)
  if (!out) return
  if (format === 'svg') {
    const blob = new Blob([out.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `trifinity-architectuur-${date}.svg`)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const scale = 2
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = out.width * scale
    canvas.height = out.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      triggerDownload(url, `trifinity-architectuur-${date}.png`)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out.svg)
}

// ── Churn-tint (Wave 3-data) ──
// Mapt churn-gebieden (pad-prefix) naar elementen en kleurt naar commit-druk.
const CHURN_AREA_ELEMENT: Record<string, string> = {
  'app/api/ai': 'as-coach',
  'app/api/household': 'as-huishouden',
  'app/api/budgets': 'as-budget',
  'app/api/assets': 'as-vermogen',
  'app/(app)/toekomst': 'fn-toekomstplannen',
  'app/(app)/overzicht': 'sp-inzicht',
  'lib/ai': 'as-coach',
  'lib/fire-simulation.ts': 'as-planning',
  'lib/horizon-data.ts': 'as-planning',
  'components/horizon': 'fn-toekomstplannen',
}
function churnTone(model: ArchimateModel, churn: NonNullable<ArchInsights['churn']>): Map<string, string> {
  const byElement = new Map<string, number>()
  for (const a of churn.areas) {
    const el = CHURN_AREA_ELEMENT[a.path]
    if (el) byElement.set(el, (byElement.get(el) ?? 0) + a.commits)
  }
  const max = Math.max(1, ...byElement.values())
  const tone = new Map<string, string>()
  for (const n of model.nodes) {
    const c = byElement.get(n.id)
    if (!c) continue
    const t = Math.min(1, c / max)
    // warm accent: meer commits = sterker
    tone.set(n.id, `color-mix(in oklch, var(--color-horizon-300) ${Math.round(t * 75)}%, ${ARCHI_KIND_META[n.kind].fill})`)
  }
  return tone
}
