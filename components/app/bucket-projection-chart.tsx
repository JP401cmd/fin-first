'use client'

import { useState, memo } from 'react'
import type { BucketProjectionResult, BucketRow } from '@/lib/bucket-projection'
import { ASSET_TYPE_COLORS, ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { DEBT_LAYER_COLOR } from '@/lib/wealth-composition'
import { formatMaskedCurrency, formatFreedomTimeString, calculateFreedomTime } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { TrendingUp, TrendingDown, Info, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── View types ──────────────────────────────────────────────

type ChartView = 'nom_reeel' | 'opbouw' | 'inkomen' | 'box3'

const CHART_VIEW_LABELS: Record<ChartView, string> = {
  nom_reeel: 'Nominaal vs Reëel',
  opbouw: 'Opbouw (assets / schulden)',
  inkomen: 'Inkomen & spaarquote',
  box3: 'Box 3 belasting',
}

const CHART_VIEWS = Object.keys(CHART_VIEW_LABELS) as ChartView[]

/**
 * Per-bucket vermogensprognose chart with 4 switchable views:
 * 1. Nominaal vs Reëel — nominal + real net worth lines
 * 2. Opbouw — stacked areas per asset type (original chart)
 * 3. Inkomen & spaarquote — income + savings projection
 * 4. Box 3 belasting — annual Box 3 tax
 */
export const BucketProjectionChart = memo(function BucketProjectionChart({
  projection,
  dailyExpenses,
  fireTarget,
}: {
  projection: BucketProjectionResult
  dailyExpenses?: number
  fireTarget?: number
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [showAlternative, setShowAlternative] = useState(false)
  const [chartView, setChartView] = useState<ChartView>('nom_reeel')
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 700 })
  const { masked } = useMaskedAmounts()

  const { rows, alternativeRows, alternativeMethod, isGrowing, currentNetWorth, cashFlowSummary } = projection

  if (rows.length < 2) return null

  const totalMonths = rows[rows.length - 1].month
  const totalYears = Math.round(totalMonths / 12)

  // Dynamic sampling interval based on horizon
  const sampleInterval = totalMonths <= 60 ? 3 : totalMonths <= 120 ? 6 : 12
  const sampled = rows.filter((r, i) => i === 0 || r.month % sampleInterval === 0 || i === rows.length - 1)
  const sampledAlt = alternativeRows.filter((r, i) => i === 0 || r.month % sampleInterval === 0 || i === alternativeRows.length - 1)

  // Active asset types (those with non-zero values)
  const activeTypes = new Set<AssetType>()
  for (const row of sampled) {
    for (const [type, v] of Object.entries(row.assetBuckets)) {
      if (v && v > 0) activeTypes.add(type as AssetType)
    }
  }
  const orderedTypes = [...activeTypes] as AssetType[]

  // Chart dimensions
  const W = 640
  const H = 260
  const PAD_LEFT = 55
  const PAD_RIGHT = 20
  const PAD_TOP = 24
  const PAD_BOTTOM = 40
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // ── Per-view value ranges ─────────────────────────────────

  function computeViewRange(): { maxVal: number; minVal: number } {
    switch (chartView) {
      case 'nom_reeel': {
        const nominals = sampled.map(r => r.netWorth)
        const reals = sampled.map(r => r.netWorth / r.inflationFactor)
        const all = [...nominals, ...reals, ...(fireTarget ? [fireTarget] : [])]
        const max = Math.max(...all)
        const min = Math.min(0, ...all)
        return { maxVal: max, minVal: min }
      }
      case 'opbouw': {
        // Individual line values per asset type + debts + net worth
        const vals: number[] = []
        for (const r of sampled) {
          vals.push(r.netWorth)
          vals.push(r.totalDebts > 0 ? -r.totalDebts : 0)
          for (const type of orderedTypes) {
            vals.push(r.assetBuckets[type] ?? 0)
          }
        }
        if (fireTarget) vals.push(fireTarget)
        const max = Math.max(...vals)
        const min = Math.min(0, ...vals)
        return { maxVal: max, minVal: min }
      }
      case 'inkomen': {
        if (cashFlowSummary.monthlyIncome === 0) return { maxVal: 1, minVal: 0 }
        const incomeValues = sampled.map(r => {
          const yearIdx = Math.floor(r.month / 12)
          return cashFlowSummary.monthlyIncome * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
        })
        const savingsValues = sampled.map(r => {
          const yearIdx = Math.floor(r.month / 12)
          return cashFlowSummary.monthlySurplus * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
        })
        const all = [...incomeValues, ...savingsValues]
        return { maxVal: Math.max(...all) * 1.05, minVal: Math.min(0, ...savingsValues) }
      }
      case 'box3': {
        const annualTaxes = computeAnnualBox3()
        if (annualTaxes.length === 0) return { maxVal: 1, minVal: 0 }
        const nominals = annualTaxes.map(t => t.nominal)
        const reals = annualTaxes.map(t => t.real)
        const all = [...nominals, ...reals]
        return { maxVal: Math.max(...all) * 1.1, minVal: 0 }
      }
    }
  }

  const { maxVal, minVal } = computeViewRange()
  const valRange = (maxVal - minVal) || 1

  function xPos(idx: number) {
    return PAD_LEFT + (idx / Math.max(sampled.length - 1, 1)) * chartW
  }
  function yPos(v: number) {
    return PAD_TOP + chartH - ((v - minVal) / valRange) * chartH
  }

  // ── Shared data helpers ───────────────────────────────────

  function computeAnnualBox3(): { year: number; nominal: number; real: number; inflationFactor: number }[] {
    const results: { year: number; nominal: number; real: number; inflationFactor: number }[] = []
    const maxYears = Math.floor(totalMonths / 12)
    for (let y = 1; y <= maxYears; y++) {
      const endMonth = y * 12
      const startMonth = (y - 1) * 12
      const endRow = rows.find(r => r.month === endMonth)
      const startRow = rows.find(r => r.month === startMonth)
      if (endRow && startRow) {
        const nominal = endRow.cumulativeBox3Tax - startRow.cumulativeBox3Tax
        results.push({
          year: y,
          nominal,
          real: nominal / endRow.inflationFactor,
          inflationFactor: endRow.inflationFactor,
        })
      }
    }
    return results
  }

  function computeAnnualBox3Alt(): { year: number; nominal: number; real: number }[] {
    const results: { year: number; nominal: number; real: number }[] = []
    const maxYears = Math.floor(totalMonths / 12)
    for (let y = 1; y <= maxYears; y++) {
      const endMonth = y * 12
      const startMonth = (y - 1) * 12
      const endRow = alternativeRows.find(r => r.month === endMonth)
      const startRow = alternativeRows.find(r => r.month === startMonth)
      if (endRow && startRow) {
        const nominal = endRow.cumulativeBox3Tax - startRow.cumulativeBox3Tax
        results.push({ year: y, nominal, real: nominal / endRow.inflationFactor })
      }
    }
    return results
  }

  // Build individual line paths per asset type (for opbouw view)
  function buildAssetLines() {
    return orderedTypes.map(type => {
      const path = sampled
        .map((r, i) => {
          const v = r.assetBuckets[type] ?? 0
          return `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`
        })
        .join(' ')
      return { type, path, color: ASSET_TYPE_COLORS[type] }
    })
  }

  // Dynamic year markers based on horizon
  const yearMarkerMonths: number[] = totalMonths <= 60
    ? [12, 24, 36, 48, 60]
    : totalMonths <= 120
      ? [12, 36, 60, 84, 120]
      : [12, 36, 60, 120, 180, 240]
  const yearMarkers = yearMarkerMonths
    .filter(m => m <= totalMonths)
    .map(m => {
      const idx = sampled.findIndex(r => r.month === m)
      return idx >= 0 ? { idx, label: `${m / 12}j`, month: m } : null
    })
    .filter(Boolean) as { idx: number; label: string; month: number }[]

  // Grid lines
  const gridLines = [0.25, 0.5, 0.75].map(pct => ({
    y: PAD_TOP + chartH - pct * chartH,
    val: minVal + pct * valRange,
  }))

  // End snapshot
  const endRow = rows[rows.length - 1]
  const lineColor = isGrowing ? '#f59e0b' : '#ef4444'

  // Animation
  const lineAnim = hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none'
  const fillAnim = hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none'

  // ── Contextual message per view ───────────────────────────

  function renderContextMessage() {
    switch (chartView) {
      case 'nom_reeel': {
        const nomEnd = endRow.netWorth
        const realEnd = endRow.netWorth / endRow.inflationFactor
        const pctNom = currentNetWorth !== 0 ? ((nomEnd - currentNetWorth) / Math.abs(currentNetWorth) * 100).toFixed(0) : '0'
        return (
          <div className={`mb-4 flex items-start gap-2.5 rounded-[var(--r-lg)] border p-3.5 ${
            isGrowing ? 'border-kern-200 bg-kern-50/60' : nomEnd < currentNetWorth ? 'border-red-200 bg-red-50/60' : 'border-[var(--border-ed)] bg-[var(--subtle)]/60'
          }`}>
            {isGrowing ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" /> : nomEnd < currentNetWorth ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />}
            <p className={`text-sm font-medium ${isGrowing ? 'text-kern-800' : nomEnd < currentNetWorth ? 'text-red-800' : 'text-[var(--ink-2)]'}`}>
              {isGrowing
                ? `Nominaal groeit je vermogen met ${pctNom}% naar ${formatMaskedCurrency(nomEnd, masked)} over ${totalYears} jaar. In euro's van vandaag: ${formatMaskedCurrency(realEnd, masked)}.`
                : nomEnd < currentNetWorth
                  ? `Let op: je vermogen daalt naar ${formatMaskedCurrency(nomEnd, masked)} (nominaal) over ${totalYears} jaar.`
                  : `Je vermogen blijft stabiel rond ${formatMaskedCurrency(currentNetWorth, masked)}.`
              }
            </p>
          </div>
        )
      }
      case 'opbouw': {
        const endNetWorth = endRow.netWorth
        const pctChange = currentNetWorth !== 0 ? ((endNetWorth - currentNetWorth) / Math.abs(currentNetWorth) * 100).toFixed(0) : '0'
        return (
          <div className={`mb-4 flex items-start gap-2.5 rounded-[var(--r-lg)] border p-3.5 ${
            isGrowing ? 'border-kern-200 bg-kern-50/60' : endNetWorth < currentNetWorth ? 'border-red-200 bg-red-50/60' : 'border-[var(--border-ed)] bg-[var(--subtle)]/60'
          }`}>
            {isGrowing ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" /> : endNetWorth < currentNetWorth ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />}
            <p className={`text-sm font-medium ${isGrowing ? 'text-kern-800' : endNetWorth < currentNetWorth ? 'text-red-800' : 'text-[var(--ink-2)]'}`}>
              {isGrowing
                ? `Je vermogen groeit met ${pctChange}% naar ${formatMaskedCurrency(endNetWorth, masked)} over ${totalYears} jaar — per bucket berekend.`
                : endNetWorth < currentNetWorth
                  ? `Let op: je vermogen daalt naar ${formatMaskedCurrency(endNetWorth, masked)} over ${totalYears} jaar.`
                  : `Je vermogen blijft stabiel rond ${formatMaskedCurrency(currentNetWorth, masked)}.`
              }
            </p>
          </div>
        )
      }
      case 'inkomen': {
        if (cashFlowSummary.monthlyIncome === 0) return null
        const currentAnnual = cashFlowSummary.monthlyIncome * 12
        const endYearIdx = Math.floor(totalMonths / 12)
        const endAnnual = currentAnnual * Math.pow(1 + cashFlowSummary.incomeGrowthRate, endYearIdx)
        const realEndAnnual = endAnnual / endRow.inflationFactor
        return (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r-lg)] border border-kern-200 bg-kern-50/60 p-3.5">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
            <p className="text-sm font-medium text-kern-800">
              Je jaarinkomen groeit van {<MaskedAmount value={currentAnnual} tone="horizon" />} naar {<MaskedAmount value={endAnnual} tone="horizon" />} (nominaal) over {totalYears} jaar. Reëel: {<MaskedAmount value={realEndAnnual} tone="horizon" />}.
            </p>
          </div>
        )
      }
      case 'box3': {
        const annualTaxes = computeAnnualBox3()
        if (annualTaxes.length === 0) return null
        const totalNominal = annualTaxes.reduce((s, t) => s + t.nominal, 0)
        const totalReal = annualTaxes.reduce((s, t) => s + t.real, 0)
        return (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r-lg)] border border-red-200 bg-red-50/60 p-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-medium text-red-800">
              Totale Box 3 belasting over {totalYears} jaar: {<MaskedAmount value={totalNominal} tone="horizon" />} nominaal, {<MaskedAmount value={totalReal} tone="horizon" />} reëel.
            </p>
          </div>
        )
      }
    }
  }

  // ── SVG render functions per view ─────────────────────────

  function renderNomReelView() {
    // Nominal net worth line + area
    const nomPoints = sampled.map((r, i) => ({ x: xPos(i), y: yPos(r.netWorth) }))
    const nomLinePath = nomPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const nomAreaPath = nomLinePath + ` L${nomPoints[nomPoints.length - 1].x.toFixed(1)},${yPos(0).toFixed(1)} L${nomPoints[0].x.toFixed(1)},${yPos(0).toFixed(1)} Z`

    // Real net worth line (dashed)
    const realLinePath = sampled
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(r.netWorth / r.inflationFactor).toFixed(1)}`)
      .join(' ')

    // FIRE target
    const fireY = fireTarget && fireTarget > 0 ? yPos(fireTarget) : null
    const fireInRange = fireY !== null && fireY > PAD_TOP && fireY < PAD_TOP + chartH

    return (
      <>
        <defs>
          <linearGradient id="nomGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Nominal area fill */}
        <path d={nomAreaPath} fill="url(#nomGrad)" style={{ animation: fillAnim }} />
        {/* Nominal line */}
        <path d={nomLinePath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Real line (dashed) */}
        <path d={realLinePath} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.55" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* FIRE target */}
        {fireInRange && (
          <>
            <line x1={PAD_LEFT} y1={fireY!} x2={W - PAD_RIGHT} y2={fireY!} stroke="var(--hor-t, #8a6e42)" strokeWidth="1.5" strokeDasharray="6 3" />
            <text x={W - PAD_RIGHT - 4} y={fireY! + 3} textAnchor="end" style={{ fill: 'var(--hor-t, #8a6e42)', fontSize: 8, fontWeight: 600 }}>FIRE</text>
          </>
        )}
        {/* Hover dots on nominal line */}
        {sampled.map((r, i) => (
          <circle
            key={i} cx={xPos(i)} cy={yPos(r.netWorth)} r={hoveredMonth === i ? 4 : 2}
            fill="#f59e0b" stroke="white" strokeWidth="1"
            opacity={hasEntered ? 1 : 0}
            style={{ transition: hasEntered ? 'opacity 100ms ease-out 650ms' : 'none', cursor: animationComplete ? 'pointer' : 'default', pointerEvents: animationComplete ? 'auto' : 'none' }}
            onMouseEnter={animationComplete ? () => setHoveredMonth(i) : undefined}
            onMouseLeave={animationComplete ? () => setHoveredMonth(null) : undefined}
          />
        ))}
      </>
    )
  }

  function renderOpbouwView() {
    const assetLines = buildAssetLines()
    const nwLinePath = sampled.map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(r.netWorth).toFixed(1)}`).join(' ')
    const altNwLinePath = sampledAlt.map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(r.netWorth).toFixed(1)}`).join(' ')
    const hasDebts = sampled.some(r => r.totalDebts > 0)
    const debtLinePath = hasDebts
      ? sampled.map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(-r.totalDebts).toFixed(1)}`).join(' ')
      : ''
    const fireY = fireTarget && fireTarget > 0 ? yPos(fireTarget) : null
    const fireInRange = fireY !== null && fireY > PAD_TOP && fireY < PAD_TOP + chartH

    return (
      <>
        {/* FIRE target */}
        {fireInRange && (
          <>
            <line x1={PAD_LEFT} y1={fireY!} x2={W - PAD_RIGHT} y2={fireY!} stroke="var(--hor-t, #8a6e42)" strokeWidth="1.5" strokeDasharray="6 3" />
            <text x={W - PAD_RIGHT - 4} y={fireY! + 3} textAnchor="end" style={{ fill: 'var(--hor-t, #8a6e42)', fontSize: 8, fontWeight: 600 }}>FIRE</text>
          </>
        )}
        {/* Individual asset type lines */}
        {assetLines.map(({ type, path, color }) => (
          <path key={type} d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        ))}
        {/* Debt line (negative) */}
        {hasDebts && (
          <path d={debtLinePath} fill="none" stroke={DEBT_LAYER_COLOR} strokeWidth="2" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        )}
        {/* Net worth line (thicker, prominent) */}
        <path d={nwLinePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Alt net worth line */}
        {showAlternative && (
          <path d={altNwLinePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        )}
        {/* Invisible hover rects per sample column for wide hit area */}
        {animationComplete && sampled.map((_, i) => {
          const colW = chartW / Math.max(sampled.length - 1, 1)
          const cx = xPos(i)
          return (
            <rect
              key={i}
              x={cx - colW / 2} y={PAD_TOP} width={colW} height={chartH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoveredMonth(i)}
              onMouseLeave={() => setHoveredMonth(null)}
            />
          )
        })}
        {/* Vertical cursor line on hover */}
        {hoveredMonth !== null && (
          <line
            x1={xPos(hoveredMonth)} y1={PAD_TOP} x2={xPos(hoveredMonth)} y2={PAD_TOP + chartH}
            stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3 2" opacity="0.7"
          />
        )}
        {/* Dots on all lines at hovered column */}
        {hoveredMonth !== null && (() => {
          const r = sampled[hoveredMonth]
          if (!r) return null
          const dots: { cy: number; color: string }[] = []
          for (const type of orderedTypes) {
            const v = r.assetBuckets[type] ?? 0
            if (v > 0) dots.push({ cy: yPos(v), color: ASSET_TYPE_COLORS[type] })
          }
          if (r.totalDebts > 0) dots.push({ cy: yPos(-r.totalDebts), color: DEBT_LAYER_COLOR })
          dots.push({ cy: yPos(r.netWorth), color: lineColor })
          return dots.map((d, i) => (
            <circle key={i} cx={xPos(hoveredMonth)} cy={d.cy} r={3.5} fill={d.color} stroke="white" strokeWidth="1.5" />
          ))
        })()}
      </>
    )
  }

  function renderInkomenView() {
    if (cashFlowSummary.monthlyIncome === 0) {
      return (
        <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fill: 'var(--ink-4)', fontSize: 12 }}>
          Stel je inkomen in om deze weergave te gebruiken.
        </text>
      )
    }

    const incomeNomPoints = sampled.map((r, i) => {
      const yearIdx = Math.floor(r.month / 12)
      const v = cashFlowSummary.monthlyIncome * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
      return { x: xPos(i), y: yPos(v), v }
    })
    const incomeRealPoints = sampled.map((r, i) => {
      const yearIdx = Math.floor(r.month / 12)
      const nom = cashFlowSummary.monthlyIncome * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
      const v = nom / r.inflationFactor
      return { x: xPos(i), y: yPos(v), v }
    })
    const savingsPoints = sampled.map((r, i) => {
      const yearIdx = Math.floor(r.month / 12)
      const v = cashFlowSummary.monthlySurplus * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
      return { x: xPos(i), y: yPos(v), v }
    })

    const incomeNomPath = incomeNomPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const incomeRealPath = incomeRealPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const savingsPath = savingsPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const savingsAreaPath = savingsPath + ` L${savingsPoints[savingsPoints.length - 1].x.toFixed(1)},${yPos(0).toFixed(1)} L${savingsPoints[0].x.toFixed(1)},${yPos(0).toFixed(1)} Z`

    return (
      <>
        <defs>
          <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Savings area fill */}
        <path d={savingsAreaPath} fill="url(#savingsGrad)" style={{ animation: fillAnim }} />
        {/* Savings line */}
        <path d={savingsPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Income nominal line */}
        <path d={incomeNomPath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Income real line (dashed) */}
        <path d={incomeRealPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.55" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Hover dots on income line */}
        {sampled.map((r, i) => (
          <circle
            key={i} cx={xPos(i)} cy={incomeNomPoints[i].y} r={hoveredMonth === i ? 4 : 2}
            fill="#f59e0b" stroke="white" strokeWidth="1"
            opacity={hasEntered ? 1 : 0}
            style={{ transition: hasEntered ? 'opacity 100ms ease-out 650ms' : 'none', cursor: animationComplete ? 'pointer' : 'default', pointerEvents: animationComplete ? 'auto' : 'none' }}
            onMouseEnter={animationComplete ? () => setHoveredMonth(i) : undefined}
            onMouseLeave={animationComplete ? () => setHoveredMonth(null) : undefined}
          />
        ))}
      </>
    )
  }

  function renderBox3View() {
    const annualTaxes = computeAnnualBox3()
    if (annualTaxes.length === 0) {
      return (
        <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fill: 'var(--ink-4)', fontSize: 12 }}>
          Geen Box 3 belasting van toepassing.
        </text>
      )
    }

    const annualAlt = showAlternative ? computeAnnualBox3Alt() : []

    // Map annual taxes to sampled x-positions (find nearest sampled point for each year)
    const taxPoints = annualTaxes.map(t => {
      const monthTarget = t.year * 12
      const idx = sampled.findIndex(r => r.month >= monthTarget)
      const sIdx = idx >= 0 ? idx : sampled.length - 1
      return { x: xPos(sIdx), yNom: yPos(t.nominal), yReal: yPos(t.real), nominal: t.nominal, real: t.real, year: t.year }
    })

    const nomLinePath = taxPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yNom.toFixed(1)}`).join(' ')
    const nomAreaPath = nomLinePath + ` L${taxPoints[taxPoints.length - 1].x.toFixed(1)},${yPos(0).toFixed(1)} L${taxPoints[0].x.toFixed(1)},${yPos(0).toFixed(1)} Z`
    const realLinePath = taxPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yReal.toFixed(1)}`).join(' ')

    let altLinePath = ''
    if (showAlternative && annualAlt.length > 0) {
      const altPoints = annualAlt.map(t => {
        const monthTarget = t.year * 12
        const idx = sampled.findIndex(r => r.month >= monthTarget)
        const sIdx = idx >= 0 ? idx : sampled.length - 1
        return { x: xPos(sIdx), y: yPos(t.nominal) }
      })
      altLinePath = altPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    }

    return (
      <>
        <defs>
          <linearGradient id="box3Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Tax area fill */}
        <path d={nomAreaPath} fill="url(#box3Grad)" style={{ animation: fillAnim }} />
        {/* Nominal tax line */}
        <path d={nomLinePath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Real tax line (dashed) */}
        <path d={realLinePath} fill="none" stroke="#6b4c38" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        {/* Alt method line */}
        {showAlternative && altLinePath && (
          <path d={altLinePath} fill="none" stroke={DEBT_LAYER_COLOR} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.45" strokeLinejoin="round" pathLength={1} style={{ animation: lineAnim }} />
        )}
        {/* Dots on nominal line */}
        {taxPoints.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.yNom} r={hoveredMonth === i ? 4 : 2}
            fill="#ef4444" stroke="white" strokeWidth="1"
            opacity={hasEntered ? 1 : 0}
            style={{ transition: hasEntered ? 'opacity 100ms ease-out 650ms' : 'none', cursor: animationComplete ? 'pointer' : 'default', pointerEvents: animationComplete ? 'auto' : 'none' }}
            onMouseEnter={animationComplete ? () => setHoveredMonth(i) : undefined}
            onMouseLeave={animationComplete ? () => setHoveredMonth(null) : undefined}
          />
        ))}
      </>
    )
  }

  // ── Tooltip per view ──────────────────────────────────────

  function renderTooltip() {
    if (hoveredMonth === null) return null

    switch (chartView) {
      case 'nom_reeel': {
        const r = sampled[hoveredMonth]
        if (!r) return null
        const nom = r.netWorth
        const real = r.netWorth / r.inflationFactor
        return renderTooltipBox(hoveredMonth, yPos(nom), [
          { label: `Maand ${r.month} — Nominaal`, value: formatMaskedCurrency(nom, masked), bold: true },
          { label: `Reëel (euro's van vandaag)`, value: formatMaskedCurrency(real, masked) },
        ])
      }
      case 'opbouw': {
        const r = sampled[hoveredMonth]
        if (!r) return null
        const yearLabel = r.month === 0 ? 'Vandaag' : r.month % 12 === 0 ? `Jaar ${r.month / 12}` : `Maand ${r.month}`
        const lines: TooltipLine[] = [
          { label: yearLabel, value: '', bold: true },
        ]
        for (const type of orderedTypes) {
          const v = r.assetBuckets[type] ?? 0
          if (v > 0) lines.push({ label: ASSET_TYPE_LABELS[type], value: formatMaskedCurrency(v, masked), color: ASSET_TYPE_COLORS[type] })
        }
        if (r.totalDebts > 0) lines.push({ label: 'Schulden', value: formatMaskedCurrency(-r.totalDebts, masked), color: '#ef4444' })
        lines.push({ label: 'Netto vermogen', value: formatMaskedCurrency(r.netWorth, masked), bold: true, color: lineColor })
        if (showAlternative && sampledAlt[hoveredMonth]) {
          lines.push({ label: `Alt. (${alternativeMethod})`, value: formatMaskedCurrency(sampledAlt[hoveredMonth].netWorth, masked) })
        }
        return renderTooltipBox(hoveredMonth, yPos(r.netWorth), lines)
      }
      case 'inkomen': {
        const r = sampled[hoveredMonth]
        if (!r || cashFlowSummary.monthlyIncome === 0) return null
        const yearIdx = Math.floor(r.month / 12)
        const nom = cashFlowSummary.monthlyIncome * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
        const real = nom / r.inflationFactor
        const savings = cashFlowSummary.monthlySurplus * 12 * Math.pow(1 + cashFlowSummary.incomeGrowthRate, yearIdx)
        return renderTooltipBox(hoveredMonth, yPos(nom), [
          { label: `Maand ${r.month} — Inkomen`, value: formatMaskedCurrency(nom, masked), bold: true },
          { label: 'Reëel inkomen', value: formatMaskedCurrency(real, masked) },
          { label: 'Jaarlijkse besparing', value: formatMaskedCurrency(savings, masked) },
        ])
      }
      case 'box3': {
        const annualTaxes = computeAnnualBox3()
        const t = annualTaxes[hoveredMonth]
        if (!t) return null
        const monthTarget = t.year * 12
        const idx = sampled.findIndex(r => r.month >= monthTarget)
        const sIdx = idx >= 0 ? idx : sampled.length - 1
        const lines: TooltipLine[] = [
          { label: `Jaar ${t.year} — Box 3`, value: formatMaskedCurrency(t.nominal, masked), bold: true },
          { label: 'Reëel', value: formatMaskedCurrency(t.real, masked) },
        ]
        if (showAlternative) {
          const alt = computeAnnualBox3Alt()[hoveredMonth]
          if (alt) lines.push({ label: `Alt. (${alternativeMethod})`, value: formatMaskedCurrency(alt.nominal, masked) })
        }
        return renderTooltipBoxAtPos(xPos(sIdx), yPos(t.nominal), lines)
      }
    }
  }

  type TooltipLine = { label: string; value: string; bold?: boolean; color?: string }

  function renderTooltipBox(sampleIdx: number, anchorY: number, lines: TooltipLine[]) {
    return renderTooltipBoxAtPos(xPos(sampleIdx), anchorY, lines)
  }

  function renderTooltipBoxAtPos(anchorX: number, anchorY: number, lines: TooltipLine[]) {
    const tooltipW = 200
    const lineH = 14
    const tooltipH = 10 + lines.length * lineH
    // Position: prefer right of cursor, fallback left, then clamp
    let tooltipX = anchorX + 12
    if (tooltipX + tooltipW > W - 2) tooltipX = anchorX - tooltipW - 12
    tooltipX = Math.max(2, Math.min(tooltipX, W - tooltipW - 2))
    const tooltipY = Math.max(anchorY, PAD_TOP)
    return (
      <g>
        <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={6} fill="var(--paper)" stroke="var(--border-ed)" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(26,25,22,0.1))" />
        {lines.map((line, i) => {
          const textX = tooltipX + (line.color ? 14 : 6)
          return (
            <g key={i}>
              {line.color && (
                <circle cx={tooltipX + 9} cy={tooltipY + 8 + i * lineH} r={2.5} fill={line.color} />
              )}
              <text
                x={textX} y={tooltipY + 11 + i * lineH}
                style={{ fill: line.bold ? 'var(--ink)' : 'var(--ink-3)', fontSize: line.bold ? 10 : 9, fontWeight: line.bold ? 600 : 400 }}
              >
                {line.value ? `${line.label}: ${line.value}` : line.label}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  // ── Legend per view ────────────────────────────────────────

  function renderLegend() {
    const fireY = fireTarget && fireTarget > 0 ? yPos(fireTarget) : null
    const fireInRange = fireY !== null && fireY > PAD_TOP && fireY < PAD_TOP + chartH

    switch (chartView) {
      case 'nom_reeel':
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: '#f59e0b' }} />
              <span className="text-[10px] text-[var(--ink-3)]">Nominaal vermogen</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: '#f59e0b', opacity: 0.55 }} />
              <span className="text-[10px] text-[var(--ink-3)]">Reëel vermogen</span>
            </div>
            {fireInRange && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded border-t border-dashed border-horizon-500" />
                <span className="text-[10px] text-[var(--ink-3)]">FIRE-doel</span>
              </div>
            )}
          </div>
        )
      case 'opbouw': {
        const hasDebtsLegend = sampled.some(r => r.totalDebts > 0)
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            {orderedTypes.map(type => (
              <div key={type} className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: ASSET_TYPE_COLORS[type] }} />
                <span className="text-[10px] text-[var(--ink-3)]">{ASSET_TYPE_LABELS[type]}</span>
              </div>
            ))}
            {hasDebtsLegend && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: DEBT_LAYER_COLOR }} />
                <span className="text-[10px] text-[var(--ink-3)]">Schulden</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} />
              <span className="text-[10px] text-[var(--ink-3)]">Netto vermogen</span>
            </div>
            {showAlternative && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: lineColor, opacity: 0.5 }} />
                <span className="text-[10px] text-[var(--ink-3)]">Alt. ({alternativeMethod})</span>
              </div>
            )}
            {fireInRange && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded border-t border-dashed border-horizon-500" />
                <span className="text-[10px] text-[var(--ink-3)]">FIRE-doel</span>
              </div>
            )}
          </div>
        )
      }
      case 'inkomen':
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: '#f59e0b' }} />
              <span className="text-[10px] text-[var(--ink-3)]">Inkomen (nominaal)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: '#f59e0b', opacity: 0.55 }} />
              <span className="text-[10px] text-[var(--ink-3)]">Inkomen (reëel)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
              <span className="text-[10px] text-[var(--ink-3)]">Jaarlijkse besparing</span>
            </div>
          </div>
        )
      case 'box3':
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-[10px] text-[var(--ink-3)]">Jaarlijkse Box 3 (nominaal)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: '#6b4c38', opacity: 0.7 }} />
              <span className="text-[10px] text-[var(--ink-3)]">Jaarlijkse Box 3 (reëel)</span>
            </div>
            {showAlternative && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: '#ef4444', opacity: 0.45 }} />
                <span className="text-[10px] text-[var(--ink-3)]">Alt. ({alternativeMethod})</span>
              </div>
            )}
          </div>
        )
    }
  }

  // ── Badges per view ───────────────────────────────────────

  function renderBadges() {
    switch (chartView) {
      case 'nom_reeel':
      case 'opbouw':
        return (
          <div className="mt-3 flex flex-wrap gap-2" data-testid="bucket-projection-badges">
            <ProjectionBadge label="Over 1 jaar" value={<MaskedAmount value={projection.year1.netWorth} tone="horizon" />} delta={projection.year1.netWorth - currentNetWorth} dailyExpenses={dailyExpenses} />
            <ProjectionBadge label="Over 3 jaar" value={<MaskedAmount value={projection.year3.netWorth} tone="horizon" />} delta={projection.year3.netWorth - currentNetWorth} dailyExpenses={dailyExpenses} />
            <ProjectionBadge label="Over 5 jaar" value={<MaskedAmount value={projection.year5.netWorth} tone="horizon" />} delta={projection.year5.netWorth - currentNetWorth} dailyExpenses={dailyExpenses} />
            {projection.year10 && <ProjectionBadge label="Over 10 jaar" value={<MaskedAmount value={projection.year10.netWorth} tone="horizon" />} delta={projection.year10.netWorth - currentNetWorth} dailyExpenses={dailyExpenses} />}
            {projection.year20 && <ProjectionBadge label="Over 20 jaar" value={<MaskedAmount value={projection.year20.netWorth} tone="horizon" />} delta={projection.year20.netWorth - currentNetWorth} dailyExpenses={dailyExpenses} />}
          </div>
        )
      case 'inkomen': {
        if (cashFlowSummary.monthlyIncome === 0) return null
        const annualIncome = cashFlowSummary.monthlyIncome * 12
        const milestones = [
          { label: 'Over 1 jaar', years: 1 },
          { label: 'Over 3 jaar', years: 3 },
          { label: 'Over 5 jaar', years: 5 },
          ...(totalMonths >= 120 ? [{ label: 'Over 10 jaar', years: 10 }] : []),
          ...(totalMonths >= 240 ? [{ label: 'Over 20 jaar', years: 20 }] : []),
        ]
        return (
          <div className="mt-3 flex flex-wrap gap-2" data-testid="bucket-projection-badges">
            {milestones.map(({ label, years }) => {
              const nom = annualIncome * Math.pow(1 + cashFlowSummary.incomeGrowthRate, years)
              const row = rows.find(r => r.month === years * 12)
              const real = row ? nom / row.inflationFactor : nom
              return (
                <div key={label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-xs">
                  <span className="text-[var(--ink-3)]">{label}:</span>
                  <span className="font-mono font-medium tabular-nums text-[var(--ink)]">{<MaskedAmount value={nom} tone="horizon" />}</span>
                  <span className="font-mono text-[var(--ink-4)] tabular-nums">({<MaskedAmount value={real} tone="horizon" />} reëel)</span>
                </div>
              )
            })}
          </div>
        )
      }
      case 'box3': {
        const annualTaxes = computeAnnualBox3()
        if (annualTaxes.length === 0) return null
        const milestoneYears = [1, 3, 5, ...(totalMonths >= 120 ? [10] : []), ...(totalMonths >= 240 ? [20] : [])]
        return (
          <div className="mt-3 flex flex-wrap gap-2" data-testid="bucket-projection-badges">
            {milestoneYears.map(y => {
              const cumulative = annualTaxes.filter(t => t.year <= y).reduce((s, t) => s + t.nominal, 0)
              return (
                <div key={y} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-xs">
                  <span className="text-[var(--ink-3)]">{y === 1 ? 'Jaar 1' : `${y} jaar`}:</span>
                  <span className="font-mono font-medium tabular-nums text-red-600">{<MaskedAmount value={cumulative} tone="horizon" />}</span>
                  <span className="font-mono text-[var(--ink-4)] tabular-nums">cumulatief</span>
                </div>
              )
            })}
          </div>
        )
      }
    }
  }

  // ── Main render ───────────────────────────────────────────

  return (
    <div ref={ref} data-testid="bucket-projection-section">
      {/* Contextual message */}
      {renderContextMessage()}

      {/* Controls bar */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {/* View selector dropdown */}
        <div className="relative">
          <select
            value={chartView}
            onChange={e => { setChartView(e.target.value as ChartView); setHoveredMonth(null) }}
            aria-label="Selecteer grafiekweergave"
            className="appearance-none rounded-full border border-[var(--border-ed)] bg-[var(--paper)] py-1 pl-3 pr-7 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus:outline-none focus:ring-1 focus:ring-kern-300"
          >
            {CHART_VIEWS.map(v => (
              <option key={v} value={v}>{CHART_VIEW_LABELS[v]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ink-3)]" />
        </div>

        {/* Alt Box 3 toggle — only for opbouw and box3 views */}
        {(chartView === 'opbouw' || chartView === 'box3') && (
          <button
            type="button"
            onClick={() => setShowAlternative(!showAlternative)}
            aria-pressed={showAlternative}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--subtle)] ${showAlternative ? 'border-kern-400 bg-kern-50 text-kern-700' : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)]'}`}
          >
            {showAlternative ? <ToggleRight className="h-3.5 w-3.5 text-kern-500" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            Vergelijk {alternativeMethod === 'werkelijk' ? 'werkelijk' : 'forfaitair'} rendement
          </button>
        )}
      </div>

      {/* Chart */}
      <svg
        key={chartView}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 280 }}
        role="img"
        aria-label={`Vermogensprognose grafiek — ${CHART_VIEW_LABELS[chartView]}`}
        data-testid="bucket-projection-chart"
      >
        {/* Grid lines */}
        {gridLines.map(({ y, val: gv }, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#e4e4e7" strokeDasharray="4" />
            <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" style={{ fill: 'var(--ink-3)', fontSize: 9 }}>
              {gv >= 1_000_000 ? `${(gv / 1_000_000).toFixed(1)}M`
                : gv >= 1000 ? `${(gv / 1000).toFixed(0)}k`
                : gv.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        {minVal < 0 && (
          <line x1={PAD_LEFT} y1={yPos(0)} x2={W - PAD_RIGHT} y2={yPos(0)} stroke="var(--ink-3)" strokeWidth="1" />
        )}

        {/* "vandaag" marker */}
        <line x1={xPos(0)} y1={PAD_TOP} x2={xPos(0)} y2={PAD_TOP + chartH} stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3 3" />
        <text x={xPos(0)} y={PAD_TOP - 4} textAnchor="middle" style={{ fill: 'var(--ink-4)', fontSize: 8 }}>vandaag</text>

        {/* View-specific content */}
        {chartView === 'nom_reeel' && renderNomReelView()}
        {chartView === 'opbouw' && renderOpbouwView()}
        {chartView === 'inkomen' && renderInkomenView()}
        {chartView === 'box3' && renderBox3View()}

        {/* Tooltip */}
        {renderTooltip()}

        {/* Year markers */}
        {yearMarkers.map(({ idx, label }) => (
          <g key={label}>
            <line x1={xPos(idx)} y1={PAD_TOP + chartH} x2={xPos(idx)} y2={PAD_TOP + chartH + 4} stroke="#a1a1aa" strokeWidth="1" />
            <text x={xPos(idx)} y={H - 10} textAnchor="middle" style={{ fill: 'var(--ink-3)', fontSize: 10, fontWeight: 500 }}>{label}</text>
          </g>
        ))}

        {/* X-axis "nu" label */}
        <text x={xPos(0)} y={H - 10} textAnchor="middle" style={{ fill: 'var(--ink-4)', fontSize: 9 }}>nu</text>
      </svg>

      {/* Legend */}
      {renderLegend()}

      {/* Summary badges */}
      {renderBadges()}
    </div>
  )
})

function ProjectionBadge({
  label,
  value,
  delta,
  dailyExpenses,
}: {
  label: string
  value: React.ReactNode
  delta: number
  dailyExpenses?: number
}) {
  const isPositive = delta > 0
  const isNegative = delta < 0

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-xs">
      <span className="text-[var(--ink-3)]">{label}:</span>
      <span className="font-mono font-medium tabular-nums text-[var(--ink)]">{value}</span>
      <span className={`font-mono font-medium tabular-nums ${isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-[var(--ink-3)]'}`}>
        ({isPositive ? '+' : ''}{<MaskedAmount value={delta} tone="horizon" />})
      </span>
      {dailyExpenses && dailyExpenses > 0 && Math.abs(delta) > 0 && (
        <span className="text-[var(--ink-4)]">
          · {formatFreedomTimeString(calculateFreedomTime(Math.abs(delta), dailyExpenses), 'short')}
        </span>
      )}
    </div>
  )
}
