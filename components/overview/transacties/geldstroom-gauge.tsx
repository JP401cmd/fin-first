'use client'

import { useEffect, useState } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { FlowSummary } from '@/lib/transaction-insights'

/**
 * GeldstroomGauge — compacte halfronde naald-meter voor de **spaarquote**,
 * geschaald van −100% (links, rood — meer uit dan in) via 0% (midden, amber)
 * naar +100% (rechts, groen — alles gespaard). De naald volgt de spaarquote
 * (geclampt op [−100, +100]); de waarde staat als centrale leeswaarde. Daaronder
 * een compacte Inkomen/Uitgaven/Saldo-stack zodat de kaart in een smalle (1/3)
 * kolom past.
 *
 * Stijl (Editorial Finance): ingetogen palet uit onze income/expense/horizon-
 * tokens; dunne naald in inkt-kleur; Playfair-leeswaarde.
 *
 * Presentational: enkel een `FlowSummary` in. Bij geen activiteit rendert niets.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// Geometrie van de halve boog (viewBox 0 0 200 118).
const CX = 100
const CY = 96
const R = 78
const BAND = 13

// 5 boog-segmenten, links→rechts: donkerrood → rood → amber → groen → donkergroen.
const SEGMENT_COLORS = [
  'var(--color-expense-600)',
  'var(--color-expense-400)',
  'var(--color-horizon-400)',
  'var(--color-income-500)',
  'var(--color-income-600)',
]

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) }
}

/** Boog van startDeg naar endDeg (180°=links … 0°=rechts), over de bovenkant. */
function arcPath(startDeg: number, endDeg: number, radius: number): string {
  const s = polar(startDeg, radius)
  const e = polar(endDeg, radius)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function savingsRateLabel(rate: number): string {
  if (rate < 0) return 'negatief'
  if (rate >= 30) return 'sterk'
  if (rate >= 15) return 'gezond'
  return 'laag'
}

export function GeldstroomGauge({ summary }: { summary: FlowSummary }) {
  const { income, expense, net, savingsRate } = summary

  // Naald: spaarquote geclampt op [−100, +100] → fractie 0..1 (−100=links, +100=rechts).
  const clamped = Math.max(-100, Math.min(100, savingsRate))
  const targetFraction = (clamped + 100) / 200

  const [fraction, setFraction] = useState(0.5)
  useEffect(() => {
    let raf = 0
    let startTs = 0
    const from = 0.5
    const duration = 700
    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setFraction(from + (targetFraction - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetFraction])

  if (income === 0 && expense === 0) {
    return null
  }

  const needleAngle = 180 - fraction * 180
  const tip = polar(needleAngle, R - 16)

  return (
    <div className="space-y-3">
      {/* Halfronde naald-meter */}
      <div className="mx-auto w-full" style={{ maxWidth: 200 }}>
        <svg
          viewBox="0 0 200 118"
          className="h-auto w-full"
          role="img"
          aria-label={`Spaarquote ${savingsRate}% (schaal −100% tot +100%)`}
        >
          {SEGMENT_COLORS.map((color, i) => {
            const start = 180 - 36 * i
            const end = 180 - 36 * (i + 1)
            return (
              <path
                key={i}
                d={arcPath(start, end, R)}
                fill="none"
                stroke={color}
                strokeWidth={BAND}
                strokeLinecap="butt"
              />
            )
          })}

          {/* Naald + hub */}
          <line
            x1={CX}
            y1={CY}
            x2={tip.x.toFixed(2)}
            y2={tip.y.toFixed(2)}
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={6} fill="var(--ink)" />
          <circle cx={CX} cy={CY} r={2.5} fill="var(--paper)" />

          {/* Schaal-uiteinden */}
          <text
            x={CX - R - BAND / 2}
            y={CY + 15}
            textAnchor="start"
            className="font-mono"
            style={{ fontSize: 8.5, letterSpacing: '0.04em', fill: 'var(--color-expense-600)' }}
          >
            −100%
          </text>
          <text
            x={CX + R + BAND / 2}
            y={CY + 15}
            textAnchor="end"
            className="font-mono"
            style={{ fontSize: 8.5, letterSpacing: '0.04em', fill: 'var(--color-income-600)' }}
          >
            +100%
          </text>
        </svg>

        {/* Leeswaarde: spaarquote */}
        <div className="-mt-1 text-center">
          <div
            className="text-[22px] font-black leading-none tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {savingsRate}%
          </div>
          <div
            className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            spaarquote · {savingsRateLabel(savingsRate)}
          </div>
        </div>
      </div>

      {/* Inkomen/Uitgaven/Saldo als compacte horizontale balk (3-up) — minder
          verticale ruimte dan een stack. */}
      <div className="grid grid-cols-3 border-t border-b border-[var(--border-ed)] text-center">
        <KpiCell label="Inkomen" tone="positive">
          <MaskedAmount value={income} tone="inherit" />
        </KpiCell>
        <KpiCell label="Uitgaven" tone="negative">
          <MaskedAmount value={expense} tone="inherit" />
        </KpiCell>
        <KpiCell label="Saldo" tone={net >= 0 ? 'positive' : 'negative'}>
          <MaskedAmount value={net} tone="inherit" signPrefix={net > 0 ? '+' : ''} />
        </KpiCell>
      </div>
    </div>
  )
}

function KpiCell({
  label,
  tone,
  children,
}: {
  label: string
  tone: 'positive' | 'negative'
  children: React.ReactNode
}) {
  const valueColor =
    tone === 'positive' ? 'text-[var(--color-income-700)]' : 'text-[var(--color-expense-600)]'
  return (
    <div className="border-r border-[var(--border-ed)] px-1 py-2 last:border-r-0">
      <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${valueColor}`}>
        {children}
      </div>
    </div>
  )
}
