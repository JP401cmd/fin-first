/**
 * Recurring transaction detection algorithm.
 *
 * Analyzes transaction history to automatically detect recurring patterns
 * such as salary, rent, subscriptions, and utilities.
 *
 * Detection strategy:
 * 1. Group transactions by counterparty name (normalized)
 * 2. For each group, check if transactions occur at regular intervals
 * 3. Detect frequency: monthly, weekly, quarterly, yearly
 * 4. Handle irregular amounts (utility bills that vary slightly)
 * 5. Assign category hints: salary, rent, subscriptions, utilities
 */

export interface DetectedRecurring {
  /** Unique key for this detected pattern */
  key: string
  /** Counterparty name (normalized) */
  counterpartyName: string
  /** Original counterparty names seen */
  originalNames: string[]
  /** Detected frequency */
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  /** Average amount (negative = expense, positive = income) */
  averageAmount: number
  /** Minimum amount seen */
  minAmount: number
  /** Maximum amount seen */
  maxAmount: number
  /** Whether amount varies (utility-style) */
  isVariableAmount: boolean
  /** Coefficient of variation of amounts (0 = exact, higher = more variation) */
  amountVariation: number
  /** Detected day of month (1-31) for monthly/quarterly/yearly */
  dayOfMonth: number | null
  /** Detected day of week (0=Sun, 6=Sat) for weekly */
  dayOfWeek: number | null
  /** Whether this is income (positive amounts) */
  isIncome: boolean
  /** Number of occurrences found */
  occurrences: number
  /** Confidence score: 'high' | 'medium' | 'low' */
  confidence: 'high' | 'medium' | 'low'
  /** Suggested category */
  suggestedCategory: RecurringCategory
  /** Description hint (for matching to budget) */
  description: string
  /** Transaction dates (sorted ascending) */
  dates: string[]
  /** Matched budget_id if found */
  matchedBudgetId: string | null
  /** Most common description from transactions */
  commonDescription: string
  /** Whether this pattern was already confirmed as a recurring transaction */
  alreadyExists: boolean
}

export type RecurringCategory =
  | 'salary'
  | 'rent'
  | 'mortgage'
  | 'subscription'
  | 'utility'
  | 'insurance'
  | 'savings'
  | 'transport'
  | 'other_income'
  | 'other_expense'

/** Dutch labels for categories */
export const CATEGORY_LABELS: Record<RecurringCategory, string> = {
  salary: 'Salaris',
  rent: 'Huur',
  mortgage: 'Hypotheek',
  subscription: 'Abonnement',
  utility: 'Nutsvoorziening',
  insurance: 'Verzekering',
  savings: 'Sparen',
  transport: 'Vervoer',
  other_income: 'Overig inkomen',
  other_expense: 'Overige uitgave',
}

/** Category icon mappings */
export const CATEGORY_ICONS: Record<RecurringCategory, string> = {
  salary: 'banknote',
  rent: 'home',
  mortgage: 'building',
  subscription: 'tv',
  utility: 'zap',
  insurance: 'shield',
  savings: 'piggy-bank',
  transport: 'car',
  other_income: 'plus-circle',
  other_expense: 'minus-circle',
}

