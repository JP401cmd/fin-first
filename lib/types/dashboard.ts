// ── Dashboard data-contracten ───────────────────────────
// Canonieke datavorm-definities van de dashboard-bundel. Verhuisd uit
// components/widgets/widget-renderer.tsx zodat de import-richting UI→lib is
// (lib mag deze contracten importeren zonder terug naar components te reiken).
// Zuiver type-only: geen runtime, geen React-verwijzing.

import type { ResolvedBasis } from '@/lib/budget-basis'
import type { FreedomRateSource } from '@/lib/format'
import type { FireProjection, FireRange, FireCountdown } from '@/lib/horizon-data'
import type { FreedomMilestoneResult } from '@/lib/freedom-milestones'
import type { FeeAnalysis } from '@/lib/fee-analysis'
import type { FireEndStrategy, StopAnchor } from '@/lib/fire-strategy'
import type { HealthScore } from '@/lib/financial-health'
import type { NewsPreview } from '@/lib/news-preview'
import type { SpendLimitWidgetData } from '@/lib/spend-limits/widget-data'

/**
 * Compacte projectie voor de vermogens-widget met eigen selectie (ADR 0120).
 * Bewust hier gedefinieerd (niet in een lib met loaders): dit is het
 * RSC-payload-contract — klein, zonder per-bezit-rijen buiten `topItems`.
 * Alle bedragen zijn gewogen met `net_worth_inclusion_pct/100`.
 */
export interface WealthSelectionWidgetData {
  /** assetsTotal − debtsTotal. */
  total: number
  assetsTotal: number
  /** Som van de geselecteerde schulden, als positief getal. */
  debtsTotal: number
  count: { assets: number; debts: number }
  /**
   * 12 maandpunten oud→nieuw (som van de gewogen LOCF-reeksen uit
   * balance_snapshots). Leeg array wanneer er minder dan 2 maanden met echte
   * snapshot-data zijn — de widget toont dan "nog geen verloop", nooit een
   * verzonnen lijn.
   */
  history: { month: string; value: number }[]
  /** Max 4 grootste posten voor het full-formaat; schuld-values positief. */
  topItems: { name: string; value: number; kind: 'asset' | 'debt' }[]
}
import type { PortfolioReturnSummary } from '@/lib/asset-return'

export interface TopAction {
  id: string
  title: string
  freedom_days_impact: number | null
  priority_score: number | null
  due_date: string | null
  source: string
}

export interface CompletedAction {
  id: string
  title: string
  freedomDaysImpact: number | null
  completedAt: string
}

export interface RejectedAction {
  id: string
  title: string
}

export interface TopGoal {
  id: string
  name: string
  goal_type: string
  current_value: number
  target_value: number
  target_date: string | null
  color: string
  icon: string
  custom_unit?: string | null
  /**
   * Door een canonieke motor GEPROJECTEERDE datum ("aug 2039"), die de uit
   * `target_date` afgeleide datum vervangt (bevinding C10). Vandaag alleen gezet
   * voor het vrijheidsgetal-doel, waar hij uit dezelfde FIRE-countdown komt als
   * `simFireCountdown`. `null`/afwezig ⇒ de widget leidt de datum zoals vanouds
   * uit `target_date` af.
   */
  eta?: string | null
}

export interface TopRecurringTransaction {
  id: string
  name: string
  amount: number
  frequency: string
  /** Canonieke RecurringCategory (bv. 'rent', 'subscription', 'insurance') — niet de budgetnaam. */
  category: string | null
  /** Canonieke split: abonnement (true) vs. overige vaste last (false). Bron: loadVasteLastenSummary. */
  isSubscription: boolean
}

export interface TopRecommendation {
  id: string
  title: string
  freedomDaysImpact: number
  priority: number
  category: string
}

export interface TopLifeEvent {
  id: string
  name: string
  year: number | null
  targetAge: number | null
  impactType: 'positive' | 'negative'
  estimatedImpact: number | null
}

export interface Notification {
  id: string
  type: 'budget' | 'milestone' | 'anomaly' | 'positive' | 'rebalance'
  message: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: string
  actionHref?: string
}



/** Module waar een volgende stap toe hoort — bepaalt het accent in de widget. */
export type NextStepModule = 'kern' | 'wil' | 'horizon'

/**
 * Soort volgende stap:
 *  - `fundament` = eenmalige inrichting (bank koppelen, bezittingen vastleggen…)
 *  - `groei`     = doorlopende waarde ná de inrichting (noodfonds, acties, vrijheid versnellen)
 */
