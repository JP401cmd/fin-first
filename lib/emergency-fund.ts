/**
 * Noodfonds — CANONIEKE resolver ("consume, don't recompute").
 *
 * Achtergrond: 'noodfonds' werd op vier oppervlakken (loader-bundel,
 * gezondheidsscore-weging, snapshot-routes, /check-rapport) onafhankelijk
 * gerekend en het noodfonds-DOEL was losgekoppeld van de score. Deze module is
 * de ÉNE bron: ze zet de canonieke liquide pot + het (optionele) noodfonds-doel
 * om naar de afgeleide noodfonds-cijfers die overal getoond en gescoord worden.
 *
 * PURE kern — geen Supabase/I-O — zodat ze ook in cron/service-role draait. Het
 * FETCHEN van goals gebeurt in de callers (loader + snapshot-routes); die geven
 * hier een reeds-geresolveerd doel-descriptor door.
 *
 * Grondslag-regels (hard):
 *  - `currentAmount` = de canonieke INCLUSION-gewogen liquide pot
 *    (`computeLiquidPot`, spaar/betaal/cash + niet-gekoppelde bankrekeningen).
 *    NOOIT goal.current_value als teller — dat is stale/gameable en zou
 *    dubbeltellen.
 *  - Het DOEL is `TARGET_EMERGENCY_SALARY_MONTHS` × netto maandsalaris
 *    (eigenaar-besluit 29 jul 2026). Een noodfonds-DOEL in goals stuurt de
 *    score-target NIET meer; het blijft een gewoon doel op /toekomst/doelen.
 *  - `monthsCovered` = currentAmount / netto maandsalaris — teller en doel op
 *    DEZELFDE grondslag, zodat "3 van de 3 maanden" letterlijk klopt.
 *  - `runwayMonths` = currentAmount / effectiveMonthlyExpenses — de leesbare
 *    "hoe lang kun je hiervan rondkomen"-uitdrukking, bewust apart gehouden.
 *  - `nettoVermogen` en `liquideVermogen` worden nooit gemengd: de liquide pot
 *    is bewust géén huis/beleggingen/pensioen (CLAUDE.md).
 */

import {
  MAX_EMERGENCY_TARGET_MONTHS,
  TARGET_EMERGENCY_MONTHS,
  TARGET_EMERGENCY_SALARY_MONTHS,
} from '@/lib/constants'
import { computeLiquidPot, type WeightableAssetRow } from '@/lib/dashboard-wealth-weighting'
import { roundCents } from '@/lib/format'

export { TARGET_EMERGENCY_SALARY_MONTHS }

/**
 * Terugval-buffer in maanden vaste lasten (6×, Nibud-bovengrens). Alias op de
 * canonieke `TARGET_EMERGENCY_MONTHS` (lib/constants.ts) — geen tweede magic
 * number. Geldt uitsluitend nog wanneer er géén netto maandsalaris bekend is.
 */
export const DEFAULT_EMERGENCY_TARGET_MONTHS = TARGET_EMERGENCY_MONTHS // = 6

/**
 * ANTI-GAMING: ondergrens (maanden) voor de SCORE-target. Een gebruiker mag een
 * kleine display-buffer kiezen (bv. 1 maand), maar de gezondheidsscore-curve
 * floort de target op dit minimum — anders zou een 1-maands-doel al 100% scoren
 * bij één maand dekking en de score triviaal te "gamen" zijn. De DISPLAY-target
 * (emergencyFund.targetMonths) blijft de gebruikerskeuze; alleen de score
 * gebruikt de gefloorde target.
 */
export const MIN_EMERGENCY_SCORE_TARGET_MONTHS = 3

/**
 * BOVENGRENS voor de target in maanden — alias op de canonieke
 * `MAX_EMERGENCY_TARGET_MONTHS` (lib/constants.ts), geen tweede magic number.
 * Begrenst uitsluitend de MAANDEN-expressie van een doel; het doelbedrag in
 * euro's blijft ongemoeid. Zie de constante voor de onderbouwing (degenerate
 * maanduitgaven-noemer + symmetrie met de anti-gaming-vloer).
 */
export const MAX_EMERGENCY_DISPLAY_TARGET_MONTHS = MAX_EMERGENCY_TARGET_MONTHS // = 24

