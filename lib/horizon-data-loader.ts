/**
 * Server-side data loader for the Horizon page.
 *
 * Extracts all Supabase queries from the client-side loadData callback
 * and runs them on the server, returning a typed HorizonPageData bundle.
 *
 * Dividend income and household/partner FIRE data are NOT included here —
 * they remain client-side fetches in horizon-landing.tsx.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ageAtDate,
  computeLifeEventImpact,
  type FinancialInput,
  type LifeEvent,
  type LifeEventImpact,
} from '@/lib/horizon-data'
import type { Action } from '@/lib/recommendation-data'
import { computeYearlyMustExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { deriveRetirementExpenseBasis } from '@/lib/retirement-expense-basis'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import { type Debt } from '@/lib/debt-data'
import { resolveFireStrategyWithOverride, type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { resolveWithdrawalStrategy, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomProgressWithBasis, inclHomeTargetFromScalar } from '@/lib/core-metrics'
import {
  parseHousingStrategy,
  deriveHousingContext,
  getFireEligibleNetWorth,
  netWorthExcludingHome,
  shouldShowDualHousingBasis,
  isHomeExcludedFromFire,
  type HousingStrategyConfig,
  type HousingContext,
} from '@/lib/housing-strategy'
import { type HousingTriggerSimBasis } from '@/lib/housing-trigger'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveFireAssumptions, type FireAssumptionRow } from '@/lib/fire-assumptions'
import { NL_AOW_AGE } from '@/lib/constants'
import { hasPartner } from '@/lib/household-type'
import { calculateBox3, CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { dailyExpenseRate } from '@/lib/format'
import { resolvePensionFactorA } from '@/lib/jaarruimte'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { resolvePotRules, type PotRulesConfig } from '@/lib/pot-rules'
import { parseToekomstScenarioPrefs, type ToekomstScenarioPrefs } from '@/lib/horizon/toekomst-scenario'
import { loadPerspectiveDataServer } from '@/lib/household/perspective-loader-server'
import type { Perspective } from '@/lib/household-data'
import { resolveEffectiveIncomeExpenses } from './effective-financials'
import { resolveSavingsSource, computeSavingsRate6m, computeDebtAflossingMonthly } from './savings-source'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getEarliestIncomeDate,
} from './server-data/base'
import {
  getTxAgg12m,
  aggSumPositief,
  aggSumNegatiefAbs,
  type TxMonthAggregateRow,
} from './server-data/tx-aggregates'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'

// Snapshot type for resilience trend data
export type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
  score_version: number | null
  /**
   * Rekenmotor die de FIRE-velden (fire_age / fire_portfolio) van deze snapshot
   * schreef — 'kernel' of 'v2' (FASE 5 stap 2b, V15). NULL = historisch / vlag-uit.
   * Voedt de "rekenwijze gewijzigd"-annotatie in de FIRE-trend-weergave.
   */
  engine_bron: string | null
}