export type NextStepKind = 'fundament' | 'groei'

export interface NextStep {
  key: string
  /** Kort actielabel (~≤ 24 tekens) voor mini/compacte rijen — géén volzin. */
  label: string
  title: string
  description: string
  /** Vrijheidsdagen-impact — alleen gezet als er een canonieke bron voor is. */
  impact: number | null
  /** Gemeten kengetal uit de bundel (bv. "1,8 van 6 maanden gedekt"); null = geen meting. */
  metric: string | null
  module: NextStepModule
  kind: NextStepKind
  href: string
  dismissed: boolean
}

export interface MonthSummary {
  netWorthDelta: number
  freedomDaysWon: number
  savingsRate: number
  budgetScore: number
  prevMonthComparison: number
}

export interface UpcomingEvent {
  id: string
  name: string
  date: string
  amount: number | null
  direction: 'in' | 'out' | 'neutral'
  source: 'recurring' | 'goal' | 'life_event' | 'tax_deadline'
}

export interface EmergencyFund {
  currentAmount: number
  targetAmount: number
  /** Dekking in maanden op de NORM-grondslag (salaris, of uitgaven-terugval). */
  monthsCovered: number
  /** Norm in maanden: 3 op de salaris-grondslag, 6 op de uitgaven-terugval. */
  targetMonths: number
  isComplete: boolean
  /**
   * Dekking in maanden VASTE LASTEN — "hoe lang kun je hiervan rondkomen".
   * Bewust apart van `monthsCovered`: de norm meet tegen het salaris, maar deze
   * zin moet waar blijven. Optioneel zodat test-/mockbundels 'm mogen weglaten.
   */
  runwayMonths?: number
  /**
   * Grondslag van de NORM, uit `resolveEmergencyFund` (lib/emergency-fund.ts):
   * 'salary' = 3 × netto maandsalaris (de norm sinds 29 jul 2026), 'expenses' =
   * terugval op 6 × maanduitgaven wanneer er geen salaris bekend is. In beide
   * gevallen geldt `targetMonths × maandbasis == targetAmount`. Optioneel zodat
   * test-/mockbundels 'm mogen weglaten; ontbreekt hij, dan lezen consumers dat
   * als 'salary'.
   */
  source?: 'salary' | 'expenses'
}

export interface FavoriteHolding {
  id: string
  name: string
  ticker: string | null
  units: number
  currentPrice: number
  totalValue: number
  totalCost: number
  returnPct: number
  dailyChangePct: number
  lastPriceUpdate: string | null
}

export interface HeatmapBudgetGroup {
  id: string
  name: string
  icon: string
  default_limit: number
  children: { id: string; name: string; icon: string; default_limit: number }[]
}