// Known Dutch counterparty patterns for categorization
const CATEGORY_PATTERNS: { patterns: RegExp[]; category: RecurringCategory }[] = [
  {
    patterns: [
      /salaris/i, /loon/i, /werkgever/i, /salary/i, /payroll/i,
      /maandloon/i, /nettoloon/i,
    ],
    category: 'salary',
  },
  {
    patterns: [
      /huur/i, /huurbetaling/i, /woningcorporatie/i, /woonstichting/i,
      /vestia/i, /ymere/i, /eigen haard/i, /woonzorg/i,
    ],
    category: 'rent',
  },
  {
    patterns: [
      /hypotheek/i, /mortgage/i, /rabobank.*hypotheek/i,
      /ing.*hypotheek/i, /abn.*hypotheek/i,
    ],
    category: 'mortgage',
  },
  {
    patterns: [
      /netflix/i, /spotify/i, /disney/i, /hbo/i, /amazon.*prime/i,
      /apple.*music/i, /youtube.*premium/i, /xbox/i, /playstation/i,
      /adobe/i, /microsoft.*365/i, /office.*365/i, /dropbox/i,
      /icloud/i, /google.*one/i, /github/i, /notion/i,
      /abonnement/i, /subscription/i, /lidmaatschap/i,
      /sportschool/i, /gym/i, /fitness/i, /basicfit/i, /basic-fit/i,
    ],
    category: 'subscription',
  },
  {
    patterns: [
      /energi/i, /gas/i, /stroom/i, /elektr/i, /water/i,
      /vattenfall/i, /eneco/i, /essent/i, /greenchoice/i,
      /vitens/i, /waternet/i, /dunea/i, /pwn/i,
      /ziggo/i, /kpn/i, /t-mobile/i, /tele2/i, /vodafone/i,
      /internet/i, /glasvezel/i, /provider/i,
    ],
    category: 'utility',
  },
  {
    patterns: [
      /verzekering/i, /insurance/i, /zorgverzekering/i,
      /centraal beheer/i, /achmea/i, /interpolis/i, /nationale.nederlanden/i,
      /nn.*group/i, /aegon/i, /unive/i, /zilveren.*kruis/i,
      /menzis/i, /vgz/i, /cz/i, /ohra/i, /inshared/i,
      /autoverzekering/i, /inboedelverzekering/i, /woonverzekering/i,
    ],
    category: 'insurance',
  },
  {
    patterns: [
      /spaarrekening/i, /spaargeld/i, /sparen/i, /beleggen/i,
      /deposito/i, /vermogen/i,
    ],
    category: 'savings',
  },
  {
    patterns: [
      /ns\.nl/i, /ns\b/i, /ov-chipkaart/i, /translink/i,
      /gvb/i, /ret/i, /htm/i, /arriva/i, /connexxion/i,
      /qbuzz/i, /swapfiets/i, /anwb/i,
    ],
    category: 'transport',
  },
]

/**
 * Normalize a counterparty name for grouping.
 * Strips extra whitespace, lowercases, removes special chars.
 */
export function normalizeCounterparty(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect the category of a transaction based on counterparty name and description.
 */
export function detectCategory(
  counterpartyName: string,
  description: string,
  isIncome: boolean,
): RecurringCategory {
  const searchText = `${counterpartyName} ${description}`.toLowerCase()

  for (const { patterns, category } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        return category
      }
    }
  }

  return isIncome ? 'other_income' : 'other_expense'
}

/**
 * Calculate the median of an array of numbers.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Calculate coefficient of variation (std dev / mean).
 */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (Math.abs(mean) < 0.01) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / Math.abs(mean)
}

/**
 * Detect the most common day-of-month from a set of dates.
 */
