'use client'

/**
 * `Box3Comparison` — toont forfaitair en werkelijk Box 3 naast elkaar voor
 * één verhuurd pand. Twee panelen, beide cijfers tegelijk zichtbaar — de
 * vergelijking IS de waarde.
 *
 * Transparantie-discipline (uit het plan):
 *  - Beide cijfers zichtbaar, niet verborgen achter een toggle.
 *  - Per methode een korte uitleg met info-tooltip.
 *  - Verschil-label expliciet gelabeld als "Verschil" met +/− teken.
 *  - Toggle alleen om de "actieve" methode te markeren (visuele highlight),
 *    niet om de andere te verbergen.
 *
 * UX-skill:
 *  - Geen `rounded-*` classes, scherpe hoeken.
 *  - DM Mono + tabular-nums voor alle bedragen.
 *  - Kicker UPPERCASE met letter-spacing 0.08em.
 *  - Kleur via tokens — geen hardcoded hex.
 *  - Touch-target op de toggle: minimaal 44×44 via padding.
 */

import { useState } from 'react'
import { Info } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/horizon-data'

/** Forfait/tarief als Dutch-genoteerd percentage, uit de canonieke constanten. */
const FORFAIT_PCT = (NL_FICTIEF_BELEGGINGEN * 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TARIEF_PCT = (BOX3_TARIEF * 100).toLocaleString('nl-NL', { maximumFractionDigits: 0 })

/** Masked-aware currency formatter hook used across this file. */
function useFcLocal() {
  const { masked } = useMaskedAmounts()
  return (v: number) => formatMaskedCurrency(v, masked)
}
import type { RentalCalculation } from './calc'

// ── Types ────────────────────────────────────────────────────

type Box3Method = 'forfaitair' | 'werkelijk'

interface Box3ComparisonProps {
  /** Berekening waaruit beide methoden hun cijfers halen. */
  calc: RentalCalculation
}

// ── Component ────────────────────────────────────────────────

export function Box3Comparison({ calc }: Box3ComparisonProps) {
  const fc = useFcLocal()
  // Default actieve methode = forfaitair (huidig stelsel). De gebruiker
  // kan switchen naar werkelijk om die kolom te markeren — beide blijven
  // zichtbaar.
  const [active, setActive] = useState<Box3Method>('forfaitair')

  const verschil = calc.werkelijkBelasting - calc.forfaitairBelasting

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Box 3-vergelijking
          </p>
          <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            Twee belasting-methodes naast elkaar — kies waar je op wil rekenen.
          </p>
        </div>
        {/* Segmented control — visuele markering van de actieve methode.
            Beide cijfers blijven onder de control zichtbaar, dus de toggle
            is geen filter maar een focus-indicator. */}
        <SegmentedToggle active={active} onChange={setActive} />
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Box3Panel
          title="Forfaitair"
          subtitle="Huidig stelsel"
          tooltip={`Belasting op fictief rendement: ${FORFAIT_PCT}% × marktwaarde × ${TARIEF_PCT}% tarief. Onafhankelijk van werkelijke huurinkomsten of waardestijging.`}
          basis="Fictief rendement"
          basisAmount={calc.forfaitairRendement}
          taxAmount={calc.forfaitairBelasting}
          netResult={calc.netNaForfaitair}
          isActive={active === 'forfaitair'}
        />
        <Box3Panel
          title="Werkelijk"
          subtitle="Vanaf 2027"
          tooltip="Belasting op werkelijk behaald rendement: huurinkomsten + waardestijging × 36% tarief. Verlies wordt afgetopt op nul."
          basis="Werkelijk rendement"
          basisAmount={calc.werkelijkRendement}
          taxAmount={calc.werkelijkBelasting}
          netResult={calc.netNaWerkelijk}
          isActive={active === 'werkelijk'}
        />
      </div>

      {/* Verschil-strip — krant-stijl ondertekening van de vergelijking.
          Toont expliciet of werkelijk Box 3 voor- of nadelig is voor dit
          object. Gebruikt semantische tokens (positive/negative). */}
      <div className="border-t border-dashed border-[var(--border-ed)] pt-3">
        <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Verschil
          </span>{' '}
          Werkelijk Box 3 is{' '}
          <span
            className={`font-mono tabular-nums font-semibold ${
              verschil < 0
                ? 'text-positive'
                : verschil > 0
                  ? 'text-negative'
                  : 'text-[var(--ink-2)]'
            }`}
          >
            {verschil < 0 ? '−' : verschil > 0 ? '+' : ''}
            {fc(Math.abs(verschil))}
          </span>{' '}
          {verschil < 0
            ? 'voordeliger'
            : verschil > 0
              ? 'duurder'
              : 'gelijk'}{' '}
          per jaar voor dit object.
        </p>
      </div>
    </section>
  )
}

