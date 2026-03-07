// ── Seizoensgeheugen (Seasonal Memory) ─────────────────────
// Stores monthly expense/income snapshots in localStorage so the AI briefing
// can detect personal seasonal spending patterns and compare with the same
// month from previous years.
// Key: 'briefing_seasonal'
// Format: Record<month(1-12), {avgExpenses, avgIncome, year}[]>
// Max 2 years of data (24 entries total).

const STORAGE_KEY = 'briefing_seasonal'
const MAX_YEARS = 2

export interface SeasonalSnapshot {
  avgExpenses: number
  avgIncome: number
  year: number
}

export type SeasonalData = Record<string, SeasonalSnapshot[]>

const NL_MONTHS = [
  '', 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** Read seasonal data from localStorage */
function readSeasonalData(): SeasonalData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SeasonalData
  } catch {
    return {}
  }
}

/** Write seasonal data to localStorage */
function writeSeasonalData(data: SeasonalData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota / SSR */ }
}

/**
 * Update seasonal data with current month's expenses and income.
 * Called after each briefing. Overwrites entry for current month+year
 * if it already exists. Keeps max 2 years of data per month.
 */
export function updateSeasonalSnapshot(
  month: number,
  year: number,
  monthlyExpenses: number,
  monthlyIncome: number,
): void {
  const data = readSeasonalData()
  const key = String(month)

  const entries = data[key] ?? []

  // Replace existing entry for this year, or add new
  const existingIdx = entries.findIndex(e => e.year === year)
  const snapshot: SeasonalSnapshot = {
    avgExpenses: Math.round(monthlyExpenses),
    avgIncome: Math.round(monthlyIncome),
    year,
  }

  if (existingIdx >= 0) {
    entries[existingIdx] = snapshot
  } else {
    entries.push(snapshot)
  }

  // Keep only the last MAX_YEARS entries per month, sorted by year
  entries.sort((a, b) => a.year - b.year)
  while (entries.length > MAX_YEARS) {
    entries.shift()
  }

  data[key] = entries
  writeSeasonalData(data)
}

/**
 * Generate seasonal context string comparing current month with same month
 * from previous year(s). Returns empty string if no prior data exists.
 */
export function getSeasonalContext(
  currentMonth: number,
  currentYear: number,
  currentExpenses: number,
  currentIncome: number,
): string {
  const data = readSeasonalData()
  const key = String(currentMonth)
  const entries = data[key] ?? []

  // Find last year's entry for the same month
  const lastYearEntry = entries
    .filter(e => e.year < currentYear)
    .sort((a, b) => b.year - a.year)[0]

  if (!lastYearEntry) return ''

  const monthName = NL_MONTHS[currentMonth] || `maand ${currentMonth}`
  const lines: string[] = []

  // Expense comparison
  if (lastYearEntry.avgExpenses > 0) {
    const expDelta = currentExpenses - lastYearEntry.avgExpenses
    const expPct = Math.round((expDelta / lastYearEntry.avgExpenses) * 100)
    const direction = expPct >= 0 ? 'meer' : 'minder'
    lines.push(
      `Vorig jaar ${monthName} gaf je ${formatEuro(lastYearEntry.avgExpenses)} uit, ` +
      `nu ${formatEuro(currentExpenses)} — ${Math.abs(expPct)}% ${direction}`
    )
  }

  // Income comparison
  if (lastYearEntry.avgIncome > 0 && currentIncome > 0) {
    const incDelta = currentIncome - lastYearEntry.avgIncome
    const incPct = Math.round((incDelta / lastYearEntry.avgIncome) * 100)
    if (Math.abs(incPct) >= 5) {
      const direction = incPct >= 0 ? 'hoger' : 'lager'
      lines.push(
        `Inkomen ${Math.abs(incPct)}% ${direction} dan ${monthName} ${lastYearEntry.year}`
      )
    }
  }

  return lines.join('; ')
}

/** Simple euro formatter for seasonal context (no dependency on format.ts to keep lightweight) */
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
