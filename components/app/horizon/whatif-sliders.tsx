'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  buildSliderEvent,
  applySliderEvent,
  readSliderValueFromEvents,
  computeSliderUiRange,
  savingsEuroForPp,
  type SliderKey,
} from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { HEFBOOM_COPY } from '@/lib/horizon/anker-copy'

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

function SliderGrid({ baseline, events, setEvents, currentAge }: SlidersProps) {
  const [minderWerkenOpen, setMinderWerkenOpen] = useState(false)
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const extraValue = readSliderValueFromEvents('extra_inleg', events, baseline)

  // Zichtbaar UI-bereik (±20% rond de basisstand) — met verbreding-vangnet zodat een opgeslagen
  // waarde buiten de band niet clampt. Validatie-clamps blijven ongewijzigd.
  const workdaysRange = computeSliderUiRange('workdays', baseline.workDaysPerWeek, workdaysValue)
  const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, savingsValue)
  // Extra inleg = bóvenop je huidige inleg (basis 0); het bereik hangt aan het maandinkomen.
  const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, extraValue)
  const dayLabel = (n: number) => `${n} dag${n === 1 ? '' : 'en'}`
  // Spec §2: de spaarquote-knop schuift onder de motorkap in procentpunten (event-shape en
  // savings_rate-doel ongewijzigd); alleen de WEERGAVE is euro per maand minder uitgeven.
  const euroMinder = (pp: number) => formatCurrency(savingsEuroForPp(baseline, pp))

  const setSliderValue = (key: SliderKey, value: number) => {
    const newEvent = buildSliderEvent(key, value, baseline, currentAge)
    setEvents(prev => applySliderEvent(prev, key, newEvent))
  }

  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-x-6">
      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.meerOpzij}
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

      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.minderUitgeven}
          hint="→ Spaarquote-event"
          value={savingsValue}
          baseValue={baseline.savingsRate}
          min={savingsRange.min}
          max={savingsRange.max}
          step={1}
          formatValue={euroMinder}
          formatDelta={v => formatCurrency(savingsEuroForPp(baseline, baseline.savingsRate + v)) + '/mnd'}
          onChange={v => setSliderValue('savings', v)}
          minLabel={euroMinder(savingsRange.min)}
          maxLabel={euroMinder(savingsRange.max)}
        />
      </div>

      {/* Secundair: parttime is een levenskeuze, geen geldhefboom (spec §2) — ingeklapt. */}
      <div className="xl:col-span-2">
        <button
          type="button"
          onClick={() => setMinderWerkenOpen(o => !o)}
          aria-expanded={minderWerkenOpen}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
        >
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {HEFBOOM_COPY.minderWerken}
            {workdaysValue !== baseline.workDaysPerWeek && (
              <span className="ml-2 font-mono text-[10px] font-normal normal-case tracking-normal text-horizon-700">
                {dayLabel(workdaysValue)}
              </span>
            )}
          </span>
          {minderWerkenOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
          )}
        </button>
        {minderWerkenOpen && (
          <SliderRow
            label={HEFBOOM_COPY.werkdagen}
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
        )}
      </div>
    </div>
  )
}

/**
 * De scenario-sliders op de tijdas van /toekomst ("Verken je aannames"). Drie
 * hefbomen — Meer opzij, Minder uitgeven, en secundair Minder werken (ingeklapt
 * achter de werkdagen-slider) — spec lab-haalbaarheid §2, 15 sep 2026. Rendert
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
