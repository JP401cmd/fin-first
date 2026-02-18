'use client'

/**
 * SpendingConfidenceIndicator — Visual variance-based confidence indicator.
 *
 * Shows 1–3 signal bars (like WiFi strength) to indicate how predictable
 * spending is for a given budget category:
 * - 3 bars (emerald) = high confidence (low variance, CV < 0.15)
 * - 2 bars (amber) = medium confidence (moderate variance, CV 0.15–0.35)
 * - 1 bar (zinc) = low confidence (high variance, CV > 0.35)
 * - 0 bars (muted) = insufficient data (< 3 months)
 *
 * Also supports a detailed tooltip and percentage display.
 */

import { useState } from 'react'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient'

export interface SpendingVarianceData {
  /** Budget category name */
  categoryName: string
  /** Standard deviation of monthly spending */
  stdDev: number
  /** Mean monthly spending */
  mean: number
  /** Coefficient of variation (stdDev / mean) */
  cv: number
  /** Confidence level derived from CV */
  confidence: ConfidenceLevel
  /** Confidence as percentage (0–100) */
  confidencePercent: number
  /** Number of months of data available */
  monthsOfData: number
  /** Whether there's enough data for a reliable indicator */
  hasSufficientData: boolean
}

/**
 * Calculate spending variance data from monthly spending amounts.
 */
export function calculateSpendingVariance(
  monthlyAmounts: number[],
  categoryName: string,
): SpendingVarianceData {
  // Filter to non-zero months (zero might mean no data, not zero spending)
  const nonZero = monthlyAmounts.filter(v => v > 0)

  if (nonZero.length < 3) {
    return {
      categoryName,
      stdDev: 0,
      mean: 0,
      cv: 1,
      confidence: 'insufficient',
      confidencePercent: 0,
      monthsOfData: nonZero.length,
      hasSufficientData: false,
    }
  }

  const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length
  const variance = nonZero.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZero.length
  const stdDev = Math.sqrt(variance)
  const cv = mean > 0 ? stdDev / mean : 1

  let confidence: ConfidenceLevel
  let confidencePercent: number

  if (cv < 0.15) {
    confidence = 'high'
    confidencePercent = Math.round(90 - cv * 100)
  } else if (cv < 0.35) {
    confidence = 'medium'
    confidencePercent = Math.round(75 - (cv - 0.15) * 150)
  } else {
    confidence = 'low'
    confidencePercent = Math.round(Math.max(20, 45 - (cv - 0.35) * 100))
  }
  confidencePercent = Math.max(10, Math.min(95, confidencePercent))

  return {
    categoryName,
    stdDev: Math.round(stdDev * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    cv: Math.round(cv * 1000) / 1000,
    confidence,
    confidencePercent,
    monthsOfData: nonZero.length,
    hasSufficientData: true,
  }
}

/**
 * Get Dutch label for confidence level.
 */
export function getVarianceConfidenceLabel(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high': return 'Hoge betrouwbaarheid'
    case 'medium': return 'Gemiddelde betrouwbaarheid'
    case 'low': return 'Lage betrouwbaarheid'
    case 'insufficient': return 'Onvoldoende data'
  }
}

/**
 * Get Dutch tooltip description for confidence level.
 */
export function getVarianceTooltip(data: SpendingVarianceData): string {
  if (!data.hasSufficientData) {
    return `Nog niet genoeg maanden met uitgaven (${data.monthsOfData}/3). Minimaal 3 maanden nodig voor een betrouwbare voorspelling.`
  }
  const formattedStdDev = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(data.stdDev)

  switch (data.confidence) {
    case 'high':
      return `Uitgaven zijn zeer voorspelbaar. Variatie van slechts ${formattedStdDev}/mnd over ${data.monthsOfData} maanden. ${data.confidencePercent}% betrouwbaar.`
    case 'medium':
      return `Uitgaven zijn redelijk voorspelbaar. Variatie van ${formattedStdDev}/mnd over ${data.monthsOfData} maanden. ${data.confidencePercent}% betrouwbaar.`
    case 'low':
      return `Uitgaven variëren sterk. Variatie van ${formattedStdDev}/mnd over ${data.monthsOfData} maanden. ${data.confidencePercent}% betrouwbaar.`
    default:
      return ''
  }
}

