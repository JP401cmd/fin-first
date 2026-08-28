'use client'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * VerdelingStaaf — 100%-gestapelde horizontale staaf.
 *
 * Verdeelt een set segmenten naar rato van hun `value` over één horizontale
 * balk: elk segment krijgt een breedte gelijk aan zijn aandeel in de som.
 * Onder de balk kan optioneel een legenda staan (kleurblokje + label + bedrag).
 *
 * Gebruikt voor o.a. box-verdeling (C2 — hoeveel belasting per box) en
 * vermogensmix (3.4 — verdeling van het vermogen over Box 3-categorieën).
 *
 * Bewust presentationeel: geen data-fetching, geen state. De caller berekent
 * de segmenten en levert per segment een `colorVar` (een CSS-variabele of
 * kleurwaarde) aan, zodat de balk de box/module-kleur van de context overneemt.
 *
 * PRIVACY (ADR 0091, S14). De legenda en de segment-tooltips tonen EURO's, dus
 * moeten ze meebewegen met de privacymodus. Dat maakt dit component 'use
 * client' — het leest `useMaskedAmounts()` en verder niets; de percentages en
 * de balkverhoudingen blijven zichtbaar (een aandeel verraadt geen bedrag).
 * Vóór deze wijziging maskeerde katern I van de Belasting-hub als enige blok
 * níét, precies zoals `HubKansen` dat vóór zijn conversie deed. De aanroepers
 * (hub-verdeling, box3-mix, box3-opbouw) blijven server-components: dit
 * component is de client-grens.
 *
 * Vormgeving — Editorial Finance: scherpe rechthoek-balk (radius 0), segmenten
 * gescheiden door papier-haarlijnen i.p.v. afgeronde hoeken. De balk groeit in
 * via een width-keyframe (reduced-motion-safe). Legenda: scherp kleurvierkant,
 * labels in Inter UI, percentage in DM Mono, bedragen in DM Mono tabular-nums.
 */

export type VerdelingSegment = {
  /** Korte beschrijving, bv. 'Box 1' of 'Beleggingen'. */
  label: string
  /** Waarde die het aandeel bepaalt; negatieve/non-finite waarden tellen als 0. */
  value: number
  /** CSS-kleurwaarde voor dit segment, bv. 'var(--color-expense-500)'. */
  colorVar: string
}

type VerdelingStaafProps = {
  segments: VerdelingSegment[]
  /** Toon de legenda onder de balk (default: true). */
  showLegend?: boolean
}

/** Niet-finite of negatieve waarden tellen niet mee in de verdeling. */
function safeValue(value: number): number {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : 0
}

export function VerdelingStaaf({ segments, showLegend = true }: VerdelingStaafProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const sanitized = segments.map((s) => ({ ...s, value: safeValue(s.value) }))
  const total = sanitized.reduce((sum, s) => sum + s.value, 0)

  // Alleen segmenten met een positief aandeel verschijnen in de balk; de
  // legenda toont desgewenst alle segmenten (ook nul-waarden) zodat de lezer
  // de volledige indeling ziet.
  const barSegments = sanitized.filter((s) => s.value > 0)

  return (
    <div className="space-y-3">
      {/* Per-instance grow-in keyframe; reduced-motion neutraliseert hem. */}
      <style>{`
        @keyframes verdeling-grow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation: verdeling-grow"] {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Staaf — scherpe rechthoek, haarlijn-kader, segment-dividers in papier */}
      <div
        className="flex h-3 w-full overflow-hidden border border-[var(--border-ed)] bg-[var(--subtle)]"
        role="img"
        aria-label={
          total > 0
            ? `Verdeling: ${barSegments
                .map((s) => `${s.label} ${Math.round((s.value / total) * 100)} procent`)
                .join(', ')}`
            : 'Geen verdeling beschikbaar'
        }
      >
        {total > 0 &&
          barSegments.map((s, i) => {
            const pct = (s.value / total) * 100
            return (
              <div
                key={`${s.label}-${i}`}
                className="h-full origin-left"
                style={{
                  width: `${pct}%`,
                  backgroundColor: s.colorVar,
                  // Papier-haarlijn tussen segmenten i.p.v. afronding.
                  boxShadow: i > 0 ? 'inset 1px 0 0 var(--paper)' : undefined,
                  animation: `verdeling-grow 600ms cubic-bezier(.22,1,.36,1) ${i * 60}ms both`,
                }}
                title={`${s.label}: ${fc(s.value)} (${Math.round(pct)}%)`}
              />
            )
          })}
      </div>

      {/* Legenda */}
      {showLegend && (
        <ul className="space-y-1.5">
          {sanitized.map((s, i) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
            return (
              <li key={`${s.label}-${i}`} className="flex items-center gap-2.5">
                <span
                  className="block h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: s.colorVar }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]">
                  {s.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.02em] text-[var(--ink-4)]">
                  {pct}%
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                  {fc(s.value)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
