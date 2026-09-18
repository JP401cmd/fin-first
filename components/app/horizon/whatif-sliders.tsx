'use client'

import { useId } from 'react'
import { formatCurrency } from '@/lib/format'
import { tapTargetClass } from '@/components/editorial/tap-target'
import type { SliderAntwoordItem } from '@/lib/horizon/lab-antwoorden'
import {
  buildSliderEvent,
  applySliderEvent,
  readSliderValueFromEvents,
  computeSliderUiRange,
  savingsEuroForPp,
  uitgaveNaPensioenRange,
  UITGAVE_NA_PENSIOEN_STAP,
  type SliderKey,
} from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { ANTWOORD_BOVEN_BEREIK, HEFBOOM_COPY, spaarquoteEuroRegel } from '@/lib/horizon/anker-copy'

/**
 * WhatIfOverrides is de baseline-snapshot waartegen de sliders hun events opbouwen
 * en teruglezen (`buildSliderEvent`/`readSliderValueFromEvents`).
 */
// Datacontract(en) wonen nu in @/lib/types/horizon-whatif (import-richting UI→lib).
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
export type { WhatIfOverrides }

/**
 * Het antwoord onder een knop (spec antwoorden-naast-sliders, 15 sep 2026): "wat hier zou
 * horen" bij een tekort onder een vast anker. Zelfde vorm als het lib-item uit
 * `labAntwoordenPerSlider` — lib blijft React-vrij, dit is alleen de UI-naam ervoor.
 */
export type SliderAntwoord = SliderAntwoordItem

type SliderAntwoordKey = 'extra_inleg' | 'savings' | 'workdays' | 'uitgave_na_pensioen'

