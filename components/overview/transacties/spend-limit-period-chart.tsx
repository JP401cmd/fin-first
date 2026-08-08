'use client'

/**
 * SpendLimitPeriodChart — het verloop van één grenzenpot over de periodes in het
 * venster (13 maanden / 9 kwartalen / 4 jaren), als inline-SVG staafgrafiek.
 *
 * euro-view: exempt (gerealiseerde historie)
 * Dit zijn GEREALISEERDE bedragen per afgesloten kalenderperiode, geen
 * geprojecteerde reeks: de nominaal/reëel-deflator (ADR 0090) hoort er niet op.
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * Elk bedrag, elke status, elke reeks-teller en de trend komen kant-en-klaar uit
 * `lib/spend-limits/engine.ts` (via `SpendLimitReport`). Hier wordt niets
 * opgeteld, gemiddeld of afgeleid. De enige berekening die dit component doet is
 * GEOMETRIE (pixels) plus één weergave-verhouding (`bedrag / grens × 100`) — dat
 * is geen financieel kerngetal maar de ratio van twee canonieke getallen, en
 * juist die ratio moet onder maskering zichtbaar blijven (zie hieronder).
 *
 * ── MASKERING (ADR-0091-regel: geometrie blijft, bedragen verdwijnen,
 *    verhoudingen mogen) ─────────────────────────────────────────────────────
 *  1. Geometrie blijft: staafhoogtes, de positie van de grenslijn, de vorm van
 *     het voortschrijdend gemiddelde. Die dragen verhoudingen, geen bedragen.
 *  2. Elk euro-label maskeert: staaflabels, tooltip-bedragen, aria-labels én de
 *     Y-as. Onder maskering worden er GEEN numerieke Y-ticks getekend (zes
 *     bullets per tick is ruis, geen informatie) en verliest de grenslijn haar
 *     bedrag — ze houdt haar naam ("je grens") en haar positie.
 *  3. Verhoudingen blijven: percentage-van-de-grens, status, aantal transacties
 *     en "X van de Y periodes boven je grens".
 *
 * Ook de VRIJHEIDSTIJD verdwijnt onder maskering: die is een lineaire functie
 * van het bedrag (bedrag ÷ dagtarief) en zou het gemaskeerde bedrag dus alsnog
 * uitspellen. Vrijheidstijd is hier geen uitzondering op laag 2, maar een
 * verschijningsvorm ervan.
 *
 * ── ANIMATIE ────────────────────────────────────────────────────────────────
 * Dit component leeft in een overlay (de prestatieweergave-pane) en gebruikt
 * daarom `useModalAnimation` — niet `useInViewAnimation`, dat op scroll triggert
 * en in een overlay nooit zou vuren.
 */

import { useMemo, useState } from 'react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import {
  calculateFreedomTime,
  formatCurrency,
  formatFreedomTimeString,
  formatMaskedCurrency,
} from '@/lib/format'
import type { SpendLimitPeriodOutcome, SpendLimitTrend } from '@/lib/spend-limits/engine'

// ── Afmetingen (viewBox-eenheden; de SVG schaalt naar 100% breedte) ─────────

const VIEW_W = 640
const VIEW_H = 210
const PAD_TOP = 18
const PAD_BOTTOM = 28
const PAD_RIGHT = 14
/** Zonder Y-ticks (maskering aan) is de asgoot niet nodig — geometrie schuift mee. */
const PAD_LEFT_TICKS = 48
const PAD_LEFT_BARE = 10

export interface SpendLimitPeriodChartProps {
  /** De periodes in het venster, oud → nieuw, inclusief de lopende periode. */
  outcomes: SpendLimitPeriodOutcome[]
  /** De HUIDIGE grens. Geldt ook voor afgesloten periodes: regels worden niet geversioneerd. */
  limitAmount: number
  /** Trend uit de motor — het voortschrijdend gemiddelde wordt hier alleen getekend. */
  trend: SpendLimitTrend
  /** Aantal afgesloten periodes in het HELE venster (`report.streaks.closedPeriodCount`). */
  closedPeriodCount: number
  /** Aantal afgesloten periodes boven de grens (`report.streaks.exceededPeriodCount`). */
  exceededPeriodCount: number
  /** €/dag voor de vrijheidstijd-regel in de tooltip; `null` ⇒ geen tijdregel. */
  dailyExpenseRate?: number | null
  selectedPeriodKey?: string | null
  onSelectPeriod?: (periodKey: string) => void
}

// ── Labels ──────────────────────────────────────────────────────────────────