/** Marker-waarde in `goals.metadata.standaardDoel` voor het standaard-noodfonds. */
export const EMERGENCY_STANDAARD_DOEL_KEY = 'noodfonds'

/**
 * Reeds-geresolveerd noodfonds-doel-descriptor (door de caller opgebouwd via
 * `emergencyGoalTarget`). De pure kern fetch't zelf geen goals.
 */
export interface EmergencyGoalTarget {
  /** Door de gebruiker gekozen buffer in maanden (emergency_fund-doel). */
  targetMonths?: number
  /** Absoluut doelbedrag in € (savings-template noodfonds-doel). */
  targetAmount?: number
}

export interface EmergencyFundInput {
  /** Canonieke inclusion-gewogen liquide pot (currentAmount teller). */
  liquidPot: number
  /** Effectieve maanduitgaven — noemer van de leesbare runway. */
  effectiveMonthlyExpenses: number
  /**
   * Effectief netto maandsalaris (`resolveEffectiveIncomeExpenses(...).income`
   * — handmatige invoer wint). Grondslag van doel én dekking. 0 → terugval op
   * de uitgaven-grondslag met de 6-maands default.
   */
  netMonthlyIncome: number
}

/** Grondslag waartegen de buffer wordt gemeten. */
export type EmergencyBasis = 'salary' | 'expenses'

export interface EmergencyFundResult {
  /** Canonieke liquide pot (= input.liquidPot; nooit de goal.current_value). */
  currentAmount: number
  /** Doel in maanden op de gekozen grondslag: 3 (salaris) of 6 (terugval). */
  targetMonths: number
  /** Doelbedrag in €: targetMonths × de maandbasis (salaris, of uitgaven). */
  targetAmount: number
  /** currentAmount / maandbasis — dezelfde grondslag als `targetMonths`. */
  monthsCovered: number
  /** currentAmount / maanduitgaven — "hoe lang kun je hiervan rondkomen". */
  runwayMonths: number
  /** Herkomst van de norm: 'salary' (3× salaris) of 'expenses' (terugval 6×). */
  source: EmergencyBasis
}

/**
 * Kiest de grondslag voor de noodbuffer-norm. Salaris wint altijd wanneer het
 * bekend is; alleen bij nul inkomen valt de norm terug op 6 × maanduitgaven,
 * zodat de pijler niet degenereert op een leeg account.
 */
export function emergencyTargetBasis(
  netMonthlyIncome: number,
  effectiveMonthlyExpenses: number,
): { basis: EmergencyBasis; monthlyBase: number; targetMonths: number } {
  if (Number.isFinite(netMonthlyIncome) && netMonthlyIncome > 0) {
    return {
      basis: 'salary',
      monthlyBase: netMonthlyIncome,
      targetMonths: TARGET_EMERGENCY_SALARY_MONTHS,
    }
  }
  return {
    basis: 'expenses',
    monthlyBase: Math.max(0, effectiveMonthlyExpenses),
    targetMonths: DEFAULT_EMERGENCY_TARGET_MONTHS,
  }
}

/**
 * Zet de canonieke liquide pot + het netto maandsalaris om naar de afgeleide
 * noodfonds-cijfers. Dit is de ÉNE definitie die loader-bundel, score-target,
 * widget en /check consumeren.
 */
export function resolveEmergencyFund(input: EmergencyFundInput): EmergencyFundResult {
  const { liquidPot, effectiveMonthlyExpenses, netMonthlyIncome } = input
  const { basis, monthlyBase, targetMonths } = emergencyTargetBasis(
    netMonthlyIncome,
    effectiveMonthlyExpenses,
  )

  return {
    currentAmount: liquidPot,
    targetMonths,
    targetAmount: targetMonths * monthlyBase,
    monthsCovered: monthlyBase > 0 ? liquidPot / monthlyBase : 0,
    runwayMonths: effectiveMonthlyExpenses > 0 ? liquidPot / effectiveMonthlyExpenses : 0,
    source: basis,
  }
}

/**
 * Minimale assetvorm voor de liquide pot: type, waarde en inclusie-percentage.
 * Bewust losser dan `WeightableAssetRow` (waarde mag ontbreken) zodat zowel de
 * score-rijen (`HealthScoreAsset`) als rauwe loader-rijen er rechtstreeks in
 * passen zonder per call-site een eigen map-stap.
 */
