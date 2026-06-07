import { formatCurrency } from '@/lib/format'

/**
 * MarginaleDrukCurve — SVG-lijngrafiek van het marginale belastingtarief
 * (y-as, 0–60%) uitgezet tegen het inkomen (x-as).
 *
 * Filosofie: marginale druk laat zien hoeveel van élke extra verdiende euro
 * naar de schatkist gaat — oftewel hoeveel "opgeslagen tijd" je per extra
 * euro daadwerkelijk overhoudt. Cliffs (drempels waar het tarief abrupt
 * verspringt, bv. wegvallende toeslagen of de schijfgrens) worden als
 * verticale markeringen getoond.
 *
 * Presentational: geen data-fetching, geen state. Puur props → SVG.
 * Server-compatible (geen hooks, geen 'use client').
 *
 * Vormgeving — Editorial Finance: papier-achtergrond, ink-hiërarchie, scherpe
 * vormen, haarlijnen. As-/tick-labels in DM Mono (font-mono tabular-nums),
 * referentie-/cliff-captions in kicker-stijl (uppercase mono). De curve tekent
 * zich in via de canonieke `drawPath`-keyframe (pathLength={1} JSX-attribuut,
 * strokeDasharray={1}); datapunten faden in via `fadeInFill`. Beide worden door
 * de globale prefers-reduced-motion-regel automatisch uitgezet.
 *
 * Kleur komt binnen via `colorVar` (caller geeft box-/module-kleur, default
 * de Kern-amber). Toegankelijk via role + aria-label op de svg.
 */

export interface MarginaleDrukPunt {
  /** Bruto-inkomen op de x-as (EUR). */
  income: number
  /** Marginaal tarief als fractie 0–1 (bv. 0.495 = 49,5%). */
  rate: number
}

export interface MarginaleDrukCliff {
  /** Inkomen (x-positie) waar de drempel/cliff zit. */
  income: number
  /** Kort label, bv. "Schijfgrens" of "Zorgtoeslag valt weg". */
  label: string
}

export interface MarginaleDrukCurveProps {
  /** Datapunten van de curve, oplopend in inkomen. */
  data: MarginaleDrukPunt[]
  /** Optionele verticale markeringen op specifieke inkomens. */
  cliffs?: MarginaleDrukCliff[]
  /** Referentielijn-tarief (fractie 0–1), default 0.5 (= "50%"). */
  referenceRate?: number
  /** CSS-kleur(variabele) voor de curve, default Kern-amber. */
  colorVar?: string
  /** Hoogte van de SVG in px (viewBox-eenheden), default 220. */
  height?: number
}

// Vaste y-schaal: marginale druk loopt van 0% tot 60%.
const Y_MAX = 0.6

