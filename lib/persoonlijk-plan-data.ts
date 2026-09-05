/**
 * Persoonlijk plan-rapport — data-types.
 *
 * Server-data shape voor `GET /api/report/persoonlijk-plan`, geconsumeerd
 * door `app/(app)/rapportages/persoonlijk-plan/page.tsx`.
 *
 * Doel: één export-PDF die toont welke aannames en persoonlijke voorkeuren
 * de FIRE/horizon-berekeningen aansturen. Geen toekomstprojectie — alleen
 * de input-zijde, zodat een gebruiker, partner of adviseur kan controleren
 * "klopt dit nog?".
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import type { FireEndStrategy } from './fire-strategy'
import type { WithdrawalStrategyType } from './withdrawal-strategy'

// ── Hero / demografie ────────────────────────────────────────────────

/**
 * Mini-hero stats. Alle leeftijd-velden in jaren; `null` als de bron-velden
 * (geboortedatum, einstrategie) niet ingevuld zijn — de page rendert dan
 * "—" met `var(--ink-4)`.
 */
export interface PersoonlijkPlanHero {
  /** Huidige leeftijd in hele jaren — afgeleid uit `date_of_birth`. */
  currentAge: number | null
  /**
   * AOW-leeftijd uit `aow_leeftijd`-tabel; valt terug op `NL_AOW_AGE` (67)
   * als geen rij matcht (lookupAowAge garandeert non-null).
   */
  aowAgeYears: number
  /** AOW-leeftijd inclusief eventuele maanden (bv. 67 jaar + 3 maanden). */
  aowAgeMonths: number
  /** Of de AOW-leeftijd een wettelijk definitieve waarde is. */
  aowDefinitive: boolean
  /** Geplande eindleeftijd (`profile.fire_end_age`). */
  fireEndAge: number
  /**
   * Levensverwachting — placeholder (gebruikt `fire_end_age` als proxy
   * conform spec open vraag 1, aanbeveling b). Wordt italic gemarkeerd in UI
   * met "uit FIRE-strategie".
   */
  lifeExpectancyProxy: number
}

export interface PersoonlijkPlanDemografie {
  /** Volledige naam — `null` als leeg in profile. */
  fullName: string | null
  /** ISO YYYY-MM-DD — `null` als leeg. */
  dateOfBirth: string | null
  currentAge: number | null
  /** `single` / `partner` / `family` / etc. Raw key uit profile. */
  householdType: string | null
  /** NL-label voor `householdType` (bv. "Alleenstaand"). */
  householdTypeLabel: string
  numberOfChildren: number
  fireEndAge: number
  aowAgeYears: number
  aowAgeMonths: number
}

// ── Inkomen ──────────────────────────────────────────────────────────

/**
 * Inkomen-sectie. Bruto jaarinkomen wordt afgeleid als ruwe schatting uit
 * `net_monthly_income × 12 / 0.65` — UI toont expliciete disclaimer
 * ("ruwe schatting") zodat niemand de cijfers misinterpreteert.
 */
export interface PersoonlijkPlanInkomen {
  netMonthlyIncome: number
  /** Bruto/jaar ≈ netto × 12 / 0.65 — ruwe schatting (open vraag 3 default a). */
  estimatedGrossAnnualIncome: number | null
  /** Marginaal IB-tarief (0–1; jaar-afgeleid) — kan ook afgeleid worden uit netto. */
  marginaalTarief: number
  /** Box 3 methode (`forfaitair` of `werkelijk`). */
  box3Method: 'forfaitair' | 'werkelijk'
}

// ── AOW & pensioen ────────────────────────────────────────────────────

/**
 * Eén AOW- of pensioen-cashflow uit de `life_events`-tabel waar
 * `event_type IN ('aow', 'pension')`. De spec verwees naar `cashflows` —
 * dat is in deze codebase `life_events`.
 */
export interface PersoonlijkPlanCashflow {
  id: string
  name: string
  /** `'aow'` of `'pension'`. */
  type: 'aow' | 'pension'
  /** Startleeftijd; `null` als alleen `target_date` ingevuld is. */
  startAge: number | null
  /** Maandbedrag (`monthly_income_change` op het life-event). */
  monthlyAmount: number
  /** Wordt het bedrag jaarlijks geïndexeerd voor inflatie? */
  isIndexed: boolean
  /**
   * Indien `type === 'pension'`: gekoppelde pensioenpot-asset met huidige
   * waarde + verwacht jaarrendement. `null` als geen koppeling.
   *
   * NB: huidige `life_events`-schema heeft géén `linked_asset_id`-veld; de
   * koppeling wordt opgezocht via een matching `retirement`-asset (naam-
   * vergelijking). Voor MVP houdt de loader dit veld leeg — de
   * type-definitie staat open zodat een latere migratie kan vullen zonder
   * breaking change.
   */
  linkedAsset: {
    name: string
    currentValue: number
    expectedReturnPct: number
  } | null
}

