'use client'

// Detailkaart van één element: type, toelichting, tags, relaties (klikbaar naar
// element óf relatie), transitieve impact, en — indien beschikbaar — datatoegang,
// aandachtspunten en architectuurbesluiten.

import { GitBranch, X } from 'lucide-react'
import {
  ARCHI_KIND_META,
  ARCHI_REL_NL,
  getRelationsFor,
  type ArchimateModel,
  type ArchiNode,
} from '@/lib/architecture/archimate-model'
import { ARCHI_FLOWS } from '@/lib/architecture/archimate-flows'
import type { AdrFact, ArchInsights, TableWriter } from '@/lib/architecture/facts'
import type { ArchiConcern } from '@/lib/architecture/archimate-concerns'

interface DetailProps {
  model: ArchimateModel
  insights: ArchInsights
  node: ArchiNode
  /** Aandachtspunten die dit element raken (Wave 3) */
  concerns?: ArchiConcern[]
  /** Architectuurbesluiten die dit element raken (Wave 3) */
  adrs?: AdrFact[]
  /** Tabellen die dit element (via zijn API-domeinen) raakt (Wave 2) */
  tableTouch?: { name: string; write: boolean }[]
  /** Wanneer dit element een tabel-object is: wie schrijft erin (Wave 2) */
  tableWriters?: TableWriter[]
  onSelectNode: (id: string) => void
  onSelectEdge: (id: string) => void
  /** Open een informatiestroom in de stromen-lens */
  onOpenFlow?: (flowId: string) => void
  onClear: () => void
}

export function ArchimateDetail({
  model,
  node,
  concerns,
  adrs,
  tableTouch,
  tableWriters,
  onSelectNode,
  onSelectEdge,
  onOpenFlow,
  onClear,
}: DetailProps) {
  const meta = ARCHI_KIND_META[node.kind]
  const relations = getRelationsFor(model, node.id)
  // Stromen waar dit element in voorkomt — directer bruikbaar dan een generieke
  // transitieve BFS op deze gelaagde topologie.
  const inFlows = ARCHI_FLOWS.filter((f) => f.steps.some((s) => s.elementId === node.id))

  return (
    <div aria-live="polite" className="border border-[var(--ink)] bg-[var(--paper)]">
      <div className="relative border-b border-[var(--border-ed)] px-5 py-4">
        <span
          className="inline-block px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white"
          style={{ backgroundColor: meta.stroke }}
        >
          {meta.label}
        </span>
        <h3 className="mt-2 font-serif text-xl font-bold leading-tight text-[var(--ink)]">
          {node.title}
          {node.badge && (
            <span className="ml-2 align-middle font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[var(--ink-3)]">
              · {node.badge}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={onClear}
          aria-label="Selectie wissen"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">{node.lead}</p>

        {node.note && <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">{node.note}</p>}

        {concerns && concerns.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Aandachtspunten</h4>
            <div className="space-y-2">
              {concerns.map((c) => (
                <div key={c.id} className="border-l-2 border-[var(--negative)] bg-[var(--subtle)] px-3 py-2">
                  <p className="text-[13px] font-medium text-[var(--ink)]">{c.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">{c.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {node.items.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Bevat / verwijst naar</h4>
            <div className="flex flex-wrap gap-1.5">
              {node.items.map((it) => (
                <span
                  key={it}
                  className="border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-2)]"
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        )}

        {tableTouch && tableTouch.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Raakt deze tabellen
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {tableTouch.map((t) => (
                <span
                  key={t.name}
                  className={`border px-2 py-0.5 font-mono text-[11px] ${
                    t.write
                      ? 'border-[var(--negative)]/40 bg-[var(--negative)]/8 text-[var(--ink)]'
                      : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)]'
                  }`}
                  title={t.write ? 'leest én schrijft' : 'alleen lezen'}
                >
                  {t.name}
                  {t.write && <span className="ml-1 text-[var(--negative)]">✎</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {tableWriters && tableWriters.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Wie raakt deze tabel ({tableWriters.length})
            </h4>
            <div className="space-y-1.5">
              {tableWriters.slice(0, 14).map((w) => (
                <div key={`${w.domain}-${w.routes[0] ?? ''}`} className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-block h-2 w-2 ${w.write ? 'bg-[var(--negative)]' : 'bg-[var(--ink-3)]'}`}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-[var(--ink)]">{w.label}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-4)]">
                    {w.write ? 'schrijft' : 'leest'} · {w.routes.length} route{w.routes.length === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
              {tableWriters.length > 14 && (
                <p className="font-mono text-[11px] text-[var(--ink-4)]">+{tableWriters.length - 14} meer domeinen</p>
              )}
            </div>
          </div>
        )}

        {relations.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Relaties</h4>
            <div className="flex flex-col gap-1.5">
              {relations.map(({ edge, other, outgoing }) => {
                const otherMeta = ARCHI_KIND_META[other.kind]
                return (
                  <div
                    key={edge.id}
                    className="flex items-stretch border border-[var(--border-ed)] bg-[var(--paper)] text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNode(other.id)}
                      className="flex min-h-11 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
                    >
                      <i aria-hidden="true" className="h-2.5 w-3 shrink-0 border" style={{ backgroundColor: otherMeta.fill, borderColor: otherMeta.stroke }} />
                      <span className="min-w-0 truncate">{other.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectEdge(edge.id)}
                      title="Bekijk de relatie (wat stroomt er)"
                      className="flex min-h-11 shrink-0 items-center gap-1 border-l border-[var(--border-ed)] px-2.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
                    >
                      {ARCHI_REL_NL[edge.type]} {outgoing ? '→' : '←'}
                      {edge.payload && <span className="text-[var(--color-horizon-600)]">●</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {inFlows.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Onderdeel van informatiestromen
            </h4>
            <div className="flex flex-col gap-1.5">
              {inFlows.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpenFlow?.(f.id)}
                  disabled={!onOpenFlow}
                  className="flex min-h-11 items-center gap-2.5 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-left text-sm text-[var(--ink)] transition-colors enabled:hover:bg-[var(--subtle)] disabled:cursor-default"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-horizon-600)]" aria-hidden="true" />
                  <span className="min-w-0">{f.title}</span>
                  {onOpenFlow && (
                    <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]">
                      open stroom →
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {adrs && adrs.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Besluiten (ADR)</h4>
            <div className="space-y-2">
              {adrs.map((a) => (
                <div key={a.id} className="border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
                  <p className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-[var(--ink)]">
                    <span>{a.title}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{a.status}</span>
                  </p>
                  {a.summary && <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">{a.summary}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