export interface DashboardData {
  // Core financial
  netWorth: number
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  /**
   * Canoniek dagtarief (€/dag) — 12-mnd rolling grondslag via `lib/expense-rate.ts`,
   * gedeeld met balans/budget/vermogen-rapport en de sidebar. Widgets consumeren dit
   * i.p.v. zelf `dailyExpenseRate(monthlyExpenses)` op de losse maand te rekenen, zodat
   * hetzelfde bedrag overal dezelfde vrijheidstijd geeft (KRUIS-20). Optioneel/additief:
   * mock-/empty-bundels zonder dit veld vallen terug op de maand-conversie.
   */
  dailyExpenseRate?: number
  /**
   * Herkomst van `dailyExpenseRate` — `recentDailyExpenseRateFromRows(...).source`.
   * Draagt de wisselkoers-voetnoot (`<VrijheidstijdVoetnoot>`, UR3-08): een
   * profiel- of cohortschatting benoemt zichzelf als schatting in plaats van
   * als gemeten uitgavenpatroon te lezen. Zonder dit veld valt de voetnoot
   * terug op `'transactions'` bij een tarief > 0 — spiegel van
   * `CorePageData.dailyExpenseRateSource` en `FiscaleKansen.dailyExpensesSource`.
   * Optioneel/additief: mock-/empty-bundels missen 'm zonder gevolg.
   */
  dailyExpenseRateSource?: FreedomRateSource
  /**
   * Canoniek 12-mnd rolling MAANDbedrag (€/mnd) — zelfde bron/berekening als
   * `dailyExpenseRate` (recentDailyExpenseRateFromRows), alleen in maand-eenheid.
   * De briefing-hero op /overzicht rekent op maandbasis en consumeert dit i.p.v.
   * de losse huidige-kalendermaand-som `monthlyExpenses` (die vroeg in de maand
   * naar ~0 kon uitschieten → onmogelijk hoog vrijheidstotaal), zodat het
   * weektotaal overeenkomt met sidebar/balans (KRUIS-17). Optioneel/additief:
   * mock-/empty-bundels zonder dit veld vallen terug op `monthlyExpenses`.
   */
  recentMonthlyExpenses?: number
  /**
   * WERKELIJK GEREALISEERD inkomen van de HUIDIGE kalendermaand (€) — venster
   * [1e van deze maand, 1e van volgende maand), transfers (`transfer`/
   * `joint_transfer`) uitgesloten. Bron: het canonieke maandaggregaat
   * (`tx_month_aggregate` via `aggIncomeByMonth(..., { realOnly: true })`), niet
   * een eigen rij-loop — een aggregaat kan niet stil op `max_rows` afkappen.
   *
   * Dit is BEWUST iets anders dan het ongemarkeerde `monthlyIncome`: dát veld is
   * en blijft de EFFECTIVE grondslag (`resolveEffectiveIncomeExpenses`), waarbij
   * bij `profiles.income_source = 'manual'` de handmatige profielinschatting
   * wint — precies wat Horizon/FIRE en de spaarquote nodig hebben. Oppervlakken
   * die "wat is er déze maand echt gebeurd" tonen (de Transacties-kaart op
   * /overzicht/budget) consumeren daarom dit veld en NIET `monthlyIncome`.
   * Zuster met hetzelfde venster-in-de-naam-principe: `prevMonthIncome`
   * (zelfde grondslag, vorige maand) en `recentMonthlyExpenses` (12-mnd rolling).
   */
  currentMonthIncome: number
  /**
   * WERKELIJK GEREALISEERDE uitgaven van de HUIDIGE kalendermaand (€, absoluut)
   * — zelfde venster, filter en aggregaat-bron als `currentMonthIncome` (via
   * `aggExpenseByMonthAbs(..., { realOnly: true })`), en dus dezelfde
   * afbakening t.o.v. het effective `monthlyExpenses`: dát blijft de
   * profiel-/override-grondslag voor Horizon/FIRE en de spaarquote, dit is de
   * gerealiseerde maand. Zuster: `prevMonthExpenses` (vorige maand).
   */
  currentMonthExpenses: number
  /**
   * VERSHEID: de jongste kalendermaand ('YYYY-MM') waarin daadwerkelijk iets
   * geboekt is, uit hetzelfde 12-maands maandaggregaat als `currentMonth*` —
   * `null` wanneer het venster leeg is.
   *
   * Bestaat omdat een LEEG VENSTER geen bewijs is van GEEN DATA (UR2-13): een
   * account met 407 transacties waarvan de jongste vijf maanden oud is, gaf
   * `currentMonth*` én `prevMonth*` op 0 en kreeg daarom "Importeer transacties"
   * te zien. Oppervlakken die een lege staat of een versheidsmelding tonen,
   * toetsen op DIT veld (via `transactionFreshness` in
   * lib/transaction-staleness.ts) — nooit op een nul-som, en nooit op een eigen
   * tel-lus over transacties.
   *
   * Optioneel/additief, spiegel van `dailyExpenseRate`: mock-/empty-bundels
   * zonder dit veld gelden als "geen historie bekend" en houden hun bestaande
   * lege staat.
   */
  latestTransactionMonth?: string | null
  monthlyContributions: number
  yearlyMustExpenses: number
  budgetTotals: {
    income:  { limit: number; spent: number }
    expense: { limit: number; spent: number }
    savings: { limit: number; spent: number }
    debt:    { limit: number; spent: number }
  }
  // Freedom
  freedomPct: number
  // FIRE-eligible vermogen (huis gefilterd via housing-strategie) — canonieke
  // teller van data.freedomPct; mijlpaal-widgets leggen hun datumlogica hierop
  // zodat "bereikt" en de voortgang dezelfde grondslag delen (ADR 0009).
  fireEligibleNetWorth: number
  // Dubbele grondslag (incl./excl. eigen woning) — bundel-contract, gevuld door de loader
  // (lib/housing-strategy.ts#netWorthExcludingHome / #shouldShowDualHousingBasis).
  // netWorthExclHome = netWorth − overwaarde (ZUIVER, ook bij reverse_mortgage); een APARTE
  // weergave-grondslag, NIET fireEligibleNetWorth en NIET het volledige netWorth — nooit op
  // dezelfde Y-as mengen. showDualHousingBasis = toon de splitsing alléén bij eigen woning +
  // strategie ≠ include_full. Optioneel/additief: mock-/empty-bundels zonder deze velden blijven geldig.
  netWorthExclHome?: number
  showDualHousingBasis?: boolean
  fireTarget: number
  fireProjResult: FireProjection
  // Canonieke gezondheidsscore mét trend (ADR 0008). Bevat de echte
  // tax_optimization-pijler; de gezondheids-widget consumeert dit i.p.v. zelf
  // computeHealthScore(DashboardData) te draaien (waar tax hardcoded 50 is).
  healthScore: HealthScore
  // Actions
  openActions: number
  totalFreedomDaysOpen: number
  completedActionsThisMonth: number
  topOpenActions: TopAction[]
  recentCompletedActions: CompletedAction[]
  recentRejectedActions: RejectedAction[]
  // Sovereignty
  sovereigntyLevel: number
  currentPhaseId: string
  monthsCovered: number
  // Runway op de soevereiniteits-grondslag (liquide pot ÷ 3-maands tx-gemiddelde) —
  // dezelfde noemer als computeSovereigntyLevel. De Jouw Pad-criteria consumeren dit.
  sovereigntyMonthsCovered: number
  hasConsumerDebt: boolean
  // Extra fetches
  recommendations: number
  goals: number
  topGoals: TopGoal[]
  recurringTransactions: number
  lifeEvents: number
  // Fractionele FIRE-leeftijd uit simulatie-engine (uit snapshot, null als nog niet berekend)
  fireAgeFractional: number | null
  // Historical net worth (up to 12 monthly snapshots, ascending)
  netWorthHistory: { month: string; value: number }[]
  // Historical savings rate % per month (up to 12 monthly snapshots, ascending)
  savingsHistory: { month: string; value: number }[]
  // Historical monthly expenses (up to 12 monthly snapshots, ascending)
  expenseHistory: { month: string; value: number }[]
  // Historical monthly amounts per budget type (up to 12 months, ascending)
  budgetTypeHistory: {
    income:  { month: string; value: number }[]
    expense: { month: string; value: number }[]
    savings: { month: string; value: number }[]
    debt:    { month: string; value: number }[]
  }
  // Asset breakdown per type. `expectedReturn` is een 0..1-FRACTIE (0,07 = 7%),
  // genormaliseerd in computeAssetsByType uit de percent-schaal van
  // assets.expected_return — consumenten doen zelf ×100 voor weergave (kaart H1).
  assetsByType: { type: string; value: number; purchaseValue: number; expectedReturn: number }[]
  /**
   * Gerealiseerd rendement uit de CANONIEKE motor (lib/asset-return.ts) —
   * dezelfde die de kop-KPI op /overzicht/bezittingen voedt, hier samengevat
   * tot totalen + een rollup per type (`summarizePortfolioReturn`). Consumeer
   * dit veld voor élk "sinds aankoop"-percentage op het dashboard; nooit een
   * eigen `waarde − aankoopwaarde` over assetsByType (dat mengt pensioen en
   * banksaldi zonder kostprijsbegrip in de teller — kaart H7).
   *
   * Bewust zonder per-bezit rijen: die dragen namen en hoeven niet mee in de
   * RSC-payload van een scherm dat ze niet toont.
   *
   * WEGING: inclusion-gewogen (`net_worth_inclusion_pct`), zoals de rest van
   * deze bundel. Waarde én kostprijs dragen dezelfde factor, dus `pct` blijft
   * onvertekend. Op /overzicht/bezittingen weegt dezelfde motor met het
   * huishoud-aandeel omdat hij daar op het bruto bezittingentotaal sluit —
   * identieke grondslag, weging per oppervlak.
   *
   * Vervangt het verwijderde `totalPurchaseValue` (Σ purchase_value over ÁLLE
   * types), dat als "Ongerealiseerde winst" een banksaldo zonder aankoopwaarde
   * volledig als winst liet meetellen.
   */
  assetReturn: PortfolioReturnSummary
  // Horizon: scenario range (optimistic/expected/pessimistic FIRE ages)
  fireRange: FireRange | null
  // Vrijheidsmijlpalen (25/50/75/100%) uit de canonieke motor
  // (lib/freedom-milestones.ts via de scalar-router), één keer berekend in de
  // loader op FIRE-eligible grondslag (ADR 0009). Widgets consumeren dit voor
  // mijlpaal-datums — géén eigen datum-sommen (consume-don't-recompute).
  // Per-user projectie: in huishouden/partner-perspectief onderdrukken.
  freedomMilestones: FreedomMilestoneResult | null
  // Horizon: simplified sim rows for vermogenspad chart (age + portfolio + phase).
  // Reeds weergave-geclipt t/m eindleeftijd − 1 (clipRowsToPlanEnd), spiegel van /horizon.
  //
  // GRONDSLAG (ADR 0090): alle bedragen zijn NOMINAAL — in de euro's van het
  // projectiejaar zelf. `inflationFactor` is de canonieke weergave-deflator van
  // diezelfde kernelrij (jaar 0 = exact 1.0); de loader joint hem op leeftijd uit
  // `HorizonFireSim.unifiedRows`. Wil een oppervlak "huidige euro's" tonen, dan
  // deelt het `endPortfolio` hierdoor via `lib/euro-display.ts` — in een
  // render-memo, nooit terug de bundel in (nominaal = ongesuffixt in de datalaag,
  // gedeflateerd draagt een `view`-prefix en leeft alleen in de render).
  // Optioneel/additief: hand-gebouwde mock-/fixture-bundels zonder dit veld blijven
  // geldig; ontbreekt hij, dan geldt de bestaande `factorAtAge`-conventie
  // "geen factor → 1" (= nominaal tonen), nooit een verzonnen getal.
  //
  // TIJDSTIP-CONVENTIE (verplicht voor consumenten): een rij met `age: N` beschrijft
  // het leeftijdsJAAR N. `startPortfolio` is de stand ÓP N; `endPortfolio` die aan het
  // EIND van dat jaar — dus op leeftijd N + 1. Een reeks "vermogen op leeftijd X" leest
  // daarom `startPortfolio`, en een grafiek plot `endPortfolio` op `age + 1` (canoniek:
  // `lib/horizon/sim-chart-geometry.ts#simRowsToChartPoints`). `inflationFactor` is
  // (1 + inflatie)^k met k = N − startleeftijd, en hoort bij de RIJ: de app deflateert
  // `endPortfolio` app-breed met f(N), ook al staat die waarde op de as bij N + 1 —
  // wijk daar niet van af, anders zakt je reeks ~π onder de hoofdlijn.
  // `startPortfolio` is optioneel omdat hand-gebouwde mock-/fixture-bundels hem niet
  // dragen; de loader vult hem altijd.
  simRows: { age: number; endPortfolio: number; startPortfolio?: number; phase: string; flowIn: number; flowOut: number; oneTimeNet: number; inflationFactor?: number }[] | null
  // Horizon: kernel-eindleeftijd (SimResult.displayEndAge) — de leeftijd die /horizon als
  // aslabel toont (deplete/legacy = fire_end_age, perpetual/pensioen = horizon-cap 100).
  // Widgets tonen dit i.p.v. een hardcoded '90j'. null als de sim niet kon draaien of bij
  // oudere/mock-bundels (widgets vallen dan terug op de laatste simRow-leeftijd).
  displayEndAge: number | null
  // Horizon: geprojecteerd VOLLEDIG netto vermogen per jaar (FIRE-pot + meegroeiende
  // niet-liquide assets die uit de FIRE-pot zijn gefilterd). Náást simRows/endPortfolio,
  // zodat de /overzicht-vermogensgrafiek de projectielijn continu houdt met het
  // Vandaag-punt (= volledig netto vermogen incl. huis). null als de sim niet kon draaien.
  //
  // GRONDSLAG (ADR 0090): `netWorth` is NOMINAAL en al her-ankerd op het Vandaag-punt
  // (de reconcile-offset in `buildSimNetWorthRows`, in nominale ruimte). `inflationFactor`
  // is de weergave-deflator van diezelfde kernelrij; deel er pas ná de her-ankering mee,
  // dan blijft de naad historie↔projectie knikvrij (jaar 0 draagt factor 1.0).
  // Optioneel/additief om dezelfde reden als bij `simRows` hierboven.
  simNetWorthRows: { age: number; netWorth: number; inflationFactor?: number }[] | null
  // Horizon: requiredFirePortfolio uit runSimulation (null als geen birth_date)
  simRequiredPortfolio: number | null
  // Horizon: FIRE-doel INCL. eigen woning (Prognose!I@FIRE) — spiegelt simRequiredPortfolio
  // (liquide). Puur uit de sim (requiredFireNetWorth via kernel-bridge); null als geen sim.
  // Optioneel/additief: mock-/empty-bundels zonder dit veld blijven geldig.
  simRequiredNetWorth?: number | null
  // Horizon: backtesting success rate + named crash paths
  backtestSuccessRate: number | null
  backtestNamedPaths: { label: string; success: boolean }[] | null
  // Box 3: pre-computed tax from full calculateBox3() (null if no assets)
  box3Tax: number | null
  // Box 3: canonieke dual-forfait breakdown uit calculateBox3() zodat de
  // kassabon-widget de tussenrijen consumeert i.p.v. zelf herberekent en
  // rekenkundig sluit op box3Tax. Optioneel/additief: mock-/empty-bundels
  // zonder dit veld blijven geldig (widget valt terug op enkel-forfait-indicatie).
  box3Breakdown?: {
    year: number
    rendementsgrondslag: number // Box 3-bezittingen − aftrekbare schulden
    heffingsvrij: number
    grondslagSparen: number // belastbaar boven de vrijstelling
    effectiefForfait: number // gemengd (spaargeld/beleggingen/schulden) forfait als fractie
    box3Income: number // grondslagSparen × effectiefForfait
    tarief: number
    tax: number // === box3Tax
  } | null
  // Simulatie-afgeleide countdown (null als simulatie niet beschikbaar)
  simFireCountdown: FireCountdown | null
  // FIRE end strategy
  fireEndStrategy: FireEndStrategy
  fireEndAge: number
  /**
   * Het stop-anker van het plan (ADR 0129 D8) — DE sleutel voor "ligt het stopmoment
   * vast" (`isFixedAnchor({ anchor })`). Consumeer dit, niet `fireEndStrategy ===
   * 'pensioen'`: die label is een F2-compat-echo die F4 verwijdert. Optioneel/additief
   * zodat mock-/regressie-bundels zonder het veld geldig blijven (⇒ `solved`).
   */
  fireStopAnchor?: StopAnchor
  // DAIshboard enrichment: previous month income/expenses + net worth delta
  prevMonthIncome: number
  prevMonthExpenses: number
  netWorthDelta: number | null
  // Favorite budgets for dynamic quarter-widgets
  favoriteBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
    limit: number
    spent: number
  }[]
  // Alle (niet-archief) hoofdbudgetten met maandlimiet + besteding — de
  // Budgetten-widget rankt hieruit zelf de top-N (consume-don't-recompute;
  // spent is per parent, kinderen al opgerold in de loader).
  topBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt'
    limit: number
    spent: number
  }[]
  // Favorite holdings for dynamic mini-widgets
  favoriteHoldings: FavoriteHolding[]
  /**
   * Grenzenpotten voor de dynamische `spend_limit:<id>`-widgets — de COMPACTE
   * projectie (`toSpendLimitWidgetData`), niet het volle `SpendLimitReport`: dat
   * draagt tot 13 periode-uitkomsten per pot en zou bij élke /overzicht-load in
   * de RSC-payload belanden.
   *
   * Bevat álle niet-gearchiveerde potten (actief én gepauzeerd, herkenbaar aan
   * `isActive`): injectie van een nieuwe widget-pref gebeurt alleen voor actieve
   * potten, maar de stale-opruiming mag een pref niet wissen omdat de gebruiker
   * de pot even pauzeerde (FR-B2-03/04).
   *
   * Optioneel/additief — spiegelt `dailyExpenseRate`/`recentMonthlyExpenses`:
   * mock-/empty-bundels zonder dit veld gedragen zich als "geen potten".
   */
  spendLimitWidgets?: SpendLimitWidgetData[]
  /**
   * Vermogens-widget met eigen selectie (ADR 0120). Alleen gevuld wanneer de
   * widget `vermogen_selectie` enabled is ÉN er een selectie is opgeslagen
   * (`feature_preferences.wealth_widget_selection`); anders undefined/null —
   * de widget toont dan zijn empty state. Waarden gewogen met
   * `net_worth_inclusion_pct` (identiek aan de balance_snapshots-historie);
   * schulden verlagen `total`. Optioneel/additief zoals `spendLimitWidgets`.
   */
  wealthSelectionWidget?: WealthSelectionWidgetData | null
  // All budgets (parents + children, non-archive) for auto-dashboard wizard
  allBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt'
    isFavorite: boolean
    parentId: string | null
  }[]
  // New widget data fields
  notifications: Notification[]
  nextSteps: NextStep[]
  monthSummary: MonthSummary
  upcomingEvents: UpcomingEvent[]
  emergencyFund: EmergencyFund
  // Enriched widget data: top recurring transactions (vaste lasten)
  topRecurringTransactions: TopRecurringTransaction[]
  totalRecurringAmount: number
  // Enriched widget data: top recommendations
  topRecommendations: TopRecommendation[]
  // Enriched widget data: top life events
  topLifeEvents: TopLifeEvent[]
  // ── Spaarquote: één getoond getal, één gemeten getal (31 aug 2026) ────────
  // De RAUWE 6-maands transactiequote (%) — de MÉTING. Blijft in de bundel omdat
  // het instellingenblok 'm expliciet als transactiequote naast de grondslagkeuze
  // toont, en omdat de parity-suite hem tegen de slanke forecast-laag vergrendelt.
  // Toon 'm NERGENS als "de spaarquote" — dat is `effectiveSavingsRatePct`.
  savingsRate6m: number
  // DE spaarquote, app-breed: grondslag-geresolveerd via
  // `resolveSavingsSource(...).effectiveSavingsRatePct` (ADR 0103) — de
  // gebruikerskeuze budget/handmatig/transactie wint van de meting. Dit is het
  // percentage dat het instellingenblok, de hefboomkaart op /overzicht, de
  // gezondheidsscore, de FIRE-prognose, de forecast-kaart, de spaarquote-widget
  // en het spaarquote-doel tonen. Gelijk aan `savingsRate6m` zolang inkomen én
  // uitgaven op de transactiegrondslag staan.
  effectiveSavingsRatePct: number
  // Het maandelijkse spaarbedrag (€) op DIE grondslag: `baseAnnualSavings / 12`,
  // dus exact de €-stroom waarmee de FIRE-prognose rekent. Zo geldt altijd
  // bedrag / inkomen == effectiveSavingsRatePct en spreken het percentage en het
  // bedrag op één kaart elkaar niet tegen (consume, don't recompute).
  effectiveMonthlySavings: number
  // Waar de spaarquote op rust (ADR 0103: elke kaart benoemt zijn grondslag).
  // Label via `savingsRateBasisLabel(...)`, "is dit de meting?" via
  // `savingsRateFollowsTransactions(...)` — beide in lib/budget-basis.ts.
  savingsRateIncomeBasis: ResolvedBasis
  savingsRateExpensesBasis: ResolvedBasis
  // De 6m-MÉTING is een schatting (profiel/net-worth-delta-fallback i.p.v.
  // transacties). Zegt alleen iets over het getoonde getal wanneer
  // `savingsRateFollowsTransactions(...)` waar is — bij een budget-/handmatige
  // grondslag komt de quote uit een keuze van de gebruiker, niet uit een schatting.
  savingsRateIsEstimate: boolean
  // Savings-budget amounts (for spaarquote correction)
  monthlySavingsBudgetSpent: number
  savingsBudgetSpent6m: number
  prevMonthSavingsBudgetSpent: number
  // Whether user actively chose to budget during onboarding
  budgetingActive: boolean
  // Household perspective overrides (null if no household).
  // FIRE-velden komen uit de gepersisteerde gecombineerde samenvatting
  // (households.combined_fire_summary) zodat ze EXACT matchen met /toekomst.
  householdOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
    // Huishoud-spaarquote (%) + het bijbehorende €-maandspaarbedrag. Sinds 31
    // aug 2026 is dit exact het EFFECTIEVE paar van de gebruiker zelf
    // (`effectiveSavingsRatePct` / `effectiveMonthlySavings`): `monthlyIncome`
    // en `monthlyExpenses` hierboven ZIJN de eigen effectieve bedragen — de RPC
    // levert van de partner alleen bezittingen/schulden — dus een eigen formule
    // hier zou dezelfde grootheid op een tweede grondslag zetten. De vorige
    // variant deed dat ook echt: die legde de spaarbudget-/aflossingscorrectie
    // (die alleen bij een RÚWE transactiesom hoort) over effectieve bedragen
    // heen, precies de dubbeltelling die resolveSavingsSource vermijdt.
    savingsRate: number
    monthlySavings: number
    freedomPct?: number
    fireTarget?: number
    fireAge?: number | null
    fireAgeFractional?: number | null
    countdownDays?: number
    monthlyPassiveIncome?: number
  } | null
  // Partner perspective overrides (null if no household).
  // FIRE-velden uit de fire_summary van de partner (profiles, via RPC).
  partnerOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
    // Canonieke partner-spaarquote (%) via savingsRateFromAggregates + het
    // bijbehorende €-maandspaarbedrag (bedrag / inkomen == savingsRate).
    savingsRate: number
    monthlySavings: number
    freedomPct?: number
    fireTarget?: number
    fireAge?: number | null
    fireAgeFractional?: number | null
    countdownDays?: number
    monthlyPassiveIncome?: number
  } | null
  // Household activity feed — recent shared transactions from both partners
  householdActivity: HouseholdActivityItem[]
  // Partner privacy: categories the partner has hidden (Feature #537)
  partnerHiddenCategories: string[]
  // Fin: decision patterns — freedom days per recommendation type
  decisionPatterns: { type: string; days: number; count: number }[]
  // Fin: 12-month freedom days trend (monthly aggregation of completed actions)
  freedomDaysMonthly: { month: string; days: number }[]
  // Wilskracht widget data
  totalFreedomDaysWon: number
  totalCompletedActions: number
  totalActions: number
  weeklyFreedomDaysWon: number
  completionRatio: number
  willpowerScore: string  // 'A' | 'B' | 'C' | 'D' | 'E'
  // FIRE parameters from user profile
  inflationRate: number   // e.g. 0.02
  grossReturn: number     // e.g. 0.07
  // Current age of user (null if no date_of_birth)
  currentAge: number | null
  // Pensioen / AOW-widget bron. aowAge = cohort-correcte AOW-leeftijd (hele jaren)
  // uit de aow_leeftijd-tabel via lookupAowAge — NIET de hardcoded 67-fallback.
  // null bij ontbrekende geboortedatum (widget toont empty-state).
  aowAge?: number | null
  // Verwacht aanvullend pensioen (2e pijler) — piek-bruto maandbedrag, verbatim
  // uit de canonieke buildPensionProjection-motor (brutoNominaal = mijnpensioen
  // 'TeBereiken'). null als er geen pensioen-events zijn geïmporteerd.
  pensionMonthlyGross?: number | null
  // Weekoverzicht widget data
  weekOverview: WeekOverviewData
  // Fee analyzer widget data
  feeAnalysis: FeeAnalysis | null
  feeImpactMonths: number
  // Hypotheek vs Beleggen summary (null if no mortgage)
  hvbSummary: HvbSummary | null
  // Heatmap widget data: expense budget groups with children + per-budget spending
  heatmapExpenseGroups: HeatmapBudgetGroup[]
  heatmapSpending: Record<string, number>
  heatmapBeschikbaarMap: Record<string, number>
  /** Vorige-maand spending per budget — voedt de trend-pijl in de heatmap-tooltip */
  heatmapPreviousSpending: Record<string, number>
  /**
   * Laatste nieuws-editie (server-veld, device-onafhankelijk) voor de
   * Nieuws-widget (id `berichten`). Null als er geen (verse) editie is.
   */
  newsPreview: NewsPreview | null
}