// ── Uitgaven nu vs. na pensioen ──────────────────────────────────────

export interface PersoonlijkPlanUitgaven {
  /** Jaarlijkse must-expenses uit essentiële budgetten (× 12 / interval). */
  yearlyEssentialExpenses: number
  /** Jaarinkomen uit `net_monthly_income × 12`. */
  yearlyNetIncome: number
  /**
   * Verwachte uitgaven na pensioen volgens `computeRetirementExpenses` met
   * de profile-instellingen.
   */
  yearlyRetirementExpenses: number
  /** Methode (`essential_budgets` / `custom_amount` / `current_income`). */
  retirementExpenseMethod: string
  /** Custom-amount in EUR/jr indien methode `custom_amount`. */
  retirementExpenseCustomAmount: number | null
  /** `yearlyRetirementExpenses − yearlyEssentialExpenses` als delta. */
  delta: number
  /**
   * `yearlyRetirementExpenses / yearlyEssentialExpenses × 100` — `null` als
   * de huidige uitgaven 0 zijn (delen door 0).
   */
  pctOfCurrent: number | null
}

// ── FIRE-rekenparameters ──────────────────────────────────────────────

export interface PersoonlijkPlanFireParams {
  /** Bruto rendement (0.07 = 7%). */
  grossReturn: number
  /** Inflatie (0.02 = 2%). */
  inflationRate: number
  /** Effectieve SWR = grossReturn − BOX3_DRAG − inflationRate. */
  effectiveSwr: number
  /** Box 3 methode. */
  box3Method: 'forfaitair' | 'werkelijk'
  /** Box 3 drag (gebruikt in de formule). Statisch BOX3_DRAG. */
  box3Drag: number
}

// ── Eindstrategie ─────────────────────────────────────────────────────

export interface PersoonlijkPlanEindstrategie {
  strategy: FireEndStrategy
  /** `name` uit `STRATEGY_LABELS[strategy]`. */
  strategyName: string
  /** `subtitle` uit `STRATEGY_LABELS[strategy]` — italic toelichting. */
  strategySubtitle: string
  endAge: number
  /** Alleen relevant bij `legacy`-strategie. */
  legacyAmount: number
  /**
   * Het stop-anker van het plan (ADR 0129 F3a): `solved` = de app zoekt het moment;
   * `aow`/`now`/`age` = een vast stopmoment. Het rapport toont onder een vast anker
   * "Gekozen stopmoment" i.p.v. een vrijheidsleeftijd (labels: F3b).
   */
  stopAnchor: 'solved' | 'aow' | 'now' | 'age'
  /** De gekozen stopleeftijd (halve jaren) — alleen bij `stopAnchor: 'age'`, anders `null`. */
  stopAge: number | null
}

// ── Onttrekkingsstrategie ─────────────────────────────────────────────

export interface PersoonlijkPlanOnttrekking {
  type: WithdrawalStrategyType
  /** NL-label voor de type. */
  typeLabel: string
  /** Korte uitleg (italic). */
  typeSubtitle: string
  /** Floor/ceiling/cut/raise — alleen relevant bij `guardrails`. */
  guardrailFloor: number
  guardrailCeiling: number
  guardrailCutStep: number
  guardrailRaiseStep: number
}

// ── Root ──────────────────────────────────────────────────────────────

export interface PersoonlijkPlanData {
  generatedAt: string
  hero: PersoonlijkPlanHero
  demografie: PersoonlijkPlanDemografie
  inkomen: PersoonlijkPlanInkomen
  cashflows: PersoonlijkPlanCashflow[]
  uitgaven: PersoonlijkPlanUitgaven
  fireParams: PersoonlijkPlanFireParams
  eindstrategie: PersoonlijkPlanEindstrategie
  onttrekking: PersoonlijkPlanOnttrekking
}

// ── Label-maps ────────────────────────────────────────────────────────

// NL-labels voor `household_type` staan bij de canonieke bron
// (`HOUSEHOLD_TYPE_LABELS`/`householdTypeLabel` in lib/household-type.ts) i.p.v.
// hier — een losse kopie in de rapportagelaag divergeerde ooit stil van de
// echte DB-waarden en toonde de ruwe string. De assembly consumeert de helper.

/**
 * Labels voor onttrekkingsstrategieën. Spiegelt `WITHDRAWAL_DEFAULTS.strategy`.
 */
export const WITHDRAWAL_LABELS: Record<WithdrawalStrategyType, { name: string; subtitle: string }> = {
  static: {
    name: 'Vaste onttrekking (SWR)',
    subtitle: 'Klassieke 4%-regel — vast bedrag, geïndexeerd voor inflatie.',
  },
  guardrails: {
    name: 'Guyton-Klinger guardrails',
    subtitle: 'Onttrekking past zich aan bij marktomstandigheden — meer bij beurswind mee, minder bij beurswind tegen.',
  },
}
