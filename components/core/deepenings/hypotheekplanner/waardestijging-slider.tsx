'use client'

/**
 * `WaardestijgingSlider` — slider voor het verwachte jaarlijkse
 * waardestijgings-percentage van de woning. Default 2,5% (NL-gemiddelde
 * laatste 10 jaar volgens CBS). Range 0–8% met step 0,1%.
 *
 * Transparantie-principe (uit het plan):
 * - Default-bron expliciet zichtbaar in een info-tooltip naast het label.
 * - Override-mogelijkheid altijd beschikbaar, geen verstopte aannames.
 * - Live equity-projectie — laat zien wat 1% verschil over 10 jaar betekent.
 *
 * UX-skill discipline:
 * - Slider is `<input type="range">` met `accent-color: var(--color-kern-600)`.
 * - Labels in DM Mono + tabular-nums voor het bedrag, sentence case voor
 *   beschrijvingen.
 * - 44×44 hit-area op de thumb via `slider-touch` utility (zie globals.css).
 * - Touch-target tip-icoon minimaal 32×32 met clickable-radius via padding.
 */

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

// ── Constants ────────────────────────────────────────────────

/**
 * Default 2,5% — NL-gemiddelde laatste 10 jaar volgens CBS-cijfers
 * (huizenprijsontwikkeling). We tonen deze bron expliciet zodat de
 * gebruiker weet waar het getal vandaan komt en kan beoordelen of het
 * realistisch is voor zijn regio/situatie.
 */
const DEFAULT_VALUE = 2.5
const SLIDER_MIN = 0
const SLIDER_MAX = 8
const SLIDER_STEP = 0.1

/** Horizon waarop de live equity-projectie rekent — 10 jaar is het venster
 *  dat huiseigenaren intuïtief snappen voor "hoe ontwikkelt mijn equity?". */
const PROJECTION_YEARS = 10

// ── Props ────────────────────────────────────────────────────

interface WaardestijgingSliderProps {
  /** Huidige marktwaarde (€) — basis voor de projectie. */
  marketValue: number
  /** Initiële waarde, override op de NL-gemiddelde. Default 2,5%. */
  initialValue?: number
  /** Callback bij wijziging — caller kan dit cachen of doorvoeren in
   *  de bredere planner-state. */
  onChange?: (pct: number) => void
}

// ── Component ────────────────────────────────────────────────

export function WaardestijgingSlider({
  marketValue,
  initialValue = DEFAULT_VALUE,
  onChange,
}: WaardestijgingSliderProps) {
  const [value, setValue] = useState(initialValue)
  const [showTooltip, setShowTooltip] = useState(false)

  // Live projectie: marktwaarde × (1 + r)^horizon. We gebruiken decimaal
  // niet decimaal-percentage, dus deelt waarde door 100.
  const projected = useMemo(() => {
    const rate = value / 100
    return marketValue * Math.pow(1 + rate, PROJECTION_YEARS)
  }, [value, marketValue])
  const delta = projected - marketValue

  function handleChange(next: number) {
    setValue(next)
    onChange?.(next)
  }

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Waardestijging per jaar
          </p>
          {/* Info-icon met simpele click/hover-tooltip. We gebruiken expliciet
              `aria-expanded` en `aria-label` zodat screenreaders het toggle-
              gedrag begrijpen. Geen externe tooltip-library — dat zou meer
              complexiteit toevoegen dan we hier nodig hebben. */}
          <button
            type="button"
            onClick={() => setShowTooltip((s) => !s)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            aria-label="Toelichting op default-waarde"
            aria-expanded={showTooltip}
            className="-m-1 inline-flex h-8 w-8 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="font-mono tabular-nums text-base font-semibold text-kern-700">
          {value.toFixed(1)}%
        </p>
      </div>

      {/* Inline tooltip — geen popover, geen overlay. Verschijnt onder het
          label zodat hij niet over andere content valt. */}
      {showTooltip && (
        <div
          role="note"
          className="mt-2 border-l-2 border-kern-300 bg-[var(--subtle)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]"
        >
          NL-gemiddelde laatste 10 jaar (CBS, huizenprijsontwikkeling).
          Pas aan naar wat realistisch lijkt voor jouw regio.
        </div>
      )}

      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={value}
        onChange={(e) => handleChange(Number(e.target.value))}
        aria-label="Verwachte jaarlijkse waardestijging woning"
        className="slider-touch mt-3 w-full"
        style={{ accentColor: 'var(--color-kern-600)' }}
      />

      <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-4)]">
        <span>0%</span>
        <span>{SLIDER_MAX}%</span>
      </div>

      {/* Live projectie-strip: laat zien wat de slider-waarde betekent over
          10 jaar. Het belang van deze strip is dat de gebruiker direct
          voelt dat 1%-stappen een groot verschil maken bij compounding. */}
      <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3">
        <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
          Bij{' '}
          <span className="font-mono tabular-nums text-[var(--ink)]">{value.toFixed(1)}%</span>{' '}
          per jaar groeit je woning over{' '}
          <span className="font-mono tabular-nums">{PROJECTION_YEARS}</span> jaar
          naar{' '}
          <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
            {formatCurrency(projected)}
          </span>
          .
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">
          Dat is{' '}
          <span className="font-mono tabular-nums text-positive">
            +{formatCurrency(delta)}
          </span>{' '}
          aan verwachte waardestijging.
        </p>
      </div>
    </div>
  )
}