interface SlidersProps {
  baseline: WhatIfOverrides
  events: WhatIfEvent[]
  setEvents: (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => void
  currentAge: number
  /** Antwoord per knop; een ontbrekende key = geen regel en geen lege ruimte. */
  antwoorden?: Partial<Record<SliderAntwoordKey, SliderAntwoord>>
  /**
   * De vierde knop (spec 2026-09-18). Optioneel: alleen /toekomst levert 'm, en alleen
   * onder een vast stopmoment. Geen `SliderKey`/event — de host houdt de waarde zelf en
   * stuurt 'm als scenario-override naar de kern.
   */
  uitgaveNaPensioen?: { waarde: number; basis: number; onChange: (v: number) => void }
}

export { computeSliderUiRange }

/**
 * De antwoordregel onder een knop — één vorm, twee hosts (`SliderRow` hier en de
 * stop-slider "Doorwerken tot" in vrijheidsas.tsx). Geen doos: een gestippelde hairline
 * scheidt 'm van de schaal, een accentstreep links koppelt 'm aan de knop erboven. De
 * boven-bereik-regel zit BINNEN het `id`-element, zodat `aria-describedby` 'm meeleest.
 */
export function SliderAntwoordRegel({ id, antwoord }: { id: string; antwoord: SliderAntwoord }) {
  return (
    // `pb-3` (eindreview M2): het extend-block-raakgebied van de knop steekt ~14px onder de knop
    // uit; zonder deze bodemruimte lag die ::after (gepositioneerd, dus bovenop) over het label
    // van de volgende sliderrij en activeerde een tik daar "Reken hiermee".
    <div data-testid="slider-antwoord" className="mt-1.5 border-t border-dashed border-[var(--border-ed)] pt-1.5 pb-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l-2 border-[var(--module-active-500)] pl-2">
        <p id={id} className="font-sans text-[11px] leading-snug text-[var(--ink-2)]">
          {antwoord.tekst}
          {antwoord.bovenBereik && (
            <span className="block text-[var(--ink-3)]">{ANTWOORD_BOVEN_BEREIK}</span>
          )}
        </p>
        {antwoord.knop && (
          <button
            type="button"
            onClick={antwoord.knop.onClick}
            aria-label={`${antwoord.knop.label}: ${antwoord.tekst}`}
            className={`${tapTargetClass('extend-block')} inline-flex items-center font-sans text-[11px] font-semibold text-[var(--module-active-800)] underline underline-offset-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
          >
            {antwoord.knop.label}
          </button>
        )}
      </div>
    </div>
  )
}

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
  detail = null,
  antwoord = null,
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
  /** Optionele tweede regel onder de waarde (bv. de spaarquote in euro's); `null` = geen regel. */
  detail?: string | null
  /** Het antwoord onder de schaal (tekort onder een vast anker); `null` = geen regel. */
  antwoord?: SliderAntwoord | null
}) {
  const antwoordId = useId()
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
      {detail && (
        <p className="-mt-0.5 mb-1 text-right font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{detail}</p>
      )}
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
          aria-describedby={antwoord ? antwoordId : undefined}
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
      {antwoord && <SliderAntwoordRegel id={antwoordId} antwoord={antwoord} />}
    </div>
  )
}

function SliderGrid({ baseline, events, setEvents, currentAge, antwoorden = {}, uitgaveNaPensioen }: SlidersProps) {
  const workdaysValue = readSliderValueFromEvents('workdays', events, baseline)
  const savingsValue = readSliderValueFromEvents('savings', events, baseline)
  const extraValue = readSliderValueFromEvents('extra_inleg', events, baseline)

  // Zichtbaar UI-bereik (±20% rond de basisstand) — met verbreding-vangnet zodat een opgeslagen
  // waarde buiten de band niet clampt. Validatie-clamps blijven ongewijzigd.
  const workdaysRange = computeSliderUiRange('workdays', baseline.workDaysPerWeek, workdaysValue)
  const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, savingsValue)
  // Extra inleg = bóvenop je huidige inleg (basis 0); het bereik hangt aan het maandinkomen.
  const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, extraValue)
  // Uitgave na pensioen: het bereik rekent op de HUIDIGE sliderstand (niet de basis) — het
  // verbreding-vangnet van uitgaveNaPensioenRange moet zich anders naar het gezette antwoord
  // toe kunnen verbreden (dragende eis, task-6-brief.md).
  const uitgaveRange = uitgaveNaPensioenRange(
    uitgaveNaPensioen?.basis ?? 0,
    uitgaveNaPensioen?.waarde ?? 0,
  )
  const dayLabel = (n: number) => `${n} dag${n === 1 ? '' : 'en'}`
  // Procenten altijd heel: het verbreding-vangnet van computeSliderUiRange kan een opgeslagen,
  // niet-afgeronde spaarquote als rand teruggeven ("52.008244023083265%").
  const pct = (v: number) => `${Math.round(v)}%`

  const setSliderValue = (key: SliderKey, value: number) => {
    const newEvent = buildSliderEvent(key, value, baseline, currentAge)
    setEvents(prev => applySliderEvent(prev, key, newEvent))
  }

  return (
    // `xl:items-start`: een antwoord maakt rijen ongelijk hoog — laat ze raggen, geen
    // gereserveerde min-hoogte (lege ruimte onder een knop leest als ontbrekende inhoud).
    <div className="xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-6">
      {/* 1 — Meer salaris: het extra-inleg-event. Rekenkundig is een salarisverhoging dezelfde
          hefboom als extra inleg (elke euro erbij gaat naar sparen, tot je stopmoment). */}
      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.meerSalaris}
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
          antwoord={antwoorden.extra_inleg}
        />
      </div>

      {/* 2 — Spaarquote: in procenten, met het bedrag minder uitgeven eronder. Onder de
          motorkap blijft het een spaarquote-event in procentpunten (savings_rate-doel
          ongewijzigd); de euro-regel komt uit savingsEuroForPp (één som). */}
      <div className="border-b border-dashed border-[var(--border-ed)] xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.spaarquote}
          hint="→ Spaarquote-event"
          value={savingsValue}
          baseValue={baseline.savingsRate}
          min={savingsRange.min}
          max={savingsRange.max}
          step={1}
          formatValue={pct}
          formatDelta={pct}
          detail={spaarquoteEuroRegel(savingsEuroForPp(baseline, savingsValue))}
          onChange={v => setSliderValue('savings', v)}
          minLabel={pct(savingsRange.min)}
          maxLabel={pct(savingsRange.max)}
          antwoord={antwoorden.savings}
        />
      </div>

      {/* 3 — Minder werken: werkdagen per week (part-time-event); volle breedte, anders
          wringt het label naast de waarde in een halve kolom. */}
      <div className="border-b border-dashed border-[var(--border-ed)] xl:col-span-2 xl:border-b-0">
        <SliderRow
          label={HEFBOOM_COPY.minderWerken}
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
          antwoord={antwoorden.workdays}
        />
      </div>

      {/* 4 — Uitgave na pensioen: de enige hefboom die ná het stopmoment grijpt, en bij
          een vastgezette stopleeftijd vaak de enige die nog draait. In €/JAAR (gelijk aan
          de KPI-tegel "Na pensioen", zodat het antwoord hetzelfde getal is als daar), met
          de maandvertaling in de detail-regel — zoals de euro-regel onder Spaarquote. */}
      {uitgaveNaPensioen && (
        <div className="border-b border-dashed border-[var(--border-ed)] xl:col-span-2 xl:border-b-0">
          <SliderRow
            label={HEFBOOM_COPY.uitgaveNaPensioen}
            hint="→ Profielparameter, geen event"
            value={uitgaveNaPensioen.waarde}
            baseValue={uitgaveNaPensioen.basis}
            min={uitgaveRange.min}
            max={uitgaveRange.max}
            step={UITGAVE_NA_PENSIOEN_STAP}
            formatValue={formatCurrency}
            formatDelta={v => `${formatCurrency(v)}/jr`}
            detail={`≈ ${formatCurrency(Math.round(uitgaveNaPensioen.waarde / 12))}/mnd`}
            onChange={uitgaveNaPensioen.onChange}
            minLabel={formatCurrency(uitgaveRange.min)}
            maxLabel={formatCurrency(uitgaveRange.max)}
            antwoord={antwoorden.uitgave_na_pensioen}
          />
        </div>
      )}
    </div>
  )
}

/**
 * De scenario-sliders op de tijdas van /toekomst ("Verken je aannames"). Drie vaste
 * draaiknoppen — 1 Meer salaris, 2 Spaarquote (met euro's eronder), 3 Minder werken
 * (eigenaarskeuze 15 sep 2026, bijstelling van spec lab-haalbaarheid §2) — plus een optionele
 * vierde (`uitgaveNaPensioen`, spec 2026-09-18, ADR 0160): de enige hefboom die ná het
 * stopmoment grijpt, alleen geleverd door /toekomst onder een vast stopmoment. Rendert
 * alleen het slidergrid — geen kaart, geen kop, geen eigen reset: die leven in de
 * host-sectie. De losse kaartvariant verviel met de Wat-Als-pagina (ADR 0144).
 * `antwoorden` zet onder een knop wat daar bij een tekort zou horen (spec
 * antwoorden-naast-sliders); de host levert ze via `labAntwoordenPerSlider`.
 */
export function WhatIfSliders({ baseline, events, setEvents, currentAge, antwoorden, uitgaveNaPensioen }: SlidersProps) {
  return (
    <SliderGrid
      baseline={baseline}
      events={events}
      setEvents={setEvents}
      currentAge={currentAge}
      antwoorden={antwoorden}
      uitgaveNaPensioen={uitgaveNaPensioen}
    />
  )
}
