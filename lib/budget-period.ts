/**
 * Budget-periode berekening voor de budgetpagina (period-toggle Maand/YTD/12 mnd).
 *
 * Pure, testbare bron voor het datumbereik dat de budgetpagina consumeert. Losgetrokken
 * uit components/app/budgets-client.tsx zodat het gedrag geregressietest kan worden
 * zonder de hele client-component te renderen.
 *
 * Belangrijk onderscheid tussen de twee tijd-inputs:
 * - `monthDate`  = de losstaande maand-SELECTIE (maand-nav-pijltjes of een
 *                  `?maand=YYYY-MM`-deeplink). Bepaalt alléén de 'maand'-modus.
 * - `now`        = de werkelijke huidige datum. Bepaalt YTD en 12-maanden, die per
 *                  definitie aan "vandaag" hangen en NIET aan de maand-selectie.
 *
 * YTD = altijd 1 januari van het HUIDIGE kalenderjaar t/m de huidige maand — ongeacht
 * welke maand toevallig in `monthDate` staat.
 *
 * Maandgrenzen volgen de projectconventie: nooit toISOString() (dag-shift bij TZ),
 * altijd lokale jaar/maand/dag-componenten via localDateStr.
 */

export type BudgetPeriodMode = 'maand' | 'ytd' | '12m'

export interface BudgetPeriod {
  /** Inclusieve ondergrens, lokale datum 'YYYY-MM-DD'. */
  periodStart: string
  /** Exclusieve bovengrens (eerste dag van de volgende maand), lokale datum 'YYYY-MM-DD'. */
  periodEnd: string
  /** Aantal maanden in de periode (voor het schalen van maandlimieten). */
  periodMonthCount: number
}

/**
 * Lokale datumstring 'YYYY-MM-DD' uit de kalendercomponenten van een Date.
 * Bewust geen toISOString(): dat converteert naar UTC en kan de dag verschuiven,
 * wat maandgrenzen kapotmaakt (zie de maandgrenzen-TZ-conventie van dit project).
 */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Bereken het datumbereik + maand-aantal voor de gekozen periode-modus.
 *
 * @param periodMode - 'maand' (geselecteerde maand), 'ytd' of '12m'
 * @param monthDate  - de geselecteerde maand (alleen relevant voor 'maand')
 * @param now        - de huidige datum (injecteerbaar voor tests); default new Date()
 */
export function computeBudgetPeriod(
  periodMode: BudgetPeriodMode,
  monthDate: Date,
  now: Date = new Date(),
): BudgetPeriod {
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  if (periodMode === 'ytd') {
    // YTD hangt aan 'now', NIET aan monthDate: 1 jan huidig jaar t/m huidige maand.
    // Edge case 1 januari: now.getMonth() === 0 → yearStart = 1 jan, months = 1,
    // periodEnd = 1 feb → exact de lopende maand januari, geen off-by-one.
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const months = now.getMonth() + 1 // Jan=1, Feb=2, ...
    return {
      periodStart: localDateStr(yearStart),
      periodEnd: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      periodMonthCount: months,
    }
  }

  if (periodMode === '12m') {
    const twelveMonthsAgo = new Date(currentMonthEnd.getFullYear(), currentMonthEnd.getMonth() - 12, 1)
    return {
      periodStart: localDateStr(twelveMonthsAgo),
      periodEnd: localDateStr(currentMonthEnd),
      periodMonthCount: 12,
    }
  }

  // Default: de geselecteerde losse maand.
  return {
    periodStart: localDateStr(monthDate),
    periodEnd: localDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)),
    periodMonthCount: 1,
  }
}
