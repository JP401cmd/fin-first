'use client'

// Detailkaart van één relatie: wat stroomt er, hoe, hoe vaak, en welke echte
// API-routes het contract vormen (live uit architecture.json).

import { ArrowRight, X } from 'lucide-react'
import {
  ARCHI_CADENCE_NL,
  ARCHI_KIND_META,
  ARCHI_MECHANISM_NL,
  ARCHI_REL_NL,
  type ArchiEdge,
  type ArchimateModel,
} from '@/lib/architecture/archimate-model'
import type { ArchInsights } from '@/lib/architecture/facts'

interface EdgeDetailProps {
  model: ArchimateModel
  insights: ArchInsights
  edge: ArchiEdge
  onSelectNode: (id: string) => void
  onClear: () => void
}

export function ArchimateEdgeDetail({ model, insights, edge, onSelectNode, onClear }: EdgeDetailProps) {
  const from = model.nodes.find((n) => n.id === edge.from)
  const to = model.nodes.find((n) => n.id === edge.to)
  if (!from || !to) return null

  const fromMeta = ARCHI_KIND_META[from.kind]
  const toMeta = ARCHI_KIND_META[to.kind]

  // Contract = de echte routes per gekoppeld API-domein (alleen bestaande).
  const contract = (edge.contractDomains ?? [])
    .map((domain) => ({ domain, facts: insights.apiByDomain[domain] }))
    .filter((x): x is { domain: string; facts: NonNullable<typeof x.facts> } => Boolean(x.facts))

  return (
    <div aria-live="polite" className="border border-[var(--ink)] bg-[var(--paper)]">
      <div className="relative border-b border-[var(--border-ed)] px-5 py-4">
        <span className="inline-block bg-[var(--ink)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--paper)]">
          Relatie · {ARCHI_REL_NL[edge.type]}
        </span>
        <h3 className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-lg font-bold leading-tight text-[var(--ink)]">
          <button
            type="button"
            onClick={() => onSelectNode(from.id)}
            className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
          >
            <i aria-hidden="true" className="h-2.5 w-3 border" style={{ backgroundColor: fromMeta.fill, borderColor: fromMeta.stroke }} />
            {from.title}
          </button>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onSelectNode(to.id)}
            className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
          >
            <i aria-hidden="true" className="h-2.5 w-3 border" style={{ backgroundColor: toMeta.fill, borderColor: toMeta.stroke }} />
            {to.title}
          </button>
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
        {edge.payload ? (
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            <span className="font-medium text-[var(--ink)]">Wat stroomt er:</span> {edge.payload}
          </p>
        ) : (
          <p className="font-serif italic text-sm text-[var(--ink-3)]">
            Structurele relatie ({ARCHI_REL_NL[edge.type].toLowerCase()}) — geen directe gegevensuitwisseling.
          </p>
        )}

        {(edge.mechanism || edge.cadence) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {edge.mechanism && (
              <div>
                <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Mechanisme</span>
                <span className="text-sm text-[var(--ink)]">{ARCHI_MECHANISM_NL[edge.mechanism]}</span>
              </div>
            )}
            {edge.cadence && (
              <div>
                <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">Cadans</span>
                <span className="text-sm text-[var(--ink)]">{ARCHI_CADENCE_NL[edge.cadence]}</span>
              </div>
            )}
          </div>
        )}

        {edge.note && (
          <p className="border-l-2 border-[var(--color-horizon-500)] pl-3 font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
            {edge.note}
          </p>
        )}

        {contract.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Contract — echte API-routes
            </h4>
            <div className="space-y-3">
              {contract.map(({ domain, facts }) => (
                <div key={domain}>
                  <p className="mb-1 text-xs font-medium text-[var(--ink-2)]">
                    {facts.label} <span className="font-mono text-[var(--ink-4)]">({facts.count})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {facts.routes.slice(0, 8).map((r) => (
                      <span
                        key={r.url}
                        className="border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-2)]"
                        title={r.methods.join(', ')}
                      >
                        {r.url}
                      </span>
                    ))}
                    {facts.routes.length > 8 && (
                      <span className="px-1 py-0.5 font-mono text-[11px] text-[var(--ink-4)]">
                        +{facts.routes.length - 8} meer
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
