'use client'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { SubtotalLine } from '@/components/editorial/subtotal-line'
import { FinDots } from '@/components/app/fin-dots'

// SVG-dimensies — spiegelen MiniNetWorthChart (module-scope, puur constant) zodat
// het anker-frame exact dezelfde geometrie/kliklijn deelt als de volle grafiek en
// de swap fallback → grafiek zonder sprong verloopt.
const W = 420
const H = 140
const PAD_LEFT = 8
const PAD_RIGHT = 8
const PAD_TOP = 16
const PAD_BOTTOM = 18
const chartW = W - PAD_LEFT - PAD_RIGHT
// Vandaag staat op 25% (dezelfde `todayFraction` als MiniNetWorthChart), zodat het
// anker-punt exact op de plek van het latere Vandaag-punt valt.
const todayX = PAD_LEFT + chartW * 0.25
const anchorY = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * 0.55

/**
 * MiniNetWorthChartAnchor — twee-traps-render voor de rechter hero-cel op
 * /overzicht (kaart "Weergave grafiek op het overzicht", optie B).
 *
 * TRAP 1 (deze component): rendert DIRECT in blok 1 als `<Suspense>`-fallback,
 * met het ECHTE, perspectief-correcte netto vermogen (`currentNetWorth`, al in
 * blok 1 beschikbaar) als "Vandaag"-anker — géén kale skeleton meer. De
 * gebruiker ziet zo meteen zijn vermogensgetal + het startpunt van de lijn.
 *
 * TRAP 2: zodra `OverzichtNetWorthChartLoader` (de kernel-zware projectie +
 * historie) klaar is, vervangt de volle `MiniNetWorthChart` deze anker-paint.
 *
 * Card-shell, header, kopgetal en de excl.-woning-subregel zijn 1:1 gelijk aan
 * `MiniNetWorthChart` (zelfde tokens, zelfde `formatMaskedCurrency`-masking),
 * zodat de overgang naadloos oogt en er geen layout-shift optreedt (CLS ~0).
 *
 * CONSUME, DON'T RECOMPUTE: toont uitsluitend reeds-berekende blok-1-waarden
 * (`currentNetWorth`, `netWorthExclHome`) — geen eigen som, geen projectie.
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
    <div className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all h-full">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        {/* Signaleert dat de projectielijn nog binnenstroomt (trap 2). */}
        <span className="nwseek-label text-xs font-mono tabular-nums text-[var(--ink-4)]">
          Projectie laden…
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatMaskedCurrency(currentNetWorth, masked)}
      </div>
      {showExclHome && netWorthExclHome != null && (
        <SubtotalLine
          label="excl. eigen woning"
          amount={netWorthExclHome}
          className="!mt-1 !mb-0"
        />
      )}
      {/* Anker-frame: alleen het Vandaag-punt + basislijn; rechts van Vandaag
          "zoekt" een rustige gestippelde lijn de projectie tot de volle grafiek
          instroomt (trap 2) — géén knipperend vlak. */}
      <div className="relative flex-1 mt-2">
        {/* Scoped keyframes — houdt globals.css onaangeraakt; gate op
            prefers-reduced-motion zet alle beweging stil (statisch gestippeld;
            Fin blijft dan stil op het startpunt staan). 3.2s spiegelt de
            thinking-orbit van FinDots (fin-dots.css) zodat lijn, label en Fin
            in fase bewegen i.p.v. tegen elkaar in te driften. */}
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
        {/* Eigen wrapper rond de svg: de buitenste cel is `flex-1` en dus hoger dan
            de svg zelf — deze block-wrapper is exact zo hoog als de svg, zodat de
            Fin-overlay in %-en van de SVG-geometrie gepositioneerd kan worden. */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full h-auto"
            aria-hidden="true"
            preserveAspectRatio="none"
            style={{ minHeight: '120px' }}
          >
            {/* Zoekende projectie-lijn rechts van Vandaag: rustige gestippelde
                lijn (drift-dashes heen en weer). Fin loopt er als overlay
                overheen — zie de strip onder deze svg. */}
            <line
              className="nwseek-line"
              x1={todayX}
              y1={anchorY}
              x2={W - PAD_RIGHT}
              y2={anchorY}
              stroke="var(--ink-4)"
              strokeWidth="1"
              strokeDasharray="4 6"
              opacity="0.4"
            />
            {/* X-as basislijn. */}
            <line
              x1={PAD_LEFT}
              y1={H - PAD_BOTTOM}
              x2={W - PAD_RIGHT}
              y2={H - PAD_BOTTOM}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              opacity="0.35"
            />
            {/* Vandaag verticaal richtlijntje. */}
            <line
              x1={todayX}
              y1={PAD_TOP}
              x2={todayX}
              y2={H - PAD_BOTTOM}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              opacity="0.5"
            />
            {/* Vandaag-anker: het startpunt van de vermogenslijn. */}
            <circle cx={todayX} cy={anchorY} r="4" fill="var(--module-active-700)" />
            <text
              x={todayX < 70 ? Math.max(2, todayX - 4) : todayX}
              y={H - 4}
              textAnchor={todayX < 70 ? 'start' : 'middle'}
              className="fill-[var(--ink-3)] font-mono"
              fontSize="9"
            >
              Vandaag
            </text>
          </svg>
          {/* Fin loopt het projectie-traject af: strip van Vandaag tot de
              rechterrand, op de hoogte van de zoeklijn. Percentages komen uit
              dezelfde SVG-constanten als de lijn zelf, zodat een wijziging van
              todayFraction/padding de loopbaan automatisch meeneemt. */}
          <div
            className="pointer-events-none absolute"
            aria-hidden="true"
            style={{
              left: `${(todayX / W) * 100}%`,
              right: `${(PAD_RIGHT / W) * 100}%`,
              top: `${(anchorY / H) * 100}%`,
            }}
          >
            {/* `nwseek-travel` schuift `left` 0% → 100% heen en weer; de vaste
                translate houdt Fin daarbij gecentreerd op de zoeklijn. */}
            <div
              className="nwseek-probe absolute"
              style={{ left: 0, transform: 'translate(-50%, -50%)' }}
            >
              <FinDots size={26} state="thinking" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