export interface HorizonPageData {
  effectiveInput: FinancialInput
  events: LifeEvent[]
  impacts: LifeEventImpact[]
  actions: Action[]
  debts: Debt[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  fireParams: FireParams
  resilienceSnapshots: SnapshotForTrend[]
  snapshotResilience: number | null
  avgIncome6m: number
  avgExpenses6m: number
  /** Health score computed server-side (5 or 6 pillars) */
  healthScore: HealthScore
  /** Health score input data for client-side recomputation */
  healthScoreInput: HealthScoreInput
  /** Whether the user has active budgeting (cash accounts with budgets) */
  budgetingActive: boolean
  /** Full assets array for vermogensopbouw stacked chart */
  assets: Asset[]
  /** Box 3 berekeningsmethode (forfaitair of werkelijk), afgeleid uit fireParams */
  box3Method: 'forfaitair' | 'werkelijk'
  /**
   * Canonieke Box 3-heffing (€/jaar, personal) uit `calculateBox3`
   * (lib/box3-data.ts, CURRENT_TAX_YEAR, hasPartner:false) — dezelfde motor als
   * de Box 3-subpagina en de dashboard-loader. Bewust NIET de simplistische
   * `healthScoreInput.taxData.box3Tax`-proxy (die schulden negeert en alles als
   * beleggingen forfait rekent → contradiceerde de kaart-status). null wanneer er
   * geen assets zijn of de berekening faalt. Household-/partnerperspectief loopt
   * op de Belasting-hub via loadPerspectiveBox3 (combined/partner).
   */
  box3Tax: number | null
  /** Of de gebruiker een fiscaal partner heeft (voor heffingsvrij vermogen berekening) */
  hasPartner: boolean
  /** Factor A (jaarlijkse pensioenaangroei uit UPO) — geresolved uit
   *  profiles.pension_factor_a via resolvePensionFactorA. Altijd ≥ 0 (0 wanneer
   *  niet ingevuld); de jaarruimte-motor rekent hiermee zonder factor-A-aftrek. */
  pensioenFactorA: number
  /** Of factor A daadwerkelijk bekend is (`resolvePensionFactorA().isKnown`).
   *  NULL ≠ 0: een leeg `pension_factor_a` levert `pensioenFactorA: 0` maar
   *  `pensioenFactorAKnown: false`. Consumers die de jaarruimte-bovengrens
   *  tonen (tips/aandachtspunten) gebruiken dit om bij ONBEKENDE factor A +
   *  bedrijfspensioen een misleidende (te hoge) jaarruimte-tip te dempen. Een
   *  expliciete 0 (zzp, geen werkgeverspensioen) is wél bekend → true. */
  pensioenFactorAKnown: boolean
  /**
   * Rauwe profiel-rij voor de kernel-router (`computeConvergentieProjection`) —
   * de al-gemergede hoofdprofiel-rij + de al-berekende essentiële-jaaruitgaven.
   * Null wanneer de profiel-query faalde.
   */
  rawProfile: ConvergentieRawProfileRow | null
  /**
   * Volledige `aow_leeftijd`-tabel (publieke referentietabel), server-side
   * meegeleverd zodat de kernel-context (rawProfile + aowRows) al bij de EERSTE
   * render compleet is en de mount-fetch (`loadKernelContext`) volledig kan
   * worden overgeslagen — dat elimineert de gegarandeerde TWEEDE kernel-solve.
   * Leeg = tabel niet beschikbaar (legacy DB); de client valt dan terug op de
   * mount-fetch met een structurele-gelijkheidsguard.
   */
  aowRows: AowLeeftijdRow[]
  /** Pot-regels (profiles.pot_rules) — verdeling/onttrekkingsvolgorde voor v2. */
  potRules: PotRulesConfig
  /** Error message from profile query, null if successful */
  profileError: string | null
  /** Total balance of disconnected bank accounts (not linked to assets) */
  unlinkedCash: number
  /** Number of children from profile (for erfgenamen calculation) */
  numberOfChildren: number
  /** Of de gebruiker de Horizon-prognose setup-pane heeft doorlopen + opgeslagen.
   *  Legacy-marker — de grafiek wordt sinds juni 2026 altijd getoond; deze flag
   *  bepaalt dat niet langer. Behouden voor achterwaartse compatibiliteit. */
  hasCompletedHorizonSetup: boolean
  /** Of de eenmalige welkomsttekst bovenaan de /toekomst-grafiek al is getoond.
   *  False → toon de welkomstbanner (en markeer 'm bij eerste render). */
  hasSeenWelcome: boolean
  /** Of de gebruiker "Niet meer weergeven" koos op de exit-melding van de
   *  tips-overlay. True → toon de exit-melding niet meer; de overlay sluit dan
   *  direct bij verlaten. */
  exitNoticeDismissed: boolean
  /** Of de gebruiker de tips-overlay op /toekomst al één keer heeft gesloten
   *  (marker HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG aanwezig). False → de
   *  eerstvolgende sluiting navigeert eenmalig naar /overzicht (post-onboarding
   *  stappenplan) en zet de marker. True → geen automatische navigatie meer. */
  tipsFirstCloseNavigated: boolean
  /** Maandelijks spaar-override uit profiles.monthly_savings_override.
   *  NULL = gebruik asset-aggregaat (monthlyContributionFromAssets). */
  monthlySavingsOverride: number | null
  /** Maandelijkse asset-contributie-aggregaat (assets.monthly_contribution).
   *  Voor weergave in setup-pane als "berekende waarde". */
  monthlyContributionFromAssets: number
  /** Maandelijks surplus uit budget-data (avgIncome6m - avgExpenses6m), null
   *  als budgetteren-module uit staat of geen surplus. Voor setup-pane summary. */
  monthlySurplusFromBudget: number | null
  /** Jaarlijks spaarbedrag afgeleid van de cashflow-pagina: inkomen × spaarquote
   *  (berekend óf overschreven, incl. spaarbudgetten + schuldaflossing). Primaire
   *  spaarbron voor de FIRE-prognose wanneer er geen handmatige spaar-override is.
   *  Zie lib/savings-source.ts — spiegelt het instellingenblok op /overzicht/cashflow. */
  baseAnnualSavingsFromCashflow: number
  /** Retirement-expense methode uit profile (raw, mogelijk null bij nieuwe users). */
  retirementExpenseMethod: RetirementExpenseMethod | null
  /** Retirement-expense custom amount uit profile (null als methode != custom_amount). */
  retirementExpenseCustomAmount: number | null
  /** Housing strategy uit profiles.housing_strategy_config (default include_full). */
  housingStrategy: HousingStrategyConfig
  /** Afgeleide context (eigen woning + linked mortgage aggregates). */
  housingContext: HousingContext
  /** Belegbaar vermogen voor pensioen — totaal vermogen minus equity bij relevante strategieën. */
  fireEligibleNetWorth: number
  /**
   * Canonieke vrijheidsvoortgang (0..100), server-side berekend met dezelfde grondslag als het
   * dashboard (`computeFreedomProgressWithBasis`). Server-SCALAR voor de PROGRESSIEVE first paint
   * van /toekomst (Task 4.2): tonen zolang de client-side kernel-worker de exacte projectie nog
   * berekent. Consume, don't recompute — géén nieuwe som in de client.
   */
  freedomPct: number
  /**
   * Strategie-bewust FIRE-doel (benodigde LIQUIDE portefeuille excl. eigen woning), server-side
   * berekend (`computeFireTarget`). Server-SCALAR voor de first paint (Task 4.2). `null` wanneer
   * er (nog) geen doel te berekenen is. Consume, don't recompute.
   */
  requiredPortfolioExclHome: number | null
  /**
   * Netto vermogen EXCLUSIEF eigen woning = netto vermogen − overwaarde (ZUIVER, ook bij
   * reverse_mortgage). Aparte weergave-grondslag (dubbele grondslag incl./excl. woning) —
   * NIET de FIRE-pot (`fireEligibleNetWorth`) en NIET het volledige netto vermogen; nooit op
   * dezelfde as mengen. Eén home: lib/housing-strategy.ts#netWorthExcludingHome.
   */
  netWorthExclHome: number
  /**
   * Gating voor de dubbele-grondslag-weergave: true ⇔ eigen woning aanwezig ÉN strategie
   * ≠ include_full (downsize / opeethypotheek / uitsluiten). lib/housing-strategy.ts#shouldShowDualHousingBasis.
   */
  showDualHousingBasis: boolean
  /** ISO-timestamp wanneer de housing-strategy nudge-sheet is gedismist; null = nog niet getoond. */
  housingStrategyDismissedAt: string | null
  /**
   * Basis-input waarmee de housing-trigger-resolver server-side draaide.
   * Doorgegeven aan de Huis-strategie-modal voor de live preview, zodat die
   * met exact dezelfde engine-basis rekent als de grafiek. Null wanneer de
   * basis niet kon worden gebouwd.
   */
  housingSimBasis: HousingTriggerSimBasis | null
  /**
   * Wat-als-scenariovoorkeuren uit profiles.toekomst_scenario_prefs (versioned
   * JSONB), defensief geparsed met parseToekomstScenarioPrefs — DB-inhoud nooit
   * vertrouwen. NULL = geen scenario gezet (client valt op de defaults terug).
   * Voedt de hydratie van de scenariolaag op /toekomst (stap 4-wiring).
   */
  toekomstScenarioPrefs: ToekomstScenarioPrefs | null
}

/**
 * Cumulative FIRE impact calculation.
 * Each event is applied sequentially, so later events see the modified input.
 */
function computeCumulativeImpacts(
  baseInput: FinancialInput,
  events: LifeEvent[],
): LifeEventImpact[] {
  const sorted = [...events].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  const results: LifeEventImpact[] = []
  let runningInput = { ...baseInput }

  for (const ev of sorted) {
    const impact = computeLifeEventImpact(runningInput, ev)
    results.push(impact)
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}

/** Feature slug used to track whether the user has completed the Horizon
 *  prognose setup-pane. Stored in user_feature_visits.
 *
 *  De setup-pane zelf is per juni 2026 vervangen door de altijd-zichtbare
 *  grafiek met inline-editors (STEP 2). De slug blijft bestaan voor
 *  achterwaartse compatibiliteit met oude records, maar bepaalt niet langer
 *  of de grafiek wordt getoond. */
export const HORIZON_SETUP_COMPLETED_SLUG = 'horizon_setup_completed'

/** Feature slug die bijhoudt of de eenmalige welkomsttekst bovenaan de
 *  /toekomst-grafiek al is getoond. Stored in user_feature_visits, gespiegeld
 *  aan HORIZON_SETUP_COMPLETED_SLUG. Wordt door de client gePOST bij eerste
 *  render zodat de welkomsttekst nooit terugkomt (los van de overlay-toggle). */
export const HORIZON_WELCOME_SHOWN_SLUG = 'horizon_welcome_shown'

/** Feature slug die bijhoudt of de gebruiker "Niet meer weergeven" heeft gekozen
 *  op de exit-melding die verschijnt bij het verlaten van de tips-overlay op
 *  /toekomst. Stored in user_feature_visits (zelfde patroon als
 *  HORIZON_WELCOME_SHOWN_SLUG → cross-device, niet localStorage). Aanwezig →
 *  de exit-melding verschijnt niet meer bij toekomstige exits; de overlay sluit
 *  dan direct. */
export const HORIZON_EXIT_NOTICE_DISMISSED_SLUG = 'horizon_exit_notice_dismissed'

/** Feature slug die bijhoudt of de gebruiker de tips-overlay op /toekomst al
 *  één keer heeft gesloten. Stored in user_feature_visits (zelfde cross-device-
 *  patroon als HORIZON_EXIT_NOTICE_DISMISSED_SLUG). Afwezig → de EERSTE keer dat
 *  de gebruiker de tips-overlay sluit navigeert de app naar /overzicht (waar het
 *  post-onboarding stappenplan staat) en wordt deze marker gezet; daarna nooit
 *  meer. Eén keer, cross-device — géén re-navigatie per apparaat. */
export const HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG = 'horizon_tips_first_close_navigated'

/** Default profile fallback values when profile query fails */
const PROFILE_DEFAULTS = {
  date_of_birth: null as string | null,
  retirement_expense_method: null as string | null,
  retirement_expense_custom_amount: null as number | null,
  fire_end_strategy: 'perpetual' as string,
  fire_end_age: 90,
  fire_legacy_amount: 0,
  expected_return: null as number | null,
  inflation_rate: null as number | null,
  net_monthly_income: 0,
  estimated_monthly_expenses: 0,
  household_type: 'solo' as string,
  withdrawal_strategy: 'static' as string,
  guardrail_floor: 0.80,
  guardrail_ceiling: 1.20,
  guardrail_cut_step: WITHDRAWAL_DEFAULTS.guardrailCutStep,
  guardrail_raise_step: WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  monthly_savings_override: null as number | null,
}

const loadHorizonDataCached = cache(async function loadHorizonDataInner(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<HorizonPageData> {
  const now = new Date()
  const oneYearFromNow = new Date(Date.UTC(now.getFullYear() + 1, now.getMonth(), now.getDate())).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]
  // 6-maands ondergrens voor de 6m-slice uit de gedeelde 12-maands tx-fetch
  // (byte-identiek aan het vroegere aparte [sixMonthsAgo, monthEnd)-venster).
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]

  const [
    txResult,
    fullAssetsResult,
    profileResult,
    allBudgetsResult,
    eventsResult,
    actionsResult,
    fullDebtsResult,
    snapshotsResult,
    bankAccountsResult,
    horizonSetupVisitResult,
    horizonWelcomeVisitResult,
    exitNoticeDismissedResult,
    tipsFirstCloseNavigatedResult,
    aowRowsResult,
    txAgg12Result,
    earliestIncomeResult,
    fireAssumptionsResult,
  ] = await Promise.all([
    // Gedeelde basisdata-laag (lib/server-data/base.ts): huidige-maand-tx,
    // actieve assets, eigen profiel (select('*') dekt óók de withdrawal/guardrail-
    // én monthly_savings_override-kolommen — de twee vroegere legacy-.maybeSingle()-
    // probes vervallen daarmee), alle budgetten, het 12-maands maandaggregaat
    // en de niet-gekoppelde bankrekeningen draaien nu als ÉÉN query per tabel per
    // request, gedeeld met de andere loaders + de shell.
    getCurrentMonthTx(supabase),
    getActiveAssets(supabase),
    getOwnProfile(supabase),
    getBudgets(supabase),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, linked_asset_id, metadata').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .eq('status', 'open')
      .not('scheduled_week', 'is', null)
      .gte('scheduled_week', today)
      .lte('scheduled_week', oneYearFromNow)
      .order('scheduled_week', { ascending: true }),
    getActiveDebts(supabase),
    supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age, score_version, engine_bron')
      .order('snapshot_date', { ascending: true })
      .limit(60),
    getUnlinkedBankAccounts(supabase),
    // Legacy setup-marker (de setup-pane is verwijderd — zie STEP 2). Nog
    // gelezen voor achterwaartse compatibiliteit; bepaalt geen weergave meer.
    // .maybeSingle() + null-fallback downstream — table kan ontbreken op legacy DBs.
    supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .eq('feature_slug', HORIZON_SETUP_COMPLETED_SLUG)
      .maybeSingle(),
    // Welkomsttekst-marker. Gespiegeld aan de setup-marker hierboven; bepaalt
    // of de eenmalige welkomstbanner bovenaan de grafiek nog wordt getoond.
    supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .eq('feature_slug', HORIZON_WELCOME_SHOWN_SLUG)
      .maybeSingle(),
    // Exit-melding-dismiss-marker ("Niet meer weergeven"). Zelfde patroon.
    supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .eq('feature_slug', HORIZON_EXIT_NOTICE_DISMISSED_SLUG)
      .maybeSingle(),
    // Eerste-sluiting-navigatie-marker. Zelfde patroon.
    supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .eq('feature_slug', HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG)
      .maybeSingle(),
    // AOW-leeftijd-referentietabel (publiek, geen user-filter) — dezelfde query-
    // vorm die de client tot nu toe op mount deed (loadKernelContext / loadData).
    // Server-side meegeleverd zodat de kernel-context al bij de eerste render
    // compleet is en de mount-fetch overgeslagen kan worden (geen tweede solve).
    supabase
      .from('aow_leeftijd')
      .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
      .order('birth_date_from', { ascending: true }),
    // 12-maands maandaggregaat (som pos/neg per maand/budget/type) voor de SUM-
    // consumers (last12Income + 6-maands inkomen/uitgaven/spaarbudget). SQL-aggregaat
    // i.p.v. een rijen-slice: kan niet stil afkappen op max_rows=1000 (correctheid).
    // GEMENGDE grondslag per reductie: de spaarquote- én gezondheidsscore-sommen
    // (income6m/expenses6m/savingsBudgetSpent6m + de 6-maands avg income/expenses)
    // draaien transfer-EXCLUSIEF (realOnly:true — app-brede spaarquote/health-
    // grondslag, eigen-rekening-overboekingen tellen NERGENS mee); alleen de
    // FIRE-projectie-som last12Income telt transfers BEWUST mee (realOnly:false).
    // RLS-breed.
    //
    // Via de gedeelde `getTxAgg12m` i.p.v. een eigen `fetchTxMonthAggregate`: het
    // venster was al byte-identiek (zelfde helpers, geen ownOnly), en op de
    // cashflow-hub draait deze loader in hetzelfde request als de dashboard- en
    // core-loader (loadDashboardData → computeHorizonFireSim → loadHorizonData).
    // Dat was dus een DERDE identieke RPC; nu delen ze er één.
    getTxAgg12m(supabase),
    // Vroegste inkomens-datum (all-time, één rij) — afkap-vrij, i.p.v. de vroegere
    // reduce over een gecapte 12-maands-slice (die kon bij >1000 positieve rijen
    // stil afkappen → incomeMonths te klein → over-extrapolatie). Zelfde gedeelde
    // helper als dashboard-data-loader.ts/lever-scores-loader.ts; cache()
    // dedupliceert met die calls binnen hetzelfde request.
    getEarliestIncomeDate(supabase),
    // FIRE-marktaannames — jaargelaagde override-laag (Optie 2: DB-override met
    // TS-fallback). Klein, RLS-breed (authenticated read). Ontbrekende tabel /
    // lege set → resolveFireAssumptions valt terug op de TS-constanten
    // (DEFAULT_RETURN/INFLATION) → byte-identiek gedrag. Server-side geresolveerd
    // zodat rendement/inflatie consistent zijn met /overzicht en /core.
    supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true }),
  ])

