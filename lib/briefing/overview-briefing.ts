// ── Overview Briefing Composer (server) ─────────────────────────────
//
// Brug tussen de ruwe page-loaders (dashboard / will / horizon) en de pure
// `buildBriefingEntries`-engine. Bouwt de volledige `BriefingEngineInput`
// inclusief de financiële verrijkingscontext (vermogensverloop, budget,
// inkomen, cash, FIRE-voortgang) zodat /overzicht 5-6 echte briefjes haalt.
//
// Twee ingangen:
//  - `composeOverviewBriefing(...)` — voor de page, die de drie loaders al
//    heeft uitgevoerd; vermijdt dubbel laden.
//  - `loadAndComposeOverviewBriefing(supabase)` — voor de refresh-API, die
//    de data zelf vers moet ophalen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { ageAtDate } from '@/lib/horizon-data'
import {
  calculateFreedomTime,
  formatFreedomTimeString,
  type FreedomTimeBreakdown,
} from '@/lib/format'
import { buildBriefingEntries, type BriefingEngineInput } from './engine'
import { loadTopMarketBriefing } from './news-market'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import type { BriefingEntry } from '@/components/overview/briefing-panel'
import type { SparklineDataPoint } from '@/components/app/budget-sparkline'
import type { DashboardData } from '@/components/widgets/widget-renderer'

type WillData = Awaited<ReturnType<typeof loadWillData>>
type HorizonData = Awaited<ReturnType<typeof loadHorizonData>> | null

/** Maximum aantal briefjes dat /overzicht toont (3-koloms × 2 rijen). */
export const OVERVIEW_BRIEFING_MAX = 6

/** Check-in-reflectie ouder dan dit aantal dagen komt niet meer in de briefing. */
const CHECKIN_RECENCY_DAYS = 60

/**
 * Meest recente maand-check-in met niet-lege reflectie, voor het check-in-
 * briefje. Leest de `checkin_snapshot_{userId}_{YYYY-MM}`-keys (app_settings);
 * de hoogste key = de laatste maand. Faalt zacht → undefined.
 */
export async function loadLatestCheckinForBriefing(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ monthKey: string; reflection: string } | undefined> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .like('key', `checkin_snapshot_${userId}_%`)
      .order('key', { ascending: false })
      .limit(1)
    const row = data?.[0]
    if (!row?.value) return undefined
    const snap = JSON.parse(row.value) as { monthKey?: string; reflection?: string; savedAt?: string }
    const reflection = snap.reflection?.trim()
    const monthKey = snap.monthKey ?? row.key.slice(-7)
    if (!reflection || !monthKey) return undefined
    const savedAt = snap.savedAt ? Date.parse(snap.savedAt) : NaN
    if (Number.isFinite(savedAt)) {
      const ageDays = (now.getTime() - savedAt) / (24 * 3600 * 1000)
      if (ageDays > CHECKIN_RECENCY_DAYS) return undefined
    }
    return { monthKey, reflection }
  } catch {
    return undefined
  }
}

/** Liquide cash = niet-gekoppelde cash + cash/savings/checking-assets.
 *  Zelfde definitie als in de overzicht-page (CompoundInsightCard). */
function computeLiquidCash(horizonData: HorizonData): number {
  return (
    (horizonData?.unlinkedCash ?? 0) +
    (horizonData?.assets ?? [])
      .filter((a) => ['cash', 'savings', 'checking'].includes(a.asset_type ?? ''))
      .reduce((sum, a) => sum + Number(a.current_value ?? 0), 0)
  )
}

/**
 * Bouw de volledige engine-input (kern + finance) uit de geladen page-data.
 * Pure transformatie — geen IO — zodat hij makkelijk te hergebruiken en te
 * testen is.
 */
