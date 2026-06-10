'use client'

import { useId } from 'react'
import Link from 'next/link'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

/**
 * NetWorthHistorySheet — popup met het netto-vermogen-verloop.
 *
 * Opent vanuit de MiniNetWorthChart wanneer de gebruiker op het
 * verleden-segment (links van "Vandaag") klikt. Toont:
 *  1. Hoofdbedrag (huidig netto vermogen) + delta over de periode
 *  2. Grote verloop-grafiek (echte waarderingen doorgetrokken,
 *     geschatte punten gestippeld in lichtere inkt)
 *  3. Kassabon-stijl maandtabel: maand · stand · maand-op-maand-delta
 *
 * Geschatte punten (back-cast op spaarritme, geen echte waardering)
 * worden italic gemarkeerd met het label "geschat" zodat de gebruiker
 * werkelijkheid van benadering kan onderscheiden.
 */

export interface HistoryPoint {
  /** ISO-maand (YYYY-MM) of ISO-datum van de waardering. */
  month: string
  value: number
  /** True wanneer dit punt een back-cast schatting is (geen snapshot). */
  estimated?: boolean
}

const MONTH_NAMES = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function formatMonthLabel(isoMonth: string): string {
  // Accepteert zowel 'YYYY-MM' als 'YYYY-MM-DD'.
  const [year, month] = isoMonth.split('-')
  const idx = Number(month) - 1
  if (!year || idx < 0 || idx > 11 || Number.isNaN(idx)) return isoMonth
  return `${MONTH_NAMES[idx]} ${year}`
}