  // Same row both consumers want: alias instead of re-querying.
  const assetsResult = fullAssetsResult

  // Gedeeld 12-maands maandaggregaat — voedt last12Income + de 6-maands sommen.
  // Per-reductie grondslag: de spaarquote/health-sommen transfer-EXCLUSIEF
  // (realOnly:true), de FIRE-som last12Income transfer-INCLUSIEF (realOnly:false).
  // Kan niet stil afkappen op 1000 rijen. earliestIncomeDate komt niet meer uit
  // een 12-maands-slice maar uit de aparte all-time `getEarliestIncomeDate` (zie
  // hieronder).
  const txAgg12 = (txAgg12Result.data ?? []) as TxMonthAggregateRow[]
  // 6-maands sub-venster op maand-niveau ('YYYY-MM'); sixMonthsAgo is de 1e van de
  // maand ⇒ `date >= sixMonthsAgo` == `maand >= sixMonthsAgoMonth` (exact).
  const sixMonthsAgoMonth = sixMonthsAgo.slice(0, 7)

  // AOW-rijen voor de client-kernel-context (rawProfile + aowRows). Leeg bij een
  // ontbrekende tabel (legacy DB) → de client valt terug op de mount-fetch.
  const aowRows = (aowRowsResult.data ?? []) as AowLeeftijdRow[]