/** Compact mortgage-vs-invest summary for briefing context */
export interface HvbSummary {
  /** Restschuld (€) */
  restschuld: number
  /** Jaarlijkse hypotheekrente (%) bijv. 3.5 */
  rente: number
  /** Breakeven bruto rendement (decimaal) bijv. 0.032 */
  breakevenRendement: number
  /** Aanbeveling */
  aanbeveling: 'aflossen' | 'beleggen' | 'gelijk'
  /** Is de rente fiscaal aftrekbaar */
  isTaxDeductible: boolean
  /**
   * Engine-outputs (consume-don't-recompute): het netto voordeel van beleggen
   * resp. aflossen over de horizon, en het verschil (beleggen − aflossen; positief
   * = beleggen wint). Alle drie komen rechtstreeks uit `compareMortgageVsInvest`.
   */
  beleggenVoordeel: number
  aflossenVoordeel: number
  verschil: number
  /** Premisse die de engine voedt: maandelijks extra bedrag (€) en horizon (jaren). */
  extraBedragMaand: number
  horizonJaren: number
  /**
   * FIRE-impact in maanden (positief = beleggen brengt je eerder vrij). Null als de
   * loader geen FIRE-params kon meegeven (bijv. geen geboortedatum). Vrijheidstijd.
   */
  fireImpactMaanden: number | null
}

export interface WeekOverviewData {
  weekExpenses: number
  weekIncome: number
  dailyExpenses: { day: string; label: string; amount: number }[]
  weekBudget: number
  prevWeekExpenses: number
  topCategories: { name: string; amount: number; prevAmount: number }[]
}

export interface HouseholdActivityItem {
  id: string
  description: string
  amount: number
  date: string
  category: string | null
  partnerName: string
  isCurrentUser: boolean
  ownership: string
}
