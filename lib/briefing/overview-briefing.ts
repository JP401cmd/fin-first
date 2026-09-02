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
import { formatFreedomTimeString, type FreedomTimeBreakdown } from '@/lib/format'
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
 * Laad de drie loaders vers en compose de briefjes. Gebruikt door de refresh-API,
 * die geen toegang heeft tot de al-geladen page-data. Leest ook (read-only) het
 * top markt-nieuws uit de cache.
 *
 * LEVERT GEEN VRIJHEIDSMEETPUNT MEER (ADR 0126 PR C). Dat meetpunt was de platte
 * `computeFreedomTotal`-deling; sinds PR C is het de bevroren RUNWAY, en die komt
 * uit de kernel (`computeHorizonRunway`). De refresh-route haalt hem daar zelf op
 * en zet hem in de snapshot — bewust NIET hier, zodat deze module de kernel-motor
 * niet in zijn eigen importgraaf trekt (hij wordt óók door de UAT-/regressielaag
 * geïmporteerd; alleen het `RunwayResult`-TYPE hoort hier thuis).
 */
export async function loadAndComposeOverviewBriefing(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{
  entries: BriefingEntry[]
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
  return { entries, input }
}

// ── Runway-duiding: de TOTALE vrijheidstijd (ADR 0126 D1 + PR C) ────
//
// Er zijn twee vrijheidstijd-grootheden en ze mogen nooit door elkaar lopen:
//
//  - TOTAAL — "hoe lang kom ik mee als ik nu stop" = de RUNWAY uit de kernel
//    (`computeHorizonRunway` → `RunwayResult`). Rendement, inflatie, AOW,
//    belasting en de eigen woon-/eindstrategie zitten erin. Elke uitspraak over
//    een HEEL vermogen hoort hier: de kop op /overzicht, de deelkaart, de
//    briefing-e-mail, het versheidssignaal.
//  - MARGINAAL — "wat koopt één euro aan tijd" = `dailyExpenseRate` +
//    `calculateFreedomTime` (lib/format.ts). Voor bedragen aan de rand: een
//    delta, een losse uitgave, een badge.
//
// De som van marginale dagen is per definitie ≠ de runway. Dat is het verschil
// tussen een prijs en een projectie, geen inconsistentie — maar één oppervlak
// mag ze nooit als hetzelfde getal presenteren.
//
// PR C heeft de platte deling (`computeFreedomTotal` = netto vermogen ÷ dagtarief)
// en het daarop gebouwde e-mail-heroblok (`buildFreedomHeroProps`) VERWIJDERD.
// Bouw er geen derde vrijheidstijd-motor naast: dat is precies wat ADR 0126
// wilde opruimen.
//
// Hieronder staat de DUIDING-laag: hoe je een runway-uitkomst bevriest
// (`RunwayPoint`), er een zin van maakt (`runwaySentence`), er een duur van maakt
// (`runwayYearsMonths`/`runwayDurationLabel`) en hoe je twee meetpunten
// vergelijkt (`computeRunwayWeekDelta`/`hasRunwayMoved`). Puur — geen IO, geen
// kernel-import: alleen het `RunwayResult`-TYPE komt hier binnen.

/**
 * Een BEVRIESBARE samenvatting van een doorgerekende runway.
 *
 * Waarom een eigen, smalle vorm naast `RunwayResult`: een verstuurd bericht (de
 * wekelijkse e-mail) en een week-snapshot moeten de uitkomst kunnen BEWAREN
 * zonder de hele kernel-run mee te slepen — en zonder dat er later een tweede
 * motor nodig is om het bewaarde getal opnieuw te duiden.
 */
export interface RunwayPoint {
  /** Welke van de drie doorgerekende uitkomsten dit is. `deficit`/`unavailable`
   *  worden bewust NIET bevroren: daar doet de app geen claim. */
  kind: 'months' | 'reaches-end-age' | 'beyond-horizon'
  /**
   * De runway als DUUR in hele maanden vanaf nu.
   *  - `months`            → maanden tot uitputting (exact);
   *  - `reaches-end-age`   → ONDERGRENS: maanden tot de eigen eindleeftijd;
   *  - `beyond-horizon`    → ONDERGRENS: maanden tot het horizonplafond.
   * Bij de twee open uitkomsten is dit dus "minstens" — nooit een uitputtingsduur.
   */
  months: number
  /** De leeftijd waartoe het vermogen reikt: uitputtingsleeftijd (`months`,
   *  fractioneel), de eigen eindleeftijd, of het horizonplafond. */
  reachesAge: number
}

/**
 * Duid een runway-uitkomst tot een bevriesbaar meetpunt, of `null` wanneer er
 * geen claim te doen valt.
 *
 * `null` bij:
 *  - `unavailable` — geen geboortedatum / geen geloofwaardige uitgavenbasis /
 *    kernel-fout: geen claim is beter dan een verkeerde claim;
 *  - `deficit` — vandaag al zonder liquide vermogen: er is geen duur te noemen;
 *  - D7-INCONSISTENTIE — bij eindstrategie 'Vermogen opeten' geldt *runway reikt
 *    tot de eindleeftijd ⇒ solver `reached_now`*. Spreken die twee elkaar tegen,
 *    dan is de kernel-run intern strijdig en zwijgt élk oppervlak (voorheen deed
 *    alleen `buildBriefingHeadline` die toets; nu delen de kop, de deelkaart, de
 *    e-mail en het versheidssignaal dezelfde poort).
 */
export function summarizeRunway(runway: RunwayResult): RunwayPoint | null {
  if (runway.kind === 'unavailable' || runway.kind === 'deficit') return null

  if (runway.kind === 'months') {
    return { kind: 'months', months: runway.months, reachesAge: runway.depletionAge }
  }

  // De twee OPEN uitkomsten: het vermogen raakt binnen de horizon niet op.
  if (runway.strategy === 'Vermogen opeten' && runway.solverStatus !== 'reached_now') {
    return null
  }
  const reachesAge =
    runway.kind === 'reaches-end-age' ? runway.endAge : HORIZON_PLAFOND_LEEFTIJD
  return {
    kind: runway.kind,
    // Ondergrens, niet herrekend: beide leeftijden komen uit dezelfde run.
    months: Math.max(0, Math.round((reachesAge - runway.startAge) * 12)),
    reachesAge,
  }
}

/** Jaren + resterende maanden van een runway-duur — de vorm die de deelkaart
 *  consumeert. Geen eigen tijdrekening: puur een deling van `months`. */
export function runwayYearsMonths(point: RunwayPoint): { years: number; months: number } {
  const whole = Math.max(0, Math.round(point.months))
  return { years: Math.floor(whole / 12), months: whole % 12 }
}

/**
 * De runway-duur als Nederlandse tekst ("8 jaar en 4 maanden"), via de canonieke
 * `formatFreedomTimeString` — geen eigen meervoudsvormen. Bij de twee OPEN
 * uitkomsten is de duur een ondergrens, en dat staat er dan ook letterlijk
 * ("minstens …"): een ondergrens als exact getal presenteren zou de kaart en de
 * mail een claim laten doen die de kernel niet gemaakt heeft.
 */
export function runwayDurationLabel(
  point: RunwayPoint,
  format: 'long' | 'short' = 'long',
): string {
  const { years, months } = runwayYearsMonths(point)
  const breakdown: FreedomTimeBreakdown = {
    years,
    months,
    days: 0,
    totalDays: 0,
    isDeficit: false,
    isInfinite: false,
  }
  const label = formatFreedomTimeString(breakdown, format)
  return point.kind === 'months' ? label : `minstens ${label}`
}

/**
 * De beschrijvende zin over een runway-meetpunt. Beschrijvend, nooit aansporend
 * (geen "je kunt nu stoppen"); definitieve kopij gaat langs merkstem/compliance.
 *
 *  - `months` < 12       → "Als je nu zou stoppen, reikt je vermogen nog N maanden."
 *  - `months` ≥ 12       → "… reikt je vermogen tot je Xe." (X = hele leeftijd van
 *                          de uitputtingsmaand)
 *  - `reaches-end-age`   → "… reikt je vermogen tot voorbij je Ee."
 *  - `beyond-horizon`    → "… reikt je vermogen zover het model rekent: tot je 100e."
 *                          Bewust zonder "oneindig": het model stopt bij
 *                          HORIZON_PLAFOND_LEEFTIJD en claimt daar niets voorbij.
 */
export function runwaySentence(point: RunwayPoint): string {
  if (point.kind === 'beyond-horizon') {
    return `Als je nu zou stoppen, reikt je vermogen zover het model rekent: tot je ${leeftijdOrdinaal(HORIZON_PLAFOND_LEEFTIJD)}.`
  }
  if (point.kind === 'reaches-end-age') {
    return `Als je nu zou stoppen, reikt je vermogen tot voorbij je ${leeftijdOrdinaal(point.reachesAge)}.`
  }
  if (point.months < 12) {
    const n = point.months
    return `Als je nu zou stoppen, reikt je vermogen nog ${n} ${n === 1 ? 'maand' : 'maanden'}.`
  }
  return `Als je nu zou stoppen, reikt je vermogen tot je ${leeftijdOrdinaal(point.reachesAge)}.`
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

/**
 * Omrekenfactor maanden → dagen voor de guard hierboven. Dezelfde 365/12 als de
 * canonieke dagbasis (jaaruitgaven/365), NIET 30 — een 360-dagenjaar zou de
 * absolute drempel ~1,4% verschuiven.
 */
const DAYS_PER_MONTH = 365 / 12

/** Uitkomst van de week-over-week vergelijking van twee runway-meetpunten. */
export interface RunwayWeekDelta {
  /** Verschil in hele maanden runway t.o.v. de vorige week. `null` zodra er geen
   *  vergelijkbare basis is (eerste week, of een basis in de pre-PR-C-vorm) of de
   *  sprong door de plausibiliteitsgrens wordt onderdrukt. */
  deltaMonths: number | null
  /** Geen basis: dit is de eerste bevroren meting. */
  isFirstWeek: boolean
  /** De sprong viel buiten de plausibele bandbreedte (zie de guard hierboven). */
  isImplausibleDelta: boolean
}

/**
 * Week-over-week beweging van de runway, in hele MAANDEN (de runway is
 * maandnauwkeurig; een dag-delta bestaat daar niet).
 *
 * De plausibiliteitsguard blijft dezelfde als vóór ADR 0126 PR C — hij bestaat
 * omdat een half-geïmporteerde transactiehistorie ooit "−3788 dagen minder" op
 * de hoofdpagina zette, en dat risico verdwijnt niet met een andere grondslag.
 * De maanden worden er met `DAYS_PER_MONTH` in gevoerd zodat beide voorwaarden
 * (≥ 1 jaar absoluut ÉN > 25% van het huidige totaal) letterlijk hetzelfde
 * betekenen als voorheen.
 *
 * `isFirstWeek` dekt twee gevallen die voor de lezer hetzelfde zijn: er is nog
 * nooit gemeten, óf de laatst bewaarde basis stond nog in de pre-PR-C-vorm (de
 * platte deling) en is dus met een andere motor gemaakt. Die basis wordt niet
 * omgerekend maar genegeerd — twee getallen uit twee motoren aftrekken is precies
 * de fout die ADR 0126 uitsluit. De kopij zegt daarom "eerste meting op deze
 * basis", niet "eerste meting ooit".
 */
export function computeRunwayWeekDelta(
  current: RunwayPoint,
  baseline: { months: number } | null,
): RunwayWeekDelta {
  if (!baseline) {
    return { deltaMonths: null, isFirstWeek: true, isImplausibleDelta: false }
  }
  const deltaMonths = Math.round(current.months - baseline.months)
  if (isImplausibleFreedomDelta(deltaMonths * DAYS_PER_MONTH, current.months * DAYS_PER_MONTH)) {
    return { deltaMonths: null, isFirstWeek: false, isImplausibleDelta: true }
  }
  return { deltaMonths, isFirstWeek: false, isImplausibleDelta: false }
}

/**
 * Is de runway sinds het bevroren meetpunt bewogen? Voedt het versheidssignaal
 * onder de "Bijgewerkt …"-stempel op /overzicht.
 *
 * BEWUST DEZELFDE GROOTHEID ALS DE KOP. Vóór PR C mat dit signaal de platte
 * deling terwijl de kop al de runway toonde: het meldde "je cijfers zijn
 * veranderd" terwijl de zichtbare zin gelijk bleef, en omgekeerd. Drempel is
 * één hele maand — de resolutie van de runway zelf; een `kind`-wissel (van een
 * uitputtingsmaand naar "reikt tot voorbij je plan") telt altijd als beweging.
 * Het verschijnen óf verdwijnen van een claim telt ook mee.
 */
export function hasRunwayMoved(
  live: RunwayPoint | null,
  frozen: { kind: RunwayPoint['kind']; months: number } | null | undefined,
): boolean {
  if (!live || !frozen) return Boolean(live) !== Boolean(frozen)
  if (live.kind !== frozen.kind) return true
  return Math.abs(live.months - frozen.months) >= 1
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
 * hetzelfde scherm, met rendement, inflatie, AOW en de eigen eindstrategie erin. Sinds
 * PR C bestaat de platte deling (`computeFreedomTotal`) niet meer — de kop, de
 * deelkaart, de briefing-mail en het versheidssignaal delen één duiding-laag
 * (`summarizeRunway` + `runwaySentence`). Wordt overschreven door een AI-kop wanneer
 * die bij een handmatige ververs is gegenereerd (`snapshot.headline`).
 *
 * UR2-09 — REKENT UIT DE LIVE CANONIEKE BRON, NIET UIT DE WEEK-SNAPSHOT. Deze zin
 * was de tweede drager van het bevroren vrijheidsgetal; na een Ververs bleef "113
 * jaar en 4 maanden" staan naast live cijfers. De loader voedt 'm daarom met de
 * runway van DIT request (grendel: overzicht-secondary-loader.headline-source.test.ts).
 *
 * Kopij en de zwijggevallen (deficit/unavailable/D7) staan bij `runwaySentence`
 * resp. `summarizeRunway` — hier wordt niets extra's besloten.
 */
export function buildBriefingHeadline(runway: RunwayResult): string | null {
  const point = summarizeRunway(runway)
  return point ? runwaySentence(point) : null
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