  // Check profile query for errors and use fallback if needed
  if (profileResult.error) {
    console.error(
      `[horizon-data-loader] Profile query failed: code=${profileResult.error.code}, message=${profileResult.error.message}`,
      profileResult.error,
    )
  }
  const baseProfile = profileResult.data ?? PROFILE_DEFAULTS

  // Withdrawal-strategy + guardrail-kolommen komen nu uit de gedeelde select('*')
  // (baseProfile) i.p.v. een aparte .maybeSingle()-probe. Op de huidige DB byte-
  // identiek; op een legacy-DB zonder deze kolommen levert select('*') ze simpelweg
  // niet op → de ?? PROFILE_DEFAULTS grijpen in (zelfde uitkomst, zonder kolom-warn).
  const wsData = baseProfile as {
    withdrawal_strategy?: string | null
    guardrail_floor?: number | null
    guardrail_ceiling?: number | null
    guardrail_cut_step?: number | null
    guardrail_raise_step?: number | null
  }

  const profile = {
    ...baseProfile,
    withdrawal_strategy: wsData.withdrawal_strategy ?? PROFILE_DEFAULTS.withdrawal_strategy,
    guardrail_floor: wsData.guardrail_floor ?? PROFILE_DEFAULTS.guardrail_floor,
    guardrail_ceiling: wsData.guardrail_ceiling ?? PROFILE_DEFAULTS.guardrail_ceiling,
    guardrail_cut_step: wsData.guardrail_cut_step ?? PROFILE_DEFAULTS.guardrail_cut_step,
    guardrail_raise_step: wsData.guardrail_raise_step ?? PROFILE_DEFAULTS.guardrail_raise_step,
  }

  // ── FIRE-marktaannames: jaarlaag-shadow (Optie 2, DB-override met TS-fallback) ──
  // Vul rendement/inflatie ALLEEN aan met de jaar-geresolveerde markt-default wanneer
  // de gebruiker zelf niets zette (null). Een expliciete gebruikerskeuze wint dus.
  // Bij een ontbrekende/lege jaarlaag geeft resolveFireAssumptions exact
  // DEFAULT_RETURN/INFLATION terug → byte-identiek aan vóór deze override.
  // Downstream werkt de override consistent: resolveFireParams (scalar/target:
  // freedomPct, FIRE-doel, effectiveSwr) én — voor inflatie — de kernel-scalar
  // (adapter/index.ts leest resolveFireParams(profile).inflationRate). Rendement
  // beweegt bewust NIET de kernel-accumulatiecurve: die leidt groei per-asset af
  // (asset.expected_return), IDENTIEK aan hoe DEFAULT_RETURN vandaag al werkt.
  const fireAssumptions = resolveFireAssumptions(
    (fireAssumptionsResult.data ?? []) as FireAssumptionRow[],
  )
  if (profile.expected_return == null) profile.expected_return = fireAssumptions.expectedReturn
  if (profile.inflation_rate == null) profile.inflation_rate = fireAssumptions.inflation

  // Factor A (pensioenaangroei) uit de canonieke resolver — NULL ≠ 0. Niet in
  // PROFILE_DEFAULTS opgenomen zodat een ontbrekend veld als undefined →
  // "onbekend" (factorA 0) wordt behandeld i.p.v. een misleidende harde 0.
  // `isKnown` wordt apart op de bundel gezet zodat consumers het verschil
  // tussen "0 (zzp, bekend)" en "onbekend (leeg)" kunnen tonen/dempen.
  const resolvedFactorA = resolvePensionFactorA(
    profile as { pension_factor_a?: number | null; pension_factor_a_source?: string | null },
  )
  const pensioenFactorA = resolvedFactorA.factorA
  const pensioenFactorAKnown = resolvedFactorA.isKnown

  // Monthly income/expenses from current month transactions
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
    resolveEffectiveIncomeExpenses(profile ?? {}, monthlyIncome, monthlyExpenses)

  // 6-month average income/expenses for stable resilience calculation — uit het
  // maandaggregaat, TRANSFER-EXCLUSIEF (realOnly:true). avgIncome6m/avgExpenses6m voeden
  // de gezondheidsscore-input (netMonthlyIncome = DSTI-noemer, avgMonthlyExpenses =
  // noodfonds-dekking). health-score-input.ts eist expliciet dat netMonthlyIncome
  // DEZELFDE bron is als savingsRate6m — dus dezelfde transfer-exclusieve grondslag als
  // income6m hieronder (spiegelt dashboard-data-loader's health-inkomensanker
  // extIncome6/6, óók transfer-exclusief). Transfers tellen NERGENS mee in de
  // spaarquote/health-grondslag; alleen de FIRE-projectie-sommen zien alle kasstromen.
  const totalIncome6m = aggSumPositief(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const totalExpenses6m = aggSumNegatiefAbs(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const avgIncome6m = totalIncome6m > 0 ? totalIncome6m / 6 : effectiveMonthlyIncome
  const avgExpenses6m = totalExpenses6m > 0 ? totalExpenses6m / 6 : effectiveMonthlyExpenses

  // Asset totals with inclusion percentages
  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash
  // totalDebts uit de gedeelde getActiveDebts (select('*')) — dezelfde rijen die
  // computeDebtAflossingMonthly + de health-score consumeren, één fetch per request.
  const totalDebts = (fullDebtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Extrapolated 12-month income — TRANSFER-INCLUSIEF (realOnly:false), BEWUST NIET
  // gelijkgetrokken. extrapolatedIncome voedt NIET computeSavingsRate6m of de
  // gezondheidsscore-input, maar computeRetirementExpenses (FIRE-pensioenuitgave,
  // income-based) én de income-basis van baseAnnualSavingsFromCashflow (inkomen ×
  // spaarquote). Dat zijn FIRE-projectie-inputs die bewust alle kasstromen zien (buiten
  // de spaarquote-gelijktrekking); die raakt alleen de spaarquote-RATE (savingsRate6m,
  // nu transfer-exclusief), niet deze income-multiplier.
  const last12Income = aggSumPositief(txAgg12, { realOnly: false })
  // Vroegste inkomens-datum: all-time via de gedeelde `getEarliestIncomeDate`
  // (order(date asc).limit(1)) i.p.v. een reduce over een gecapte 12-maands-slice —
  // die kon bij >1000 positieve rijen stil afkappen (incomeMonths te klein →
  // over-extrapolatie). Spiegelt dashboard-data-loader.ts/lever-scores-loader.ts.
  const earliestIncomeDate =
    (earliestIncomeResult.data as { date?: string | null } | null)?.date ?? undefined

  // ── Budget subsets from single query ──────────────────────────
  const allBudgetsRaw = (allBudgetsResult.data ?? []) as { id: string; name: string; default_limit: number; interval: string; budget_type: string; is_essential: boolean; parent_id: string | null }[]
  const essentialBudgets = allBudgetsRaw.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
  const allParentBudgets = allBudgetsRaw.filter(b => b.parent_id === null)
  const allChildren = allBudgetsRaw.filter(b => b.parent_id !== null)

  // Budget type map: budget_id → budget_type (parent + child)
  const budgetTypeMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of allChildren) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }

  // Yearly must expenses + retirement expenses
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialBudgets,
    allChildren.filter(c => !['archive', 'income', 'savings'].includes(c.budget_type)),
  )