function detectDayOfMonth(dates: string[]): number | null {
  if (dates.length < 2) return null

  const days = dates.map(d => new Date(d).getDate())
  const dayCount = new Map<number, number>()

  for (const day of days) {
    dayCount.set(day, (dayCount.get(day) || 0) + 1)
  }

  // Find most common day, but also check nearby days (±2)
  let bestDay = days[0]
  let bestScore = 0

  for (const [day, count] of dayCount) {
    // Count nearby days too (handles month-end variations)
    let score = count
    for (const [otherDay, otherCount] of dayCount) {
      if (otherDay !== day && Math.abs(otherDay - day) <= 2) {
        score += otherCount * 0.5 // partial credit for nearby days
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestDay = day
    }
  }

  return bestDay
}

/**
 * Detect the most common day-of-week from a set of dates.
 */
function detectDayOfWeek(dates: string[]): number | null {
  if (dates.length < 3) return null

  const days = dates.map(d => new Date(d).getDay())
  const dayCount = new Map<number, number>()

  for (const day of days) {
    dayCount.set(day, (dayCount.get(day) || 0) + 1)
  }

  let bestDay = 0
  let bestCount = 0
  for (const [day, count] of dayCount) {
    if (count > bestCount) {
      bestCount = count
      bestDay = day
    }
  }

  // Must appear at least 60% of the time to be a real pattern
  return bestCount / dates.length >= 0.6 ? bestDay : null
}

/**
 * Detect the frequency of a set of transaction dates.
 * Returns the most likely frequency based on intervals between dates.
 */
export function detectFrequency(
  dates: string[],
): { frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'; confidence: 'high' | 'medium' | 'low' } | null {
  if (dates.length < 2) return null

  const sortedDates = [...dates].sort()
  const intervals: number[] = []

  for (let i = 1; i < sortedDates.length; i++) {
    const d1 = new Date(sortedDates[i - 1])
    const d2 = new Date(sortedDates[i])
    const daysBetween = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    intervals.push(daysBetween)
  }

  if (intervals.length === 0) return null

  const medianInterval = median(intervals)
  const cv = coefficientOfVariation(intervals)

  // Weekly: 5-9 days median (allowing some flexibility)
  if (medianInterval >= 5 && medianInterval <= 9) {
    return {
      frequency: 'weekly',
      confidence: cv < 0.15 ? 'high' : cv < 0.3 ? 'medium' : 'low',
    }
  }

  // Monthly: 25-35 days median
  if (medianInterval >= 25 && medianInterval <= 35) {
    return {
      frequency: 'monthly',
      confidence: cv < 0.15 ? 'high' : cv < 0.3 ? 'medium' : 'low',
    }
  }

  // Quarterly: 80-100 days median
  if (medianInterval >= 80 && medianInterval <= 100) {
    return {
      frequency: 'quarterly',
      confidence: cv < 0.2 ? 'high' : cv < 0.4 ? 'medium' : 'low',
    }
  }

  // Yearly: 340-395 days median
  if (medianInterval >= 340 && medianInterval <= 395) {
    return {
      frequency: 'yearly',
      confidence: cv < 0.1 ? 'high' : cv < 0.2 ? 'medium' : 'low',
    }
  }

  // If none match clearly, try to infer based on count and time span
  const firstDate = new Date(sortedDates[0])
  const lastDate = new Date(sortedDates[sortedDates.length - 1])
  const totalDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
  const expectedMonthlyCount = totalDays / 30.4

  // If we have roughly the right count for monthly (+/- 30%)
  if (dates.length >= expectedMonthlyCount * 0.7 && dates.length <= expectedMonthlyCount * 1.3 && dates.length >= 3) {
    return { frequency: 'monthly', confidence: 'low' }
  }

  return null
}

/**
 * Minimum occurrences required per frequency type.
 */
const MIN_OCCURRENCES: Record<string, number> = {
  weekly: 4,
  monthly: 3,
  quarterly: 2,
  yearly: 2,
}

export interface TransactionForDetection {
  id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  is_income: boolean
  budget_id: string | null
  transaction_type?: string | null
}

/**
 * Main detection function: analyzes transactions and returns detected recurring patterns.
 *
 * @param transactions - All transactions to analyze (typically 6-18 months)
 * @param existingRecurrings - Already confirmed recurring transactions (to flag duplicates)
 * @param budgets - Budget list for category matching
 */
export function detectRecurringTransactions(
  transactions: TransactionForDetection[],
  existingRecurrings: { counterparty_name: string | null; amount: number; name: string }[] = [],
  budgets: { id: string; name: string; parent_id: string | null; budget_type: string }[] = [],
): DetectedRecurring[] {
  if (transactions.length < 3) return []

  // Filter out own-account transfers — they're not recurring expenses/income
  const filtered = transactions.filter(
    t => t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'
  )
  if (filtered.length < 3) return []

  // Step 1: Group by normalized counterparty name
  const groups = new Map<string, TransactionForDetection[]>()

  for (const tx of filtered) {
    const name = tx.counterparty_name || tx.description
    if (!name || name.trim().length < 2) continue

    const key = normalizeCounterparty(name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  // Step 2: Analyze each group for recurring patterns
  const detected: DetectedRecurring[] = []

  for (const [normalizedName, txGroup] of groups) {
    // Need minimum occurrences
    if (txGroup.length < 2) continue

    // Sort by date
    const sortedTx = [...txGroup].sort((a, b) => a.date.localeCompare(b.date))

    // Separate income and expense transactions
    const incomeTx = sortedTx.filter(t => t.amount > 0)
    const expenseTx = sortedTx.filter(t => t.amount <= 0)

    // Process each direction separately (a counterparty could be both income and expense)
    for (const subGroup of [incomeTx, expenseTx]) {
      if (subGroup.length < 2) continue

      const amounts = subGroup.map(t => Math.abs(t.amount))
      const dates = subGroup.map(t => t.date)
      const isIncome = subGroup[0].amount > 0

      // Detect frequency
      const freqResult = detectFrequency(dates)
      if (!freqResult) continue

      const { frequency, confidence: freqConfidence } = freqResult

      // Check minimum occurrences for this frequency
      if (subGroup.length < (MIN_OCCURRENCES[frequency] || 3)) continue

      // Calculate amount statistics
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
      const minAmount = Math.min(...amounts)
      const maxAmount = Math.max(...amounts)
      const amountCV = coefficientOfVariation(amounts)
      const isVariable = amountCV > 0.1 // More than 10% variation

      // Overall confidence based on frequency confidence + amount consistency + occurrences
      let confidence: 'high' | 'medium' | 'low'
      if (freqConfidence === 'high' && amountCV < 0.15 && subGroup.length >= 5) {
        confidence = 'high'
      } else if (freqConfidence !== 'low' && amountCV < 0.35 && subGroup.length >= 3) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      // Detect timing
      const dayOfMonth = frequency !== 'weekly' ? detectDayOfMonth(dates) : null
      const dayOfWeek = frequency === 'weekly' ? detectDayOfWeek(dates) : null

      // Detect category
      const counterpartyName = subGroup[0].counterparty_name || ''
      const descriptions = subGroup.map(t => t.description)
      const commonDescription = getMostCommon(descriptions) || counterpartyName
      const category = detectCategory(counterpartyName, commonDescription, isIncome)

      // Check if already exists as recurring transaction
      const existingNorms = existingRecurrings.map(r =>
        normalizeCounterparty(r.counterparty_name || r.name)
      )
      const alreadyExists = existingNorms.includes(normalizedName)

      // Try to match to a budget
      const mostCommonBudgetId = getMostCommonBudgetId(subGroup)

      // Build the detected pattern
      const signedAvg = isIncome ? avgAmount : -avgAmount

      detected.push({
        key: `${normalizedName}-${isIncome ? 'in' : 'out'}`,
        counterpartyName: subGroup[0].counterparty_name || commonDescription,
        originalNames: [...new Set(subGroup.map(t => t.counterparty_name || t.description))],
        frequency,
        averageAmount: Math.round(signedAvg * 100) / 100,
        minAmount: Math.round((isIncome ? minAmount : -maxAmount) * 100) / 100,
        maxAmount: Math.round((isIncome ? maxAmount : -minAmount) * 100) / 100,
        isVariableAmount: isVariable,
        amountVariation: Math.round(amountCV * 100) / 100,
        dayOfMonth,
        dayOfWeek,
        isIncome,
        occurrences: subGroup.length,
        confidence,
        suggestedCategory: category,
        description: commonDescription,
        dates: dates.sort(),
        matchedBudgetId: mostCommonBudgetId,
        commonDescription,
        alreadyExists,
      })
    }
  }

  // Sort by confidence (high first), then by amount (largest first)
  return detected.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 }
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence]
    }
    return Math.abs(b.averageAmount) - Math.abs(a.averageAmount)
  })
}

