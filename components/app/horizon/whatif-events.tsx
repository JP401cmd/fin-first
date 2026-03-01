'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { LIFE_EVENT_CATALOG, type LifeEvent } from '@/lib/horizon-data'
import type { SimResult } from '@/lib/fire-simulation'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import {
  Calendar, Plus, ChevronDown, ChevronUp, Eye, EyeOff, Info,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WhatIfEvent extends LifeEvent {
  /** Temporarily disabled in what-if (not persisted) */
  whatIfDisabled?: boolean
}

interface EventImpact {
  event: WhatIfEvent
  fireAgeWith: number | null
  fireAgeWithout: number | null
  deltaMonths: number | null
  totalCost: number
}

// ── WhatIfEventsPanel ────────────────────────────────────────────────────────

export function WhatIfEventsPanel({
  events,
  onToggleEvent,
  onAddEvent,
  onRemoveEvent,
  baselineFireAge,
  computeImpact,
}: {
  events: WhatIfEvent[]
  onToggleEvent: (id: string) => void
  onAddEvent: (event: WhatIfEvent) => void
  onRemoveEvent: (id: string) => void
  baselineFireAge: number | null
  computeImpact: (eventId: string) => EventImpact | null
}) {
  const [expanded, setExpanded] = useState(true)
  const [showCatalog, setShowCatalog] = useState(false)
  const [selectedImpact, setSelectedImpact] = useState<EventImpact | null>(null)

  const activeCount = events.filter(e => !e.whatIfDisabled).length
  const totalCount = events.length

  return (
    <>
      <div className="card-editorial overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-horizon-600" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
              Levensgebeurtenissen
            </span>
            <span className="rounded-full bg-horizon-50 px-1.5 py-0.5 font-mono text-[10px] text-horizon-700">
              {activeCount}/{totalCount}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4">
            {events.length === 0 ? (
              <p className="py-4 text-center font-sans text-[11px] text-[var(--ink-4)]">
                Geen levensgebeurtenissen ingesteld.
                <br />
                Voeg er een toe vanuit de catalogus.
              </p>
            ) : (
              <div className="divide-y divide-dashed divide-[var(--border-ed)]">
                {events.map(ev => {
                  const isActive = !ev.whatIfDisabled
                  const catalog = LIFE_EVENT_CATALOG[ev.event_type]
                  const icon = EVENT_ICONS[ev.icon] ?? EVENT_ICONS[catalog?.icon ?? 'Calendar'] ?? <Calendar className="h-4 w-4" />

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-center gap-3 py-2.5 transition-opacity ${isActive ? '' : 'opacity-40'}`}
                    >
                      {/* Icon */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)] text-horizon-600">
                        {icon}
                      </div>

                      {/* Label + meta */}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          const impact = computeImpact(ev.id)
                          if (impact) setSelectedImpact(impact)
                        }}
                      >
                        <p className="truncate font-sans text-sm font-medium text-[var(--ink)]">
                          {ev.name}
                        </p>
                        <p className="font-sans text-[10px] text-[var(--ink-4)]">
                          {ev.target_age ? `leeftijd ${ev.target_age}` : '—'}
                          {Number(ev.one_time_cost) !== 0 && ` · ${formatCurrency(Number(ev.one_time_cost))}`}
                          {Number(ev.monthly_cost_change) !== 0 && ` · ${formatCurrency(Number(ev.monthly_cost_change))}/mnd`}
                        </p>
                      </button>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => onToggleEvent(ev.id)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors ${
                          isActive
                            ? 'text-horizon-600 hover:bg-horizon-50'
                            : 'text-[var(--ink-4)] hover:bg-[var(--subtle)]'
                        }`}
                        title={isActive ? 'Uitzetten in scenario' : 'Aanzetten in scenario'}
                      >
                        {isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>

                      {/* Remove (only for what-if added events) */}
                      {ev.id.startsWith('whatif-') && (
                        <button
                          type="button"
                          onClick={() => onRemoveEvent(ev.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Verwijderen uit scenario"
                        >
                          <span className="text-xs">×</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add event button */}
            <button
              type="button"
              onClick={() => setShowCatalog(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Gebeurtenis toevoegen
            </button>
          </div>
        )}
      </div>

      {/* ── Catalog BottomSheet ──────────────────────────── */}
      <BottomSheet
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        title="Gebeurtenis toevoegen"
      >
        <div className="space-y-1.5">
          {Object.entries(LIFE_EVENT_CATALOG)
            .filter(([key]) => key !== 'aow' && key !== 'pension')
            .map(([key, cat]) => {
              const icon = EVENT_ICONS[cat.icon] ?? <Calendar className="h-4 w-4" />
              const alreadyAdded = events.some(e => e.event_type === key && e.id.startsWith('whatif-'))

              return (
                <button
                  key={key}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => {
                    const newEvent: WhatIfEvent = {
                      id: `whatif-${key}-${Date.now()}`,
                      name: cat.label,
                      event_type: key,
                      target_age: cat.defaultAge ?? null,
                      target_date: null,
                      one_time_cost: cat.defaultCost,
                      monthly_cost_change: cat.defaultMonthlyCost,
                      monthly_income_change: cat.defaultMonthlyIncome,
                      duration_months: cat.defaultDuration,
                      icon: cat.icon,
                      is_active: true,
                      sort_order: events.length,
                      is_indexed: true,
                    }
                    onAddEvent(newEvent)
                    setShowCatalog(false)
                  }}
                  className={`flex w-full items-center gap-3 rounded-[var(--r)] px-3 py-2.5 text-left transition-colors ${
                    alreadyAdded
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-[var(--subtle)]'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-horizon-50 text-horizon-600">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-medium text-[var(--ink)]">{cat.label}</p>
                    <p className="font-sans text-[11px] text-[var(--ink-3)]">{cat.description}</p>
                  </div>
                  {cat.defaultCost !== 0 && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                      {formatCurrency(cat.defaultCost)}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
        <p className="mt-4 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Bedragen zijn standaardwaarden — pas ze aan op de Horizon pagina.
        </p>
      </BottomSheet>

      {/* ── Impact Kassabon BottomSheet ──────────────────── */}
      <BottomSheet
        open={selectedImpact !== null}
        onClose={() => setSelectedImpact(null)}
        title={selectedImpact?.event.name ?? 'Impact'}
      >
        {selectedImpact && (
          <EventImpactKassabon impact={selectedImpact} />
        )}
      </BottomSheet>
    </>
  )
}

// ── EventImpactKassabon ──────────────────────────────────────────────────────

function EventImpactKassabon({ impact }: { impact: EventImpact }) {
  const { event, fireAgeWith, fireAgeWithout, deltaMonths, totalCost } = impact
  const catalog = LIFE_EVENT_CATALOG[event.event_type]

  const absDelta = Math.abs(deltaMonths ?? 0)
  const deltaYears = Math.floor(absDelta / 12)
  const deltaRemainder = absDelta % 12
  const isPositive = (deltaMonths ?? 0) < 0 // negative delta = FIRE earlier = good
  const deltaLabel = deltaYears > 0
    ? `${deltaYears} jaar${deltaRemainder > 0 ? ` en ${deltaRemainder} mnd` : ''}`
    : `${deltaRemainder} maanden`

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          IMPACT OP FIRE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          {event.name} · leeftijd {event.target_age ?? '—'}
        </p>
      </div>

      {/* Uitleg */}
      {catalog?.description && (
        <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          {catalog.description}.{' '}
          {catalog.tip && <span>{catalog.tip}.</span>}
        </div>
      )}

      {/* Regelitems */}
      <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        {Number(event.one_time_cost) !== 0 && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Eenmalige kosten</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Number(event.one_time_cost))}</span>
          </div>
        )}
        {Number(event.monthly_cost_change) !== 0 && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Maandelijkse kosten</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Number(event.monthly_cost_change))}/mnd</span>
          </div>
        )}
        {Number(event.monthly_income_change) !== 0 && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Inkomenswijziging</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Number(event.monthly_income_change))}/mnd</span>
          </div>
        )}
        {Number(event.duration_months) > 0 && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Duur</span>
            <span className="tabular-nums text-[var(--ink)]">{event.duration_months} maanden</span>
          </div>
        )}
      </div>

      {/* Totaal kosten */}
      {totalCost !== 0 && (
        <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
          <span className="text-[var(--ink)]">Totale kosten</span>
          <span className="tabular-nums text-[var(--ink)]">{formatCurrency(totalCost)}</span>
        </div>
      )}

      {/* FIRE impact */}
      {deltaMonths !== null && (
        <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">FIRE zonder dit event</span>
            <span className="tabular-nums text-[var(--ink)]">
              {fireAgeWithout !== null ? `${Math.floor(fireAgeWithout)} jaar` : 'n.v.t.'}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">FIRE met dit event</span>
            <span className="tabular-nums text-[var(--ink)]">
              {fireAgeWith !== null ? `${Math.floor(fireAgeWith)} jaar` : 'n.v.t.'}
            </span>
          </div>

          {absDelta > 0 && (
            <div className={`mt-2 rounded-[var(--r-sm)] px-3 py-2 text-center font-sans text-[11px] font-medium ${
              isPositive
                ? 'border border-dashed border-horizon-300 bg-horizon-50/50 text-horizon-700'
                : 'border border-dashed border-kern-300 bg-kern-50/50 text-kern-700'
            }`}>
              {isPositive
                ? `↑ Versnelt FIRE met ${deltaLabel}`
                : `↓ Vertraagt FIRE met ${deltaLabel}`
              }
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
        Gebaseerd op de huidige simulatie-parameters
      </p>
    </KassabonShell>
  )
}