// Color configurations per confidence level
const CONFIDENCE_COLORS = {
  high: {
    bar: 'bg-emerald-500',
    barInactive: 'bg-emerald-200',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  medium: {
    bar: 'bg-amber-500',
    barInactive: 'bg-amber-200',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  low: {
    bar: 'bg-zinc-400',
    barInactive: 'bg-zinc-200',
    text: 'text-zinc-600',
    bg: 'bg-zinc-50',
    border: 'border-zinc-200',
    dot: 'bg-zinc-400',
  },
  insufficient: {
    bar: 'bg-zinc-300',
    barInactive: 'bg-zinc-200',
    text: 'text-zinc-400',
    bg: 'bg-zinc-50',
    border: 'border-zinc-200',
    dot: 'bg-zinc-300',
  },
}

/**
 * Get the number of active bars for a confidence level.
 */
function getActiveBars(confidence: ConfidenceLevel): number {
  switch (confidence) {
    case 'high': return 3
    case 'medium': return 2
    case 'low': return 1
    case 'insufficient': return 0
  }
}

interface SpendingConfidenceIndicatorProps {
  /** Variance data for the budget category */
  data: SpendingVarianceData
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show the percentage label */
  showPercent?: boolean
  /** Whether to show the confidence text label */
  showLabel?: boolean
  /** Whether to show a tooltip on hover */
  showTooltip?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Visual confidence indicator with 1–3 signal bars.
 * Includes optional tooltip, percentage, and label.
 */
export function SpendingConfidenceIndicator({
  data,
  size = 'md',
  showPercent = false,
  showLabel = false,
  showTooltip = true,
  className = '',
}: SpendingConfidenceIndicatorProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)

  const activeBars = getActiveBars(data.confidence)
  const colors = CONFIDENCE_COLORS[data.confidence]
  const label = getVarianceConfidenceLabel(data.confidence)
  const tooltip = getVarianceTooltip(data)

  // Bar heights per size
  const barConfig = {
    sm: { heights: [6, 10, 14], width: 3, gap: 1, fontSize: 'text-[9px]' },
    md: { heights: [8, 14, 20], width: 4, gap: 1.5, fontSize: 'text-[10px]' },
    lg: { heights: [10, 18, 26], width: 5, gap: 2, fontSize: 'text-xs' },
  }

  const config = barConfig[size]

  return (
    <div
      className={`inline-flex items-end gap-px relative ${className}`}
      data-testid="spending-confidence-indicator"
      data-confidence={data.confidence}
      data-confidence-percent={data.confidencePercent}
      data-months={data.monthsOfData}
      onMouseEnter={() => showTooltip && setTooltipVisible(true)}
      onMouseLeave={() => showTooltip && setTooltipVisible(false)}
    >
      {/* Signal bars */}
      <div
        className="flex items-end"
        style={{ gap: `${config.gap}px` }}
        data-testid="confidence-bars"
      >
        {config.heights.map((height, index) => (
          <div
            key={index}
            className={`rounded-sm transition-colors ${
              index < activeBars ? colors.bar : colors.barInactive
            }`}
            style={{
              width: `${config.width}px`,
              height: `${height}px`,
            }}
            data-testid={`confidence-bar-${index + 1}`}
            data-active={index < activeBars}
          />
        ))}
      </div>

      {/* Optional percentage */}
      {showPercent && data.hasSufficientData && (
        <span className={`ml-1 font-medium ${colors.text} ${config.fontSize}`} data-testid="confidence-percent">
          {data.confidencePercent}%
        </span>
      )}

      {/* Optional label */}
      {showLabel && (
        <span className={`ml-1.5 font-medium ${colors.text} ${config.fontSize}`} data-testid="confidence-label">
          {label}
        </span>
      )}

      {/* Tooltip */}
      {showTooltip && tooltipVisible && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg"
          data-testid="confidence-tooltip"
        >
          <p className={`text-xs font-semibold ${colors.text}`}>{label}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500 leading-relaxed">{tooltip}</p>
          {data.hasSufficientData && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
              <span>σ = €{Math.round(data.stdDev)}</span>
              <span>•</span>
              <span>CV = {(data.cv * 100).toFixed(1)}%</span>
              <span>•</span>
              <span>{data.monthsOfData} mnd</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact confidence badge — combines bars + label in a pill shape.
 * Used in the budget forecast section.
 */
interface ConfidenceBadgeProps {
  data: SpendingVarianceData
  className?: string
}

export function SpendingConfidenceBadge({ data, className = '' }: ConfidenceBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const colors = CONFIDENCE_COLORS[data.confidence]
  const label = getVarianceConfidenceLabel(data.confidence)
  const tooltip = getVarianceTooltip(data)
  const activeBars = getActiveBars(data.confidence)

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${colors.bg} border ${colors.border} ${className}`}
      data-testid="spending-confidence-badge"
      data-confidence={data.confidence}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      {/* Mini signal bars */}
      <div className="flex items-end gap-[1px]" data-testid="badge-confidence-bars">
        {[5, 8, 11].map((height, index) => (
          <div
            key={index}
            className={`rounded-[1px] ${index < activeBars ? colors.dot : colors.barInactive}`}
            style={{ width: '2.5px', height: `${height}px` }}
          />
        ))}
      </div>

      {/* Label */}
      <span className={`text-[10px] font-medium ${colors.text}`} data-testid="badge-label">
        {label}
      </span>

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg"
          data-testid="badge-tooltip"
        >
          <p className={`text-xs font-semibold ${colors.text}`}>{label}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500 leading-relaxed">{tooltip}</p>
          {data.hasSufficientData && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
              <span>σ = €{Math.round(data.stdDev)}</span>
              <span>•</span>
              <span>CV = {(data.cv * 100).toFixed(1)}%</span>
              <span>•</span>
              <span>{data.monthsOfData} mnd</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Detailed variance panel — shows full variance breakdown.
 * Used in budget detail modals for deeper insight.
 */
interface VarianceDetailPanelProps {
  data: SpendingVarianceData
  className?: string
}

export function SpendingVarianceDetailPanel({ data, className = '' }: VarianceDetailPanelProps) {
  const colors = CONFIDENCE_COLORS[data.confidence]
  const label = getVarianceConfidenceLabel(data.confidence)
  const activeBars = getActiveBars(data.confidence)

  const formattedMean = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(data.mean)

  const formattedStdDev = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(data.stdDev)

  if (!data.hasSufficientData) {
    return (
      <div className={`rounded-lg border border-zinc-200 bg-zinc-50 p-3 ${className}`} data-testid="variance-detail-panel">
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-[1px]">
            {[6, 10, 14].map((height, index) => (
              <div
                key={index}
                className="rounded-sm bg-zinc-200"
                style={{ width: '3px', height: `${height}px` }}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-400" data-testid="variance-insufficient-message">
            Onvoldoende data — minimaal 3 maanden met uitgaven nodig ({data.monthsOfData}/3)
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-3 ${className}`} data-testid="variance-detail-panel">
      {/* Header row with bars + label + percentage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Signal bars */}
          <div className="flex items-end gap-[1.5px]" data-testid="detail-confidence-bars">
            {[8, 14, 20].map((height, index) => (
              <div
                key={index}
                className={`rounded-sm ${index < activeBars ? colors.bar : colors.barInactive}`}
                style={{ width: '4px', height: `${height}px` }}
              />
            ))}
          </div>
          <span className={`text-xs font-semibold ${colors.text}`}>{label}</span>
        </div>
        <span className={`text-xs font-bold ${colors.text}`} data-testid="detail-confidence-percent">
          {data.confidencePercent}%
        </span>
      </div>

      {/* Stats row */}
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-zinc-400">Gemiddeld</p>
          <p className="text-xs font-medium text-zinc-700" data-testid="detail-mean">{formattedMean}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400">Variatie</p>
          <p className="text-xs font-medium text-zinc-700" data-testid="detail-stddev">{formattedStdDev}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400">Maanden</p>
          <p className="text-xs font-medium text-zinc-700" data-testid="detail-months">{data.monthsOfData}</p>
        </div>
      </div>

      {/* Variance bar visual */}
      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className={`h-full rounded-full transition-all ${colors.bar}`}
            style={{ width: `${data.confidencePercent}%` }}
            data-testid="detail-confidence-bar"
          />
        </div>
      </div>
    </div>
  )
}
