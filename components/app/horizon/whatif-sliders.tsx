'use client'

import { formatCurrency } from '@/lib/format'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import {
  buildSliderEvent,
  applySliderEvent,
  readSliderValueFromEvents,
  clearScenarioEvents,
  type SliderKey,
} from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { WhatIfDevelopmentNotice } from '@/components/app/horizon/whatif-development-notice'

/**
 * WhatIfOverrides is now a derived view, but kept as a public type for
 * components that still consume the snapshot shape (WhatIfActions / Chat /
 * Scenarios). Pages compute it via deriveOverridesFromEvents.
 */
export interface WhatIfOverrides {
  monthlyIncome: number
  workDaysPerWeek: number
  savingsRate: number
  expectedReturn: number
  extraContribution: number
}

interface SlidersProps {
  baseline: WhatIfOverrides
  events: WhatIfEvent[]
  setEvents: (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => void
  currentAge: number
  /** When true, render only the slider grid — no card wrapper, no headers. */
  bare?: boolean
  /**
   * Toont de "nog in ontwikkeling"-notice bovenaan de collapsible (default: true).
   * De inline `?whatif=open`-modal (horizon-client) rendert deze component zonder
   * prop → notice zichtbaar. De volledige what-if-pagina toont de notice zelf al
   * bovenaan en zet deze daarom op `false` (voorkomt dubbele weergave).
   */
  developmentNotice?: boolean
}

function DeltaBadge({ current, base, format }: { current: number; base: number; format: (v: number) => string }) {
  const diff = current - base
  if (Math.abs(diff) < 0.001) return null
  const isPositive = diff > 0
  return (
    <span className={`ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
      isPositive ? 'bg-horizon-50 text-horizon-700' : 'bg-kern-50 text-kern-700'
    }`}>
      {isPositive ? '+' : ''}{format(diff)}
    </span>
  )
}

function SliderRow({
  label,
  value,
  baseValue,
  min,
  max,
  step,
  formatValue,
  formatDelta,
  onChange,
  minLabel,
  maxLabel,
  hint,
}: {
  label: string
  value: number
  baseValue: number
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  formatDelta: (v: number) => string
  onChange: (v: number) => void
  minLabel: string
  maxLabel: string
  /** Optional micro-hint shown right of the label, e.g. event-event link. */
  hint?: string
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {label}
          {hint && (
            <span className="ml-2 font-mono text-[9px] font-normal normal-case tracking-normal text-[var(--ink-4)]">
              {hint}
            </span>
          )}
        </span>
        <span className="flex items-center">
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatValue(value)}
          </span>
          <DeltaBadge current={value} base={baseValue} format={formatDelta} />
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-horizon-600"
      />
      <div className="flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

function SliderGrid({ baseline, events, setEvents, currentAge }: SlidersProps) {
  const incomeValue = readSliderValueFromEvents('income', events, baseline)
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const extraValue = readSliderValueFromEvents('extra_inleg', events, baseline)

  const setSliderValue = (key: SliderKey, value: number) => {
    const newEvent = buildSliderEvent(key, value, baseline, currentAge)
    setEvents(prev => applySliderEvent(prev, key, newEvent))
  }

  const hasSliderEvent = events.some(e => e.scenario_origin?.startsWith('slider:'))

  const resetAll = () => {
    setEvents(prev => clearScenarioEvents(prev, 'slider:'))
  }

  return (
    <>
      <div className="xl:grid xl:grid-cols-2 xl:gap-x-6">
        <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
          <SliderRow
            label="Maandinkomen"
            hint="→ Inkomenswijziging-event"
            value={incomeValue}
            baseValue={baseline.monthlyIncome}
            min={0}
            max={15000}
            step={100}
            formatValue={formatCurrency}
            formatDelta={v => formatCurrency(v) + '/mnd'}
            onChange={v => setSliderValue('income', v)}
            minLabel="€ 0"
            maxLabel="€ 15.000"
          />
        </div>

        <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
          <SliderRow
            label="Werkdagen per week"
            hint="→ Part-time-event"
            value={workdaysValue}
            baseValue={baseline.workDaysPerWeek}
            min={1}
            max={5}
            step={1}
            formatValue={v => `${v} dagen`}
            formatDelta={v => `${v} dag${Math.abs(v) !== 1 ? 'en' : ''}`}
            onChange={v => setSliderValue('workdays', v)}
            minLabel="1 dag"
            maxLabel="5 dagen"
          />
        </div>

        <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
          <SliderRow
            label="Spaarquote"
            hint="→ Lifestyle-event"
            value={savingsValue}
            baseValue={baseline.savingsRate}
            min={0}
            max={80}
            step={1}
            formatValue={v => `${Math.round(v)}%`}
            formatDelta={v => `${Math.round(v)}%`}
            onChange={v => setSliderValue('savings', v)}
            minLabel="0%"
            maxLabel="80%"
          />
        </div>

        <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
          <SliderRow
            label="Extra inleg"
            hint="→ Extra-inleg-event"
            value={extraValue}
            baseValue={0}
            min={0}
            max={5000}
            step={50}
            formatValue={formatCurrency}
            formatDelta={v => formatCurrency(v) + '/mnd'}
            onChange={v => setSliderValue('extra_inleg', v)}
            minLabel="€ 0"
            maxLabel="€ 5.000"
          />
        </div>
      </div>

      {hasSliderEvent && (
        <button
          type="button"
          onClick={resetAll}
          className="mt-3 w-full rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-700"
        >
          Verfijn-events wissen
        </button>
      )}

      <p className="mt-3 font-sans text-[10px] leading-snug text-[var(--ink-4)]">
        Elke slider maakt of bewerkt een levensgebeurtenis in je scenario. Open
        het paneel Levensgebeurtenissen onderaan om ze handmatig aan te passen.
      </p>
    </>
  )
}

export function WhatIfSliders({ baseline, events, setEvents, currentAge, bare = false }: SlidersProps) {
  const [expanded, setExpanded] = useState(true)

  if (bare) {
    return <SliderGrid baseline={baseline} events={events} setEvents={setEvents} currentAge={currentAge} />
  }

  const incomeValue = readSliderValueFromEvents('income', events, baseline)
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const summary = `${formatCurrency(incomeValue)} · ${workdaysValue} dagen · ${Math.round(savingsValue)}%`

  return (
    <div className="card-editorial overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left md:hidden"
      >
        <div>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
            Scenario-parameters
          </p>
          {!expanded && (
            <p className="mt-0.5 font-mono text-xs text-[var(--ink-3)]">{summary}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        )}
      </button>

      <div className="hidden px-4 pb-3 pt-3 md:block">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
          Scenario-parameters
        </p>
      </div>

      <div className={`px-4 pb-4 ${expanded ? 'block' : 'hidden'} md:block`}>
        <SliderGrid baseline={baseline} events={events} setEvents={setEvents} currentAge={currentAge} />
      </div>
    </div>
  )
}

export function WhatIfSlidersCollapsible({
  baseline,
  events,
  setEvents,
  currentAge,
  developmentNotice = true,
}: SlidersProps) {
  // Auto-detect manual tuning: any slider-origin event present.
  const hasSliderEvent = events.some(e => e.is_scenario_only && e.scenario_origin?.startsWith('slider:'))
  const [userOpen, setUserOpen] = useState(false)
  const open = userOpen || hasSliderEvent

  return (
    <>
      {developmentNotice && <WhatIfDevelopmentNotice className="mb-3" />}
    <div className="card-editorial overflow-hidden">
      <button
        type="button"
        onClick={() => setUserOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
      >
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />
          <div>
            <p className="font-sans text-sm font-semibold text-[var(--ink)]">
              Verfijn handmatig
            </p>
            <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)]">
              Pas inkomen, sparen of extra inleg zelf aan — wordt opgeslagen als events
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-4 pb-4 pt-3">
          <SliderGrid baseline={baseline} events={events} setEvents={setEvents} currentAge={currentAge} />
        </div>
      )}
    </div>
    </>
  )
}
