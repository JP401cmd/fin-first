'use client'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { SubtotalLine } from '@/components/editorial/subtotal-line'
import { FinDots } from '@/components/app/fin-dots'
import { NW_LAYOUT, NW_PLOT, NW_SEAM_LEFT } from './networth-chart-layout'

const { PAD_TOP, FLOOR, PAST_PAD_LEFT, FUTURE_PAD_RIGHT } = NW_PLOT
// Het anker-punt op ~55% van het tekenvlak — dezelfde plek als voorheen.
const ANCHOR_Y = PAD_TOP + (FLOOR - PAD_TOP) * 0.55

/**
 * MiniNetWorthChartAnchor — twee-traps-render voor de netto-vermogen-cel op
 * /overzicht (kaart "Weergave grafiek op het overzicht", optie B).
 *
 * TRAP 1 (deze component): rendert DIRECT in blok 1 als `<Suspense>`-fallback,
 * met het ECHTE, perspectief-correcte netto vermogen (`currentNetWorth`) als
 * "Vandaag"-anker — géén kale skeleton.
 *
 * TRAP 2: zodra `OverzichtNetWorthChartLoader` klaar is, vervangt de volle
 * `MiniNetWorthChart` deze anker-paint.
 *
 * GEEN LAYOUT-SHIFT: dit component leest exact dezelfde grid-recepten
 * (`networth-chart-layout.ts`) als de volle grafiek — dezelfde rijen, dezelfde
 * kolommen, dezelfde naad (<lg één kaart met de naad op 1/3, lg+ twee kaarten
 * onder Schulden en Budget+Belasting). Hier zijn de frames alleen niet
 * klikbaar: er is nog niets om naartoe te gaan.
 *
 * CONSUME, DON'T RECOMPUTE: toont uitsluitend reeds-berekende blok-1-waarden.
 *
 * euro-view: exempt (D12) — trap 1 toont uitsluitend GEREALISEERD vermogen van
 * vandaag; er is hier nog geen projectierij en dus geen kernelfactor.
 */
export function MiniNetWorthChartAnchor({
  currentNetWorth,
  netWorthExclHome = null,
  showExclHome = false,
}: {
  /** Netto vermogen (perspectief-correct, blok 1) — het Vandaag-anker. */
  currentNetWorth: number
  /** Nettovermogen excl. eigen woning (perspectief-correct) — losse subregel. */
  netWorthExclHome?: number | null
  /** Gate voor de excl.-regel ⇔ `showDualHousingBasis`. Default false. */
  showExclHome?: boolean
}) {
  const { masked } = useMaskedAmounts()

  return (
    <div className={NW_LAYOUT.wrapper}>
      <h3 className="sr-only">Netto vermogen door de tijd</h3>
      {/* Scoped keyframes — gate op prefers-reduced-motion zet alle beweging
          stil. 3.2s spiegelt de thinking-orbit van FinDots. */}
      <style>{`
        @keyframes nwseek-march { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -20 } }
        @keyframes nwseek-travel { from { left: 0% } to { left: 100% } }
        @keyframes nwseek-fade { from { opacity: .55 } to { opacity: 1 } }
        .nwseek-line { animation: nwseek-march 3.2s ease-in-out infinite alternate; }
        .nwseek-probe { animation: nwseek-travel 3.2s ease-in-out infinite alternate; }
        .nwseek-label { animation: nwseek-fade 3.2s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .nwseek-line, .nwseek-probe, .nwseek-label { animation: none; }
        }
      `}</style>

      {/* Niet-interactieve frames op exact de plek van de klikdoelen. */}
      <div className={NW_LAYOUT.pastFrame} aria-hidden="true" />
      <div className={NW_LAYOUT.futureFrame} aria-hidden="true" />

      <div className={NW_LAYOUT.pastText}>
        <span className={NW_LAYOUT.kicker}>Netto vermogen</span>
        <div className="mt-1 font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
          {formatMaskedCurrency(currentNetWorth, masked)}
        </div>
        {showExclHome && netWorthExclHome != null && (
          <SubtotalLine
            label="excl. eigen woning"
            amount={netWorthExclHome}
            className="!mt-1 !mb-0"
          />
        )}
      </div>

      <div className={NW_LAYOUT.futureText}>
        <span className={NW_LAYOUT.kicker}>Je plan</span>
        {/* Signaleert dat de projectie nog binnenstroomt (trap 2). */}
        <div className="nwseek-label mt-1 font-serif text-lg sm:text-xl font-semibold text-[var(--ink-4)]">
          Projectie laden…
        </div>
        {/* Reserveert de bedragen- en dekkingsregel van trap 2. */}
        <div className={NW_LAYOUT.futureMeta} aria-hidden="true" />
      </div>

      <div className={NW_LAYOUT.pastPlot} aria-hidden="true">
        <div className={NW_LAYOUT.drawing}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1={PAST_PAD_LEFT}
              y1={FLOOR}
              x2={100}
              y2={FLOOR}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      <div className={NW_LAYOUT.futurePlot}>
        <div className={NW_LAYOUT.drawing} aria-hidden="true">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {/* Zoekende projectie-lijn rechts van Vandaag. */}
            <line
              className="nwseek-line"
              x1={0}
              y1={ANCHOR_Y}
              x2={100 - FUTURE_PAD_RIGHT}
              y2={ANCHOR_Y}
              stroke="var(--ink-4)"
              strokeWidth="1"
              strokeDasharray="4 6"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={0}
              y1={FLOOR}
              x2={100 - FUTURE_PAD_RIGHT}
              y2={FLOOR}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* De naad + het Vandaag-anker — zelfde CSS-positie als de volle grafiek;
              net als daar alleen <lg (op lg staat er niets tussen de kaarten). */}
          <span
            className="absolute inset-y-0 border-l border-dashed border-[var(--ink-4)] opacity-50 lg:hidden"
            style={{ left: NW_SEAM_LEFT }}
          />
          <span
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--module-active-700)] lg:hidden"
            style={{ left: NW_SEAM_LEFT, top: `${ANCHOR_Y}%` }}
          />
          {/* Fin loopt het projectie-traject af. */}
          <div
            className="pointer-events-none absolute"
            style={{ left: 0, right: `${FUTURE_PAD_RIGHT}%`, top: `${ANCHOR_Y}%` }}
          >
            <div
              className="nwseek-probe absolute"
              style={{ left: 0, transform: 'translate(-50%, -50%)' }}
            >
              <FinDots size={26} state="thinking" />
            </div>
          </div>
        </div>
        <span
          className="absolute bottom-0 -translate-x-1/2 bg-[var(--paper)] px-1 font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap lg:hidden"
          style={{ left: NW_SEAM_LEFT }}
        >
          Vandaag
        </span>
        <span className="absolute bottom-0 left-3 hidden font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap lg:block">
          nu
        </span>
      </div>

      {/* Legenda-rij gereserveerd (zelfde minimale hoogte als de volle grafiek). */}
      <div className={NW_LAYOUT.legend} aria-hidden="true" />
    </div>
  )
}
