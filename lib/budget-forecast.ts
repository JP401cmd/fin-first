/**
 * Budget forecast utility — predicts next month's realisation per category.
 *
 * Uses 3–6 month weighted moving average of the actual realisation.
 * Computes confidence from coefficient of variation (std / mean).
 * "Op basis van je patroon geef je volgende maand €420 uit aan boodschappen."
 *
 * ── RICHTING (B-019, sep 2026) ──────────────────────────────────────────────
 * De REKENKANT is richtingsloos: de aanroeper levert een maandreeks die al
 * richting-gecorrigeerd is door `spendingContribution` (lib/budget-spending.ts),
 * dus op een inkomstenbudget is de reeks het gerealiseerde inkomen en op een
 * uitgavenbudget de besteding. De WOORDEN waren dat niet: elke uitkomst heette
 * "Verwachte uitgaven" en elke zin "geef je volgende maand € X uit aan …",
 * inclusief op "Salaris". Gemeld vanaf /overzicht/budget.
 *
 * Daarom draagt de uitkomst nu zijn eigen `label` en zijn eigen zinnen, gekozen
 * op `budget_type`. Het is bewust ÉÉN tabel (`PHRASING`) en geen tweede
 * richtingsregel naast `isExpenseDirectionBudget`/`isIncomeDirectionBudget`: die
 * bepalen hoe er GEREKEND wordt (dat gebeurt stroomopwaarts), deze tabel bepaalt
 * alleen hoe de uitkomst heet. Het limiet-alarm hangt aan dezelfde tabel —
 * alleen op een uitgavenbudget is boven de limiet uitkomen slecht nieuws,
 * spiegelbeeldig aan `isOverPositive` in components/app/budget-shared.tsx, dat
 * in de UI de kleuren stuurt.
 */

