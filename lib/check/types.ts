/**
 * Gedeeld typecontract voor de publieke Vrijheidscheck-funnel (`/check`).
 *
 * Dit bestand is de NAAD tussen alle bouwstromen: de intake-wizard (W4) produceert
 * een `CheckIntake`, de rapportmotor (`lib/check/build-report.ts`, W2) zet die om naar
 * een `CheckReportData`, en de rapport-render (W5) consumeert uitsluitend `CheckReportData`.
 *
 * REGELS:
 * - `CheckReportData` is een PRESENTATIE-DTO (getallen + labels + grafiekreeksen), losgekoppeld
 *   van de engine-interne types. `build-report.ts` mapt de canonieke engine-output hiernaartoe.
 *   Zo herberekent de render niets (consume, don't recompute) en blijft het JSON-serialiseerbaar
 *   (= `report_snapshot` in `lead_intakes`).
 * - Elk EUR-bedrag dat het ontwerp óók als vrijheidstijd toont, draagt hier een `FreedomTime`
 *   of een vooraf opgemaakt label mee — de render formatteert geen geld→tijd zelf.
 * - SSoT per getal staat als JSDoc bij de velden (welke bestaande functie de bron is).
 *
 * Dit contract is voor wave-1 van de bouw VAST: consumeren, niet bewerken. Heeft een specialist
 * een wijziging nodig, dan meldt die dat in het rapport en past de orchestrator het hier aan.
 */

// ──────────────────────────────────────────────────────────────────────────
// Intake (output van de wizard, input van build-report)
// ──────────────────────────────────────────────────────────────────────────

/** Huishoudsamenstelling — voedt benchmark-cohort + heffingsvrij vermogen. */
export type HouseholdComposition = 'alleen' | 'samen' | 'gezin'

export type RiskProfile = 'defensief' | 'neutraal' | 'offensief'

/**
 * Eén bezitting uit stap ⑤ (QuickAddWizard collect-mode → `QuickAddInput`).
 * `assetType` volgt de bestaande asset_type-enum (o.a. 'investment','retirement','cash',
 * 'eigen_huis','crypto','real_estate'). `extra` = bank/ticker (optioneel).
 */
export interface CheckIntakeAsset {
  assetType: string
  name: string
  value: number
  extra?: string | null
  /**
   * Stap ⑤ — optioneel verwacht jaarrendement in % voor dit specifieke bezit (alleen groei-assets).
   * Overschrijft de globale `grossReturn` voor dit bezit; leeg = globaal rendement (pensioenstap).
   */
  expectedReturnPct?: number | null
}

/**
 * Eén levensgebeurtenis uit stap ⑦b (lichte intake-subset; build-report mapt naar het
 * volwaardige `LifeEvent`-model + `lifeEventsToCashflows`). `amount` < 0 = uitgave/kost,
 * > 0 = meevaller/bijdrage. Optioneel terugkerend via `recurringYearly` × `durationYears`.
 */
export interface CheckIntakeLifeEvent {
  /** Catalogus-sleutel, bv. 'huwelijk' | 'sabbatical' | 'kind' | 'erfenis' | 'woningverkoop' | 'grote_aankoop'. */
  key: string
  /** Weergave-label. */
  label: string
  /** Leeftijd waarop de gebeurtenis plaatsvindt. */
  age: number
  /** Eenmalig bedrag (positief = meevaller, negatief = kost). */
  amount?: number | null
  /** Terugkerend bedrag per jaar (positief = inkomen, negatief = extra uitgave). */
  recurringYearly?: number | null
  /** Duur in jaren voor `recurringYearly`. */
  durationYears?: number | null
}

/** Eén schuld uit stap ⑥. `interestRatePct` voedt de duurste-schuld-tip; `monthlyPayment` de DSTI-pijler. */
export interface CheckIntakeDebt {
  debtType: string
  name: string
  balance: number
  interestRatePct: number
  monthlyPayment: number
}