  // Extrapolatie (inkomen → jaarbasis) + pensioenuitgave-methode: ÉÉN gedeelde
  // bron (lib/retirement-expense-basis.ts), identiek gedeeld met horizon-client
  // loadData() en /api/uitgaven-na-pensioen/context (consume, don't recompute).
  const { extrapolatedIncome, yearlyRetirementExpenses } = deriveRetirementExpenseBasis({
    method: profile.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    last12Income,
    earliestIncomeDate,
    customAmount: profile.retirement_expense_custom_amount,
    estimatedYearlyExpenses: profileMonthlyExpenses * 12,
    now,
  })

  const dob = profile.date_of_birth ?? null

  // FIRE strategy from profile — use override-aware resolver for pensioen fallback
  const fireStrategy = resolveFireStrategyWithOverride(profile)

  // Withdrawal strategy from profile (static/guardrails/vpw/bucket)
  const withdrawalStrategy = resolveWithdrawalStrategy(profile)

  // Berekeningsparameters uit profiel
  const fireParams = resolveFireParams(profile)

  // ── Perspectief-aware FIRE-vermogensaggregaten ────────────────────
  // Default 'personal' → byte-identiek aan voorheen. Bij 'household'/'partner'
  // herberekenen we totalAssets/totalDebts/monthlyContributions op het aandeel
  // dat in dat perspectief telt (via loadPerspectiveData; privacy reeds
  // server-side toegepast). De rest van de loader (health, housing, Box 3)
  // blijft op de eigen ruwe data — die metrics zijn persoonlijk van aard.
  let fireTotalAssets = totalAssets
  let fireTotalDebts = totalDebts
  let fireMonthlyContributions = monthlyContributions
  if (perspective !== 'personal') {
    try {
      const pd = await loadPerspectiveDataServer(supabase, perspective)
      const share = (item: { ownership?: string; _myShareFraction?: number }, raw: number): number =>
        item.ownership === 'shared' && perspective !== 'household'
          ? raw * (item._myShareFraction ?? 1)
          : raw
      fireTotalAssets = pd.assets.reduce((s, a) => {
        const raw = Number(a.current_value) * ((Number(a.net_worth_inclusion_pct) || 100) / 100)
        return s + share(a, raw)
      }, 0) + unlinkedCash
      fireTotalDebts = pd.debts.reduce((s, d) => {
        const raw = Number(d.current_balance) * ((Number(d.net_worth_inclusion_pct) || 100) / 100)
        return s + share(d, raw)
      }, 0)
      fireMonthlyContributions = pd.assets.reduce((s, a) => {
        const raw = Number(a.monthly_contribution) || 0
        return s + share(a, raw)
      }, 0)
    } catch {
      // Perspectief-laden faalt (geen huishouden / RLS) → val terug op eigen data.
    }
  }

  // Build the effective FIRE input
  const effectiveInput: FinancialInput = {
    totalAssets: fireTotalAssets,
    totalDebts: fireTotalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlyContributions: fireMonthlyContributions,
    yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: dob,
  }

  // Process snapshot data for resilience score
  const allSnapshots = (snapshotsResult.data ?? []) as SnapshotForTrend[]
  const snapshotsWithResilience = allSnapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  const snapshotResilience = snapshotsWithResilience.length > 0
    ? snapshotsWithResilience[snapshotsWithResilience.length - 1].resilience_score
    : null

  // ── Health Score (5 or 6 pillars) ──────────────────────────
  // Detect budgetingActive from profile (defaults to true if column doesn't exist)
  const budgetingActive = (profile as Record<string, unknown>).budgeting_active !== false