export function MarginaleDrukCurve({
  data,
  cliffs = [],
  referenceRate = 0.5,
  colorVar = 'var(--kern-500, #d97706)',
  height = 220,
}: MarginaleDrukCurveProps) {
  // SVG-grid — vaste viewBox-breedte; hoogte via prop.
  const W = 440
  const H = height
  const PAD_LEFT = 38
  const PAD_RIGHT = 16
  const PAD_TOP = 18
  const PAD_BOTTOM = 34
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // Gesorteerde, geldige punten — defensief tegen ongeordende input.
  const points = [...data]
    .filter((p) => Number.isFinite(p.income) && Number.isFinite(p.rate))
    .sort((a, b) => a.income - b.income)

  // Lege staat: niets te tekenen.
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center border border-dashed border-[var(--border-md)] bg-[var(--paper)] text-sm italic text-[var(--ink-3)]"
        style={{ height: `${H}px`, fontFamily: 'var(--font-serif, Georgia, serif)' }}
      >
        Geen tariefgegevens beschikbaar.
      </div>
    )
  }

  // X-schaal: van laagste tot hoogste inkomen in de dataset.
  const minIncome = points[0].income
  const maxIncome = points[points.length - 1].income
  const incomeSpan = Math.max(maxIncome - minIncome, 1)

  function incomeToX(income: number): number {
    return PAD_LEFT + ((income - minIncome) / incomeSpan) * chartW
  }

  function rateToY(rate: number): number {
    const clamped = Math.min(Math.max(rate, 0), Y_MAX)
    return PAD_TOP + chartH - (clamped / Y_MAX) * chartH
  }

  // Stapsgewijs (step-after) pad: marginale tarieven zijn schijven, geen
  // gladde curve. Elk punt geldt tot het volgende inkomen.
  const linePath = points
    .map((p, i) => {
      const x = incomeToX(p.income)
      const y = rateToY(p.rate)
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`
      const prevY = rateToY(points[i - 1].rate)
      // Horizontaal tot huidige x op vorig niveau, dan verticaal naar nieuw.
      return `L${x.toFixed(1)},${prevY.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Y-gridlijnen + labels op 0/15/30/45/60%.
  const yTicks = [0, 0.15, 0.3, 0.45, 0.6]

  // X-gridlabels: begin, eind en (indien ruimte) een middenpunt.
  const xTicks =
    points.length > 1
      ? [minIncome, minIncome + incomeSpan / 2, maxIncome]
      : [minIncome]

  const refY = rateToY(referenceRate)
  const refPct = Math.round(referenceRate * 100)

  // Canonieke draw-in: pathLength={1} + strokeDasharray={1} + drawPath-keyframe.
  // prefers-reduced-motion zet dit globaal uit (stroke-dashoffset → 0).
  const drawAnim = 'drawPath 900ms cubic-bezier(.22,1,.36,1) forwards'

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Marginale belastingdruk over inkomen, van ${formatCurrency(minIncome)} tot ${formatCurrency(maxIncome)}. Referentielijn op ${refPct}%.`}
      style={{ overflow: 'visible' }}
    >
      {/* Y-gridlijnen + labels (0–60%) — haarlijnen, mono-labels */}
      {yTicks.map((t) => {
        const y = rateToY(t)
        return (
          <g key={`y-${t}`}>
            <line
              x1={PAD_LEFT}
              y1={y}
              x2={W - PAD_RIGHT}
              y2={y}
              stroke="var(--rule-soft, var(--border-ed))"
              strokeWidth="0.5"
            />
            <text
              x={PAD_LEFT - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-[var(--ink-4)] font-mono tabular-nums"
              fontSize="8.5"
              style={{ letterSpacing: '0.04em' }}
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        )
      })}

      {/* Referentielijn (stippellijn) op referenceRate met kicker-label */}
      <line
        x1={PAD_LEFT}
        y1={refY}
        x2={W - PAD_RIGHT}
        y2={refY}
        stroke="var(--ink-3)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <text
        x={W - PAD_RIGHT}
        y={refY - 5}
        textAnchor="end"
        className="fill-[var(--ink-3)] font-mono uppercase"
        fontSize="7.5"
        style={{ letterSpacing: '0.14em' }}
      >
        Referentie {refPct}%
      </text>

      {/* Cliff-markeringen: verticale haarlijn + kicker-caption */}
      {cliffs
        .filter(
          (c) =>
            Number.isFinite(c.income) &&
            c.income >= minIncome &&
            c.income <= maxIncome,
        )
        .map((c, i) => {
          const x = incomeToX(c.income)
          return (
            <g key={`cliff-${i}-${c.income}`}>
              <line
                x1={x}
                y1={PAD_TOP}
                x2={x}
                y2={PAD_TOP + chartH}
                stroke="var(--ink-4)"
                strokeWidth="0.75"
                strokeDasharray="2 2"
                opacity="0.7"
              />
              <text
                x={x + 4}
                y={PAD_TOP + 9}
                textAnchor="start"
                className="fill-[var(--ink-3)] font-mono uppercase"
                fontSize="7"
                style={{ letterSpacing: '0.1em' }}
              >
                {c.label}
              </text>
            </g>
          )
        })}

      {/* De marginale-druk-curve (step-after) — tekent zich in */}
      <path
        d={linePath}
        fill="none"
        stroke={colorVar}
        strokeWidth="2"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        pathLength={1}
        strokeDasharray={1}
        style={{ animation: drawAnim }}
      />

      {/* Datapunt-markers — scherpe ruitjes (geen ronde dots), faden in */}
      {points.map((p, i) => {
        const cx = incomeToX(p.income)
        const cy = rateToY(p.rate)
        const s = 2.6
        return (
          <rect
            key={`pt-${i}-${p.income}`}
            x={cx - s}
            y={cy - s}
            width={s * 2}
            height={s * 2}
            fill={colorVar}
            transform={`rotate(45 ${cx} ${cy})`}
            style={{ animation: `fadeInFill 500ms ease-out ${600 + i * 30}ms both` }}
          />
        )
      })}

      {/* X-as-labels (inkomen) — mono tabular */}
      {xTicks.map((income, i) => {
        const x = incomeToX(income)
        const anchor = i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'
        return (
          <text
            key={`x-${i}-${income}`}
            x={x}
            y={H - 16}
            textAnchor={anchor}
            className="fill-[var(--ink-4)] font-mono tabular-nums"
            fontSize="8.5"
            style={{ letterSpacing: '0.03em' }}
          >
            {formatCurrency(income)}
          </text>
        )
      })}

      {/* As-titels — kicker-stijl (uppercase mono) */}
      <text
        x={PAD_LEFT}
        y={H - 3}
        textAnchor="start"
        className="fill-[var(--ink-3)] font-mono uppercase"
        fontSize="7"
        style={{ letterSpacing: '0.16em' }}
      >
        Bruto-inkomen →
      </text>
      <text
        x={2}
        y={PAD_TOP - 6}
        textAnchor="start"
        className="fill-[var(--ink-3)] font-mono uppercase"
        fontSize="7"
        style={{ letterSpacing: '0.16em' }}
      >
        Marginaal tarief
      </text>
    </svg>
  )
}
