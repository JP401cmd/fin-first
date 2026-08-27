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
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { EXPENSE_RATE_ROLLING_MONTHS } from '@/lib/constants'
import {
  aggToExpenseRows,
  fetchTxMonthAggregate,
  getTxAgg12m,
} from '@/lib/server-data/tx-aggregates'

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
 * Haal de uitgaven-rijen voor het rolling-venster op — VIA HET MAANDAGGREGAAT.
 *
 * ── Waarom niet meer rauw (L10) ─────────────────────────────────────────────
 * De vorige implementatie deed `.from('transactions').select('amount, date')`
 * zonder `.order()` en zonder paginering. PostgREST kapt zo'n antwoord STIL af op
 * `max_rows` (supabase/config.toml = 1000) — óók zonder expliciete `.limit()`.
 * Boven de 1000 negatieve transacties in het venster kreeg deze functie dus een
 * willekeurige deelverzameling: zowel `totalExpenses` als de vroegste maand
 * (`dataMonths`) schoven mee, en het dagtarief LOOG omhoog. Dat is exact het
 * bugpatroon dat `lib/server-data/tx-aggregates.parity.test.ts` al bewijst voor
 * de spaarquote — en de reden dat /rapportages/balans €165/dag toonde naast
 * €106/dag op /overzicht/cashflow (bevinding L10): cashflow liep al wél via het
 * aggregaat, de rapport-routes nog niet.
 *
 * Het aggregaat (`public.tx_month_aggregate`) levert per definitie enkele rijen
 * (één per maand × budget × type) en kan dus niet afkappen. `aggToExpenseRows`
 * bouwt daar synthetische maand-rijen van; `recentDailyExpenseRateFromRows`
 * gebruikt alleen het totaal én de vroegste maand, dus de uitkomst is voor een
 * niet-afgekapte verzameling byte-identiek aan de rauwe route (bewezen in de
 * parity-test hierboven).
 *
 * ── Venster: maandkorrel, en waarom dat de canonieke keuze is ───────────────
 * Het aggregaat kent alleen hele kalendermaanden. Het venster is daarom
 * `[maandstart 11 mnd terug, maandeinde van referenceDate)` — waar de rauwe query
 * exact op `referenceDate` afkapte. Voor de lopende maand is dat precies wat
 * `lib/dashboard-data-loader.ts`, `lib/cashflow-kpis.ts`, `lib/core-data-loader.ts`
 * en de horizon-loader al hanteren; die grondslag is dus de norm, niet de
 * afwijking. Voor een HISTORISCHE peildatum (rapport-routes met `?date=`) telt de
 * rest van die kalendermaand mee — bewust geaccepteerd: één grondslag app-breed
 * weegt zwaarder dan een dag-precieze afkap op één rapport, en de afwijking is
 * begrensd tot hooguit één deelmaand van de twaalf.
 *
 * Valt de peildatum in de HUIDIGE kalendermaand, dan is het venster identiek aan
 * dat van `getTxAgg12m` en delen we diens `cache()`-entry — dan draait er binnen
 * één request één RPC voor dashboard-, core-, horizon- én deze consumers samen.
 */
export async function fetchExpenseRowsForRate(
  supabase: SupabaseClient,
  referenceDate: Date = new Date(),
): Promise<{ amount: number; date: string }[]> {
  const now = new Date()
  const sameMonthAsNow =
    referenceDate.getFullYear() === now.getFullYear() &&
    referenceDate.getMonth() === now.getMonth()

  const { data } = sameMonthAsNow
    ? await getTxAgg12m(supabase)
    : await fetchTxMonthAggregate(supabase, {
        from: localMonthStartMonthsAgo(referenceDate, EXPENSE_RATE_ROLLING_MONTHS - 1),
        // `to` is EXCLUSIEF in de RPC → de 1e van de volgende maand.
        to: localMonthBounds(referenceDate).end,
      })

  // `realOnly: false` = álle negatieve transacties, inclusief (joint_)transfers —
  // byte-identiek aan de vroegere `.lt('amount', 0)`-fetch en aan de grondslag van
  // `DashboardData.dailyExpenseRate`. Nooit stilzwijgend filteren: dat zou een
  // ANDERE grondslag zijn en precies de drift terugbrengen die L10 opruimt.
  return aggToExpenseRows(data ?? [], { realOnly: false })
}

/**
 * Server-variant: haal het canonieke rolling-venster op (via het maandaggregaat,
 * zie `fetchExpenseRowsForRate`) en bereken het dagtarief. Gebruik deze wanneer
 * een oppervlak nog geen uitgaven-rijen heeft opgehaald (client via
 * `/api/daily-expense-rate`, bezittingen-loader, cashflow-rapport).
 */
export async function getRecentDailyExpenseRate(
  supabase: SupabaseClient,
  referenceDate: Date = new Date(),
  fallbackMonthlyExpenses = 0,
): Promise<RecentDailyExpenseRate> {
  const rows = await fetchExpenseRowsForRate(supabase, referenceDate)
  return recentDailyExpenseRateFromRows(rows, referenceDate, fallbackMonthlyExpenses)
}