export function buildOverviewBriefingInput(
  dashboardData: DashboardData,
  willData: WillData,
  horizonData: HorizonData,
  now: Date = new Date(),
  marketEntry?: BriefingEntry,
  aandachtspunten?: Aandachtspunt[],
  checkin?: { monthKey: string; reflection: string },
): BriefingEngineInput {
  const dob = horizonData?.effectiveInput?.dateOfBirth ?? null
  const currentAge = dob ? Math.round(ageAtDate(dob)) : null
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  const freedomPct =
    horizonData?.healthScoreInput?.freedomPct ?? dashboardData.freedomPct ?? undefined

  return {
    recommendations: willData.recommendations,
    events: horizonData?.events ?? [],
    health: horizonData?.healthScore ?? null,
    goalNames: willData.goals.map((g) => g.name),
    goalProgresses: willData.goalProgresses,
    // Parallel aan goalNames/goalProgresses — voedt de goal-heads-up-format +
    // fire_age-exclusie (CR-M1). Zie BriefingEngineInput.goalTypes.
    goalTypes: willData.goals.map((g) => g.goal_type),
    finance: {
      netWorthHistory: dashboardData.netWorthHistory,
      monthlyExpenses: dashboardData.monthlyExpenses,
      monthlyIncome: dashboardData.monthlyIncome,
      // Canonieke 6m-spaarquote (incl. spaarbudgetten + aflossing) — zit al in
      // DashboardData. De engine gebruikt dít voor elke spaarquote-presentatie
      // i.p.v. een 1-maands surplus, zodat de briefing nooit een ander
      // spaarpercentage noemt dan de cashflow-pagina.
      savingsRate6m: dashboardData.savingsRate6m,
      budgetExpense: dashboardData.budgetTotals?.expense,
      liquidCash: computeLiquidCash(horizonData),
      freedomPct,
      currentAge,
      fireAge,
      openActions: dashboardData.openActions,
      totalFreedomDaysOpen: dashboardData.totalFreedomDaysOpen,
      backtestSuccessRate: dashboardData.backtestSuccessRate,
      backtestNamedPaths: dashboardData.backtestNamedPaths,
      recurring: (dashboardData.topRecurringTransactions ?? [])
        .slice(0, 3)
        .map((r) => ({ name: r.name, amount: r.amount })),
      totalRecurringAmount: dashboardData.totalRecurringAmount,
      box3Tax: dashboardData.box3Tax,
      feeAnalysis: dashboardData.feeAnalysis
        ? {
            totalAnnualFee: dashboardData.feeAnalysis.totalAnnualFee,
            weightedTER: dashboardData.feeAnalysis.weightedTER,
          }
        : null,
      emergencyFund: dashboardData.emergencyFund
        ? {
            monthsCovered: dashboardData.emergencyFund.monthsCovered,
            targetMonths: dashboardData.emergencyFund.targetMonths,
            isComplete: dashboardData.emergencyFund.isComplete,
          }
        : null,
      hvbSummary: dashboardData.hvbSummary
        ? {
            rente: dashboardData.hvbSummary.rente,
            aanbeveling: dashboardData.hvbSummary.aanbeveling,
          }
        : null,
    },
    marketEntry,
    aandachtspunten,
    checkin,
    now,
  }
}

/** Compose de getoonde briefjes (gecapt op OVERVIEW_BRIEFING_MAX). */
export function composeOverviewBriefing(
  dashboardData: DashboardData,
  willData: WillData,
  horizonData: HorizonData,
  now: Date = new Date(),
  marketEntry?: BriefingEntry,
  aandachtspunten?: Aandachtspunt[],
  checkin?: { monthKey: string; reflection: string },
): BriefingEntry[] {
  const entries = buildBriefingEntries(
    buildOverviewBriefingInput(dashboardData, willData, horizonData, now, marketEntry, aandachtspunten, checkin),
  )
  return entries.slice(0, OVERVIEW_BRIEFING_MAX)
}

/**
 * Laad de drie loaders vers, compose de briefjes én bereken het vrijheidstijd-
 * meetpunt. Gebruikt door de refresh-API, die geen toegang heeft tot de
 * al-geladen page-data. Leest ook (read-only) het top markt-nieuws uit de cache.
 */