// ── Segmented toggle ─────────────────────────────────────────

interface SegmentedToggleProps {
  active: Box3Method
  onChange: (method: Box3Method) => void
}

function SegmentedToggle({ active, onChange }: SegmentedToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Box 3-methode kiezen"
      className="inline-flex border border-[var(--border-ed)] bg-[var(--paper)] text-[11px]"
    >
      <SegmentButton
        label="Forfaitair"
        sublabel="huidig"
        active={active === 'forfaitair'}
        onClick={() => onChange('forfaitair')}
      />
      <SegmentButton
        label="Werkelijk"
        sublabel="vanaf 2027"
        active={active === 'werkelijk'}
        onClick={() => onChange('werkelijk')}
      />
    </div>
  )
}

interface SegmentButtonProps {
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
}

function SegmentButton({ label, sublabel, active, onClick }: SegmentButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      // Touch-target 44px hoog. We gebruiken min-h-[44px] met flex zodat de
      // kniptekst (label + sublabel) verticaal centreert. Border-r tussen de
      // segmenten via :not(:last-child)-equivalent — Tailwind doet dat met
      // first:border-l-0 niet, daarom expliciet via index.
      className={[
        'flex min-h-[44px] flex-col items-center justify-center px-3 py-1.5',
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500',
        active
          ? 'bg-kern-50 text-kern-700'
          : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]/40',
      ].join(' ')}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {sublabel}
      </span>
    </button>
  )
}

// ── Box 3 panel (één methode) ────────────────────────────────

interface Box3PanelProps {
  title: string
  subtitle: string
  tooltip: string
  basis: string
  basisAmount: number
  taxAmount: number
  netResult: number
  isActive: boolean
}

function Box3Panel({
  title,
  subtitle,
  tooltip,
  basis,
  basisAmount,
  taxAmount,
  netResult,
  isActive,
}: Box3PanelProps) {
  const fc = useFcLocal()
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <article
      className={[
        'border bg-[var(--paper)] p-4 transition-colors',
        isActive
          ? 'border-kern-300 bg-kern-50/30'
          : 'border-[var(--border-ed)]',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {title}
          </p>
          {/* Inline info-tooltip — dezelfde pattern als WaardestijgingSlider.
              Geen externe popover-library; toggle via click/hover. */}
          <button
            type="button"
            onClick={() => setShowTooltip((s) => !s)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            aria-label={`Toelichting op ${title.toLowerCase()} Box 3`}
            aria-expanded={showTooltip}
            className="-m-1 inline-flex h-8 w-8 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {subtitle}
        </p>
      </header>

      {showTooltip && (
        <div
          role="note"
          className="mt-2 border-l-2 border-kern-300 bg-[var(--subtle)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]"
        >
          {tooltip}
        </div>
      )}

      {/* Drie regels: basis (rendement-grondslag) → belasting → netto. We
          herhalen het label-pattern (kicker links, getal rechts) zodat de
          twee panelen visueel uitlijnen. */}
      <dl className="mt-3 space-y-2">
        <Row label={basis} value={fc(basisAmount)} muted />
        <Row
          label="Box 3-belasting"
          value={`−${fc(taxAmount)}`}
          muted
        />
        <div className="border-t border-dashed border-[var(--border-ed)] pt-2">
          <Row
            label="Netto cashflow"
            value={fc(netResult)}
            tone={netResult >= 0 ? 'primary' : 'negative'}
            bold
          />
        </div>
      </dl>
    </article>
  )
}

// ── Row sub-component ────────────────────────────────────────

interface RowProps {
  label: string
  value: string
  muted?: boolean
  bold?: boolean
  tone?: 'default' | 'primary' | 'negative'
}

function Row({ label, value, muted = false, bold = false, tone = 'default' }: RowProps) {
  const labelClass = muted ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'
  const valueClass =
    tone === 'primary'
      ? 'text-[var(--ink)]'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink-2)]'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-[11px] ${labelClass}`}>{label}</dt>
      <dd
        className={`font-mono tabular-nums text-[12px] ${valueClass} ${
          bold ? 'font-semibold' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