const NL_MONTHS_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/**
 * Korte as-label uit de periodesleutel. De drie sleutelvormen zijn een contract
 * van de motor (`'2026-08'` | `'2026-Q3'` | `'2026'`); dit leest ze, het maakt er
 * geen nieuwe.
 */
export function shortPeriodLabel(periodKey: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(periodKey)
  if (month) return NL_MONTHS_SHORT[Number(month[2]) - 1] ?? periodKey
  const quarter = /^(\d{4})-(Q\d)$/.exec(periodKey)
  if (quarter) return quarter[2]
  return periodKey
}

/** Compacte as-tick. Alleen zichtbaar wanneer maskering UIT staat. */
function compactEuro(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000) return `€ ${Math.round(value / 1000)}k`
  if (abs >= 1000) return `€ ${(value / 1000).toFixed(1).replace('.', ',')}k`
  return `€ ${Math.round(value)}`
}

/** Percentage van de grens — een verhouding, geen bedrag (blijft zichtbaar onder maskering). */
function pctOfLimit(amount: number, limitAmount: number): number | null {
  if (!(limitAmount > 0)) return null
  return Math.round((amount / limitAmount) * 100)
}

// ── Component ───────────────────────────────────────────────────────────────

export function SpendLimitPeriodChart({
  outcomes,
  limitAmount,
  trend,
  closedPeriodCount,
  exceededPeriodCount,
  dailyExpenseRate = null,
  selectedPeriodKey = null,
  onSelectPeriod,
}: SpendLimitPeriodChartProps) {
  const { masked } = useMaskedAmounts()
  const { hasEntered } = useModalAnimation({ duration: 700 })
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const movingAvgByPeriod = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const p of trend.movingAvgMatchedAmountByPeriod) {
      map.set(p.periodKey, p.movingAvgMatchedAmount)
    }
    return map
  }, [trend])

  if (outcomes.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Nog geen periodes om te tonen.
      </p>
    )
  }

  const padLeft = masked ? PAD_LEFT_BARE : PAD_LEFT_TICKS
  const innerW = VIEW_W - padLeft - PAD_RIGHT
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const values = outcomes.map((o) => o.periodMatchedAmount)
  const rawMax = Math.max(limitAmount, ...values, 1)
  const yMax = rawMax * 1.1
  // Een netto-negatieve periode (meer terugbetaald dan uitgegeven) hoort ONDER de
  // nullijn te hangen; de motor klemt bewust niet op 0, dus de as doet dat ook niet.
  const yMin = Math.min(0, ...values) * 1.1

  const toY = (v: number) => PAD_TOP + ((yMax - v) / (yMax - yMin)) * innerH
  const zeroY = toY(0)
  const limitY = toY(limitAmount)

  const n = outcomes.length
  const step = innerW / n
  const barW = Math.min(step * 0.62, 34)
  const toX = (i: number) => padLeft + step * i + (step - barW) / 2
  const centerX = (i: number) => toX(i) + barW / 2

  // Bij veel periodes zouden alle labels overlappen; laat er dan één op de twee weg.
  const labelEvery = n > 9 ? 2 : 1

  const ticks = [yMax, (yMax + Math.max(0, yMin)) / 2, Math.max(0, yMin)]

  const avgPoints = outcomes
    .map((o, i) => ({ i, v: movingAvgByPeriod.get(o.periodKey) ?? null }))
    .filter((p): p is { i: number; v: number } => p.v !== null)
  const avgPath =
    avgPoints.length >= 2
      ? avgPoints
          .map((p, k) => `${k === 0 ? 'M' : 'L'}${centerX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`)
          .join(' ')
      : null

  const active = outcomes.find((o) => o.periodKey === activeKey) ?? null
  const activeIndex = active ? outcomes.indexOf(active) : -1

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        className="block max-w-full"
        role="img"
        aria-label={`Verloop per periode, ${n} periodes, met je grenslijn`}
      >
        {/* Y-ticks — ALLEEN zonder maskering (ADR 0091 laag 2). */}
        {!masked &&
          ticks.map((t, i) => (
            <g key={`tick-${i}`}>
              <line
                x1={padLeft}
                y1={toY(t)}
                x2={VIEW_W - PAD_RIGHT}
                y2={toY(t)}
                stroke="var(--border-ed)"
                strokeWidth={0.5}
              />
              <text
                x={padLeft - 6}
                y={toY(t) + 3}
                fontSize={8}
                fill="var(--ink-4)"
                fontFamily="var(--font-mono)"
                textAnchor="end"
              >
                {compactEuro(t)}
              </text>
            </g>
          ))}

        {/* Nullijn — geometrie, blijft altijd. */}
        <line
          x1={padLeft}
          y1={zeroY}
          x2={VIEW_W - PAD_RIGHT}
          y2={zeroY}
          stroke="var(--ink-4)"
          strokeWidth={0.75}
        />

        {/* Staven: onderste segment tot de grens in kern-accent (module-identiteit),
            het deel bóven de grens in het negative-token (semantiek — volgt de
            accentkeuze NIET). De lopende periode is hollow + dashed: voorlopig. */}
        {outcomes.map((o, i) => {
          const v = o.periodMatchedAmount
          const x = toX(i)
          const isSelected = o.periodKey === selectedPeriodKey
          const dash = o.isOpen ? '3 2' : undefined

          if (v < 0) {
            // Netto teruggekregen: staaf hangt onder de nullijn, in het positive-token.
            return (
              <rect
                key={`bar-${o.periodKey}`}
                x={x}
                y={zeroY}
                width={barW}
                height={Math.max(0, toY(v) - zeroY)}
                fill="var(--positive)"
                opacity={hasEntered ? 0.45 : 0}
                strokeDasharray={dash}
                stroke={o.isOpen ? 'var(--positive)' : undefined}
                strokeWidth={o.isOpen ? 1 : undefined}
                style={{ transition: `opacity 500ms ease ${i * 40}ms` }}
              />
            )
          }

          const baseTop = toY(Math.min(v, limitAmount))
          const overTop = v > limitAmount ? toY(v) : null

          return (
            <g key={`bar-${o.periodKey}`}>
              <rect
                x={x}
                y={baseTop}
                width={barW}
                height={Math.max(0, zeroY - baseTop)}
                fill={o.isOpen ? 'var(--color-kern-200)' : 'var(--color-kern-500)'}
                stroke={o.isOpen ? 'var(--color-kern-500)' : undefined}
                strokeWidth={o.isOpen ? 1 : undefined}
                strokeDasharray={dash}
                opacity={hasEntered ? (isSelected ? 1 : 0.9) : 0}
                style={{ transition: `opacity 500ms ease ${i * 40}ms` }}
              />
              {overTop !== null && (
                <rect
                  x={x}
                  y={overTop}
                  width={barW}
                  height={Math.max(0, limitY - overTop)}
                  fill="var(--negative)"
                  stroke={o.isOpen ? 'var(--negative)' : undefined}
                  strokeWidth={o.isOpen ? 1 : undefined}
                  strokeDasharray={dash}
                  opacity={hasEntered ? (o.isOpen ? 0.5 : 0.95) : 0}
                  style={{ transition: `opacity 500ms ease ${i * 40}ms` }}
                />
              )}
              {isSelected && (
                <rect
                  x={x - 2}
                  y={Math.min(baseTop, overTop ?? baseTop) - 2}
                  width={barW + 4}
                  height={Math.max(0, zeroY - Math.min(baseTop, overTop ?? baseTop)) + 4}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1}
                />
              )}
            </g>
          )
        })}

        {/* Staaflabels — het bedrag per periode. Maskeert zonder uitzondering. */}
        {outcomes.map((o, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`val-${o.periodKey}`}
              x={centerX(i)}
              y={Math.max(9, Math.min(toY(o.periodMatchedAmount), zeroY) - 4)}
              fontSize={7}
              fill="var(--ink-3)"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              opacity={hasEntered ? 0.9 : 0}
              style={{ transition: `opacity 500ms ease ${i * 40 + 200}ms` }}
            >
              {formatMaskedCurrency(o.periodMatchedAmount, masked)}
            </text>
          ) : null,
        )}

        {/* Grenslijn: houdt altijd haar POSITIE en haar naam; alleen het bedrag maskeert. */}
        <line
          x1={padLeft}
          y1={limitY}
          x2={VIEW_W - PAD_RIGHT}
          y2={limitY}
          stroke="var(--ink-2)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={hasEntered ? 0.85 : 0}
          style={{ transition: 'opacity 600ms ease 300ms' }}
        />
        <text
          x={VIEW_W - PAD_RIGHT}
          y={Math.max(8, limitY - 4)}
          fontSize={8}
          fill="var(--ink-2)"
          fontFamily="var(--font-mono)"
          textAnchor="end"
          opacity={hasEntered ? 0.9 : 0}
          style={{ transition: 'opacity 600ms ease 300ms' }}
        >
          {masked ? 'je grens' : `je grens · ${formatCurrency(limitAmount)}`}
        </text>

        {/* Voortschrijdend gemiddelde uit de motor — nooit lokaal gemiddeld. */}
        {avgPath && (
          <path
            d={avgPath}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' }}
          />
        )}

        {/* Periodelabels. */}
        {outcomes.map((o, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`lbl-${o.periodKey}`}
              x={centerX(i)}
              y={VIEW_H - 12}
              fontSize={7}
              fill="var(--ink-4)"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {shortPeriodLabel(o.periodKey)}
            </text>
          ) : null,
        )}

        {/* "voorlopig" onder de lopende periode. */}
        {outcomes.map((o, i) =>
          o.isOpen ? (
            <text
              key={`open-${o.periodKey}`}
              x={centerX(i)}
              y={VIEW_H - 3}
              fontSize={6.5}
              fill="var(--ink-3)"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              voorlopig
            </text>
          ) : null,
        )}

        {/* Trefvlakken: één per periode, over de volle hoogte. Toetsenbord-
            bereikbaar (NFR-B1-05) — de tooltip mag niet alleen op hover bestaan. */}
        {outcomes.map((o, i) => {
          const pct = pctOfLimit(o.periodMatchedAmount, limitAmount)
          const statusWord = o.isOpen
            ? o.status === 'exceeded'
              ? 'voorlopig boven je grens'
              : 'voorlopig binnen je grens'
            : o.status === 'exceeded'
              ? 'boven je grens'
              : 'binnen je grens'
          return (
            <rect
              key={`hit-${o.periodKey}`}
              x={padLeft + step * i}
              y={PAD_TOP}
              width={step}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role={onSelectPeriod ? 'button' : 'img'}
              aria-label={`${o.label}: ${formatMaskedCurrency(o.periodMatchedAmount, masked)}, ${statusWord}${
                pct !== null ? `, ${pct}% van je grens` : ''
              }, ${o.matchedTransactionCount} transactie${o.matchedTransactionCount === 1 ? '' : 's'}`}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
              onMouseEnter={() => setActiveKey(o.periodKey)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(o.periodKey)}
              onBlur={() => setActiveKey(null)}
              onClick={onSelectPeriod ? () => onSelectPeriod(o.periodKey) : undefined}
              onKeyDown={
                onSelectPeriod
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectPeriod(o.periodKey)
                      }
                    }
                  : undefined
              }
            />
          )
        })}
      </svg>

      {/* Tooltip — HTML in een relative wrapper, zodat hij niet in de SVG hoeft
          te passen. Status, periode, percentage en aantal transacties blijven
          onder maskering staan; alleen bedrag en vrijheidstijd verdwijnen. */}
      {active && activeIndex >= 0 && (
        <div
          className="pointer-events-none absolute top-2 z-20 max-w-[70%] -translate-x-1/2 whitespace-nowrap border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 shadow-[var(--s2)]"
          style={{ left: `${(centerX(activeIndex) / VIEW_W) * 100}%` }}
        >
          <div className="text-[11px] font-semibold capitalize text-[var(--ink)]">
            {active.label}
            {active.isOpen && (
              <span className="ml-1 font-normal text-[var(--ink-3)]">· voorlopig</span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatMaskedCurrency(active.periodMatchedAmount, masked)}
          </div>
          <div
            className={`mt-0.5 text-[11px] ${
              active.status === 'exceeded' ? 'text-negative' : 'text-positive'
            }`}
          >
            {active.status === 'exceeded' ? 'Boven je grens' : 'Binnen je grens'}
            {pctOfLimit(active.periodMatchedAmount, limitAmount) !== null && (
              <> · {pctOfLimit(active.periodMatchedAmount, limitAmount)}% van je grens</>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            {active.matchedTransactionCount} transactie
            {active.matchedTransactionCount === 1 ? '' : 's'}
          </div>
          {!masked && dailyExpenseRate !== null && dailyExpenseRate > 0 && active.periodMatchedAmount > 0 && (
            <div className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
              ≈{' '}
              {formatFreedomTimeString(
                calculateFreedomTime(active.periodMatchedAmount, dailyExpenseRate),
                'long',
              )}{' '}
              vrijheid
            </div>
          )}
        </div>
      )}

      {/* Legenda + de periodeteller. Beide blijven onder maskering staan:
          verhoudingen en tellingen zijn geen bedragen (ADR 0091 laag 3). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: 'var(--color-kern-500)' }}
          />
          tot je grens
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: 'var(--negative)' }}
          />
          eroverheen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0 w-4 border-t border-dashed border-[var(--ink-2)]" />
          je grens
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0 w-4 border-t border-[var(--ink-3)]" />
          gemiddelde over {trend.windowPeriods} periodes
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--ink-2)]">
        {exceededPeriodCount} van de {closedPeriodCount} afgesloten periode
        {closedPeriodCount === 1 ? '' : 's'} boven je grens
      </p>
    </div>
  )
}