/** De genormaliseerde intake — alle wizard-stappen. */
export interface CheckIntake {
  /** Stap ① — optionele voornaam (gevraagd bij de e-mailpoort of stap 1) voor de masthead-aanhef. */
  firstName?: string | null
  /** Stap ① — ISO-datum. Voedt leeftijd, AOW-leeftijd, benchmark-cohort. */
  dateOfBirth: string
  /** Stap ① */
  household: HouseholdComposition
  /** Stap ② — netto maandinkomen. */
  monthlyIncomeNet: number
  /** Stap ② — optioneel bruto jaarinkomen. */
  yearlyIncomeGross?: number | null
  /** Stap ③ — uitgaven in hoofdcategorieën + totaal per maand. */
  expenses: {
    wonen: number
    vasteLasten: number
    vrijBesteedbaar: number
    totaalMaand: number
  }
  /** Stap ④ — noodfonds/buffer-saldo (apart, voedt buffer-pijler + maanden dekking). */
  emergencyFund: number
  /** Stap ⑤ */
  assets: CheckIntakeAsset[]
  /** Stap ⑥ */
  debts: CheckIntakeDebt[]
  /** Stap ⑦ — pensioen/AOW + rendement/risico (voeden sectie 4 & 5). */
  pension: {
    aowExpectedMonthly?: number | null
    expectedReturnPct?: number | null
    riskProfile?: RiskProfile | null
    /** Stap ⑦ — optioneel geschatte uitgaven na pensioen (per maand). Leeg = huidige uitgaven 1:1 (geen wijziging). */
    retirementMonthlyExpenses?: number | null
  }
  /** Stap ⑦b — optionele levensgebeurtenissen (huwelijk, sabbatical, kind, erfenis, woningverkoop, grote aankoop). */
  lifeEvents?: CheckIntakeLifeEvent[]
  /** Stap ⑧ — grootste doel (vrij tekstveld, optioneel). */
  goal?: { label: string } | null
}

/** Payload van `POST /api/check/submit` (intake + e-mailpoort + anti-misbruik). */
export interface CheckSubmitPayload {
  intake: CheckIntake
  email: string
  /** ISO-timestamp van het AVG-consent-vinkje. */
  consentAt: string
  /** Cloudflare Turnstile-token (server-side geverifieerd). */
  turnstileToken: string
}

// ──────────────────────────────────────────────────────────────────────────
// Rapport-DTO (output van build-report, input van de render-componenten)
// ──────────────────────────────────────────────────────────────────────────

/** Vrijheidstijd-breakdown, canoniek uit `calculateFreedomTime` (lib/format.ts). */
export interface FreedomTime {
  years: number
  months: number
  totalDays?: number
  isInfinite?: boolean
  isDeficit?: boolean
}

/** Stoplicht-status voor pijlers/tags. */
export type StatusColor = 'green' | 'amber' | 'red' | 'grey'

/** Masthead / byline. `displayName` = firstName of een neutrale aanhef. */
export interface ReportMasthead {
  displayName: string
  age: number
  /** Voorbeeld: '17 juni 2026'. */
  dateLabel: string
}

/**
 * Hero-levensgrid (90 vakjes). Render kleurt: lived (< age), funded (age..age+fundedYears),
 * grind (..fireAge), free (..endAge). De drie punch-getallen onderaan.
 * Bron: `computeFireProjection` (fireAge) + `calculateFreedomTime` (al-vrijgekochte jaren).
 */
export interface ReportLifeGrid {
  endAge: number
  age: number
  /** "Al vrijgekochte" jaren (decimaal, bv. 3.1) = freedomTime van het FIRE-eligible vermogen. */
  alreadyFundedYears: number
  /** Jaren werk tussen nu en FIRE (fireAge − age). Null als FIRE onhaalbaar. */
  grindYears: number | null
  /** Jaren vrijheid na FIRE (endAge − fireAge). Null als FIRE onhaalbaar. */
  freeYears: number | null
  fireAge: number | null
  fireReachable: boolean
}

/** Eén "potje" in de dual-bars (€ + maanden vrijheid). `countsForFire=false` voor de eigen woning. */
export interface ReportDualBar {
  name: string
  /** Logische bron voor de modulekleur in de render ('beleggingen'|'pensioen'|'cash'|'huis'|…). */
  bucket: string
  eur: number
  pctOfTotal: number
  /** Voorgemaakt label: 'X,Y mnd' of 'telt niet mee'. */
  freedomLabel: string
  countsForFire: boolean
}

/** Snapshot-cellen (sectie 1). Vrijheidstijd via formatWithFreedom/calculateFreedomTime. */
export interface ReportSnapshot {
  netWorth: number
  netWorthFreedom: FreedomTime
  netWorthFreedomLabel: string
  /**
   * Het EURO-bedrag waaróp `netWorthFreedom` is berekend = het FIRE-eligible/
   * vrijheidsvermogen (`getFireEligibleNetWorth`, huis voor 50% meegerekend).
   * Maakt de snapshot intern legible: de render toont het volledige netto vermogen
   * (`netWorth`) als headline én dit lagere vrijheidsvermogen waaruit de
   * vrijheidstijd vloeit, i.p.v. te suggereren dat de tijd op `netWorth ÷ uitgaven`
   * rust. Bij een tekort (negatief FIRE-eligible) is dit ≤ 0 → de tijd is deficit.
   */
  freedomBaseEur: number
  /** `resolveSavingsSource(...).savingsRate` (lib/savings-source.ts). */
  savingsRatePct: number
  savingsMonthly: number
  /** `computeEmergencyFundMonths` (lib/health-score-input.ts). */
  bufferMonths: number
  emergencyFund: number
  netMonthlyIncome: number
  monthlyExpenses: number
  expenseToIncomePct: number
}

