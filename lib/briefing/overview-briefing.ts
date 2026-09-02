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
import { loadFinData } from '@/lib/fin-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { ageAtDate } from '@/lib/horizon-data'
import {
  calculateFreedomTime,
  credibleMonthlyBasis,
  formatFreedomTimeString,
  type FreedomTimeBreakdown,
} from '@/lib/format'
import { buildBriefingEntries, type BriefingEngineInput } from './engine'
import { loadTopMarketBriefing } from './news-market'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import type { BriefingEntry } from '@/lib/types/briefing'
import type { DashboardData } from '@/lib/types/dashboard'
// Alleen het TYPE: de runway-motor zelf (kernel) hoort niet in deze briefing-module
// te worden meegebundeld; de loader levert het resultaat aan.
import type { RunwayResult } from '@/lib/horizon/runway'
import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'

type FinData = Awaited<ReturnType<typeof loadFinData>>
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
  finData: FinData,
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
    recommendations: finData.recommendations,
    events: horizonData?.events ?? [],
    health: horizonData?.healthScore ?? null,
    goalNames: finData.goals.map((g) => g.name),
    goalProgresses: finData.goalProgresses,
    // Parallel aan goalNames/goalProgresses — voedt de goal-heads-up-format +
    // fire_age-exclusie (CR-M1). Zie BriefingEngineInput.goalTypes.
    goalTypes: finData.goals.map((g) => g.goal_type),
    finance: {
      netWorthHistory: dashboardData.netWorthHistory,
      monthlyExpenses: dashboardData.monthlyExpenses,
      monthlyIncome: dashboardData.monthlyIncome,
      // Canoniek dagtarief (12-maands rolling) — dezelfde bron als de widgets
      // consumeren, zodat de briefing-tip nooit een ander aantal vrijheidsdagen
      // noemt dan de CASHFLOW-widget op dezelfde pagina (WF-CANON-06).
      dailyExpenseRate: dashboardData.dailyExpenseRate,
      // DE spaarquote (effectief, grondslag-geresolveerd) — zit al in
      // DashboardData. De engine gebruikt dít voor elke spaarquote-presentatie
      // i.p.v. een 1-maands surplus of de rauwe 6-maands meting, zodat de
      // briefing nooit een ander spaarpercentage noemt dan de cashflow-pagina
      // waarnaar hij linkt.
      savingsRatePct: dashboardData.effectiveSavingsRatePct,
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
  finData: FinData,
  horizonData: HorizonData,
  now: Date = new Date(),
  marketEntry?: BriefingEntry,
  aandachtspunten?: Aandachtspunt[],
  checkin?: { monthKey: string; reflection: string },
): BriefingEntry[] {
  const entries = buildBriefingEntries(
    buildOverviewBriefingInput(dashboardData, finData, horizonData, now, marketEntry, aandachtspunten, checkin),
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
  const [dashboardResult, finData, horizonData, aandachtspunten] = await Promise.all([
    loadDashboardData(supabase),
    loadFinData(supabase),
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
    finData,
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
  //
  // De voorkeursvolgorde blijft, maar een kandidaat die door de
  // geloofwaardigheidsvloer zakt slaan we OVER i.p.v. hem te gebruiken
  // (UR2-03): een rolling venster met één transactie van €1 mag de effectieve
  // maandbasis niet verdringen. Blijft er niets over, dan is 0 het eerlijke
  // antwoord en toont de hero de ontbrekende-data-staat.
  const total = computeFreedomTotal(
    currentNetWorth,
    credibleMonthlyBasis(dashboardResult.dashboardData.recentMonthlyExpenses) ||
      credibleMonthlyBasis(dashboardResult.dashboardData.monthlyExpenses),
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
// "Geld is opgeslagen tijd" als de vrijheidswinst van je week, afgeleid van de
// bevroren week-snapshot zodat het beeld de hele week stabiel blijft.
//
// UR2-09 (eigenaar-besluit 31 aug 2026): op /overzicht is deze hero VERWIJDERD.
// Een blok dat per definitie een week bevriest kwam daar naast live-herrekenende
// kerngetallen te staan; hetzelfde getal las binnen vijf minuten drie keer
// anders (113 jaar bevroren, 0% op-weg-balk, 0 dagen na een weergave-wissel) en
// de Ververs-knop raakte het niet. De ENIGE overgebleven consument van deze
// hero-vorm is de wekelijkse briefing-e-mail (lib/briefing/email-template.ts) —
// een momentopname in een bericht mág bevroren zijn, want hij staat niet naast
// live cijfers. Voeg hier dus geen tweede in-app consument aan toe.

export interface FreedomTotal {
  totalFreedomDays: number
  netWorth: number
  monthlyExpenses: number
  breakdown: FreedomTimeBreakdown
}

/** Het vrijheidstijd-blok van de wekelijkse briefing-e-mail (zie hierboven:
 *  in-app bestaat deze hero sinds UR2-09 niet meer). */
export interface FreedomHeroProps {
  totalFreedomDays: number
  /** Vooraf geformatteerd ("8 jaar en 4 maanden"). */
  totalLabel: string
  /** Week-over-week delta in dagen; null in de eerste week (geen basis) én
   *  wanneer de delta de plausibiliteitsgrens overschrijdt (zie
   *  `isImplausibleFreedomDelta`). */
  deltaDays: number | null
  isFirstWeek: boolean
  /** De week-over-week delta is onderdrukt omdat hij buiten de plausibele
   *  bandbreedte viel (settelende data / eenmalige vermogenscorrectie). */
  isImplausibleDelta: boolean
  /** Geen daguitgaven bekend → vrijheidstijd onbepaald. */
  isInfinite: boolean
  /** Netto vermogen ≤ 0 → schuld-framing i.p.v. viering. */
  isDeficit: boolean
}

/** Bereken het huidige vrijheidstijd-totaal uit netto vermogen + maanduitgaven.
 *  `totalFreedomDays` is GETEKEND: negatief bij een tekort (netto vermogen ≤ 0),
 *  zodat de week-over-week delta klopt wanneer iemand de nul-lijn kruist
 *  (calculateFreedomTime rekent zelf op de absolute waarde).
 *
 *  GELOOFWAARDIGHEIDSVLOER (UR2-03): een maandbasis onder
 *  `CREDIBLE_MONTHLY_BASIS_MIN` is geen basis maar een gegevensartefact — één
 *  losse transactie van €1 gaf €0,03/dag en daarmee "113 jaar en 4 maanden aan
 *  vrijheid" op een leeg account. Zo'n grondslag valt hier terug op 0, waarmee
 *  de hero automatisch in de al bestaande ontbrekende-data-staat komt
 *  (`isInfinite` → "Vul je uitgaven aan om je vrijheidstijd te zien"). De
 *  gefloorde basis gaat ook in het RESULTAAT mee, zodat de bevroren
 *  week-snapshot geen bogus grondslag conserveert en `buildFreedomHeroProps`
 *  bij het herrekenen tot dezelfde uitkomst komt. */
export function computeFreedomTotal(netWorth: number, monthlyExpenses: number): FreedomTotal {
  const basis = credibleMonthlyBasis(monthlyExpenses)
  // Canonieke dagbasis: jaaruitgaven/365 (= maanduitgaven×12/365), gelijk aan
  // calculateFreedomTime/core-metrics — niet maand/30 (=jaar/360).
  const dailyExpenses = basis > 0 ? (basis * 12) / 365 : 0
  const breakdown = calculateFreedomTime(netWorth, dailyExpenses)
  const totalFreedomDays = breakdown.isDeficit ? -breakdown.totalDays : breakdown.totalDays
  return { totalFreedomDays, netWorth, monthlyExpenses: basis, breakdown }
}

// ── Plausibiliteitsgrens op de week-over-week delta ─────────────────
//
// De basis (`previousFreedomSnapshot`) wordt één keer per ISO-week bevroren.
// Wordt hij bevroren op een moment dat de onderliggende data nog niet klopt —
// een vers account met een half-geïmporteerde transactiehistorie geeft een
// kunstmatig lage maanduitgave en dus een torenhoog vrijheidstotaal — dan is
// het verschil met de volgende (wél realistische) week geen echte weekbeweging
// maar een datacorrectie. Zonder grens toont /overzicht dat als "−3788 dagen
// minder": een prominent, ongeloofwaardig getal op de hoofdpagina.
//
// De grens is bewust dubbel (beide moeten gelden), zodat we alleen echte
// uitbijters afvangen en normale volatiliteit ongemoeid laten:
//  - absoluut: onder een jaar vrijheidstijd verschil grijpen we nooit in
//    (een grote bonus of een marktweek mag gewoon zichtbaar zijn);
//  - relatief: pas boven een kwart van het huidige totaal is de beweging niet
//    meer als weekbeweging te verklaren. Voor een grote portefeuille is een
//    absoluut groot verschil juist wél gewoon (marktbeweging), voor een kleine
//    is een relatief groot verschil vaak maar een handvol dagen.

/** Onder dit absolute verschil (in vrijheidsdagen) grijpt de guard nooit in. */
export const FREEDOM_DELTA_MIN_DAYS = 365
/** Aandeel van het huidige totaal dat een week mag bewegen vóór de guard grijpt. */
export const FREEDOM_DELTA_MAX_SHARE = 0.25

/**
 * Valt deze week-over-week delta buiten de plausibele bandbreedte? Pure,
 * losstaand getoetste predicaat zodat de grens niet alleen via de hero bewezen
 * wordt. Beide voorwaarden moeten gelden (zie de toelichting hierboven).
 */
export function isImplausibleFreedomDelta(
  deltaDays: number,
  currentTotalDays: number,
): boolean {
  const abs = Math.abs(deltaDays)
  if (!Number.isFinite(abs)) return true
  if (abs < FREEDOM_DELTA_MIN_DAYS) return false
  return abs > Math.abs(currentTotalDays) * FREEDOM_DELTA_MAX_SHARE
}

/** Week-over-week delta in vrijheidsdagen t.o.v. de vorige-week-basis.
 *  Een implausibele sprong (settelende data / eenmalige vermogenscorrectie)
 *  wordt onderdrukt: `deltaDays: null` + `isImplausibleDelta: true`, zodat de
 *  hero en de kop terugvallen op het (wél betrouwbare) totaal. */
export function computeFreedomDelta(
  current: { totalFreedomDays: number },
  baseline: { totalFreedomDays: number } | null,
): { deltaDays: number | null; isFirstWeek: boolean; isImplausibleDelta: boolean } {
  if (!baseline) return { deltaDays: null, isFirstWeek: true, isImplausibleDelta: false }
  const deltaDays = Math.round(current.totalFreedomDays - baseline.totalFreedomDays)
  if (isImplausibleFreedomDelta(deltaDays, current.totalFreedomDays)) {
    return { deltaDays: null, isFirstWeek: false, isImplausibleDelta: true }
  }
  return { deltaDays, isFirstWeek: false, isImplausibleDelta: false }
}

/** Bouw het e-mail-vrijheidsblok uit een (bevroren) vrijheidstijd-meetpunt + basis. */
export function buildFreedomHeroProps(
  freedom: { totalFreedomDays: number; netWorth: number; monthlyExpenses: number },
  baseline: { totalFreedomDays: number } | null,
): FreedomHeroProps {
  const total = computeFreedomTotal(freedom.netWorth, freedom.monthlyExpenses)
  const delta = computeFreedomDelta({ totalFreedomDays: freedom.totalFreedomDays }, baseline)
  return {
    totalFreedomDays: freedom.totalFreedomDays,
    totalLabel: formatFreedomTimeString(total.breakdown, 'long'),
    deltaDays: delta.deltaDays,
    isFirstWeek: delta.isFirstWeek,
    isImplausibleDelta: delta.isImplausibleDelta,
    isInfinite: total.breakdown.isInfinite,
    isDeficit: total.breakdown.isDeficit,
  }
}

/** Nederlands rangtelwoord voor een leeftijd: 42 → "42e". */
function leeftijdOrdinaal(age: number): string {
  return `${Math.floor(age)}e`
}

/**
 * Deterministische kop-zin naast de masthead "De briefing" — sinds ADR 0126 (PR B)
 * een echte ONTTREKKINGSPROJECTIE: *als je vandaag zou stoppen, tot wanneer reikt je
 * vermogen?* Consumeert het `RunwayResult` uit `computeHorizonRunway`
 * (lib/fire-target-shared.ts): dezelfde kernel-run-familie als de vrijheidsleeftijd op
 * hetzelfde scherm, met rendement, inflatie, AOW en de eigen eindstrategie erin — geen
 * platte deling meer (`computeFreedomTotal` blijft alleen voor de week-snapshot en de
 * e-mail bestaan, PR C ruimt die op). Wordt overschreven door een AI-kop wanneer die
 * bij een handmatige ververs is gegenereerd (`snapshot.headline`).
 *
 * UR2-09 — REKENT UIT DE LIVE CANONIEKE BRON, NIET UIT DE WEEK-SNAPSHOT. Deze zin
 * was de tweede drager van het bevroren vrijheidsgetal; na een Ververs bleef "113
 * jaar en 4 maanden" staan naast live cijfers. De loader voedt 'm daarom met de
 * runway van DIT request (grendel: overzicht-secondary-loader.headline-source.test.ts).
 *
 * KOPIJ (beschrijvend, nooit aansporend — geen "je kunt nu stoppen"; definitieve
 * zinnen gaan nog langs merkstem/compliance):
 *  - `months` < 12   → "Als je nu zou stoppen, reikt je vermogen nog N maanden."
 *  - `months` ≥ 12   → "Als je nu zou stoppen, reikt je vermogen tot je Xe."
 *                      (X = hele leeftijd van de uitputtingsmaand)
 *  - `reaches-end-age` → "… reikt je vermogen tot voorbij je Ee." (E = eigen eindleeftijd)
 *  - `beyond-horizon`  → "… reikt je vermogen zover het model rekent: tot je 100e."
 *                      Bewust zonder "oneindig": het model stopt bij
 *                      HORIZON_PLAFOND_LEEFTIJD en claimt daar niets voorbij.
 *  - `deficit` / `unavailable` → GEEN kop: geen claim is beter dan een verkeerde
 *                      (zoals `isInfinite`/`isDeficit` dat eerder ook deden).
 *
 * D7 — bij eindstrategie 'Vermogen opeten' geldt *runway reikt tot de eindleeftijd ⇒
 * solver `reached_now`*. Spreken die twee elkaar tegen (kernel-inconsistentie), dan
 * doet de kop géén claim. Bij 'Nalatenschap'/'Eeuwigdurend' is de runway-uitspraak
 * zwakker (geld dat tot 90 reikt is nog geen nalatenschap gehaald); de zin blijft daar
 * een pure liquiditeitsuitspraak en zegt niets over het doel.
 */
export function buildBriefingHeadline(runway: RunwayResult): string | null {
  if (runway.kind === 'unavailable' || runway.kind === 'deficit') return null

  if (runway.kind === 'reaches-end-age' || runway.kind === 'beyond-horizon') {
    if (runway.strategy === 'Vermogen opeten' && runway.solverStatus !== 'reached_now') {
      return null
    }
    if (runway.kind === 'reaches-end-age') {
      return `Als je nu zou stoppen, reikt je vermogen tot voorbij je ${leeftijdOrdinaal(runway.endAge)}.`
    }
    return `Als je nu zou stoppen, reikt je vermogen zover het model rekent: tot je ${leeftijdOrdinaal(HORIZON_PLAFOND_LEEFTIJD)}.`
  }

  if (runway.months < 12) {
    const n = runway.months
    return `Als je nu zou stoppen, reikt je vermogen nog ${n} ${n === 1 ? 'maand' : 'maanden'}.`
  }
  return `Als je nu zou stoppen, reikt je vermogen tot je ${leeftijdOrdinaal(runway.depletionAge)}.`
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
