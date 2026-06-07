'use client'

import { useEffect, useState } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { FlowSummary } from '@/lib/transaction-insights'

/**
 * GeldstroomGauge — de headline van de transactie-analysepagina.
 *
 * Een halfronde naald-meter (speedometer) die de verhouding bijschrijvingen ↔
 * afschrijvingen toont: de boog loopt van links (rood — uitgaven domineren) via
 * amber (in balans) naar rechts (groen — inkomsten/sparen domineren). De naald
 * wijst naar `income / (income + expense)`; de spaarquote staat als grote
 * leeswaarde onder de meter. Daaronder een KPI-rij (Inkomen / Uitgaven / Saldo).
 *
 * Stijl (Editorial Finance): ingetogen palet uit onze income/expense/horizon-
 * tokens i.p.v. een regenboog; dunne naald in inkt-kleur; Playfair-leeswaarde.
 *
 * Presentational: enkel een `FlowSummary` in, geen data-fetching. Bij volledig
 * geen activiteit (income === 0 && expense === 0) rendert het niets.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// Geometrie van de halve boog (viewBox 0 0 200 124).
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
  if (rate >= 30) return 'sterk'
  if (rate >= 15) return 'gezond'
  return 'laag'
}

export function GeldstroomGauge({ summary }: { summary: FlowSummary }) {
  const { income, expense, net, savingsRate } = summary

  const total = income + expense
  const targetShare = total > 0 ? income / total : 0.5

  // Animeer de naald van het midden (0.5) naar de werkelijke verhouding.
  const [share, setShare] = useState(0.5)
  useEffect(() => {
    let raf = 0
    let startTs = 0
    const from = 0.5
    const duration = 700
    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setShare(from + (targetShare - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetShare])

  // Verberg bij volledig geen transactie-activiteit.
  if (income === 0 && expense === 0) {
    return null
  }

  // Naaldhoek: 180° (links/rood) bij share 0, 0° (rechts/groen) bij share 1.
  const needleAngle = 180 - share * 180
  const tip = polar(needleAngle, R - 16)

  return (
    <div className="space-y-3">
      {/* Halfronde naald-meter */}
      <div className="mx-auto w-full" style={{ maxWidth: 340 }}>
        <svg viewBox="0 0 200 124" className="h-auto w-full" role="img" aria-label={`Verhouding inkomsten/uitgaven: ${Math.round(targetShare * 100)}% inkomsten`}>
          {/* Gekleurde boog-segmenten */}
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

          {/* Uiteinde-labels */}
          <text
            x={CX - R - BAND / 2}
            y={CY + 16}
            textAnchor="start"
            className="font-mono uppercase"
            style={{ fontSize: 9, letterSpacing: '0.12em', fill: 'var(--color-expense-600)' }}
          >
            Uit
          </text>
          <text
            x={CX + R + BAND / 2}
            y={CY + 16}
            textAnchor="end"
            className="font-mono uppercase"
            style={{ fontSize: 9, letterSpacing: '0.12em', fill: 'var(--color-income-600)' }}
          >
            In
          </text>
        </svg>

        {/* Leeswaarde: spaarquote */}
        <div className="-mt-1 text-center">
          <div
            className="text-[28px] font-black leading-none tabular-nums text-[var(--ink)]"
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

      {/* KPI-rij: Inkomen / Uitgaven / Saldo */}
      <div className="grid grid-cols-3 border-t border-b border-[var(--border-ed)]">
        <KpiCell label="Inkomen" sub="ontvangen" tone="positive">
          <MaskedAmount value={income} tone="inherit" monoWhenVisible={false} />
        </KpiCell>
        <KpiCell label="Uitgaven" sub="besteed" tone="negative">
          <MaskedAmount value={expense} tone="inherit" monoWhenVisible={false} />
        </KpiCell>
        <KpiCell label="Saldo" sub="netto" tone={net >= 0 ? 'positive' : 'negative'}>
          <MaskedAmount
            value={net}
            tone="inherit"
            monoWhenVisible={false}
            signPrefix={net > 0 ? '+' : ''}
          />
        </KpiCell>
      </div>
    </div>
  )
}

function KpiCell({
  label,
  sub,
  tone,
  children,
}: {
  label: string
  sub: string
  tone: 'positive' | 'negative' | 'neutral'
  children: React.ReactNode
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-[var(--color-income-700)]'
      : tone === 'negative'
        ? 'text-[var(--color-expense-600)]'
        : 'text-[var(--ink)]'
  const labelColor =
    tone === 'positive'
      ? 'text-[var(--color-income-700)]'
      : tone === 'negative'
        ? 'text-[var(--color-expense-600)]'
        : 'text-[var(--ink-3)]'

  return (
    <div className="p-3 sm:p-4 border-r border-[var(--border-ed)] last:border-r-0">
      <div className={`mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] ${labelColor}`}>
        {label}
      </div>
      <div
        className={`text-[18px] sm:text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums ${valueColor}`}
        style={{ fontFamily: PLAYFAIR }}
      >
        {children}
      </div>
      <div className="mt-1.5 text-[11px] italic text-[var(--ink-3)]" style={{ fontFamily: SOURCE_SERIF }}>
        {sub}
      </div>
    </div>
  )
}