/** Rij in de maandbalans-tabel. `kind='total'` voor de overschot/sparen-rij. */
export interface ReportMonthBalanceRow {
  label: string
  perMonth: number
  perYear: number
  /** Voorgemaakt '6,1 mnd', of null voor de inkomstenbron/'—'. */
  freedomPerYearLabel: string | null
  kind: 'income' | 'expense' | 'free' | 'total'
}

export interface ReportMonthBalance {
  rows: ReportMonthBalanceRow[]
  savingsRatePct: number
}

/**
 * Eén pijler van het gezondheidsgetal — de volledige v2-pijlerset (mirror /overzicht).
 * `id` volgt de canonieke engine-indicator-ids van `computeHealthScoreFromInputs`
 * (lib/financial-health.ts). Alleen de ACTIEVE pijlers worden gemapt — inactieve
 * indicatoren (zoals `budget_discipline` zonder budgetten in de funnel) laat de
 * engine vallen; we tonen géén grijze placeholder meer.
 */
export interface ReportHealthPillar {
  id:
    | 'savings_rate'
    | 'budget_discipline'
    | 'emergency_fund'
    | 'debt_service_ratio'
    | 'debt_ratio'
    | 'fire_progress'
    | 'asset_concentration'
  name: string
  score: number | null
  status: StatusColor
  note: string
}

/**
 * Sectie 2 — gezondheidsgetal. Bron: `buildHealthScoreInput` → `computeHealthScoreFromInputs`
 * (lib/health-score-input.ts + lib/financial-health.ts). Toont de VOLLEDIGE actieve
 * v2-pijlerset (zoals /overzicht): spaarquote, noodfonds, schuldenlast/schuldratio,
 * FIRE-voortgang en vermogensspreiding — geen gestripte 3+grijze-budget-set. De engine
 * laat inactieve indicatoren (geen data) zelf vallen; `budget_discipline` is in de funnel
 * inactief (geen budgetten) en verschijnt dus niet als placeholder.
 */
export interface ReportHealth {
  score: number
  label: string
  copy: string
  pillars: ReportHealthPillar[]
}

/** Eén benchmark-rij (jij vs NL-gemiddelde). `better` bepaalt de kleur. */
export interface ReportBenchmarkRow {
  label: string
  you: number
  youDisplay: string
  average: number
  averageDisplay: string
  better: boolean
}

/**
 * Sectie 2 — benchmark. Bron: `getCohortReference` (lib/benchmark/nl-reference.ts) +
 * dezelfde bron als de in-app benchmark voor buffer/score (om drift te vermijden).
 * `sourceBadge` = 'Geraamd (CBS-basis)' (ADR 0018-addendum).
 */
export interface ReportBenchmark {
  rows: ReportBenchmarkRow[]
  sourceBadge: string
}

export interface ReportProjectionPoint {
  age: number
  value: number
}

/**
 * Eén rendement-scenario voor de bandbreedte rond de opbouwcurve (sectie 3).
 * `returnDeltaPct` is het verschil t.o.v. het basisrendement in procentpunten (bv. −2 / +2).
 * LEGACY: `kruising.scenarios` wordt niet meer berekend/gerenderd; de live rendement-band
 * leeft op `ReportLifePathScenario`. Type blijft voor back-compat van oude snapshots.
 */
export interface ReportKruisingScenario {
  /** Label, bv. '−2% rendement' / '+2% rendement'. */
  label: string
  /** Verschil t.o.v. basisrendement in procentpunten. */
  returnDeltaPct: number
  /** V_op-reeks (opgebouwd vermogen) onder dit scenario. */
  vOp: ReportProjectionPoint[]
  /** Snijpunt met V_nodig onder dit scenario (null = onhaalbaar binnen horizon). */
  crossing: { age: number; value: number } | null
}

