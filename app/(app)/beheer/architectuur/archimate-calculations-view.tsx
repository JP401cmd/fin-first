'use client'

// Berekeningen-view: de rekenmotoren die brongegevens omzetten naar de cijfers
// die de gebruiker ziet. Gegroepeerd per domein; elke berekening toont
// invoer → formule → uitvoer, bronbestanden, constanten en koppelingen naar de
// plaat-elementen, ADR's en aandachtspunten die erbij horen.

import { useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { ARCHI_KIND_META, type ArchimateModel } from '@/lib/architecture/archimate-model'
import { ARCHI_CONCERNS } from '@/lib/architecture/archimate-concerns'
import { calculationsByDomain, type Calculation } from '@/lib/architecture/calculations'
import type { ArchInsights } from '@/lib/architecture/facts'

interface Props {
  model: ArchimateModel
  insights: ArchInsights
  /** Open een element op de ArchiMate-plaat (schakelt naar de plaat-view) */
  onOpenElement: (id: string) => void
}

const DOMAIN_ACCENT: Record<string, string> = {
  Cashflow: 'var(--color-kern-500)',
  Vermogen: 'var(--color-kern-700)',
  Belasting: 'var(--color-wil-500)',
  'Toekomst (FIRE)': 'var(--color-horizon-500)',
}

export function ArchimateCalculationsView({ model, insights, onOpenElement }: Props) {
  const groups = calculationsByDomain()
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const [open, setOpen] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  function relatedConcerns(calc: Calculation) {
    return ARCHI_CONCERNS.filter((c) => c.elementIds.some((e) => calc.elementIds.includes(e)))
  }
  function relatedAdrs(calc: Calculation) {
    return insights.adrs.filter((a) => a.elements.some((e) => calc.elementIds.includes(e)))
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span aria-hidden="true" className="mr-2.5 inline-block h-px w-7 bg-[var(--rule-soft)] align-middle" />
          Rekenmotoren · {groups.reduce((s, g) => s + g.items.length, 0)} berekeningen
        </p>
        <h2 className="mt-2 font-serif text-2xl font-bold text-[var(--ink)]">
          Wat er met de <em className="font-serif italic font-normal text-[var(--ink-2)]">brongegevens</em> gebeurt
        </h2>
        <p className="mt-3 max-w-[68ch] border-l-2 border-[var(--rule-soft)] pl-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Van ruwe transacties en saldi naar spaarquote, netto vermogen, belastingdruk en FIRE-datum. Elke berekening
          wijst naar haar bronbestand, constanten en de plaat-elementen waar ze speelt.
        </p>
      </header>

      {groups.map((group) => (
        <section key={group.domain}>
          <div className="mb-3 flex items-center gap-2 border-b border-[var(--border-ed)] pb-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-3" style={{ backgroundColor: DOMAIN_ACCENT[group.domain] ?? 'var(--ink-3)' }} />
            <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-2)]">{group.domain}</h3>
            <span className="font-mono text-[10px] text-[var(--ink-4)]">{group.items.length}</span>
          </div>

          <div className="space-y-2.5">
            {group.items.map((calc) => {
              const isOpen = open.has(calc.id)
              const concerns = relatedConcerns(calc)
              const adrs = relatedAdrs(calc)
              return (
                <div key={calc.id} className="border border-[var(--border-ed)] bg-[var(--paper)]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(calc.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
                  >
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-serif text-base font-bold text-[var(--ink)]">{calc.title}</span>
                        {concerns.length > 0 && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--negative)]">
                            {concerns.length} aandachtspunt{concerns.length === 1 ? '' : 'en'}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-[var(--ink-2)]">{calc.summary}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-[var(--border-ed)] px-4 py-4">
                      {/* invoer → formule → uitvoer */}
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Brongegevens</p>
                          <ul className="space-y-0.5">
                            {calc.inputs.map((i) => (
                              <li key={i} className="font-mono text-[11px] text-[var(--ink-2)]">{i}</li>
                            ))}
                          </ul>
                        </div>
                        <ArrowRight className="hidden h-4 w-4 text-[var(--ink-3)] sm:block" aria-hidden="true" />
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Uitkomst</p>
                          <ul className="space-y-0.5">
                            {calc.outputs.map((o) => (
                              <li key={o} className="font-mono text-[11px] text-[var(--ink)]">{o}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {calc.formula && (
                        <div className="border-l-2 border-[var(--ink)] bg-[var(--subtle)] px-3 py-2">
                          <p className="font-mono text-xs text-[var(--ink)]">{calc.formula}</p>
                        </div>
                      )}

                      {calc.constants && calc.constants.length > 0 && (
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Aannames / constanten</p>
                          <div className="space-y-0.5">
                            {calc.constants.map((c) => (
                              <div key={c.label} className="flex items-baseline justify-between gap-3 text-xs">
                                <span className="text-[var(--ink-2)]">{c.label}</span>
                                <span className="font-mono text-[var(--ink)]">{c.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {calc.note && (
                        <p className="border-l-2 border-[var(--color-horizon-500)] pl-3 font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
                          {calc.note}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-6 gap-y-3">
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Bronbestanden</p>
                          <div className="flex flex-wrap gap-1.5">
                            {calc.files.map((f) => (
                              <span key={f} className="border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-2)]">{f}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Functies</p>
                          <div className="flex flex-wrap gap-1.5">
                            {calc.functions.map((fn) => (
                              <span key={fn} className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink)]">{fn}()</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* koppelingen naar de plaat */}
                      <div>
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Op de plaat</p>
                        <div className="flex flex-wrap gap-1.5">
                          {calc.elementIds.map((id) => {
                            const n = byId.get(id)
                            if (!n) return null
                            const m = ARCHI_KIND_META[n.kind]
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => onOpenElement(id)}
                                className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
                              >
                                <i aria-hidden="true" className="h-2 w-2.5 border" style={{ backgroundColor: m.fill, borderColor: m.stroke }} />
                                {n.title}
                                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]">→ plaat</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {concerns.length > 0 && (
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Aandachtspunten</p>
                          <div className="space-y-1.5">
                            {concerns.map((c) => (
                              <div key={c.id} className="border-l-2 border-[var(--negative)] bg-[var(--subtle)] px-3 py-1.5">
                                <p className="text-[13px] font-medium text-[var(--ink)]">{c.title}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">{c.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {adrs.length > 0 && (
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">Besluiten (ADR)</p>
                          <div className="space-y-1.5">
                            {adrs.map((a) => (
                              <div key={a.id} className="border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1.5">
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
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
