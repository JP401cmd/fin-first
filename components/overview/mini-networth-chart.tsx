'use client'

import Link from 'next/link'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { computeConfidenceBand } from '@/lib/confidence-band'

/**
 * MiniNetWorthChart — compacte netto-vermogen-grafiek voor /overzicht hero.
 *
 * Bron-van-waarheid: gebruikt **dezelfde simulatie-data** als de grafiek
 * op /toekomst (`simRows` uit `runUnifiedProjection`). Geen lineaire
 * benadering, geen eigen groei-rate — exact dezelfde curve als
 * /toekomst toont voor het vandaag → vrijheid-segment. Hierdoor komen
 * vrijheidsleeftijd én doelbedrag bij vrijheid 1:1 overeen tussen de
 * twee pagina's.
 *
 * Visueel:
 *  - "Vandaag" landt op ~20% van links zodat er ruime ruimte rechts is
 *    voor de projectie naar vrijheid
 *  - Linker 20%: historisch netto vermogen als **stippellijn** terug
 *    in de tijd (uit `netWorthHistory`)
 *  - Rechter 80%: projectie als **doorlopende lijn** vanaf vandaag naar
 *    vrijheidsmoment (uit `simRows`, gesplitst op fireAge)
 *  - Vandaag-marker (groen) + Vrijheid-marker (violet) met label
 *    "{Vrijheid|Pensioen} {fireAge}"
 *
 * Bij user-tap: navigeert naar /toekomst voor de volledige grafiek
 * inclusief afbouw-fase.
 */