/**
 * Get the most common string from an array.
 */
function getMostCommon(arr: string[]): string | null {
  if (arr.length === 0) return null
  const counts = new Map<string, number>()
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  let best = arr[0]
  let bestCount = 0
  for (const [item, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      best = item
    }
  }
  return best
}

/**
 * Get the most common budget_id from transactions.
 */
function getMostCommonBudgetId(txs: TransactionForDetection[]): string | null {
  const ids = txs.filter(t => t.budget_id).map(t => t.budget_id!)
  if (ids.length === 0) return null
  return getMostCommon(ids)
}

/**
 * Convert a detected recurring pattern to a recurring_transactions row.
 */
export function detectedToRecurring(
  detected: DetectedRecurring,
  accountId: string,
  userId: string,
): {
  user_id: string
  account_id: string
  name: string
  amount: number
  description: string
  counterparty_name: string
  frequency: string
  day_of_month: number | null
  day_of_week: number | null
  start_date: string
  is_active: boolean
  budget_id: string | null
} {
  return {
    user_id: userId,
    account_id: accountId,
    name: detected.counterpartyName,
    amount: detected.averageAmount,
    description: detected.commonDescription,
    counterparty_name: detected.counterpartyName,
    frequency: detected.frequency,
    day_of_month: detected.dayOfMonth,
    day_of_week: detected.dayOfWeek,
    start_date: detected.dates[0] || new Date().toISOString().split('T')[0],
    is_active: true,
    budget_id: detected.matchedBudgetId,
  }
}