export type BudgetForecast = {
  /**
   * Kop boven het bedrag én titel van de "Hoe berekend?"-overlay, in de
   * richting van het budget ("Verwachte uitgaven" / "Verwacht inkomen" /
   * "Verwachte inleg" / "Verwachte aflossing" / "Verwacht bedrag").
   * Consumeren, niet zelf verzinnen.
   */
  label: string
  /** Predicted amount for next month in EUR */
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
 * De woorden per budgetrichting. ÉÉN tabel — zonder haar stond "uitgaven" in
 * vier losse strings (kop, zin, lege staat, alarm) plus twee keer hardgecodeerd
 * in de UI, en dat is precies waar B-019 doorheen glipte.
 *
 * `alert` bestaat ALLEEN op de uitgaven-richting: op een inkomsten-, spaar- of
 * aflossingsbudget is bóven de limiet uitkomen goed nieuws (zie `isOverPositive`
 * in components/app/budget-shared.tsx, dat daar de kleuren op stuurt). Een
 * archief-post ("Eigen rekening") heeft geen richting en dus geen oordeel.
 */
export interface BudgetForecastPhrasing {
  /** Kop boven het bedrag én titel van de "Hoe berekend?"-overlay. */
  label: string
  /** "Nog niet genoeg <historyNoun> voor …" */
  historyNoun: string
  /** "minimaal 3 maanden met <dataNoun> nodig" */
  dataNoun: string
  /** Onderwerp van de betrouwbaarheidszin, mét de bijpassende werkwoordsvorm. */
  varianceSubject: string
  varianceIsPlural: boolean
  sentence: (amount: string, name: string) => string
  /** `null` = boven de limiet uitkomen is hier géén slecht nieuws. */
  alert: ((exceed: string) => string) | null
}

const PHRASING: Record<
  'income' | 'expense' | 'savings' | 'debt' | 'neutral',
  BudgetForecastPhrasing
> = {
  expense: {
    label: 'Verwachte uitgaven',
    historyNoun: 'uitgavenhistorie',
    dataNoun: 'uitgaven',
    varianceSubject: 'Je uitgaven op deze post',
    varianceIsPlural: true,
    sentence: (a, n) => `Op basis van je patroon geef je volgende maand ${a} uit aan ${n}`,
    alert: (e) => `Let op: verwachte uitgaven overschrijden je limiet met ${e}`,
  },
  income: {
    label: 'Verwacht inkomen',
    historyNoun: 'inkomstenhistorie',
    dataNoun: 'inkomsten',
    varianceSubject: 'Je inkomsten op deze post',
    varianceIsPlural: true,
    sentence: (a, n) => `Op basis van je patroon komt er volgende maand ${a} binnen op ${n}`,
    alert: null,
  },
  savings: {
    label: 'Verwachte inleg',
    historyNoun: 'inleghistorie',
    dataNoun: 'inleg',
    varianceSubject: 'Je inleg op deze post',
    varianceIsPlural: false,
    sentence: (a, n) => `Op basis van je patroon leg je volgende maand ${a} opzij op ${n}`,
    alert: null,
  },
  debt: {
    label: 'Verwachte aflossing',
    historyNoun: 'aflossingshistorie',
    dataNoun: 'aflossingen',
    varianceSubject: 'Je aflossing op deze post',
    varianceIsPlural: false,
    sentence: (a, n) => `Op basis van je patroon los je volgende maand ${a} af op ${n}`,
    alert: null,
  },
  neutral: {
    label: 'Verwacht bedrag',
    historyNoun: 'historie',
    dataNoun: 'bedragen',
    varianceSubject: 'Deze post',
    varianceIsPlural: false,
    sentence: (a, n) => `Op basis van je patroon gaat er volgende maand ${a} om op ${n}`,
    alert: null,
  },
}

/**
 * `budget_type` → woordkeus. Onbekend/leeg → neutraal: geen richting claimen.
 *
 * Ook geëxporteerd omdat het betrouwbaarheidspaneel ernaast
 * (components/app/spending-confidence-indicator.tsx) dezelfde reeks beschrijft
 * en zijn zinnen anders een tweede keer "uitgaven" zouden hardcoderen — dat was
 * de helft van B-019 die op het scherm bleef staan.
 */
export function budgetForecastPhrasing(
  budgetType: string | null | undefined,
): BudgetForecastPhrasing {
  switch (budgetType) {
    case 'expense':
      return PHRASING.expense
    case 'income':
      return PHRASING.income
    case 'savings':
      return PHRASING.savings
    case 'debt':
      return PHRASING.debt
    default:
      return PHRASING.neutral
  }
}

/**
 * Calculate the predicted next-month realisation for a budget category.
 *
 * @param monthlySpending Maandreeks (oudste → nieuwste), ideaal 6–12 waarden.
 *   Al richting-gecorrigeerd door de aanroeper (`spendingContribution`): op een
 *   inkomstenbudget is dit het gerealiseerde inkomen, op een uitgavenbudget de
 *   besteding. Deze functie kent alleen positieve grootten.
 * @param limit Budget limit for this category (for alert comparison)
 * @param budgetName Name of the budget category (for message generation)
 * @param budgetType `budgets.budget_type` — income | expense | savings | debt |
 *   archive. VERPLICHT: zonder richting heet elke voorspelling "uitgaven", ook
 *   op "Salaris" (B-019). Een onbekende waarde valt terug op neutrale woorden.
 * @returns BudgetForecast with prediction, confidence, label and messages
 */
export function computeBudgetForecast(
  monthlySpending: number[],
  limit: number,
  budgetName: string,
  budgetType: string | null | undefined,
): BudgetForecast {
  const phrasing = budgetForecastPhrasing(budgetType)
  // Filter to last 6 months, but only non-zero months for average
  // (zero months might mean no data, not zero spending)
  const recentMonths = monthlySpending.slice(-6)

  // For prediction, use 3–6 months with actual spending data
  const nonZeroMonths = recentMonths.filter(v => v > 0)

  // Insufficient data: need at least 3 months with spending
  if (nonZeroMonths.length < 3) {
    return {
      label: phrasing.label,
      predicted: 0,
      confidence: 'low',
      confidencePercent: 0,
      monthsUsed: nonZeroMonths.length,
      exceedsLimit: false,
      exceedAmount: 0,
      limit,
      hasSufficientData: false,
      message: `Nog niet genoeg ${phrasing.historyNoun} voor ${budgetName} (minimaal 3 maanden nodig)`,
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

  const message = phrasing.sentence(formattedPredicted, budgetName.toLowerCase())

  let alertMessage: string | null = null
  if (exceedsLimit && phrasing.alert) {
    const formattedExceed = new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(exceedAmount)
    alertMessage = phrasing.alert(formattedExceed)
  }

  return {
    label: phrasing.label,
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
