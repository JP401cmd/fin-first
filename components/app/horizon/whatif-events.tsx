'use client'

import { useState, useMemo } from 'react'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { LIFE_EVENT_CATALOG, type LifeEvent, type CatalogField } from '@/lib/horizon-data'
import type { SimResult } from '@/lib/fire-simulation'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import {
  Calendar, Plus, ChevronDown, ChevronUp, Eye, EyeOff, Info, Clock,
  ArrowLeft, Check, Pencil,
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

/** Form state for creating/editing a life event */
interface EventFormState {
  eventType: string
  name: string
  targetAge: number | null
  oneTimeCost: number
  monthlyCostChange: number
  monthlyIncomeChange: number
  durationMonths: number
  metadata: Record<string, unknown>
}

// ── WhatIfEventsPanel ────────────────────────────────────────────────────────

export function WhatIfEventsPanel({
  events,
  onToggleEvent,
  onAddEvent,
  onRemoveEvent,
  onEditEvent,
  baselineFireAge,
  computeImpact,
  dailyExpenses,
  isHousehold = false,
}: {
  events: WhatIfEvent[]
  onToggleEvent: (id: string) => void
  onAddEvent: (event: WhatIfEvent) => void
  onRemoveEvent: (id: string) => void
  onEditEvent?: (id: string, updated: WhatIfEvent) => void
  baselineFireAge: number | null
  computeImpact: (eventId: string) => EventImpact | null
  /** Daily expenses for freedom-time calc (optional — hides freedom time if missing) */
  dailyExpenses?: number
  /** Whether user has a household (enables household-only events) */
  isHousehold?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const [showCatalog, setShowCatalog] = useState(false)
  const [selectedImpact, setSelectedImpact] = useState<EventImpact | null>(null)
  const [formState, setFormState] = useState<EventFormState | null>(null)
  /** The event being edited (null = creating new) */
  const [editingEventId, setEditingEventId] = useState<string | null>(null)

  const activeCount = events.filter(e => !e.whatIfDisabled).length
  const totalCount = events.length

  /** Open the event form for a catalog entry */
  function openFormForCatalog(key: string) {
    const cat = LIFE_EVENT_CATALOG[key]
    if (!cat) return

    // Build initial metadata from field defaults
    const initialMeta: Record<string, unknown> = {}
    for (const field of cat.fields ?? []) {
      initialMeta[field.key] = field.default
    }

    setFormState({
      eventType: key,
      name: cat.label,
      targetAge: cat.defaultAge ?? null,
      oneTimeCost: cat.defaultCost,
      monthlyCostChange: cat.defaultMonthlyCost,
      monthlyIncomeChange: cat.defaultMonthlyIncome,
      durationMonths: cat.defaultDuration,
      metadata: initialMeta,
    })
    setShowCatalog(false)
  }

  /** Open the form to edit an existing event */
  function openFormForEdit(ev: WhatIfEvent) {
    setEditingEventId(ev.id)
    setFormState({
      eventType: ev.event_type,
      name: ev.name,
      targetAge: ev.target_age ?? null,
      oneTimeCost: Number(ev.one_time_cost) || 0,
      monthlyCostChange: Number(ev.monthly_cost_change) || 0,
      monthlyIncomeChange: Number(ev.monthly_income_change) || 0,
      durationMonths: Number(ev.duration_months) || 0,
      metadata: ev.metadata ?? {},
    })
  }

  /** Submit the form — create new or update existing event */
  function handleFormSubmit() {
    if (!formState) return
    const cat = LIFE_EVENT_CATALOG[formState.eventType]
    if (!cat) return

    if (editingEventId && onEditEvent) {
      // ── Edit mode ──
      const existingEvent = events.find(e => e.id === editingEventId)

      if (existingEvent && !existingEvent.id.startsWith('whatif-')) {
        // DB event → create a what-if copy with modified values, remove original from what-if list
        const copyEvent: WhatIfEvent = {
          id: `whatif-copy-${existingEvent.event_type}-${Date.now()}`,
          name: formState.name,
          event_type: formState.eventType,
          target_age: formState.targetAge,
          target_date: null,
          one_time_cost: formState.oneTimeCost,
          monthly_cost_change: formState.monthlyCostChange,
          monthly_income_change: formState.monthlyIncomeChange,
          duration_months: formState.durationMonths,
          icon: cat.icon,
          is_active: true,
          sort_order: existingEvent.sort_order,
          is_indexed: true,
          metadata: formState.metadata,
        }
        // Replace original with copy
        onEditEvent(editingEventId, copyEvent)
      } else {
        // What-if event → update in-place
        const updatedEvent: WhatIfEvent = {
          ...(existingEvent ?? {}),
          id: editingEventId,
          name: formState.name,
          event_type: formState.eventType,
          target_age: formState.targetAge,
          target_date: null,
          one_time_cost: formState.oneTimeCost,
          monthly_cost_change: formState.monthlyCostChange,
          monthly_income_change: formState.monthlyIncomeChange,
          duration_months: formState.durationMonths,
          icon: cat.icon,
          is_active: true,
          sort_order: existingEvent?.sort_order ?? events.length,
          is_indexed: true,
          metadata: formState.metadata,
        }
        onEditEvent(editingEventId, updatedEvent)
      }

      setEditingEventId(null)
      setFormState(null)
    } else {
      // ── Create mode ──
      // Auto-suffix duplicate event names: "Kinderen" → "Kinderen (2)", "Kinderen (3)", ...
      const sameTypeCount = events.filter(e => e.event_type === formState.eventType).length
      const eventName = sameTypeCount > 0
        ? `${formState.name} (${sameTypeCount + 1})`
        : formState.name
      const newEvent: WhatIfEvent = {
        id: `whatif-${formState.eventType}-${Date.now()}`,
        name: eventName,
        event_type: formState.eventType,
        target_age: formState.targetAge,
        target_date: null,
        one_time_cost: formState.oneTimeCost,
        monthly_cost_change: formState.monthlyCostChange,
        monthly_income_change: formState.monthlyIncomeChange,
        duration_months: formState.durationMonths,
        icon: cat.icon,
        is_active: true,
        sort_order: events.length,
        is_indexed: true,
        metadata: formState.metadata,
      }
      onAddEvent(newEvent)
      setFormState(null)
    }
  }

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

                      {/* Edit */}
                      {onEditEvent && (
                        <button
                          type="button"
                          onClick={() => openFormForEdit(ev)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-4)] transition-colors hover:bg-wil-50 hover:text-wil-600"
                          title="Bewerken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}

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
            .filter(([key, cat]) => key !== 'aow' && key !== 'pension' && (!cat.householdOnly || isHousehold))
            .map(([key, cat]) => {
              const icon = EVENT_ICONS[cat.icon] ?? <Calendar className="h-4 w-4" />
              const existingCount = events.filter(e => e.event_type === key && e.id.startsWith('whatif-')).length

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => openFormForCatalog(key)}
                  className="flex w-full items-center gap-3 rounded-[var(--r)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-horizon-50 text-horizon-600">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-medium text-[var(--ink)]">{cat.label}</p>
                    <p className="font-sans text-[11px] text-[var(--ink-3)]">{cat.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {existingCount > 0 && (
                      <span className="rounded-full bg-horizon-100 px-1.5 py-0.5 text-[10px] font-medium text-horizon-700">
                        {existingCount}×
                      </span>
                    )}
                    {cat.defaultCost !== 0 && (
                      <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                        {formatCurrency(cat.defaultCost)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
        </div>
        <p className="mt-4 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Kies een gebeurtenis om het formulier in te vullen.
        </p>
      </BottomSheet>

      {/* ── Event Form BottomSheet ──────────────────────── */}
      <BottomSheet
        open={formState !== null}
        onClose={() => { setFormState(null); setEditingEventId(null) }}
        title={
          editingEventId
            ? `${formState ? LIFE_EVENT_CATALOG[formState.eventType]?.label ?? 'Gebeurtenis' : 'Gebeurtenis'} bewerken`
            : formState ? LIFE_EVENT_CATALOG[formState.eventType]?.label ?? 'Gebeurtenis' : 'Gebeurtenis'
        }
      >
        {formState && (
          <EventFormSheet
            form={formState}
            onChange={setFormState}
            onSubmit={handleFormSubmit}
            onBack={editingEventId
              ? () => { setFormState(null); setEditingEventId(null) }
              : () => { setFormState(null); setShowCatalog(true) }
            }
            dailyExpenses={dailyExpenses}
            isEditing={editingEventId !== null}
            isDbEvent={editingEventId !== null && !editingEventId.startsWith('whatif-')}
          />
        )}
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

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <h3 className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        {label}
      </h3>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

// ── EventFormSheet ──────────────────────────────────────────────────────────

function EventFormSheet({
  form,
  onChange,
  onSubmit,
  onBack,
  dailyExpenses,
  isEditing = false,
  isDbEvent = false,
}: {
  form: EventFormState
  onChange: (f: EventFormState) => void
  onSubmit: () => void
  onBack: () => void
  dailyExpenses?: number
  isEditing?: boolean
  isDbEvent?: boolean
}) {
  const catalog = LIFE_EVENT_CATALOG[form.eventType]
  if (!catalog) return null

  const fields = catalog.fields ?? []

  // Compute summary values
  const totalImpact = useMemo(() => {
    const oneTime = Math.abs(form.oneTimeCost)
    const monthlyNet = form.monthlyCostChange + Math.abs(form.monthlyIncomeChange < 0 ? form.monthlyIncomeChange : 0)
    const durationTotal = form.durationMonths > 0 ? monthlyNet * form.durationMonths : 0
    return oneTime + durationTotal
  }, [form.oneTimeCost, form.monthlyCostChange, form.monthlyIncomeChange, form.durationMonths])

  const freedomTimeStr = useMemo(() => {
    if (!dailyExpenses || dailyExpenses <= 0 || totalImpact <= 0) return null
    const breakdown = calculateFreedomTime(totalImpact, dailyExpenses)
    return formatFreedomTimeString(breakdown, 'long', true)
  }, [totalImpact, dailyExpenses])

  function updateField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    onChange({ ...form, [key]: value })
  }

  function updateMeta(key: string, value: unknown) {
    onChange({ ...form, metadata: { ...form.metadata, [key]: value } })
  }

  return (
    <div className="space-y-5">
      {/* Description / tip */}
      {catalog.tip && (
        <div className="flex items-start gap-2 rounded-[var(--r-sm)] bg-horizon-50/50 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-horizon-600" />
          <p className="font-sans text-[11px] leading-relaxed text-horizon-700">
            {catalog.tip}
          </p>
        </div>
      )}

      {/* ── Sectie: Basis ──────────────────────────────── */}
      <div>
        <SectionHeader label="Basis" />
        <div className="space-y-3">
          {/* Naam */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Naam
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-sans text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
              placeholder={catalog.label}
            />
          </div>

          {/* Leeftijd */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Op welke leeftijd?
            </label>
            <input
              type="number"
              value={form.targetAge ?? ''}
              onChange={e => updateField('targetAge', e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
              placeholder="bijv. 35"
              min={18}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* ── Sectie: Details (event-specific fields) ──── */}
      {fields.length > 0 && (
        <div>
          <SectionHeader label="Details" />
          <div className="space-y-3">
            {fields.map(field => (
              <CatalogFieldInput
                key={field.key}
                field={field}
                value={form.metadata[field.key] ?? field.default}
                onChange={val => updateMeta(field.key, val)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Sectie: Financiële impact ──────────────── */}
      <div>
        <SectionHeader label="Financiële impact" />
        <div className="space-y-3">
          {/* Eenmalige kosten */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Eenmalige kosten
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-sans text-sm text-[var(--ink-3)]">€</span>
              <input
                type="number"
                value={form.oneTimeCost}
                onChange={e => updateField('oneTimeCost', Number(e.target.value) || 0)}
                className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-8 pr-3 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
              />
            </div>
          </div>

          {/* Maandelijkse kosten */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Maandelijkse kosten
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-sans text-sm text-[var(--ink-3)]">€</span>
              <input
                type="number"
                value={form.monthlyCostChange}
                onChange={e => updateField('monthlyCostChange', Number(e.target.value) || 0)}
                className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-8 pr-3 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[11px] text-[var(--ink-4)]">/mnd</span>
            </div>
          </div>

          {/* Inkomenswijziging */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Inkomenswijziging
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-sans text-sm text-[var(--ink-3)]">€</span>
              <input
                type="number"
                value={form.monthlyIncomeChange}
                onChange={e => updateField('monthlyIncomeChange', Number(e.target.value) || 0)}
                className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-8 pr-3 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[11px] text-[var(--ink-4)]">/mnd</span>
            </div>
          </div>

          {/* Duur */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Duur
            </label>
            <div className="relative">
              <input
                type="number"
                value={form.durationMonths}
                onChange={e => updateField('durationMonths', Number(e.target.value) || 0)}
                className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
                min={0}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[11px] text-[var(--ink-4)]">maanden</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Samenvattingskaart ──────────────────────── */}
      <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
        <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Samenvatting
        </p>

        <div className="space-y-1.5">
          {form.oneTimeCost !== 0 && (
            <div className="flex justify-between">
              <span className="font-sans text-[11px] text-[var(--ink-2)]">Eenmalige kosten</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                {formatCurrency(form.oneTimeCost)}
              </span>
            </div>
          )}
          {form.monthlyCostChange !== 0 && (
            <div className="flex justify-between">
              <span className="font-sans text-[11px] text-[var(--ink-2)]">Maandelijkse impact</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                {formatCurrency(form.monthlyCostChange)}/mnd
              </span>
            </div>
          )}
          {form.monthlyIncomeChange !== 0 && (
            <div className="flex justify-between">
              <span className="font-sans text-[11px] text-[var(--ink-2)]">Inkomenswijziging</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                {formatCurrency(form.monthlyIncomeChange)}/mnd
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="my-2.5 border-t border-dashed border-[var(--border-md)]" />

        {/* Total */}
        <div className="flex justify-between">
          <span className="font-sans text-xs font-semibold text-[var(--ink)]">Totale impact</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(totalImpact)}
          </span>
        </div>

        {/* Freedom time */}
        {freedomTimeStr && (
          <div className="mt-2 flex items-center justify-between rounded-[var(--r-sm)] bg-horizon-50/80 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-horizon-600" />
              <span className="font-sans text-[11px] font-medium text-horizon-700">Vrijheidstijd</span>
            </div>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-horizon-700">
              {freedomTimeStr}
            </span>
          </div>
        )}
      </div>

      {/* ── DB event notice ────────────────────────── */}
      {isEditing && isDbEvent && (
        <div className="flex items-start gap-2 rounded-[var(--r-sm)] bg-wil-50/50 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wil-600" />
          <p className="font-sans text-[11px] leading-relaxed text-wil-700">
            Dit is een bestaande gebeurtenis. Wijzigingen worden alleen in dit scenario toegepast — het origineel op de Horizon-pagina blijft ongewijzigd.
          </p>
        </div>
      )}

      {/* ── Actions ────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-[var(--r)] px-4 py-2.5 font-sans text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isEditing ? 'Annuleren' : 'Terug'}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!form.name.trim()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-horizon-600 px-4 py-2.5 font-sans text-[11px] font-medium text-white transition-colors hover:bg-horizon-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="h-3.5 w-3.5" />
          {isEditing ? 'Wijzigingen toepassen' : 'Toevoegen aan scenario'}
        </button>
      </div>
    </div>
  )
}

// ── CatalogFieldInput ───────────────────────────────────────────────────────

function CatalogFieldInput({
  field,
  value,
  onChange,
}: {
  field: CatalogField
  value: unknown
  onChange: (val: unknown) => void
}) {
  const { key, label, fieldType, tip, options, suffix } = field

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <label className="font-sans text-[11px] font-medium text-[var(--ink-2)]">
          {label}
        </label>
        {tip && (
          <span className="group relative">
            <Info className="h-3 w-3 cursor-help text-[var(--ink-4)]" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-normal rounded-[var(--r-sm)] bg-[var(--ink)] px-2.5 py-1.5 font-sans text-[10px] leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 max-w-[200px] sm:max-w-[260px]">
              {tip}
            </span>
          </span>
        )}
      </div>

      {fieldType === 'number' && (
        <div className="relative">
          <input
            type="number"
            value={value as number}
            onChange={e => onChange(Number(e.target.value) || 0)}
            className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[11px] text-[var(--ink-4)]">
              {suffix}
            </span>
          )}
        </div>
      )}

      {fieldType === 'percentage' && (
        <div className="relative">
          <input
            type="number"
            value={value as number}
            onChange={e => onChange(Number(e.target.value) || 0)}
            step={0.1}
            className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[11px] text-[var(--ink-4)]">
            {suffix ?? '%'}
          </span>
        </div>
      )}

      {fieldType === 'select' && options && (
        <select
          value={String(value)}
          onChange={e => {
            // Preserve number type if the option value is numeric
            const opt = options.find(o => String(o.value) === e.target.value)
            onChange(opt ? opt.value : e.target.value)
          }}
          className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-sans text-sm text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400"
        >
          {options.map(opt => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {fieldType === 'toggle' && (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            value ? 'bg-horizon-600' : 'bg-[var(--border-md)]'
          }`}
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={label}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      )}
    </div>
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
