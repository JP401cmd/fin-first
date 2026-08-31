'use client'

import { useState, useEffect, memo, useCallback, useId } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

const PAD = { top: 16, right: 16, bottom: 28, left: 60 }

function fmtY(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${Math.round(val / 1_000)}k`
  if (abs > 0) return `€${Math.round(val)}`
  return '€0'
}

function fmtEur(val: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val)
}

export type SurplusGapRow = {
  age: number
  flowIn: number
  flowOut: number
  oneTimeNet: number
  phase: 'accumulation' | 'retirement' | string
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

export type LifetimeTotals = {
  opgebouwd: number
  ingeteerd: number
  saldo: number
  kantelpuntAge: number | null
}

export function computeLifetimeTotals(rows: SurplusGapRow[]): LifetimeTotals {
  let opgebouwd = 0
  let ingeteerd = 0
  let kantelpuntAge: number | null = null
  let prevPositive = true
  for (const r of rows) {
    const net = r.flowIn - r.flowOut
    if (net > 0) opgebouwd += net
    else if (net < 0) {
      ingeteerd += -net
      if (prevPositive && kantelpuntAge === null) kantelpuntAge = r.age
      prevPositive = false
    }
  }
  return { opgebouwd, ingeteerd, saldo: opgebouwd - ingeteerd, kantelpuntAge }
}

export const SurplusGapChart = memo(function SurplusGapChart({
  rows,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  fireAge,
  planningMode = 'fire',
  aowAgeFractional,
  height,
  showLegend = true,
}: {
  rows: SurplusGapRow[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  fireAge?: number | null
  planningMode?: 'fire' | 'pensioen'
  aowAgeFractional?: number
  height?: number
  showLegend?: boolean
}) {
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 1200 })
  const summaryId = useId()

  const [containerW, setContainerW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  const W = containerW
  const isDesktop = containerW >= 768
  const H = height ?? (isDesktop ? 200 : 150)
  // Compacte modus voor kaart-inbedding (o.a. de half-widget): met de volle
  // marges blijft er onder ~100px hoogte vrijwel geen tekengebied over, en
  // vijf y-labels lopen op zo'n binnenhoogte door elkaar.
  const compact = H < 100
  const P = compact ? { top: 8, right: 12, bottom: 14, left: 44 } : PAD
  const innerW = W - P.left - P.right
  const innerH = H - P.top - P.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  const xScale = useCallback(
    (age: number) => (maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0),
    [minAge, maxAge, innerW],
  )

  const resolveAge = useCallback((clientX: number, svgRect: DOMRect) => {
    const mouseX = ((clientX - svgRect.left) / svgRect.width) * W
    const relX = mouseX - P.left
    if (relX < 0 || relX > innerW) return null
    const age = Math.round(minAge + (relX / innerW) * (maxAge - minAge))
    return Math.max(minAge, Math.min(maxAge, age))
  }, [W, innerW, minAge, maxAge])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!animationComplete) return
    const age = resolveAge(e.clientX, e.currentTarget.getBoundingClientRect())
    setHoveredAge(age)
  }, [animationComplete, resolveAge])

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (!animationComplete) return
    const touch = e.touches[0]
    if (!touch) return
    const age = resolveAge(touch.clientX, e.currentTarget.getBoundingClientRect())
    setHoveredAge(age)
  }, [animationComplete, resolveAge])

  const handleMouseLeave = useCallback(() => setHoveredAge(null), [])
  const handleTouchEnd = useCallback(() => setHoveredAge(null), [])

  const isPensioenMode = planningMode === 'pensioen'

  const visibleRows = rows.filter(r => r.age >= minAge && r.age <= maxAge)
  const nets = visibleRows.map(r => ({
    age: r.age,
    net: r.flowIn - r.flowOut,
    flowIn: r.flowIn,
    flowOut: r.flowOut,
    phase: r.phase,
  }))

  const sortedAbs = nets.map(n => Math.abs(n.net)).filter(v => v > 0).sort((a, b) => a - b)
  const yMaxRaw = quantile(sortedAbs, 0.95)
  const yMaxAbs = Math.max(yMaxRaw, 1)

  const yZero = P.top + innerH / 2
  const yScale = (val: number) => {
    const clamped = Math.max(-yMaxAbs, Math.min(yMaxAbs, val))
    return yZero - (clamped / yMaxAbs) * (innerH / 2)
  }

  const yearStep = innerW / Math.max(maxAge - minAge, 1)
  const barWidth = Math.max(2, yearStep * (isDesktop ? 0.7 : 0.65))

  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTickAges.push(a)

  const yTicks = compact
    ? [
        { val: yMaxAbs, y: yZero - innerH / 2 },
        { val: 0, y: yZero },
        { val: -yMaxAbs, y: yZero + innerH / 2 },
      ]
    : [
        { val: yMaxAbs, y: yZero - innerH / 2 },
        { val: yMaxAbs / 2, y: yZero - innerH / 4 },
        { val: 0, y: yZero },
        { val: -yMaxAbs / 2, y: yZero + innerH / 4 },
        { val: -yMaxAbs, y: yZero + innerH / 2 },
      ]

  const hovered = hoveredAge !== null ? nets.find(n => n.age === hoveredAge) : null

  const COLOR_POS = 'var(--positive)'
  const COLOR_NEG = 'var(--negative)'

  const xFireLine = !isPensioenMode && fireAge != null && fireAge >= minAge && fireAge <= maxAge
    ? P.left + xScale(fireAge) : null
  const xAowLine = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? P.left + xScale(aowAgeFractional) : null

  const phaseShadeStart = isPensioenMode && aowAgeFractional != null
    ? aowAgeFractional
    : (fireAge ?? null)
  const xShadeStart = phaseShadeStart != null && phaseShadeStart >= minAge && phaseShadeStart <= maxAge
    ? P.left + xScale(phaseShadeStart)
    : null

  const totals = computeLifetimeTotals(visibleRows)
  const summaryText = `Opgebouwd ${fmtEur(totals.opgebouwd)}, ingeteerd ${fmtEur(totals.ingeteerd)}, saldo ${fmtEur(totals.saldo)} over levensloop.`

  return (
    <div ref={ref}>
      <p id={summaryId} className="sr-only">{summaryText}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full block"
        overflow="hidden"
        role="img"
        aria-label="Diverging bars: jaarlijkse opbouw of inteer per leeftijd"
        aria-describedby={summaryId}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {xShadeStart !== null && (
          <rect
            x={xShadeStart}
            y={P.top}
            width={Math.max(0, P.left + innerW - xShadeStart)}
            height={innerH}
            fill="var(--subtle)"
            opacity={hasEntered ? 0.6 : 0}
            style={{ transition: hasEntered ? 'opacity 0.6s ease 0.4s' : 'none' }}
          />
        )}

        {yTicks.map(({ val, y }) => (
          <line key={val} x1={P.left} x2={P.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        <line x1={P.left} x2={P.left + innerW} y1={yZero} y2={yZero}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {yTicks.map(({ val, y }) => (
          <text key={`yl-${val}`} x={P.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
            {val === 0 ? '€0' : (val > 0 ? '+' : '−') + fmtY(Math.abs(val))}
          </text>
        ))}

        {xTickAges.map(age => (
          <text key={`xl-${age}`} x={P.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        {nets.map((n, i) => {
          const isPos = n.net >= 0
          const yEnd = yScale(n.net)
          const barH = Math.abs(yEnd - yZero)
          const yTop = isPos ? yEnd : yZero
          const isFirstBar = n.age === minAge
          const cx = P.left + xScale(n.age)
          const x = Math.max(P.left, cx - barWidth / 2) + (isFirstBar ? 0 : 0)
          const isClipped = Math.abs(n.net) > yMaxAbs
          const fill = isPos ? COLOR_POS : COLOR_NEG
          const staggerSec = Math.min((i / Math.max(nets.length, 1)) * 1.2, 1.2)
          const renderH = hasEntered ? Math.max(barH, n.net === 0 ? 1 : 0.5) : 0
          const renderY = hasEntered ? yTop : yZero

          return (
            <g key={`bar-${n.age}`}>
              <rect
                x={x}
                y={renderY}
                width={barWidth}
                height={renderH}
                rx={1}
                fill={fill}
                opacity={hovered && hovered.age === n.age ? 1 : 0.85}
                style={{
                  transition: hasEntered
                    ? `y 600ms cubic-bezier(.22,1,.36,1) ${staggerSec}s, height 600ms cubic-bezier(.22,1,.36,1) ${staggerSec}s, opacity 200ms ease`
                    : 'none',
                }}
              />
              {isClipped && hasEntered && (
                <text
                  x={cx}
                  y={isPos ? yEnd - 3 : yEnd + 9}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--ink-3)"
                  fontFamily="var(--font-inter, sans-serif)"
                  style={{ transition: `opacity 400ms ease ${staggerSec + 0.6}s`, opacity: hasEntered ? 1 : 0 }}
                >
                  {isPos ? '▲' : '▼'}
                </text>
              )}
            </g>
          )
        })}

        {xFireLine !== null && (
          <g>
            <line x1={xFireLine} x2={xFireLine} y1={P.top} y2={P.top + innerH}
              stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.85} />
            <text x={xFireLine + 4} y={P.top + 10} fontSize={7}
              fill="var(--hor-t, #8a6e42)" fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
              {/* Eén decimaal — de rauwe fractional (46.5833…) hoort nooit op
                  het scherm; spiegelt sim-chart. */}
              FIRE {fireAge?.toFixed(1)}
            </text>
          </g>
        )}
        {xAowLine !== null && aowAgeFractional != null && (
          <g>
            <line x1={xAowLine} x2={xAowLine} y1={P.top} y2={P.top + innerH}
              stroke="var(--hor-t, #8a6e42)" strokeWidth={1.8} strokeDasharray="4 2" opacity={0.85} />
            <text x={xAowLine - 4} y={P.top + 10} textAnchor="end" fontSize={7}
              fill="var(--hor-t, #8a6e42)" fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
              AOW
            </text>
          </g>
        )}

        {hovered && (() => {
          const hx = P.left + xScale(hovered.age)
          const tooltipW = 150
          const tooltipH = 60
          const tx = Math.max(P.left, Math.min(hx - tooltipW / 2, W - P.right - tooltipW))
          const ty = P.top + 4
          const isPos = hovered.net >= 0
          return (
            <g>
              <line x1={hx} x2={hx} y1={P.top} y2={P.top + innerH}
                stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={4} fill="var(--ink)" opacity={0.94} />
              <text x={tx + tooltipW / 2} y={ty + 13} textAnchor="middle" fontSize={8}
                fontWeight={600} fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                Leeftijd {hovered.age}
              </text>
              <text x={tx + 6} y={ty + 26} fontSize={7.5} fill="var(--paper)" opacity={0.75} fontFamily="var(--font-dm-mono, monospace)">
                Aanvulling: +{fmtY(hovered.flowIn)}
              </text>
              <text x={tx + 6} y={ty + 37} fontSize={7.5} fill="var(--paper)" opacity={0.75} fontFamily="var(--font-dm-mono, monospace)">
                Onttrekking: −{fmtY(hovered.flowOut)}
              </text>
              <text x={tx + 6} y={ty + 50} fontSize={8.5} fontWeight={600}
                fill={isPos ? 'var(--positive)' : 'var(--negative)'}
                fontFamily="var(--font-dm-mono, monospace)">
                Saldo: {isPos ? '+' : '−'}{fmtY(Math.abs(hovered.net))}
              </text>
            </g>
          )
        })()}
      </svg>

      {showLegend && (
        <div className="mt-1 flex items-center justify-center gap-x-4 px-4" role="list" aria-label="Legenda surplus en tekort">
          <div className="flex items-center gap-1.5" role="listitem">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--positive)' }} aria-hidden="true" />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">Surplus</span>
          </div>
          <div className="flex items-center gap-1.5" role="listitem">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--negative)' }} aria-hidden="true" />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">Tekort</span>
          </div>
        </div>
      )}
    </div>
  )
})

export function SurplusGapSummary({
  rows,
  variant = 'inline',
}: {
  rows: SurplusGapRow[]
  variant?: 'inline' | 'strip'
}) {
  const { opgebouwd, ingeteerd, saldo } = computeLifetimeTotals(rows)
  const saldoPositive = saldo >= 0
  const { masked } = useMaskedAmounts()

  // Privacy-masking: kaal fmtEur negeert de toggle, dus hier expliciet maskeren.
  // Bij masked verbergen we óók het teken (placeholder mag geregeld richting
  // niet lekken) — spiegelt de MaskedAmount-conventie.
  const cell = (value: number, sign: '+' | '−') =>
    masked ? MASKED_AMOUNT_PLACEHOLDER : `${sign}${fmtEur(value)}`

  if (variant === 'strip') {
    return (
      <div className="grid grid-cols-3 border-t border-b border-[var(--ink)] my-2">
        <div className="p-2 sm:p-2.5 border-r border-[var(--rule-soft)]">
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)] mb-1 font-mono">Opgebouwd</div>
          <div className="font-serif font-black text-[15px] sm:text-[17px] leading-none tracking-[-0.02em] tabular-nums text-[var(--positive)]">
            {cell(opgebouwd, '+')}
          </div>
        </div>
        <div className="p-2 sm:p-2.5 border-r border-[var(--rule-soft)]">
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)] mb-1 font-mono">Ingeteerd</div>
          <div className="font-serif font-black text-[15px] sm:text-[17px] leading-none tracking-[-0.02em] tabular-nums text-[var(--negative)]">
            {cell(ingeteerd, '−')}
          </div>
        </div>
        <div className="p-2 sm:p-2.5">
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)] mb-1 font-mono">Saldo</div>
          <div className="font-serif font-black text-[15px] sm:text-[17px] leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]">
            <span className={!masked && saldoPositive ? 'bg-[var(--horizon-200)]/60 px-1' : ''}>
              {cell(Math.abs(saldo), saldoPositive ? '+' : '−')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-4)] font-mono">Opgebouwd</div>
        <div className="font-mono tabular-nums text-sm font-semibold text-[var(--positive)] mt-0.5">
          {cell(opgebouwd, '+')}
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-4)] font-mono">Ingeteerd</div>
        <div className="font-mono tabular-nums text-sm font-semibold text-[var(--negative)] mt-0.5">
          {cell(ingeteerd, '−')}
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-4)] font-mono">Saldo</div>
        <div className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
          {cell(Math.abs(saldo), saldoPositive ? '+' : '−')}
        </div>
      </div>
    </div>
  )
}