  // ── savingsRate6m (zelfde formule ÉN zelfde transfer-exclusieve grondslag als
  //    dashboard-data-loader) ────
  // Savings-budget IDs: transactions mapped to savings budgets are saving, not spending
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeMap) {
    if (type === 'savings') savingsBudgetIds.add(id)
  }

  // 6-maands inkomen/uitgaven + spaarbudget-correctie uit het maandaggregaat,
  // TRANSFER-EXCLUSIEF (realOnly:true) — spiegelt dashboard-data-loader (r757-763),
  // lever-scores-loader en core-data-loader (isRealTx): de spaarquote heeft app-breed
  // ÉÉN grondslag waarin eigen-rekening-overboekingen NERGENS meetellen. Vroeger stond
  // dit op realOnly:false, waardoor savingsRate6m — en dus de savings-pijler van de
  // gezondheidsscore + het cashflow-hefboompercentage — bij transfer-zware gebruikers
  // afweek van statusdot/briefing/cashflow-pagina. income6m/expenses6m zijn hierdoor
  // (weer) per constructie gelijk aan totalIncome6m/totalExpenses6m hierboven.
  const income6m = aggSumPositief(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const expenses6m = aggSumNegatiefAbs(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const savingsBudgetSpent6m = aggSumNegatiefAbs(txAgg12, {
    realOnly: true,
    sinceMonth: sixMonthsAgoMonth,
    budgetIds: savingsBudgetIds,
  })

  // Debt aflossing add-back (principal repayments count as saving) — gedeelde helper.
  const debtAflossingMonthly = computeDebtAflossingMonthly((fullDebtsResult.data ?? []) as unknown as Debt[])
  const debtAflossing6m = debtAflossingMonthly * 6

  // Canonieke 6-maands spaarquote — gedeelde helper (extrapolatie <6m data +
  // savingsRateFromAggregates + profiel-fallback). Spaarbudgetten tellen als sparen
  // (uit de uitgaven-term), schuldaflossing erbij. Byte-identiek aan de vroegere
  // inline-versie; nu single-sourced met dashboard/core/lever-scores.
  let dataMonths6 = 6
  // Zelfde vroegste-inkomens-datum als hierboven (uit de gedeelde all-time
  // getEarliestIncomeDate).
  const earliestIncomeDateH = earliestIncomeDate
  if (earliestIncomeDateH) {
    const earliest = new Date(earliestIncomeDateH)
    dataMonths6 = Math.max(1, Math.min(6,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
  }
  const { savingsRate6m } = computeSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m,
    dataMonths: dataMonths6,
    fallbackMonthlyIncome: effectiveMonthlyIncome,
    fallbackMonthlyExpenses: effectiveMonthlyExpenses,
  })

  // Canonieke spaarbron voor de FIRE-prognose: inkomen × spaarquote, exact zoals
  // het instellingenblok onderaan /overzicht/cashflow het toont (berekend óf
  // overschreven). `effectiveSavingsRate` is datzelfde percentage en voedt
  // hieronder ook de gezondheidsscore — één getal, één oordeel.
  const sources = profile as { income_source?: string | null; expenses_source?: string | null }
  const {
    baseAnnualSavings: baseAnnualSavingsFromCashflow,
    effectiveSavingsRatePct: effectiveSavingsRate,
  } = resolveSavingsSource({
    incomeSource: sources.income_source,
    expensesSource: sources.expenses_source,
    netMonthlyIncome: Number(profile.net_monthly_income ?? 0),
    estimatedAnnualIncome: extrapolatedIncome,
    estimatedMonthlyExpenses: profileMonthlyExpenses,
    savingsRate6m,
  })


  // ── freedomPct: strategy-adjusted FIRE target (same as dashboard) ──
  // Bij huishoud-/partnerweergave rekenen we met de perspectief-totalen
  // (fireTotalAssets/fireTotalDebts bevatten al partner-aandeel + gedeeld) zodat
  // netto vermogen, freedomPct én de healthScoreInput-totalen kloppen voor de
  // gekozen weergave. Eigen weergave blijft byte-identiek (zelfde totalAssets/Debts).
  const perspectiveTotalAssets = perspective !== 'personal' ? fireTotalAssets : totalAssets
  const perspectiveTotalDebts = perspective !== 'personal' ? fireTotalDebts : totalDebts
  const netWorth = perspectiveTotalAssets - perspectiveTotalDebts
  const fireSwr = fireParams.effectiveSwr
  const currentAge = dob ? ageAtDate(dob) : null
  const yearsInRetirement = (fireStrategy.strategy === 'deplete' && currentAge != null)
    ? Math.max(1, fireStrategy.endAge - Math.round(currentAge))
    : undefined
  const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
  const fireTarget = computeFireTarget(
    computeEffectiveExpenses(yearlyRetirementExpenses, effectiveMonthlyExpenses * 12),
    fireSwr,
    { strategy: fireStrategy.strategy, yearsInRetirement, realReturn },
  )

  // ── Housing strategy ──────────────────────────────────────────
  // Parse strategy uit profile (default include_full bij missing/legacy users).
  // Context aggregeert eigen_huis + linked mortgage. fireEligibleNetWorth =
  // netWorth minus equity bij strategieën waar het huis niet meedoet.
  // Vroeg berekend zodat de canonieke freedomPct dezelfde FIRE-eligible
  // grondslag gebruikt als de "nog X jaar"-aftelling.
  const housingStrategy = parseHousingStrategy(
    (profile as Record<string, unknown>).housing_strategy_config,
  )
  const housingContext = deriveHousingContext(
    (fullAssetsResult.data ?? []) as Asset[],
    (fullDebtsResult.data ?? []) as Debt[],
  )
  const fireEligibleNetWorth = getFireEligibleNetWorth(netWorth, housingContext, housingStrategy)
  // Dubbele grondslag (incl./excl. eigen woning). netWorthExclHome = netWorth − overwaarde
  // (ZUIVER, ook bij reverse_mortgage); aparte weergave-grondslag, NIET de FIRE-pot. Eén home:
  // lib/housing-strategy.ts. showDualHousingBasis gate't de splitsing.
  const netWorthExclHome = netWorthExcludingHome(netWorth, housingContext)
  const showDualHousingBasis = shouldShowDualHousingBasis(housingContext, housingStrategy)

  // ── freedomPct: canonieke vrijheidsvoortgang (zelfde grondslag als dashboard) ──
  // Deze loader draait zelf géén unified projection (de client doet dat); de
  // benodigde portfolio is hier het strategie-bewuste fireTarget op de
  // FIRE-eligible grondslag — geen nieuwe parallelle som, identieke noemer als
  // de "nog X jaar"-aftelling. Voorkomt 100% naast "nog jaren".
  // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
  // INCL.-woning grondslag. Deze loader draait zelf géén unified projection (de
  // client doet dat), dus de incl.-noemer is de scalar-fallback (excl.-doel + huis-
  // aandeel via inclHomeTargetFromScalar). Alleen bij exclude_from_fire → EXCL.
  const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategy)
  const requiredPortfolioExclHome = fireTarget > 0 ? fireTarget : null
  const freedomPct = computeFreedomProgressWithBasis({
    homeExcludedFromFire,
    netWorthInclHome: netWorth,
    fireEligibleNetWorth,
    requiredNetWorthInclHome: inclHomeTargetFromScalar(requiredPortfolioExclHome, netWorth, fireEligibleNetWorth),
    requiredPortfolioExclHome,
  })

  // ── Canonieke gezondheidsscore-input (ADR 0008/0010) ──────────
  // Eén bron: dezelfde `buildHealthScoreInput` als de dashboard-loader en de
  // snapshot-routes. Verving het lokale tweede berekenpad (eigen assetTypeCount/
  // budgetCategories + buildTaxData-duplicaat) zodat /toekomst, /overzicht en de
  // opgeslagen resilience_score byte-identiek scoren bij gelijke data.
  //   • netMonthlyIncome = avgIncome6m (= totaalIncome6m/6, profiel-fallback) —
  //     DEZELFDE inkomensbron die savingsRate6m voedt (ADR 0010 / FR-2).
  //   • debtMonthlyPayments = Σ monthly_payment over de actieve schulden uit
  //     fullDebtsResult (de trimmed debts-query mist deze kolom).
  //   • avgMonthlyExpenses = avgExpenses6m → identieke noodfonds-dekking als het
  //     vroegere inline-pad (zelfde liquide-types: savings/checking/cash + cash).
  // emergencyFundMonths, assetTypeCount én taxData worden nu canoniek door de
  // helper afgeleid; de losse inline-varianten zijn verwijderd.
  const healthDebtMonthlyPayments = (fullDebtsResult.data ?? []).reduce(
    (s, d) => s + Number((d as { monthly_payment?: number | string | null }).monthly_payment ?? 0),
    0,
  )
  const healthScoreInput: HealthScoreInput = buildHealthScoreInput(
    {
      // EFFECTIEVE spaarquote (handmatige invoer wint) — hetzelfde percentage
      // dat het instellingenblok onderaan /overzicht/cashflow toont en dat de
      // FIRE-prognose hierboven gebruikt. Niet de rauwe transactiequote.
      savingsRate6m: effectiveSavingsRate,
      totalAssets: perspectiveTotalAssets,
      totalDebts: perspectiveTotalDebts,
      freedomPct,
      avgMonthlyExpenses: avgExpenses6m,
      netMonthlyIncome: avgIncome6m,
      // Noodbuffer-norm: 3 × netto maandsalaris (lib/emergency-fund.ts).
      netMonthlySalary: effectiveMonthlyIncome,
    },
    {
      assets: (fullAssetsResult.data ?? []) as HealthScoreAsset[],
      unlinkedCash,
      budgets: allBudgetsRaw as HealthScoreBudget[],
      transactions: (txResult.data ?? []) as HealthScoreTransaction[],
      householdType: (profile as Record<string, unknown>).household_type as string | null,
      debtMonthlyPayments: healthDebtMonthlyPayments,
    },
  )
  // Canonieke gezondheidsscore (ADR 0008/0010) — de ÉNE bron voor zowel de
  // /overzicht-hero als de Gezondheid-widget (die 'm consumeert via
  // withCanonicalHealthScore i.p.v. de eigen bundel-score te herberekenen).
  // TRENDLOOS (previousMonth=null): de hero toonde nooit een trend, en de widget
  // lijnt daar nu mee uit — één cijfer, één presentatie. Een geünificeerde
  // gezondheids-trend is bewust een APARTE follow-up: die vereist een correcte
  // meest-recente-vóórgaande-snapshotbron (de gedeelde allSnapshots-query is
  // order(asc).limit(60) → bij >60 snapshots de OUDSTE, niet de recente) én een
  // besluit over het /toekomst-gedrag (horizon-client herrekent op slider-
  // wijziging trendloos). De dashboard-bundel-fallback berekent wél een trend,
  // maar die score wordt op /overzicht overschreven door deze.
  const healthScore = computeHealthScoreFromInputs(healthScoreInput, budgetingActive)

  // Events, actions, debts, assets
  const realEvents = (eventsResult.data ?? []) as LifeEvent[]
  const actions = (actionsResult.data ?? []) as Action[]
  const debts = (fullDebtsResult.data ?? []) as Debt[]
  const assets = (fullAssetsResult.data ?? []) as Asset[]

  // housingStrategy/housingContext/fireEligibleNetWorth zijn hierboven al
  // berekend (vóór freedomPct, zelfde grondslag als de "nog X jaar"-aftelling).
  const housingStrategyDismissedAt =
    ((profile as Record<string, unknown>).housing_strategy_dismissed_at as string | null) ?? null

  // ── Virtuele housing-strategy LifeEvents ─────────────────────
  // Maken downsize/reverse_mortgage zichtbaar op de tijdlijn. Worden door de
  // bestaande LifeEvent → SimCashflow-pipeline opgepikt voor de simulatie.
  // Read-only — UI markeert ze via metadata.source = 'housing-strategy'.
  //
  // Het on_depletion-trigger-moment komt uit `resolveHousingEventsForSim`
  // (lib/housing-trigger.ts): dezelfde unified-projection-engine als de
  // grafiek, zodat de event-marker samenvalt met het uitputtingsmoment in
  // de grafiek. Op /toekomst regenereert de client-hook deze events met de
  // actuele client-parameters; deze server-set is de initiële weergave.
  const currentAgeForHousing = dob ? ageAtDate(dob) : 40
  const housingHouseholdType = String((profile as Record<string, unknown>).household_type ?? 'solo')
  // Bug-fix: voorheen tegen de verouderde woordenschat ('samenwonend'/'getrouwd')
  // die household_type nooit is → altijd false. Nu via canonieke helper.
  const housingHasPartner = hasPartner(housingHouseholdType)
  // Annual savings: zelfde bron als de client-sim (override > cashflow-
  // spaarquote > asset-contributies), zodat het trigger-moment overeenkomt.
  const housingOverrideRaw =
    (profile as { monthly_savings_override?: number | string | null }).monthly_savings_override ?? null
  const housingMonthlyOverride = housingOverrideRaw == null ? null : Number(housingOverrideRaw)
  const annualSavingsForHousing =
    housingMonthlyOverride != null && housingMonthlyOverride >= 0
      ? housingMonthlyOverride * 12
      : (baseAnnualSavingsFromCashflow != null && baseAnnualSavingsFromCashflow > 0
          ? baseAnnualSavingsFromCashflow
          : monthlyContributions * 12)
  // Pensioen-modus: FIRE-moment is exogeen (AOW). Geen aow-tabel in deze
  // loader — NL_AOW_AGE volstaat; de client regenereert met de echte
  // fractionele AOW-leeftijd.
  const housingIsPensioen = fireStrategy.strategy === 'pensioen'
  const housingEndAge = housingIsPensioen
    ? Math.max(fireStrategy.endAge, NL_AOW_AGE + 1)
    : fireStrategy.endAge
  // Basis voor de trigger-resolver én (via HorizonPageData) voor de live
  // preview in de Huis-strategie-modal — één definitie, geen drift.
  const housingSimBasis: HousingTriggerSimBasis = {
    assets,
    debts,
    currentAge: currentAgeForHousing,
    endAge: housingEndAge,
    yearlyExpenses: yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses : effectiveMonthlyExpenses * 12,
    annualSavings: annualSavingsForHousing,
    monthlyIncome: effectiveMonthlyIncome,
    grossReturn: fireParams.grossReturn,
    inflationRate: fireParams.inflationRate,
    box3Method: fireParams.box3Method,
    cashflows: lifeEventsToCashflows(realEvents),
    strategyConfig: housingIsPensioen ? { ...fireStrategy, endAge: housingEndAge } : fireStrategy,
    withdrawalStrategy,
    forcedFireAge: housingIsPensioen ? NL_AOW_AGE : undefined,
    hasPartner: housingHasPartner,
    bankAccountCash: unlinkedCash,
  }
  // FASE 6 stap 5A — kernel-only: de horizon-kernel resolvet housing ZÉLF
  // (`kernelHousingSale`, client-side via `applyKernelHousingSaleToEvents`). De server
  // genereert geen virtuele huis-verkoop-events meer (die waren op een v2-meetrun geresolved
  // en werden op de kernel-tak toch gestript).
  const loadedEvents: LifeEvent[] = realEvents

  // Cumulative impacts
  const impacts = computeCumulativeImpacts(effectiveInput, loadedEvents)

  // Derive box3Method from fireParams and hasPartner from household_type.
  // Bug-fix: voorheen tegen de verouderde woordenschat ('samenwonend'/'getrouwd')
  // die household_type nooit is → altijd false. Nu via canonieke helper.
  const box3Method = fireParams.box3Method

  // ── Canonieke Box 3-heffing (personal) ─────────────────────────
  // Zelfde motor als /overzicht/belasting/box3 en de dashboard-loader:
  // calculateBox3 (lib/box3-data.ts) op CURRENT_TAX_YEAR, hasPartner:false.
  // Pariteit met de box3-subpagina is exact voor solo-gebruikers; bij een
  // fiscaal partner rekent de subpagina in household-perspectief met
  // hasPartner:true (dubbele voet + shared assets) en kan dit personal-getal
  // dus afwijken — partner-perspectief loopt via loadPerspectiveBox3. De
  // Belasting-hub-kaart en de /overzicht-belastingtegel consumeren dit i.p.v. de
  // `healthScoreInput.taxData.box3Tax`-proxy (buildTaxData): die negeert schulden
  // (incl. de eigenwoninghypotheek → Box 1) en rekent alles als beleggingen, wat
  // een positieve heffing toonde náást een "geen belasting"-status. dailyExpenses
  // raakt alleen freedomDays, niet .tax — de heffing zelf is er onafhankelijk van.
  let box3Tax: number | null = null
  if (assets.length > 0) {
    try {
      const box3DailyExp = yearlyMustExpenses > 0
        ? yearlyMustExpenses / 365
        : dailyExpenseRate(effectiveMonthlyExpenses)
      const rawBox3Tax = calculateBox3({
        assets,
        debts,
        hasPartner: false,
        dailyExpenses: box3DailyExp,
        year: CURRENT_TAX_YEAR,
      }).tax
      // Normaliseer negatief-nul (grondslagSparen 0 × negatief effectief rendement
      // levert -0) zodat de KPI nooit "-€ 0" toont.
      box3Tax = Object.is(rawBox3Tax, -0) ? 0 : rawBox3Tax
    } catch {
      box3Tax = null
    }
  }
  const householdType = String((profile as Record<string, unknown>).household_type ?? 'solo')
  const hasPartnerFlag = hasPartner(householdType)
  const potRules = resolvePotRules(profile as { pot_rules?: unknown })
  const numberOfChildren = Number((profile as Record<string, unknown>).number_of_children ?? 0)

  // ── Horizon setup-pane state ──────────────────────────────────────
  // hasCompletedHorizonSetup: true zodra de gebruiker de Horizon-prognose-
  // setup-pane heeft doorlopen + opgeslagen. Bepaalt of de hoofd-grafiek
  // wordt vervangen door de intro-card.
  const hasCompletedHorizonSetup = !horizonSetupVisitResult.error
    && horizonSetupVisitResult.data?.feature_slug === HORIZON_SETUP_COMPLETED_SLUG

  // hasSeenWelcome: true zodra de welkomsttekst-marker bestaat. Bij een
  // ontbrekende tabel (error) → behandel als "nog niet gezien" zodat de
  // welkomsttekst minstens één keer verschijnt (graceful degrade).
  const hasSeenWelcome = !horizonWelcomeVisitResult.error
    && horizonWelcomeVisitResult.data?.feature_slug === HORIZON_WELCOME_SHOWN_SLUG

  // exitNoticeDismissed: true zodra de "Niet meer weergeven"-marker bestaat. Bij
  // een ontbrekende tabel (error) → behandel als "nog niet weggeklikt" zodat de
  // exit-melding minstens kan verschijnen (graceful degrade, zelfde keuze als
  // hasSeenWelcome).
  const exitNoticeDismissed = !exitNoticeDismissedResult.error
    && exitNoticeDismissedResult.data?.feature_slug === HORIZON_EXIT_NOTICE_DISMISSED_SLUG

  // tipsFirstCloseNavigated: true zodra de eerste-sluiting-navigatie-marker
  // bestaat. Bij een ontbrekende tabel (error) → behandel als "nog niet
  // genavigeerd" zodat de eenmalige navigatie minstens kan plaatsvinden
  // (graceful degrade, zelfde keuze als exitNoticeDismissed / hasSeenWelcome).
  const tipsFirstCloseNavigated = !tipsFirstCloseNavigatedResult.error
    && tipsFirstCloseNavigatedResult.data?.feature_slug === HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG

  // monthlySavingsOverride: handmatige override uit profiles. Null = geen
  // override, simulator gebruikt monthlyContributionFromAssets.
  const overrideRaw =
    (profile as { monthly_savings_override?: number | string | null }).monthly_savings_override ?? null
  const monthlySavingsOverride = overrideRaw == null ? null : Number(overrideRaw)

  // monthlyContributionFromAssets: raw asset-aggregaat (identiek aan
  // monthlyContributions hierboven, geëxporteerd voor de setup-pane).
  const monthlyContributionFromAssets = monthlyContributions

  // toekomstScenarioPrefs: wat-als-scenariovoorkeuren uit de eigen profielrij.
  // Defensief geparsed (clamps/whitelist/versiecheck) — DB-inhoud nooit vertrouwen;
  // ongeldig/afwezig → null (client gebruikt de defaults). Zelfde schrijf-poort als
  // PUT /api/toekomst-scenario, zodat lezen en schrijven identiek gevalideerd zijn.
  const toekomstScenarioPrefs = parseToekomstScenarioPrefs(
    (profile as { toekomst_scenario_prefs?: unknown }).toekomst_scenario_prefs,
  )

  // monthlySurplusFromBudget: surplus uit 6m gemiddelde transacties als
  // Budgetteren-module actief is. Null als module uit of geen surplus.
  const monthlySurplusFromBudget = budgetingActive && avgIncome6m > 0 && avgExpenses6m > 0
    ? Math.max(0, avgIncome6m - avgExpenses6m)
    : null

  // ── Rauwe kernel-context ──────────────────────────────────────────
  // De kernel-router (fire-target-shared, use-horizon-fire-sim, dashboard-loader) heeft de
  // RAUWE profiel-rij nodig om de kernel-invoer samen te stellen.
  // rawProfile = de al-gemergede hoofdprofiel-rij (incl. withdrawal/guardrail-velden,
  // hierboven gemerged) + de al-berekende essentiële-jaaruitgaven (geen DB-kolom)
  // zodat de kernel dezelfde pensioen-uitgave-grondslag ('essential_budgets')
  // gebruikt als v2. Geen nieuwe som — hergebruikt `yearlyMustExpenses`.
  const rawProfile: ConvergentieRawProfileRow = {
    ...(profile as ConvergentieRawProfileRow),
    yearly_essential_expenses: yearlyMustExpenses,
  }

  return {
    effectiveInput,
    events: loadedEvents,
    impacts,
    actions,
    debts,
    fireStrategy,
    withdrawalStrategy,
    fireParams,
    resilienceSnapshots: allSnapshots,
    snapshotResilience,
    avgIncome6m,
    avgExpenses6m,
    healthScore,
    healthScoreInput,
    budgetingActive,
    assets,
    box3Method,
    box3Tax,
    hasPartner: hasPartnerFlag,
    pensioenFactorA,
    pensioenFactorAKnown,
    rawProfile,
    aowRows,
    potRules,
    profileError: profileResult.error
      ? `Profile query failed: ${profileResult.error.code} — ${profileResult.error.message}`
      : null,
    unlinkedCash,
    numberOfChildren,
    hasCompletedHorizonSetup,
    hasSeenWelcome,
    exitNoticeDismissed,
    tipsFirstCloseNavigated,
    monthlySavingsOverride,
    monthlyContributionFromAssets,
    monthlySurplusFromBudget,
    baseAnnualSavingsFromCashflow,
    retirementExpenseMethod: (profile.retirement_expense_method as RetirementExpenseMethod | null) ?? null,
    retirementExpenseCustomAmount: profile.retirement_expense_custom_amount ?? null,
    housingStrategy,
    housingContext,
    fireEligibleNetWorth,
    // Server-scalars voor de progressieve first paint van /toekomst (Task 4.2) — al berekend
    // hierboven, nu doorgegeven (geen nieuwe som). `fire_age` zit al in `resilienceSnapshots`.
    freedomPct,
    requiredPortfolioExclHome,
    netWorthExclHome,
    showDualHousingBasis,
    housingStrategyDismissedAt,
    housingSimBasis,
    toekomstScenarioPrefs,
  }
})

/**
 * Server-side loader voor de Horizon-bundel, request-gededuped via React
 * `cache()` — meerdere aanroepen binnen één RSC-render (page + aandachtspunten-
 * producenten + briefing) draaien de queries maar één keer per
 * (client, perspective)-combinatie.
 *
 * Perspectief (eigen / huishouden / partner). Optioneel + default 'personal'
 * zodat bestaande callers byte-identiek blijven. Alleen wanneer 'household'
 * of 'partner' worden de FIRE-vermogensaggregaten (totalAssets/totalDebts/
 * monthlyContributions) + de assets/debts-arrays via loadPerspectiveData
 * herberekend op het gevraagde aandeel. Health-score, housing-context en
 * Box 3 blijven op de eigen ruwe data — die zijn persoonlijk van aard.
 *
 * De default wordt hiér genormaliseerd (niet in de gecachte functie): cache()
 * keyt op de argumentenlijst, dus `loadHorizonData(sb)` en
 * `loadHorizonData(sb, 'personal')` moeten dezelfde entry raken.
 */
export async function loadHorizonData(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<HorizonPageData> {
  return loadHorizonDataCached(supabase, perspective)
}