export async function loadAndComposeOverviewBriefing(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{
  entries: BriefingEntry[]
  freedom: { totalFreedomDays: number; netWorth: number; monthlyExpenses: number }
  /** De volledige engine-input — voor de redactie-laag (metrics t.b.v.
   *  functionele directives), zodat de refresh-route niets dubbel laadt. */
  input: BriefingEngineInput
}> {
  const [dashboardResult, willData, horizonData, aandachtspunten] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
    loadHorizonData(supabase),
    // Faalt intern zacht per producent (collectAandachtspunten vangt zelf af).
    collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [marketEntry, checkin] = user
    ? await Promise.all([
        loadTopMarketBriefing(supabase, user.id, now),
        loadLatestCheckinForBriefing(supabase, user.id, now),
      ])
    : [null, undefined]
  const input = buildOverviewBriefingInput(
    dashboardResult.dashboardData,
    willData,
    horizonData,
    now,
    marketEntry ?? undefined,
    aandachtspunten,
    checkin,
  )
  const entries = buildBriefingEntries(input).slice(0, OVERVIEW_BRIEFING_MAX)
  const currentNetWorth =
    (horizonData?.healthScoreInput?.totalAssets ?? 0) -
    (horizonData?.healthScoreInput?.totalDebts ?? 0)
  // Canoniek 12-mnd rolling maandbedrag (zelfde bron als het app-brede dagtarief),
  // NIET de losse huidige-kalendermaand-som — die gaf een onmogelijk hoog
  // vrijheidstotaal in de handmatige ververs (KRUIS-17). Fallback op
  // monthlyExpenses voor bundels zonder het veld.
  const total = computeFreedomTotal(
    currentNetWorth,
    dashboardResult.dashboardData.recentMonthlyExpenses ??
      dashboardResult.dashboardData.monthlyExpenses ??
      0,
  )
  return {
    entries,
    freedom: {
      totalFreedomDays: total.totalFreedomDays,
      netWorth: total.netWorth,
      monthlyExpenses: total.monthlyExpenses,
    },
    input,
  }
}

// ── Vrijheidstijd-hero (week-over-week delta) ───────────────────────
//
// De emotionele kern van de briefing: "Geld is opgeslagen tijd" voelbaar
// gemaakt als de vrijheidswinst van je week. Alle waarden zijn afgeleid van
// de bevroren week-snapshot zodat de hero de hele week stabiel blijft.

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

export interface FreedomTotal {
  totalFreedomDays: number
  netWorth: number
  monthlyExpenses: number
  breakdown: FreedomTimeBreakdown
}

/** Props die `VrijheidsbriefingHero` rendert (server berekent, client toont). */
export interface FreedomHeroProps {
  totalFreedomDays: number
  /** Vooraf geformatteerd ("8 jaar en 4 maanden"). */
  totalLabel: string
  /** Week-over-week delta in dagen; null in de eerste week (geen basis). */
  deltaDays: number | null
  isFirstWeek: boolean
  sparkline: SparklineDataPoint[]
  /** Geen daguitgaven bekend → vrijheidstijd onbepaald. */
  isInfinite: boolean
  /** Netto vermogen ≤ 0 → schuld-framing i.p.v. viering. */
  isDeficit: boolean
}

/** Bereken het huidige vrijheidstijd-totaal uit netto vermogen + maanduitgaven.
 *  `totalFreedomDays` is GETEKEND: negatief bij een tekort (netto vermogen ≤ 0),
 *  zodat de week-over-week delta klopt wanneer iemand de nul-lijn kruist
 *  (calculateFreedomTime rekent zelf op de absolute waarde). */
export function computeFreedomTotal(netWorth: number, monthlyExpenses: number): FreedomTotal {
  // Canonieke dagbasis: jaaruitgaven/365 (= maanduitgaven×12/365), gelijk aan
  // calculateFreedomTime/core-metrics — niet maand/30 (=jaar/360).
  const dailyExpenses = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0
  const breakdown = calculateFreedomTime(netWorth, dailyExpenses)
  const totalFreedomDays = breakdown.isDeficit ? -breakdown.totalDays : breakdown.totalDays
  return { totalFreedomDays, netWorth, monthlyExpenses, breakdown }
}

/** Week-over-week delta in vrijheidsdagen t.o.v. de vorige-week-basis. */
export function computeFreedomDelta(
  current: { totalFreedomDays: number },
  baseline: { totalFreedomDays: number } | null,
): { deltaDays: number | null; isFirstWeek: boolean } {
  if (!baseline) return { deltaDays: null, isFirstWeek: true }
  return {
    deltaDays: Math.round(current.totalFreedomDays - baseline.totalFreedomDays),
    isFirstWeek: false,
  }
}

/** Vrijheidsdagen-sparkline-serie uit het vermogensverloop (per maand → dagen). */
export function buildFreedomSparkline(
  netWorthHistory: { month: string; value: number }[],
  monthlyExpenses: number,
): SparklineDataPoint[] {
  // Canonieke dagbasis: jaaruitgaven/365 (zie computeFreedomTotal).
  const dailyExpenses = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0
  if (dailyExpenses <= 0) return []
  return netWorthHistory.map((h) => {
    // Tekort-maanden klemmen op 0 dagen: calculateFreedomTime rekent op de
    // absolute waarde, dus een negatief vermogen zou anders als een positieve
    // piek renderen (schuld die op vrijheid lijkt).
    const days = h.value > 0 ? calculateFreedomTime(h.value, dailyExpenses).totalDays : 0
    const mIdx = Number(h.month.slice(5, 7)) - 1
    const label = mIdx >= 0 && mIdx < 12 ? NL_MONTH_ABBR[mIdx] : ''
    return { month: h.month, label, spent: Math.round(days) }
  })
}

/** Bouw de hero-props uit een (bevroren) vrijheidstijd-meetpunt + basis. */
export function buildFreedomHeroProps(
  freedom: { totalFreedomDays: number; netWorth: number; monthlyExpenses: number },
  baseline: { totalFreedomDays: number } | null,
  netWorthHistory: { month: string; value: number }[],
): FreedomHeroProps {
  const total = computeFreedomTotal(freedom.netWorth, freedom.monthlyExpenses)
  const delta = computeFreedomDelta({ totalFreedomDays: freedom.totalFreedomDays }, baseline)
  return {
    totalFreedomDays: freedom.totalFreedomDays,
    totalLabel: formatFreedomTimeString(total.breakdown, 'long'),
    deltaDays: delta.deltaDays,
    isFirstWeek: delta.isFirstWeek,
    sparkline: buildFreedomSparkline(netWorthHistory, freedom.monthlyExpenses),
    isInfinite: total.breakdown.isInfinite,
    isDeficit: total.breakdown.isDeficit,
  }
}

/**
 * Deterministische kop-zin boven de briefjes — afgeleid van de bevroren
 * hero-waarden zodat hij de hele week stabiel is. Wordt overschreven door een
 * AI-kop wanneer die bij een handmatige ververs is gegenereerd (snapshot.headline).
 */
export function buildBriefingHeadline(hero: {
  deltaDays: number | null
  totalLabel: string
  isInfinite: boolean
  isDeficit: boolean
}): string | null {
  // Bij oneindig (geen uitgaven) of tekort (negatief vermogen) geen kop — de
  // hero toont daar zijn eigen kalme fallback; een "X dagen vrijheid erbij"
  // zou debt-dagen als vrijheid presenteren en de hero tegenspreken.
  if (hero.isInfinite || hero.isDeficit) return null
  const d = hero.deltaDays
  if (d != null && d > 0) {
    return `Deze week ${d} ${d === 1 ? 'dag' : 'dagen'} vrijheid erbij — je staat op ${hero.totalLabel}.`
  }
  if (d != null && d < 0) {
    const a = Math.abs(d)
    return `Deze week ${a} ${a === 1 ? 'dag' : 'dagen'} minder, maar je staat nog op ${hero.totalLabel}.`
  }
  if (hero.totalLabel) {
    return `Je vermogen staat voor ${hero.totalLabel} aan vrijheid.`
  }
  return null
}

/**
 * Saneer een AI-gegenereerde kop-zin (uit de ververs-route): vouw witruimte/
 * regeleinden samen, strip omringende aanhalingstekens, en wijs lege of te
 * lange output af (→ null, zodat de deterministische kop terugvalt). Puur en
 * los getest zodat de validatie niet alleen via de route bewezen wordt.
 */
export function sanitizeAiHeadline(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim()
  if (!cleaned || cleaned.length > 160) return null
  return cleaned
}