/**
 * Sectie 3 — De kruising (V_op = opgebouwd vermogen × FIRE-punt). NB: NIET meer live
 * gerenderd (de `DeKruising`-grafiek is verwijderd); blijft in de DTO voor back-compat
 * van bestaande `report_snapshot`-rijen.
 *
 * KERNEL-MIGRATIE (stap 5A): `vOp` benadert de besteedbare/liquide lijn met de horizon-
 * kernel-`rows[].netWorth` (bovengrens bij een eigen huis). De per-jaar `V_nodig`-lijn is
 * VERVALLEN — de kernel-bridge levert alleen een scalair `requiredFirePortfolio`, geen
 * per-jaar benodigd-vermogen-reeks (die was LedgerRow-only in de verwijderde v2-grootboek-
 * engine). Het `vNodig`-veld is daarom uit deze DTO verwijderd.
 */
export interface ReportKruising {
  vOp: ReportProjectionPoint[]
  crossing: { age: number; value: number } | null
  fireReachable: boolean
  startYear: number
  endYear: number
  realReturnPct: number
  savingsRatePct: number
  /** Optionele rendement-scenario's (−2% / +2%) rond `vOp`. Afwezig = geen band (niet meer berekend). */
  scenarios?: ReportKruisingScenario[]
}

/** Sectie 3 — spaarquote-historie. In de funnel niet beschikbaar → placeholder met doellijn. */
export interface ReportSavingsHistory {
  available: boolean
  targetPct: number
  note: string
  bars?: { month: string; pct: number }[]
}

/** Sectie 4 — twee toekomsten. Bron: computeFireProjection + calculateFreedomTime. */
export interface ReportTwoFutures {
  fireAge: number | null
  fireYear: number | null
  yearsUntilFire: number | null
  /** Vrijheidstijd als je vandaag stopt met opbouwen. */
  stopToday: FreedomTime
  stopTodayLabel: string
  /** Jaren vrijheid als je op koers blijft (endAge − fireAge). */
  stayFreeYears: number | null
}

/** Eén fire-card (sectie 4). Vrije, voorgemaakte waarde + sublabel. */
export interface ReportFireCard {
  key: string
  value: string
  sub: string
}

/** Eén gevoeligheidsrij — engine-her-run met een delta. `better=true` = eerder FIRE (groen). */
export interface ReportSensitivityRow {
  lever: string
  effectLabel: string
  better: boolean
}

/** Eén onttrekkingsstrategie-rij. Bron: applyWithdrawalStrategy via runHorizonLedger-her-run. */
export interface ReportWithdrawalRow {
  strategy: string
  year1: number
  sustainableUntil: string
  risk: StatusColor
  riskLabel: string
}

export type LifeEventType = 'natuurlijk' | 'leven'

/** Eén mijlpaal op het levenspad (sectie 5). `illustrative=true` → gelabeld als illustratief. */
export interface ReportLifeEvent {
  name: string
  type: LifeEventType
  age: number
  year: number
  effect: string
  illustrative: boolean
}

/**
 * Eén rendement-scenario rond de levenslange vermogenslijn (sectie Toekomst).
 * `points` loopt over de HELE levenslijn (opbouw én afbouw), zodat de band beide
 * fasen dekt. Bron: GEEN per-scenario engine-her-run — het basisplan wordt
 * vastgehouden en alleen het rendement gevarieerd: de jaarlijkse kasstroom wordt
 * uit de basis-kernel-run (`rows[].netWorth`) afgeleid en heropgerent op het
 * verschoven rendement (zelfde grondslag als `ReportLifePath.points`, raakt de
 * basislijn exact op t=0).
 */
export interface ReportLifePathScenario {
  /** Label, bv. '−2% rendement' / '+2% rendement'. */
  label: string
  /** Verschil t.o.v. basisrendement in procentpunten. */
  returnDeltaPct: number
  /** Vermogensreeks (netto incl. huis) onder dit scenario, hele levenslijn. */
  points: ReportProjectionPoint[]
}

/**
 * Sectie 5 — levenslang vermogenspad (tot endAge) + mijlpalen.
 * Bron: horizon-kernel-run (`runKernelUnified` → `rows[].netWorth`). Grondslag: NETTO
 * vermogen (incl. huis; op de kernel-scalar-pot groeit het huis mee met het portefeuille-
 * rendement), niet het FIRE-eligible/liquide vermogen — niet mengen. Zie de route-keuze +
 * benaderingen in `lib/check/build-report.ts` (`safeKernelRun`).
 */