export interface LiquidPotAssetRow {
  current_value?: number | string | null
  asset_type?: string | null
  net_worth_inclusion_pct?: number | null
}

/**
 * Dezelfde resolver, maar gevoed vanuit de RUWE rijen: de canonieke
 * inclusion-gewogen liquide pot wordt hier zélf afgeleid (`computeLiquidPot`).
 *
 * Dit is de gedeelde kern onder twee consumenten die tot bevinding H4 (punt 1)
 * elk hun eigen pot bouwden:
 *  - de gezondheidsscore-pijler `emergency_fund`
 *    (`computeEmergencyFundMonths` in lib/health-score-input.ts delegeert
 *    hiernaartoe), en
 *  - de noodfonds-bundel die de widget en de briefing lezen
 *    (`lib/horizon/raw-data-loader.ts` → `HorizonRawData.emergencyFund`).
 *
 * Gelijke rijen + gelijke scalars ⇒ per constructie hetzelfde aantal maanden
 * dekking en dezelfde norm. Dát is wat "Uitstekend, 4,6 × salaris" in de
 * gezondheidsmodal naast "vraagt aandacht" in de briefing onmogelijk maakt.
 *
 * @param netMonthlySalary effectief netto maandsalaris; 0 → uitgaven-terugval.
 * @param avgMonthlyExpenses gemiddelde maanduitgaven — terugval-noemer én de
 *   noemer van de leesbare runway.
 */
export function resolveEmergencyFundFromRows(
  assets: ReadonlyArray<LiquidPotAssetRow>,
  unlinkedCash: number,
  netMonthlySalary: number,
  avgMonthlyExpenses: number,
): EmergencyFundResult {
  const rows: WeightableAssetRow[] = assets.map((a) => ({
    current_value: a.current_value ?? 0,
    asset_type: a.asset_type,
    net_worth_inclusion_pct: a.net_worth_inclusion_pct,
  }))
  return resolveEmergencyFund({
    liquidPot: computeLiquidPot(rows, unlinkedCash),
    effectiveMonthlyExpenses: avgMonthlyExpenses,
    netMonthlyIncome: netMonthlySalary,
  })
}

/**
 * Weergave-vorm van het noodfonds zoals de bundel (`DashboardData.emergencyFund`)
 * en de widget 'm dragen: dezelfde cijfers, één keer afgerond.
 *
 * Structureel toewijsbaar aan `EmergencyFund` (lib/types/dashboard.ts) zonder
 * dat deze pure module dat zware type hoeft te importeren.
 */
export interface EmergencyFundDisplay {
  currentAmount: number
  targetAmount: number
  monthsCovered: number
  targetMonths: number
  isComplete: boolean
  runwayMonths: number
  source: EmergencyBasis
}

/**
 * De ÉNE afrondings-conventie voor de noodfonds-bundel. Woont hier zodat het
 * canonieke pad (/overzicht, via `withCanonicalOverviewFigures`) en de
 * loader-bundel niet elk hun eigen `Math.round(x * 10) / 10` dragen — twee
 * afrondingen op één getal is precies hoe "4,6" en "4,5" naast elkaar komen te
 * staan.
 *
 * `isComplete` toetst bewust op de ONAFGERONDE waarden: 2,96 maanden mag geen
 * "compleet" worden omdat de weergave er 3,0 van maakt.
 */
export function toEmergencyFundDisplay(result: EmergencyFundResult): EmergencyFundDisplay {
  return {
    currentAmount: roundCents(result.currentAmount),
    targetAmount: roundCents(result.targetAmount),
    monthsCovered: Math.round(result.monthsCovered * 10) / 10,
    targetMonths: Math.round(result.targetMonths * 2) / 2,
    isComplete: result.monthsCovered >= result.targetMonths,
    runwayMonths: Math.round(result.runwayMonths * 10) / 10,
    source: result.source,
  }
}

/**
 * Score-target: display-target begrensd op [vloer, plafond]. Alleen de
 * gezondheidsscore-curve gebruikt deze; de display-target blijft ongefloord.
 * De vloer is anti-gaming (mini-doel ≠ gratis 100%); het plafond voorkomt dat
 * een absurd hoge target de pijler permanent op 0 pint. Callers geven soms een
 * rauwe waarde door, dus beide grenzen ook hier — niet alleen in de resolver.
 */