export function NetWorthHistorySheet({
  open,
  onClose,
  history,
  currentNetWorth,
}: {
  open: boolean
  onClose: () => void
  /** Chronologisch oplopend (oudste eerst), inclusief geschatte punten. */
  history: HistoryPoint[]
  currentNetWorth: number
}) {
  const { masked } = useMaskedAmounts()
  // Unieke gradient-id per instantie (SVG-defs zijn document-globaal).
  const gradientId = useId()

  // Reeks voor grafiek + tabel: historie afgesloten met de live stand
  // van vandaag (de snapshots lopen t/m vorige maand).
  const series: HistoryPoint[] = [
    ...history,
    { month: 'nu', value: currentNetWorth },
  ]

  const first = series[0]
  const periodDelta = first ? currentNetWorth - first.value : 0
  const hasEstimates = history.some((h) => h.estimated)

  // ── Grafiek-geometrie ──────────────────────────────────────────
  const W = 560
  const H = 180
  const PAD_X = 8
  const PAD_Y = 16
  const chartW = W - PAD_X * 2
  const chartH = H - PAD_Y * 2

  const values = series.map((p) => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  // Verticale marge zodat de lijn niet tegen de randen plakt; bij een
  // vlakke reeks (alle waardes gelijk) een kunstmatige spanwijdte.
  const span = maxVal - minVal || Math.max(Math.abs(maxVal), 1) * 0.1
  const yMin = minVal - span * 0.12
  const yMax = maxVal + span * 0.12

  const toX = (i: number) =>
    PAD_X + (series.length <= 1 ? 0 : (i / (series.length - 1)) * chartW)
  const toY = (v: number) =>
    PAD_Y + chartH - ((v - yMin) / (yMax - yMin)) * chartH

  const points = series.map((p, i) => ({ x: toX(i), y: toY(p.value), estimated: p.estimated }))

  // Splits in geschat-prefix en echt-suffix. Het grenspunt hoort bij
  // beide paden zodat de lijn doorloopt zonder gat.
  const firstRealIdx = points.findIndex((p) => !p.estimated)
  const estimatedPts = firstRealIdx > 0 ? points.slice(0, firstRealIdx + 1) : []
  const realPts = firstRealIdx >= 0 ? points.slice(firstRealIdx) : []

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.length >= 2
      ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : ''

  const estimatedPath = toPath(estimatedPts)
  const realPath = toPath(realPts)
  const lastPt = points[points.length - 1]

  // Schaduw-vlak onder de volledige verlooplijn: zachte verticale
  // gradient naar de vloer — geeft het grafiekgebied diepte.
  const floorY = (PAD_Y + chartH).toFixed(1)
  const areaPath =
    points.length >= 2
      ? `${toPath(points)} L${points[points.length - 1]!.x.toFixed(1)},${floorY} L${points[0]!.x.toFixed(1)},${floorY} Z`
      : ''

  return (
    <ShellOverlay open={open} onClose={onClose} kind="sheet" size="lg" title="Netto vermogen — verloop">
      <div className="space-y-5">
        {/* Hoofdbedrag + periode-delta */}
        <div>
          <div className="font-serif text-2xl font-semibold text-[var(--ink)] tabular-nums">
            {formatMaskedCurrency(currentNetWorth, masked)}
          </div>
          {first && (
            <p
              className={`mt-1 text-sm font-mono tabular-nums ${
                periodDelta >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {periodDelta >= 0 ? '+' : ''}
              {formatMaskedCurrency(periodDelta, masked)}{' '}
              <span className="font-serif italic text-[var(--ink-3)]">
                sinds {formatMonthLabel(first.month)}
              </span>
            </p>
          )}
        </div>

        {/* Verloop-grafiek */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          aria-label="Netto vermogen verloop over de afgelopen maanden"
          role="img"
        >
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--module-active-700, var(--ink))"
                stopOpacity="0.12"
              />
              <stop
                offset="100%"
                stopColor="var(--module-active-700, var(--ink))"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          {/* Schaduw-vlak onder de verlooplijn */}
          {areaPath && (
            <path d={areaPath} fill={`url(#${gradientId}-area)`} stroke="none" />
          )}
          {/* Geschat segment — lichtere stippellijn */}
          {estimatedPath && (
            <path
              d={estimatedPath}
              fill="none"
              stroke="var(--ink-4)"
              strokeWidth="2"
              strokeDasharray="3 4"
              strokeLinecap="round"
            />
          )}
          {/* Echt segment — doorlopende lijn in module-inkt */}
          {realPath && (
            <path
              d={realPath}
              fill="none"
              stroke="var(--module-active-700, var(--ink))"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
          {/* Punt op vandaag */}
          {lastPt && (
            <circle cx={lastPt.x} cy={lastPt.y} r="4" fill="var(--module-active-700, var(--ink))" />
          )}
        </svg>

        {/* Legenda — alleen wanneer er een geschat segment is */}
        {hasEstimates && (
          <p className="font-serif italic text-xs text-[var(--ink-3)]">
            Het gestippelde deel is een schatting op basis van je spaarritme —
            er zijn voor die maanden nog geen waarderingen vastgelegd.
          </p>
        )}

        {/* Kassabon-stijl maandtabel */}
        <div>
          <div className="border-b border-[var(--border-ed)] pb-1 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Maand
            </span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Stand · verschil
            </span>
          </div>
          <ul>
            {series
              .slice()
              .reverse()
              .map((p, revIdx) => {
                const idx = series.length - 1 - revIdx
                const prev = idx > 0 ? series[idx - 1] : null
                const delta = prev ? p.value - prev.value : null
                const label = p.month === 'nu' ? 'Vandaag' : formatMonthLabel(p.month)
                return (
                  <li
                    key={`${p.month}-${idx}`}
                    className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--rule-soft)] py-1.5 hover:bg-[var(--subtle)]"
                  >
                    <span className="text-sm text-[var(--ink-2)] font-serif">
                      {label}
                      {p.estimated && (
                        <span className="ml-1.5 font-serif italic text-[11px] text-[var(--ink-4)]">
                          geschat
                        </span>
                      )}
                    </span>
                    <span className="text-right">
                      <span
                        className={`font-mono tabular-nums text-sm text-[var(--ink)] ${
                          p.estimated ? 'opacity-60' : ''
                        }`}
                      >
                        {formatMaskedCurrency(p.value, masked)}
                      </span>
                      {delta != null && (
                        <span
                          className={`ml-2 font-mono tabular-nums text-xs ${
                            delta >= 0 ? 'text-positive' : 'text-negative'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}
                          {formatMaskedCurrency(delta, masked)}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>

        {/* Duo-CTA: voorwaarts naar de projectie + terug naar overzicht */}
        <div className="flex items-center gap-2 border-t border-[var(--border-ed)] pt-4">
          <Link
            href="/toekomst"
            className="inline-flex min-h-11 flex-1 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            Bekijk je toekomstprojectie
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
          >
            Terug naar overzicht
          </button>
        </div>
      </div>
    </ShellOverlay>
  )
}