export interface ReportLifePath {
  points: ReportProjectionPoint[]
  markers: ReportLifeEvent[]
  fireAge: number | null
  endAge: number
  peakNote?: string
  /** Optionele −2% / +2% rendement-scenario's als band rond `points` (opbouw + afbouw). */
  scenarios?: ReportLifePathScenario[]
}

/** Eén zet van Fin. `kind` bepaalt de pill-stijl (groene dagen of paarse FIRE-maanden). */
export interface ReportWillMove {
  title: string
  body: string
  gainLabel: string
  gainDays?: number
  kind: 'freedom-days' | 'fire-months'
}

/** Sectie 6 — Fin. `intro` via AI-framing (guardrails); `moves` deterministisch uit de metrics. */
export interface ReportWill {
  intro: string
  moves: ReportWillMove[]
}

/** CTA-sectie. `signupHref` draagt het token: `/signup?check=<token>`. */
export interface ReportCta {
  perks: { title: string; body: string }[]
  signupHref: string
}

/**
 * Disclosure over hoe de eigen woning meetelt in de FIRE-/vrijheidsberekening.
 * `null` wanneer de gebruiker geen eigen woning heeft. `weightPct` = het percentage
 * van de netto overwaarde dat als vrijheidsvermogen meetelt (rapport-conventie 50%);
 * `note` is de leek-uitleg (server-side bron, niet in een component hardcoden).
 */
export interface ReportHouseInclusion {
  /** Percentage van de netto overwaarde dat als vrijheidsvermogen meetelt (50). */
  weightPct: number
  /** Leek-uitleg over de 50%-methodiek + dat het in de app fijnregelbaar is. */
  note: string
}

/**
 * Eén nieuwsitem in de publieke rapport-krant. Algemeen financieel nieuws uit de
 * gedeelde `news_articles`-bron (cron-ingest). `impact` is de ALGEMENE potentiële
 * impact van het artikel zelf (ingest-niveau, gedeeld door alle lezers) — GÉÉN
 * gepersonaliseerde impact: die vereist AI + profiel, wat dit publieke, anonieme
 * pad bewust mijdt (er gaat geen intake/profiel in deze sectie). `dateLabel` is
 * server-side voorgemaakt; de render formatteert geen datums zelf.
 */
export interface ReportNewsItem {
  category: 'fiscaal' | 'rente' | 'woningmarkt' | 'beleggingen' | 'pensioen' | 'macro' | null
  headline: string
  summary: string
  sourceName: string
  sourceUrl: string
  dateLabel: string
  /** Algemene "waarom dit telt"-impact uit `news_articles.potential_impact`; `null` als de bron leeg is. */
  impact: string | null
}

/**
 * Sectie — tot 3 actuele nieuwsitems in krant-stijl. Bron: `news_articles` →
 * `selectSourceArticles({ limit: 3 })`. Optioneel/leeg → de sectie verbergt zichzelf
 * (back-compat: oudere `report_snapshot`-rijen hebben dit veld niet).
 */
export interface ReportNews {
  items: ReportNewsItem[]
  /** Voorgemaakt, bv. 'Gebaseerd op de laatste bronnen · bijgewerkt 17 juni 2026'. */
  sourceNote: string
}

/** Het volledige rapport — één veld per ontwerp-sectie. Pure DTO = `report_snapshot`. */
export interface CheckReportData {
  /** ISO-timestamp. */
  generatedAt: string
  masthead: ReportMasthead
  lifeGrid: ReportLifeGrid
  snapshot: ReportSnapshot
  dualBars: ReportDualBar[]
  monthBalance: ReportMonthBalance
  health: ReportHealth
  benchmark: ReportBenchmark
  kruising: ReportKruising
  savingsHistory: ReportSavingsHistory
  twoFutures: ReportTwoFutures
  fireCards: ReportFireCard[]
  sensitivity: ReportSensitivityRow[]
  withdrawalStrategies: ReportWithdrawalRow[]
  lifePath: ReportLifePath
  will: ReportWill
  cta: ReportCta
  /**
   * Disclosure over de eigen-woning-weging (50% van de overwaarde telt mee voor
   * vrijheid). `null` wanneer geen eigen woning. Voedt de render zonder de uitleg
   * in een component te hardcoden.
   */
  houseInclusion: ReportHouseInclusion | null
  /**
   * Optioneel — tot 3 actuele nieuwsitems (krant-sectie). Server-side aangehecht in
   * `/api/check/submit` ná `buildReport` (houdt `buildReport` I/O-vrij). Afwezig op
   * oudere snapshots → de render toont de sectie dan niet.
   */
  news?: ReportNews | null
  disclaimers: { wft: string; avg: string }
}
