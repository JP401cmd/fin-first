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
}

/** Eén schuld uit stap ⑥. `interestRatePct` voedt de duurste-schuld-tip; `monthlyPayment` de DSTI-pijler. */
export interface CheckIntakeDebt {
  debtType: string
  name: string
  balance: number
  interestRatePct: number
  monthlyPayment: number
}

/** De genormaliseerde intake — alle 8 wizard-stappen. */
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
  }
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

/** Eén pijler van het gezondheidsgetal. `score=null` + status='grey' voor Budget (niet gemeten in funnel). */
export interface ReportHealthPillar {
  id: 'rondkomen' | 'buffer' | 'schuld' | 'budget'
  name: string
  score: number | null
  status: StatusColor
  note: string
}

/**
 * Sectie 2 — gezondheidsgetal. Bron: `buildHealthScoreInput` → `computeHealthScoreFromInputs`
 * (lib/health-score-input.ts + lib/financial-health.ts). 4 pijlers; Budget altijd inactief.
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
 * Sectie 3 — De kruising. V_op (opgebouwd) × V_nodig (benodigd) → snijpunt.
 * Bron: `runHorizonLedger` (lib/horizon-engine/engine.ts): rows[].liquideVermogen + vNodig[].
 */
export interface ReportKruising {
  vOp: ReportProjectionPoint[]
  vNodig: ReportProjectionPoint[]
  crossing: { age: number; value: number } | null
  fireReachable: boolean
  startYear: number
  endYear: number
  realReturnPct: number
  savingsRatePct: number
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
 * Sectie 5 — levenslang vermogenspad (tot endAge) + mijlpalen.
 * Bron: `runHorizonLedger` decumulatie (rows[].nettoVermogen). Let op de grondslag:
 * dit is NETTO vermogen (incl. huis), niet het FIRE-eligible/liquide vermogen — niet mengen.
 */
export interface ReportLifePath {
  points: ReportProjectionPoint[]
  markers: ReportLifeEvent[]
  fireAge: number | null
  endAge: number
  peakNote?: string
}

/** Eén zet van Will. `kind` bepaalt de pill-stijl (groene dagen of paarse FIRE-maanden). */
export interface ReportWillMove {
  title: string
  body: string
  gainLabel: string
  gainDays?: number
  kind: 'freedom-days' | 'fire-months'
}

/** Sectie 6 — Will. `intro` via AI-framing (guardrails); `moves` deterministisch uit de metrics. */
export interface ReportWill {
  intro: string
  moves: ReportWillMove[]
}

/** CTA-sectie. `signupHref` draagt het token: `/signup?check=<token>`. */
export interface ReportCta {
  perks: { title: string; body: string }[]
  signupHref: string
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
  disclaimers: { wft: string; avg: string }
}
