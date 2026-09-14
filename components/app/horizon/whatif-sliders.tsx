'use client'

import { formatCurrency } from '@/lib/format'
import {
  buildSliderEvent,
  applySliderEvent,
  readSliderValueFromEvents,
  computeSliderUiRange,
  type SliderKey,
} from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'

/**
 * WhatIfOverrides is de baseline-snapshot waartegen de sliders hun events opbouwen
 * en teruglezen (`buildSliderEvent`/`readSliderValueFromEvents`).
 */
// Datacontract(en) wonen nu in @/lib/types/horizon-whatif (import-richting UI→lib).
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
export type { WhatIfOverrides }

interface SlidersProps {
  baseline: WhatIfOverrides
  events: WhatIfEvent[]
  setEvents: (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => void
  currentAge: number
}

export { computeSliderUiRange }

export function DeltaBadge({ current, base, format }: { current: number; base: number; format: (v: number) => string }) {
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
  // Basislijn-anker "nu": vaste notch op de positie van de werkelijke waarde (baseValue).
  // Decoratief/aria-hidden; het micro-label wordt verborgen als het te dicht bij een
  // rand-label zit (eenvoudige %-drempel) zodat het niet botst met min/max.
  const notchPct = max > min ? Math.max(0, Math.min(100, ((baseValue - min) / (max - min)) * 100)) : 0
  const showNuLabel = notchPct > 12 && notchPct < 88
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
      <div className="relative mt-1">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-20 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--ink-3)]"
          style={{ left: `${notchPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          aria-label={label}
          aria-valuetext={formatValue(value)}
          className="slider-module relative z-10 w-full"
          {...rangeTouchSeekProps}
        />
      </div>
      <div className="relative flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
        <span>{minLabel}</span>
        {showNuLabel && (
          <span
            aria-hidden
            className="absolute -translate-x-1/2 font-mono text-[10px] text-[var(--ink-3)]"
            style={{ left: `${notchPct}%` }}
          >
            nu
          </span>
        )}
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

function SliderGrid({
  baseline,
  events,
  setEvents,
  currentAge,
}: SlidersProps) {
  const incomeValue = readSliderValueFromEvents('income', events, baseline)
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const extraValue = readSliderValueFromEvents('extra_inleg', events, baseline)

  // Zichtbaar UI-bereik (±20% rond de basisstand) — met verbreding-vangnet zodat een opgeslagen
  // waarde buiten de band niet clampt. Validatie-clamps blijven ongewijzigd.
  const incomeRange = computeSliderUiRange('income', baseline.monthlyIncome, incomeValue)
  const workdaysRange = computeSliderUiRange('workdays', baseline.workDaysPerWeek, workdaysValue)
  const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, savingsValue)
  // Extra inleg = bóvenop je huidige inleg (basis 0); het bereik hangt aan het maandinkomen.
  const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, extraValue)
  const dayLabel = (n: number) => `${n} dag${n === 1 ? '' : 'en'}`

  const setSliderValue = (key: SliderKey, value: number) => {
    const newEvent = buildSliderEvent(key, value, baseline, currentAge)
    setEvents(prev => applySliderEvent(prev, key, newEvent))
  }

  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-x-6">
      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label="Maandinkomen"
          hint="→ Inkomenswijziging-event"
          value={incomeValue}
          baseValue={baseline.monthlyIncome}
          min={incomeRange.min}
          max={incomeRange.max}
          step={100}
          formatValue={formatCurrency}
          formatDelta={v => formatCurrency(v) + '/mnd'}
          onChange={v => setSliderValue('income', v)}
          minLabel={formatCurrency(incomeRange.min)}
          maxLabel={formatCurrency(incomeRange.max)}
        />
      </div>

      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label="Werkdagen per week"
          hint="→ Part-time-event"
          value={workdaysValue}
          baseValue={baseline.workDaysPerWeek}
          min={workdaysRange.min}
          max={workdaysRange.max}
          step={1}
          formatValue={v => `${v} dagen`}
          formatDelta={v => `${v} dag${Math.abs(v) !== 1 ? 'en' : ''}`}
          onChange={v => setSliderValue('workdays', v)}
          minLabel={dayLabel(workdaysRange.min)}
          maxLabel={dayLabel(workdaysRange.max)}
        />
      </div>

      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label="Spaarquote"
          hint="→ Spaarquote-event"
          value={savingsValue}
          baseValue={baseline.savingsRate}
          min={savingsRange.min}
          max={savingsRange.max}
          step={1}
          formatValue={v => `${Math.round(v)}%`}
          formatDelta={v => `${Math.round(v)}%`}
          onChange={v => setSliderValue('savings', v)}
          minLabel={`${savingsRange.min}%`}
          maxLabel={`${savingsRange.max}%`}
        />
      </div>

      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label="Extra inleg"
          hint="→ Extra-inleg-event"
          value={extraValue}
          baseValue={0}
          min={extraRange.min}
          max={extraRange.max}
          step={50}
          formatValue={formatCurrency}
          formatDelta={v => formatCurrency(v) + '/mnd'}
          onChange={v => setSliderValue('extra_inleg', v)}
          minLabel={formatCurrency(extraRange.min)}
          maxLabel={formatCurrency(extraRange.max)}
        />
      </div>
    </div>
  )
}

/**
 * De scenario-sliders op de tijdas van /toekomst ("Verken je aannames"). Rendert
 * alleen het slidergrid — geen kaart, geen kop, geen eigen reset: die leven in de
 * host-sectie. De losse kaartvariant verviel met de Wat-Als-pagina (ADR 0144).
 */
export function WhatIfSliders({ baseline, events, setEvents, currentAge }: SlidersProps) {
  return (
    <SliderGrid
      baseline={baseline}
      events={events}
      setEvents={setEvents}
      currentAge={currentAge}
    />
  )
}