export function emergencyScoreTargetMonths(displayTargetMonths: number): number {
  if (!Number.isFinite(displayTargetMonths) || displayTargetMonths <= 0) {
    return DEFAULT_EMERGENCY_TARGET_MONTHS
  }
  return Math.min(
    MAX_EMERGENCY_DISPLAY_TARGET_MONTHS,
    Math.max(MIN_EMERGENCY_SCORE_TARGET_MONTHS, displayTargetMonths),
  )
}

// ── Marker & doel-selectie (detectie-marker B) ───────────────────────────────
//
// LET OP (eigenaar-besluit 29 jul 2026): een noodfonds-DOEL stuurt de
// score-target NIET meer — de norm is altijd 3 × netto maandsalaris
// (`resolveEmergencyFund`). Deze helpers blijven bestaan om het noodfonds-doel
// te herkennen op /toekomst/doelen (eigen voortgangsbalk op het doelbedrag).

/**
 * Minimale goal-vorm voor noodfonds-detectie (subset van `Goal`). Zowel een
 * volledige `Goal` als een lichte loader-/route-projectie voldoet hieraan.
 */
export interface EmergencyGoalCandidate {
  goal_type?: string | null
  target_value?: number | string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Is dit het canonieke noodfonds-doel? Eén stabiele marker (B):
 *  - `goal_type === 'emergency_fund'` (expliciet doel-type, unit=maanden), OF
 *  - `metadata.standaardDoel === 'noodfonds'` (het savings-template noodfonds
 *    dat quick-add/onboarding aanmaken).
 */
export function isEmergencyGoal(goal: EmergencyGoalCandidate): boolean {
  if (goal.goal_type === 'emergency_fund') return true
  return goal.metadata?.standaardDoel === EMERGENCY_STANDAARD_DOEL_KEY
}

/**
 * Kies deterministisch één noodfonds-doel uit een lijst. Prioriteit: eerst een
 * expliciet `emergency_fund`-doel (unit=maanden), anders het eerste
 * `metadata.standaardDoel==='noodfonds'`-savings-doel. Behoudt de ingaande
 * volgorde (de loader levert al op `sort_order` gesorteerd), dus de keuze is
 * stabiel. `null` wanneer er geen noodfonds-doel is.
 */
export function pickEmergencyGoal<T extends EmergencyGoalCandidate>(
  goals: readonly T[],
): T | null {
  const candidates = goals.filter(isEmergencyGoal)
  if (candidates.length === 0) return null
  return candidates.find((g) => g.goal_type === 'emergency_fund') ?? candidates[0]
}

/**
 * Zet een gekozen noodfonds-doel om naar een `EmergencyGoalTarget`-descriptor.
 * De `target_value`-semantiek verschilt per doel-type:
 *  - `emergency_fund` (unit=maanden): target_value = aantal maanden.
 *  - savings-template noodfonds (unit=€): target_value = doelbedrag in €.
 * Beide velden worden — waar mogelijk (maanduitgaven > 0) — ingevuld zodat de
 * resolver en de callers een compleet descriptor krijgen.
 *
 * Let op (MCP/DB): `target_value` kan als string binnenkomen (NUMERIC) → expliciet
 * `Number(...)`.
 */
export function emergencyGoalTarget(
  goal: EmergencyGoalCandidate,
  monthlyExpenses: number,
): EmergencyGoalTarget {
  const targetValue = Number(goal.target_value ?? 0)
  if (goal.goal_type === 'emergency_fund') {
    const targetMonths = targetValue > 0 ? targetValue : undefined
    return {
      targetMonths,
      targetAmount:
        targetMonths != null && monthlyExpenses > 0
          ? targetMonths * monthlyExpenses
          : undefined,
    }
  }
  // Savings-template noodfonds: doelbedrag in €.
  const targetAmount = targetValue > 0 ? targetValue : undefined
  return {
    targetAmount,
    targetMonths:
      targetAmount != null && monthlyExpenses > 0
        ? targetAmount / monthlyExpenses
        : undefined,
  }
}

