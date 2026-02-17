/**
 * Budget forecast utility — predicts next month's spending per category.
 *
 * Uses 3–6 month weighted moving average of actual spending.
 * Computes confidence from coefficient of variation (std / mean).
 * "Op basis van je patroon geef je volgende maand €420 uit aan boodschappen."
 */

export type BudgetForecast = {
  /** Predicted spend for next month in EUR */
  predicted: number
  /** Confidence level: 'high' | 'medium' | 'low' */
  confidence: 'high' | 'medium' | 'low'
  /** Confidence as a numeric percentage 0–100 */
  confidencePercent: number
  /** Number of months of data used for the prediction */
  monthsUsed: number
  /** Whether the predicted spend exceeds the budget limit */
  exceedsLimit: boolean
  /** How much it exceeds the limit by (0 if within limit) */
  exceedAmount: number
  /** The budget limit used for comparison */
  limit: number
  /** Whether there is enough data for a reliable prediction (>= 3 months) */
  hasSufficientData: boolean
  /** Contextual message in Dutch */
  message: string
  /** Alert message when predicted spend exceeds limit (null if within limit) */
  alertMessage: string | null
  /** Monthly values used for calculation (for debugging/display) */
  monthlyValues: number[]
  /** Standard deviation of spending values */
  stdDev: number
  /** Mean spending value */
  mean: number
}

/**
 * Calculate predicted next month spending for a budget category.
 *
 * @param monthlySpending Array of monthly spending amounts (most recent last), ideally 6–12 entries
 * @param limit Budget limit for this category (for alert comparison)
 * @param budgetName Name of the budget category (for message generation)
 * @returns BudgetForecast with prediction, confidence, and messages
 */
export function computeBudgetForecast(
  monthlySpending: number[],
  limit: number,
  budgetName: string,
): BudgetForecast {
  // Filter to last 6 months, but only non-zero months for average
  // (zero months might mean no data, not zero spending)
  const recentMonths = monthlySpending.slice(-6)

  // For prediction, use 3–6 months with actual spending data
  const nonZeroMonths = recentMonths.filter(v => v > 0)

  // Insufficient data: need at least 3 months with spending
  if (nonZeroMonths.length < 3) {
    return {
      predicted: 0,
      confidence: 'low',
      confidencePercent: 0,
      monthsUsed: nonZeroMonths.length,
      exceedsLimit: false,
      exceedAmount: 0,
      limit,
      hasSufficientData: false,
      message: `Nog niet genoeg uitgavenhistorie voor ${budgetName} (minimaal 3 maanden nodig)`,
      alertMessage: null,
      monthlyValues: recentMonths,
      stdDev: 0,
      mean: 0,
    }
  }

  // Weighted moving average: more recent months get higher weight
  // Weights: [1, 2, 3, 4, 5, 6] for up to 6 months (most recent = highest)
  const weights = nonZeroMonths.map((_, i) => i + 1)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const weighted = nonZeroMonths.reduce((sum, val, i) => sum + val * weights[i], 0)
  const predicted = Math.round(weighted / totalWeight)

  // Simple mean for comparison
  const mean = nonZeroMonths.reduce((s, v) => s + v, 0) / nonZeroMonths.length

  // Standard deviation
  const variance = nonZeroMonths.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZeroMonths.length
  const stdDev = Math.sqrt(variance)

  // Coefficient of variation (CV) — lower = more consistent = higher confidence
  const cv = mean > 0 ? stdDev / mean : 1

  // Confidence mapping: CV < 0.15 = high, < 0.35 = medium, else low
  let confidence: 'high' | 'medium' | 'low'
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

  // Limit comparison
  const exceedsLimit = limit > 0 && predicted > limit
  const exceedAmount = exceedsLimit ? predicted - limit : 0

  // Contextual messages
  const formattedPredicted = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(predicted)

  const message = `Op basis van je patroon geef je volgende maand ${formattedPredicted} uit aan ${budgetName.toLowerCase()}`

  let alertMessage: string | null = null
  if (exceedsLimit) {
    const formattedExceed = new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(exceedAmount)
    alertMessage = `Let op: verwachte uitgaven overschrijden je limiet met ${formattedExceed}`
  }

  return {
    predicted,
    confidence,
    confidencePercent,
    monthsUsed: nonZeroMonths.length,
    exceedsLimit,
    exceedAmount,
    limit,
    hasSufficientData: true,
    message,
    alertMessage,
    monthlyValues: recentMonths,
    stdDev: Math.round(stdDev * 100) / 100,
    mean: Math.round(mean * 100) / 100,
  }
}

/**
 * Get the confidence label in Dutch.
 */
export function getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return 'Hoge betrouwbaarheid'
    case 'medium': return 'Gemiddelde betrouwbaarheid'
    case 'low': return 'Lage betrouwbaarheid'
  }
}

/**
 * Get the confidence color classes.
 */
export function getConfidenceColors(confidence: 'high' | 'medium' | 'low') {
  switch (confidence) {
    case 'high':
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' }
    case 'medium':
      return { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' }
    case 'low':
      return { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400', border: 'border-zinc-200' }
  }
}
