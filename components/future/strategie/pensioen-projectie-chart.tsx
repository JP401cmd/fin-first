'use client'

import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { formatCurrency } from '@/lib/format'
import {
  buildPensionProjection,
  type PensionProjectionRow,
} from '@/lib/pension/pension-projection'
import type { Box1TaxYear } from '@/lib/box1-tax'
import type { LifeEvent } from '@/lib/horizon-data'

interface Props {
  pensionEvents: LifeEvent[]
  /** Huidige leeftijd uit DOB (null = onbekend → geen indexatie-anker). */
  currentAge: number | null
  /** Inflatievoet uit resolveFireParams (fractie, bv. 0.02). */
  inflationRate: number
  /** Belastingjaar voor de Box 1-som. */
  year: Box1TaxYear
}

// ── Y-as-formattering (compacte k/M-notatie) ──────────────────
function fmtYAxis(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€ ${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€ ${Math.round(val / 1_000)}k`
  if (abs > 0) return `€ ${Math.round(val)}`
  return '€ 0'
}

const PAD = { top: 20, right: 20, bottom: 32, left: 56 }
const W = 600
const H = 280

const LINE_BRUTO_NOM = 'var(--color-horizon-300)'
const LINE_BRUTO_IDX = 'var(--color-horizon-500)'
const LINE_NETTO = 'var(--color-horizon-700)'

/**
 * Pensioen-projectiegrafiek: leeftijd × verwacht jaarbedrag, 3 lijnen
 * (bruto nominaal / bruto geïndexeerd / netto geïndexeerd) + detail-tabel
 * achter een knop. Module-accent horizon. Toont een rode melding dat eerder
 * stoppen met werken niet is verwerkt.
 */
export function PensioenProjectieChart({
  pensionEvents,
  currentAge,
  inflationRate,
  year,
}: Props) {
  const [tableOpen, setTableOpen] = useState(false)
  const { hasEntered } = useModalAnimation({ delay: 120 })
  const animProgress = hasEntered ? 1 : 0

  const rows = useMemo(
    () =>
      buildPensionProjection({
        pensionEvents,
        currentAge: currentAge ?? 0,
        inflationRate,
        year,
      }),
    [pensionEvents, currentAge, inflationRate, year],
  )

  const minAge = rows.length > 0 ? rows[0]!.age : 0
  const maxAge = rows.length > 0 ? rows[rows.length - 1]!.age : 0
  const ageSpan = Math.max(1, maxAge - minAge)

  const yMax = useMemo(() => {
    const peak = Math.max(
      0,
      ...rows.map((r) => Math.max(r.brutoNominaal, r.brutoGeindexeerd)),
    )
    if (peak <= 0) return 10_000
    const exp = Math.pow(10, Math.floor(Math.log10(peak)))
    return Math.ceil(peak / exp) * exp * 1.1
  }, [rows])

  const yTicks = useMemo(() => {
    const count = 4
    return Array.from({ length: count + 1 }, (_, i) => (yMax / count) * i)
  }, [yMax])

  const xTicks = useMemo(() => {
    const ticks: number[] = []
    const step = ageSpan <= 15 ? 5 : 10
    // Op een veelvoud van step beginnen voor nette labels.
    let a = Math.ceil(minAge / step) * step
    if (a > minAge) ticks.push(minAge)
    for (; a <= maxAge; a += step) ticks.push(a)
    if (ticks.length > 0 && ticks[ticks.length - 1] !== maxAge) ticks.push(maxAge)
    return ticks
  }, [minAge, maxAge, ageSpan])

  // Tabel: per 5 jaar tonen (compacter), incl. eerste en laatste rij.
  const tableRows = useMemo(
    () => rows.filter((r, i) => i === 0 || i === rows.length - 1 || r.age % 5 === 0),
    [rows],
  )

  // Geen potten met een actief venster → niets te tekenen.
  if (rows.length === 0) return null

  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xScale = (age: number) => PAD.left + ((age - minAge) / ageSpan) * chartW
  const yScale = (val: number) => PAD.top + chartH - (val / yMax) * chartH

  const linePath = (key: keyof PensionProjectionRow) =>
    rows
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${xScale(r.age)},${yScale(r[key] as number)}`)
      .join(' ')

  return (
    <div className="space-y-4">
      {/* Rode melding — stoplicht-/risicorood, GEEN module-accent */}
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-xl border border-negative/30 bg-negative/5 p-3"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden />
        <p className="text-xs leading-relaxed text-[var(--ink-2)]">
          Eerder stoppen met werken is hierin nog niet verwerkt — je te-bereiken
          pensioen gaat uit van doorwerken tot je pensioendatum.
        </p>
      </div>

      {/* Grafiek */}
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Verwacht pensioen-jaarbedrag per leeftijd van ${minAge} tot ${maxAge} jaar, drie lijnen: bruto nominaal, bruto geïndexeerd en netto geïndexeerd.`}
        >
          {/* Y-as gridlines + labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={yScale(tick)}
                x2={W - PAD.right}
                y2={yScale(tick)}
                stroke="var(--rule-soft)"
                strokeWidth={tick === 0 ? 1 : 0.5}
                strokeDasharray={tick === 0 ? undefined : '3,3'}
              />
              <text
                x={PAD.left - 8}
                y={yScale(tick) + 4}
                textAnchor="end"
                className="fill-[var(--ink-3)] font-mono text-[10px] tabular-nums"
              >
                {fmtYAxis(tick)}
              </text>
            </g>
          ))}

          {/* X-as labels (leeftijd) */}
          {xTicks.map((age) => (
            <text
              key={age}
              x={xScale(age)}
              y={H - 8}
              textAnchor="middle"
              className="fill-[var(--ink-3)] font-mono text-[10px] tabular-nums"
            >
              {age}
            </text>
          ))}

          {/* Lijn — bruto nominaal (gestreept → fade-in; draw-in kan niet met dash) */}
          <path
            d={linePath('brutoNominaal')}
            fill="none"
            stroke={LINE_BRUTO_NOM}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,4"
            style={{ opacity: animProgress, transition: 'opacity 500ms ease-out' }}
          />
          {/* Lijn — bruto geïndexeerd (draw-in via pathLength) */}
          <path
            d={linePath('brutoGeindexeerd')}
            fill="none"
            stroke={LINE_BRUTO_IDX}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1 - animProgress,
              transition: 'stroke-dashoffset 700ms ease-out',
            }}
          />
          {/* Lijn — netto geïndexeerd (draw-in, lichte stagger) */}
          <path
            d={linePath('nettoGeindexeerd')}
            fill="none"
            stroke={LINE_NETTO}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1 - animProgress,
              transition: 'stroke-dashoffset 700ms ease-out 120ms',
            }}
          />

          {/* Y-as eenheid-label rechtsboven */}
          <text
            x={W - PAD.right}
            y={PAD.top - 6}
            textAnchor="end"
            className="fill-[var(--ink-4)] font-mono text-[9px] uppercase tracking-[0.12em]"
          >
            € / jaar
          </text>
        </svg>

        {/* Legenda */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <LegendItem color={LINE_BRUTO_NOM} dashed label="Bruto (nominaal)" />
          <LegendItem color={LINE_BRUTO_IDX} label="Bruto (geïndexeerd)" />
          <LegendItem color={LINE_NETTO} label="Netto (geïndexeerd)" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
          De x-as is je leeftijd, de y-as je verwachte pensioen per jaar. Nominaal blijft
          vlak (je te-bereiken bedrag); geïndexeerd is wat je zou krijgen als je pensioen
          volledig met de inflatie meegroeit — het verschil is je koopkrachtverlies. Netto
          is na belasting.
        </p>

        <button
          type="button"
          onClick={() => setTableOpen(true)}
          className="mt-3 inline-flex items-center rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)]"
        >
          Details
        </button>
      </div>

      {/* Detail-tabel achter een knop — BottomSheet (z-[70], boven de nav-pill) */}
      <BottomSheet
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        title="Pensioen per leeftijd"
        size="lg"
      >
        <div className="px-5 pb-6 pt-3">
          <p className="mb-3 text-xs leading-relaxed text-[var(--ink-3)]">
            Verwacht pensioen per jaar (per 5 jaar). Nominaal = vlak; geïndexeerd =
            bij volledige indexatie aan de inflatie; netto = na belasting.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-[var(--ink-3)]">
                  <th className="py-2 pr-3 text-left font-medium">Leeftijd</th>
                  <th className="py-2 pl-3 font-medium">Bruto nom.</th>
                  <th className="py-2 pl-3 font-medium">Bruto geïnd.</th>
                  <th className="py-2 pl-3 font-medium">Netto geïnd.</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.age}
                    className="border-b border-[var(--rule-soft)] last:border-0"
                  >
                    <td className="py-2 pr-3 text-left font-mono tabular-nums text-[var(--ink-2)]">
                      {r.age}
                    </td>
                    <td className="py-2 pl-3 font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(Math.round(r.brutoNominaal))}
                    </td>
                    <td className="py-2 pl-3 font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(Math.round(r.brutoGeindexeerd))}
                    </td>
                    <td className="py-2 pl-3 font-mono tabular-nums font-semibold text-[var(--ink)]">
                      {formatCurrency(Math.round(r.nettoGeindexeerd))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
      <svg width={18} height={6} aria-hidden className="shrink-0">
        <line
          x1={0}
          y1={3}
          x2={18}
          y2={3}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={dashed ? '4,3' : undefined}
        />
      </svg>
      {label}
    </span>
  )
}