export function MiniNetWorthChart({
  netWorthHistory,
  currentNetWorth,
  currentAge,
  fireAge,
  endAge,
  isPensioenMode,
  simRows,
  simRequiredPortfolio,
}: {
  netWorthHistory: { month: string; value: number }[]
  currentNetWorth: number
  currentAge: number | null
  fireAge: number | null
  endAge: number | null
  isPensioenMode?: boolean
  /**
   * Per-jaar projectie-rijen uit `runUnifiedProjection`. Wanneer aanwezig:
   * de chart gebruikt deze waardes 1:1 (consistent met /toekomst). Wanneer
   * afwezig (sim mislukt op server): empty-state-CTA.
   */
  simRows?: { age: number; endPortfolio: number }[] | null
  /**
   * Vereist FIRE-portfolio bij vrijheidsmoment uit de simulatie. Wanneer
   * gegeven gebruikt de chart deze waarde voor het eind-marker-bedrag
   * i.p.v. de simRows-waarde op fireAge. Verzekert dat /overzicht en
   * /toekomst exact hetzelfde "doelbedrag bij vrijheid" tonen.
   */
  simRequiredPortfolio?: number | null
}) {
  // Netto vermogen + eindbedrag zijn saldi → honoreren de privacy-toggle.
  // Hook vóór elke early-return aangeroepen (rules-of-hooks). De numerieke
  // chart-coördinaten blijven ongemoeid; alleen de zichtbare bedrag-tekst maskt.
  const { masked } = useMaskedAmounts()

  // SVG-dimensies
  const W = 420
  const H = 140
  const PAD_LEFT = 8
  const PAD_RIGHT = 8
  const PAD_TOP = 16
  const PAD_BOTTOM = 18
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // Vandaag staat op 20% van links — rest is projectie naar vrijheid.
  // Linker 20% is gereserveerd voor historische stippellijn terug in de tijd.
  const TODAY_X_FRACTION = 0.2

  // Filter de simRows tot het opbouw-segment: vandaag → fireAge (vrijheid).
  // De afbouw-fase leeft op /toekomst — hier tonen we alleen het verhaal
  // "hoe kom je bij vrijheid".
  const projectionEndAge =
    fireAge != null && currentAge != null && fireAge > currentAge
      ? fireAge
      : endAge != null && currentAge != null && endAge > currentAge
        ? endAge
        : null

  if (currentAge == null || projectionEndAge == null || !simRows || simRows.length === 0) {
    return (
      <Link
        href="/toekomst"
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 text-center hover:border-violet-300 transition-colors min-h-[140px] h-full"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Vermogen door de tijd
        </div>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Vul je profiel aan om je vermogensgroei tot{' '}
          {isPensioenMode ? 'pensioen' : 'vrijheid'} te zien.
        </p>
        <span className="mt-3 text-xs font-semibold text-violet-700">
          Bekijk projectie →
        </span>
      </Link>
    )
  }

  // Narrowed copies — guard hierboven sluit null uit.
  const startAge: number = currentAge
  const finalAge: number = projectionEndAge

  // Projectie-segment: simRows van vandaag → fireAge. Voeg vandaag-punt
  // bovenaan toe (currentNetWorth) zodat het startpunt scherp is en niet
  // mogelijk verschilt van simRows[0] (dat het einde van jaar 0 is).
  const projRowsInRange = simRows.filter(
    (r) => r.age >= startAge && r.age <= finalAge,
  )
  const projection: { age: number; value: number }[] = [
    { age: startAge, value: currentNetWorth },
    ...projRowsInRange.map((r) => ({ age: r.age, value: r.endPortfolio })),
  ]
  // Dedupe identieke leeftijden (currentAge kan al in simRows zitten);
  // hou de eerste — currentNetWorth is de waarheid voor vandaag.
  const seen = new Set<number>()
  const dedupedProjection = projection.filter((p) => {
    if (seen.has(p.age)) return false
    seen.add(p.age)
    return true
  })

  // Eindwaarde komt primair uit simRequiredPortfolio (= "doelbedrag bij
  // vrijheid" zoals /toekomst dat ook toont). Fallback: laatste rij in
  // het opbouw-segment.
  const endValue =
    simRequiredPortfolio != null && simRequiredPortfolio > 0
      ? simRequiredPortfolio
      : dedupedProjection[dedupedProjection.length - 1]?.value ?? currentNetWorth
  const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'

  // Historisch netto vermogen: gebruik de werkelijke tracking (max 12
  // maanden, bron = net_worth_snapshots). Punten worden TIJDS-PROPORTIONAL
  // verdeeld over het linker-segment (PAD_LEFT → todayX) i.p.v. evenredig
  // gespreid — zo komen 6 maanden data uit op halve breedte, niet 100%
  // uitgerekt zoals 12 maanden. User-feedback mei 2026: "gebruik echte
  // netto-vermogen tracking tot aan vandaag, vanaf vandaag = toekomst".
  const recentHistory = netWorthHistory.slice(-12)
  // Vensterbreedte voor visuele schaling: maximaal 12 maanden = volle
  // linker-segment. Korter venster vult slechts een fractie.
  const HISTORY_WINDOW_MONTHS = 12
  // Anchor: oudste history-punt = maand 0 in linker-segment. Wanneer er
  // minder dan HISTORY_WINDOW_MONTHS punten zijn, schaalt de lijn-lengte
  // proportioneel mee (geen artificiële uitrekking meer).

  // Y-schaal: 0 → max van projectie + history + eindwaarde + P90-top
  // van de confidence-band zodat de gradient binnen het frame valt.
  // P90 op endpoint = endValue × (1 + 1.28 × σ × √years). Voor MVP
  // approximaten we via factor 1.5 = simpel-headroom.
  const maxProjection = Math.max(...dedupedProjection.map((p) => p.value), 1)
  const bandHeadroom = maxProjection * 1.5
  const allValues = [
    ...recentHistory.map((h) => h.value),
    ...dedupedProjection.map((p) => p.value),
    endValue,
    bandHeadroom,
  ]
  const maxValue = Math.max(...allValues, 1)
  const yScale = chartH / maxValue
  function valueToY(v: number) {
    return PAD_TOP + chartH - v * yScale
  }

  // X-mapping:
  //  - Vandaag (startAge) zit op PAD_LEFT + chartW * TODAY_X_FRACTION
  //  - finalAge zit op de rechterrand (PAD_LEFT + chartW)
  //  - Historische punten (12 maanden terug) over PAD_LEFT → today-x
  const todayX = PAD_LEFT + chartW * TODAY_X_FRACTION
  const projXSpan = chartW * (1 - TODAY_X_FRACTION)
  const projYears = Math.max(1, finalAge - startAge)

  function ageToX(age: number) {
    const yearsFromToday = age - startAge
    return todayX + (yearsFromToday / projYears) * projXSpan
  }

  // Historische lijn — punten tijdsproportioneel over linker-segment.
  // Bij minder dan HISTORY_WINDOW_MONTHS punten vult de lijn slechts een
  // deel van het segment (geen kunstmatige uitrekking). Het laatste
  // history-punt valt op todayX zodat hij continu overgaat in de
  // projectie-curve.
  const histPoints = recentHistory.map((h, i) => {
    const monthsBack = recentHistory.length - 1 - i
    const fraction =
      recentHistory.length <= 1
        ? 0
        : 1 - monthsBack / HISTORY_WINDOW_MONTHS
    const x = PAD_LEFT + fraction * (todayX - PAD_LEFT)
    const y = valueToY(h.value)
    return { x, y }
  })
  const histPath =
    histPoints.length >= 2
      ? histPoints
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')
      : ''

  // Projectie-pad (vanaf today-x naar finalAge). Doorlopende lijn.
  const projPath = dedupedProjection
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToY(p.value).toFixed(1)}`,
    )
    .join(' ')

  // Plan F-4: confidence-band P10-P90 als zachte gradient rond
  // projectie. Approximated via σ × √t — geen echte Monte Carlo maar
  // voldoende voor MVP-visualisatie van onzekerheid.
  const bandPoints = computeConfidenceBand(
    dedupedProjection.map((p) => ({ age: p.age, endPortfolio: p.value })),
  )
  // Polygon-path: heen langs P90, terug langs P10 (gespiegeld).
  const bandPath =
    bandPoints.length >= 2
      ? [
          // Forward langs P90
          ...bandPoints.map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToY(p.p90).toFixed(1)}`,
          ),
          // Backward langs P10
          ...[...bandPoints].reverse().map(
            (p) =>
              `L${ageToX(p.age).toFixed(1)},${valueToY(p.p10).toFixed(1)}`,
          ),
          'Z',
        ].join(' ')
      : ''

  // Toon de fireAge gerond (in praktijk: integer uit DashboardData).
  const fireAgeLabel = Math.round(finalAge)

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all h-full">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
          → {formatMaskedCurrency(endValue, masked)} bij {endLabel.toLowerCase()}
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatMaskedCurrency(currentNetWorth, masked)}
      </div>
      <Link
        href="/toekomst"
        className="block hover:opacity-90 transition-opacity flex-1"
        aria-label="Bekijk volledige projectie inclusief afbouw op /toekomst"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto mt-2"
          aria-label="Vermogensprojectie tot vrijheid (zelfde berekening als /toekomst)"
          preserveAspectRatio="none"
          style={{ minHeight: '120px' }}
        >
          {/* Historische lijn — stippellijn terug in de tijd (links van Vandaag) */}
          {histPath && (
            <path
              d={histPath}
              fill="none"
              stroke="var(--module-active-700, #047857)"
              strokeWidth="2"
              strokeDasharray="3 3"
              strokeLinecap="round"
              opacity="0.7"
            />
          )}
          {/* Confidence-band P10-P90 (plan F-4) — zachte gradient onder
              de projectie-lijn. Approximated via σ×√t. */}
          {bandPath && (
            <path
              d={bandPath}
              fill="var(--module-active-500, #10b981)"
              opacity="0.12"
              stroke="none"
            />
          )}
          {/* Projectie-lijn — doorlopend van Vandaag naar Vrijheid */}
          <path
            d={projPath}
            fill="none"
            stroke="var(--module-active-700, #047857)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Vandaag-marker */}
          <circle
            cx={todayX}
            cy={valueToY(currentNetWorth)}
            r="4"
            fill="var(--module-active-700, #047857)"
          />
          {/* Vandaag verticaal richtlijntje */}
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
          {/* Vrijheid-eindmarker rechts */}
          <line
            x1={ageToX(finalAge)}
            y1={PAD_TOP}
            x2={ageToX(finalAge)}
            y2={valueToY(endValue)}
            stroke="var(--horizon-500, #8b5cf6)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <circle cx={ageToX(finalAge)} cy={valueToY(endValue)} r="4" fill="var(--horizon-500, #8b5cf6)" />
          <text
            x={ageToX(finalAge)}
            y={PAD_TOP - 4}
            textAnchor="end"
            className="fill-[var(--horizon-700,#6d28d9)] font-mono"
            fontSize="9"
          >
            {endLabel} {fireAgeLabel}
          </text>
          {/* Vandaag-label */}
          <text
            x={todayX}
            y={H - 4}
            textAnchor="middle"
            className="fill-[var(--ink-3)] font-mono"
            fontSize="9"
          >
            Vandaag ({startAge})
          </text>
        </svg>
      </Link>
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-[var(--ink-3)]">
          {/* Historisch — stippellijn-indicator zodat de gebruiker weet
              dat het verleden uit netto-vermogen-tracking komt. */}
          {recentHistory.length > 0 && (
            <span
              className="inline-flex items-center gap-1.5"
              title="Gerealiseerde netto-vermogen-tracking uit het verleden"
            >
              <svg width="16" height="2" aria-hidden="true">
                <line
                  x1="0"
                  y1="1"
                  x2="16"
                  y2="1"
                  stroke="var(--module-active-700, #10b981)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </svg>
              Historisch
            </span>
          )}
          {/* Projectie — doorlopende lijn-indicator. */}
          <span
            className="inline-flex items-center gap-1.5"
            title="Toekomst-projectie tot vrijheidsmoment"
          >
            <svg width="16" height="2" aria-hidden="true">
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                stroke="var(--module-active-500, #10b981)"
                strokeWidth="2"
              />
            </svg>
            Projectie
          </span>
          {/* Confidence-band — gevuld rechthoekje. */}
          <span
            className="inline-flex items-center gap-1.5"
            title="P10-P90 bandbreedte op basis van marktvolatiliteit σ × √t"
          >
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{
                background: 'var(--module-active-500, #10b981)',
                opacity: 0.25,
              }}
              aria-hidden="true"
            />
            Onzekerheid (P10–P90)
          </span>
        </div>
        <Link
          href="/toekomst"
          className="text-[11px] font-semibold text-violet-700 hover:underline shrink-0"
        >
          Bekijk afbouw →
        </Link>
      </div>
    </div>
  )
}
