/**
 * Canonieke dagtarief-bron (€/dag) voor de "geld = opgeslagen tijd"-conversie.
 *
 * ── Waarom deze module bestaat ──────────────────────────────────────────────
 * Vóór KRUIS-20 herimplementeerde élk oppervlak (balans/budget/vermogen-rapport,
 * de client-side DailyExpenseProvider, de bezittingen-pagina, de netto-vermogen-
 * widget) dezelfde "jaaruitgaven → dagtarief"-som — mét net andere venstergrenzen
 * (12-mnd rolling vs. losse kalendermaand vs. rapportperiode). Daardoor gaf
 * hetzelfde bedrag verschillende "jaren vrijheid" per scherm. Dit is de ENE
 * gedeelde bron: elk oppervlak middelt de werkelijke uitgaven over exact hetzelfde
 * rolling-venster (`EXPENSE_RATE_ROLLING_MONTHS`) en converteert via de canonieke
 * `dailyExpenseRate()` (×12/365) uit `lib/format.ts`.
 *
 * Grondslag = ALLE negatieve transacties in het venster (ruwe uitgaven, geen
 * essentieel/"must"-filter). Dat is bewust dezelfde basis als vóór de consolidatie
 * — dit ticket harmoniseert alléén het venster/codepad, niet wélke uitgaven meetellen.
 * De aparte onttrekkingsfase-grondslag (`uitgaveNaPensioenPerJaar` → horizon-kernel)
 * is een ánder concept en hoort hier NIET thuis.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { dailyExpenseRate } from '@/lib/format'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { EXPENSE_RATE_ROLLING_MONTHS } from '@/lib/constants'

export interface RecentDailyExpenseRate {
  /** Dagtarief in €/dag (canonieke jaar/365-basis via `dailyExpenseRate`). */
  dailyRate: number
  /** Gemiddelde maanduitgaven over het rolling-venster (of de schatting-fallback). */
  monthlyExpenses: number
  /** Aantal maanden met data (1..EXPENSE_RATE_ROLLING_MONTHS); 0 bij schatting/geen data. */
  dataMonths: number
  /** Herkomst van het tarief: echte transacties, profiel-schatting, of geen. */
  source: 'transactions' | 'estimate' | 'none'
}

type ExpenseRow = { amount: number | string; date: string }

/**
 * Pure variant: bereken het canonieke dagtarief uit reeds-opgehaalde
 * uitgaven-rijen (amount < 0) over het rolling-venster dat op `referenceDate`
 * eindigt. Gebruik deze wanneer een oppervlak de rijen tóch al fetcht
 * (rapport-routes, dashboard-loader) — zo delen we de formule zonder extra query.
 *
 * @param rows - Transactie-rijen met negatieve `amount` over het venster.
 * @param referenceDate - Einddatum van het venster (bepaalt dataMonths).
 * @param fallbackMonthlyExpenses - Optionele maand-schatting; alléén gebruikt
 *   wanneer er GEEN transactie-rijen zijn (bv. onboarding zonder transacties),
 *   zodat een schatting-only gebruiker niet plots "0 vrijheid" ziet.
 */
export function recentDailyExpenseRateFromRows(
  rows: ExpenseRow[],
  referenceDate: Date,
  fallbackMonthlyExpenses = 0,
): RecentDailyExpenseRate {
  if (rows.length > 0) {
    const totalExpenses = rows.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)
    const times = rows
      .map((tx) => new Date(tx.date).getTime())
      .filter((t) => Number.isFinite(t))
    const earliest = times.length > 0 ? new Date(Math.min(...times)) : referenceDate
    let dataMonths = Math.max(
      1,
      (referenceDate.getFullYear() - earliest.getFullYear()) * 12 +
        (referenceDate.getMonth() - earliest.getMonth()) +
        1,
    )
    dataMonths = Math.min(dataMonths, EXPENSE_RATE_ROLLING_MONTHS)
    const monthlyExpenses = totalExpenses / dataMonths
    return {
      dailyRate: dailyExpenseRate(monthlyExpenses),
      monthlyExpenses,
      dataMonths,
      source: 'transactions',
    }
  }
  if (fallbackMonthlyExpenses > 0) {
    return {
      dailyRate: dailyExpenseRate(fallbackMonthlyExpenses),
      monthlyExpenses: fallbackMonthlyExpenses,
      dataMonths: 0,
      source: 'estimate',
    }
  }
  return { dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' }
}

/**
 * Server-variant: query het canonieke rolling-venster (tijdzone-veilige
 * ondergrens via `localMonthStartMonthsAgo`) en bereken het dagtarief. Gebruik
 * deze wanneer een oppervlak nog geen uitgaven-rijen heeft opgehaald (client via
 * `/api/daily-expense-rate`, bezittingen-loader, cashflow-rapport).
 */
export async function getRecentDailyExpenseRate(
  supabase: SupabaseClient,
  referenceDate: Date = new Date(),
  fallbackMonthlyExpenses = 0,
): Promise<RecentDailyExpenseRate> {
  // 12-maands venster = 11 maanden terug t/m de referentiedatum (inclusief).
  const startWindow = localMonthStartMonthsAgo(referenceDate, EXPENSE_RATE_ROLLING_MONTHS - 1)
  const refIso = referenceDate.toISOString().split('T')[0]
  const { data } = await supabase
    .from('transactions')
    .select('amount, date')
    .lt('amount', 0)
    .gte('date', startWindow)
    .lte('date', refIso)
  return recentDailyExpenseRateFromRows(
    (data ?? []) as ExpenseRow[],
    referenceDate,
    fallbackMonthlyExpenses,
  )
}
