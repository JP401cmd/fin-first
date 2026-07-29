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
 *    dubbeltellen. Het DOEL levert uitsluitend de TARGET.
 *  - `monthsCovered` = currentAmount / effectiveMonthlyExpenses (dezelfde noemer
 *    als de loader; 0 bij 0 uitgaven — geen divide-by-zero).
 *  - `nettoVermogen` en `liquideVermogen` worden nooit gemengd: de liquide pot
 *    is bewust géén huis/beleggingen/pensioen (CLAUDE.md).
 */

import { MAX_EMERGENCY_TARGET_MONTHS, TARGET_EMERGENCY_MONTHS } from '@/lib/constants'

/**
 * Default noodfonds-buffer in maanden vaste lasten (6×, Nibud-bovengrens).
 * Alias op de canonieke `TARGET_EMERGENCY_MONTHS` (lib/constants.ts) — geen
 * tweede magic number. Gebruikt wanneer er geen noodfonds-doel bestaat.
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

/**
 * Begrens een target-in-maanden tot een zinnige buffer-bandbreedte. Puur op de
 * BOVENkant (de vloer hoort bij de score, niet bij de weergave) plus een
 * eindigheids-check, zodat een deling door bijna-nul maanduitgaven nooit als
 * "389 maanden" doorlekt naar tegel of score.
 */
function clampTargetMonths(months: number): number {
  if (!Number.isFinite(months) || months <= 0) return DEFAULT_EMERGENCY_TARGET_MONTHS
  return Math.min(months, MAX_EMERGENCY_DISPLAY_TARGET_MONTHS)
}

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
  /** Effectieve maanduitgaven — noemer (identiek aan de loader). */
  effectiveMonthlyExpenses: number
  /** Geresolveerd noodfonds-doel, of `null` → default-buffer / liquide-tak. */
  goal: EmergencyGoalTarget | null
}

export interface EmergencyFundResult {
  /** Canonieke liquide pot (= input.liquidPot; nooit de goal.current_value). */
  currentAmount: number
  /** Display-target in maanden (gebruikerskeuze als er een doel is, anders 6). */
  targetMonths: number
  /** Doelbedrag in €: expliciet doelbedrag, anders targetMonths × maanduitgaven. */
  targetAmount: number
  /** currentAmount / effectiveMonthlyExpenses (0 bij 0 uitgaven). */
  monthsCovered: number
  /** Herkomst van de target: 'goal' (noodfonds-doel) of 'liquid' (default 6). */
  source: 'goal' | 'liquid'
}

/**
 * Zet de canonieke liquide pot + het (optionele) noodfonds-doel om naar de
 * afgeleide noodfonds-cijfers. Dit is de ÉNE definitie die loader-bundel,
 * score-target en /check consumeren.
 */
export function resolveEmergencyFund(input: EmergencyFundInput): EmergencyFundResult {
  const { liquidPot, effectiveMonthlyExpenses, goal } = input

  // Target-maanden: expliciete doel-maanden > afgeleid uit doelbedrag > default.
  // Altijd door clampTargetMonths: een €-doel gedeeld door (bijna) nul
  // maanduitgaven zou anders een absurde target opleveren (productie: €5.000 /
  // €12,85 = 389 maanden), en ook een handmatig ingetikt maanden-doel mag niet
  // ongelimiteerd zijn. Het doelBEDRAG blijft hieronder ongemoeid.
  let targetMonths = DEFAULT_EMERGENCY_TARGET_MONTHS
  if (goal) {
    if (goal.targetMonths != null && goal.targetMonths > 0) {
      targetMonths = clampTargetMonths(goal.targetMonths)
    } else if (
      goal.targetAmount != null &&
      goal.targetAmount > 0 &&
      effectiveMonthlyExpenses > 0
    ) {
      targetMonths = clampTargetMonths(goal.targetAmount / effectiveMonthlyExpenses)
    }
  }

  // Doelbedrag: expliciet doelbedrag wint; anders target-maanden × maanduitgaven.
  const targetAmount =
    goal?.targetAmount != null && goal.targetAmount > 0
      ? goal.targetAmount
      : targetMonths * effectiveMonthlyExpenses

  const monthsCovered =
    effectiveMonthlyExpenses > 0 ? liquidPot / effectiveMonthlyExpenses : 0

  return {
    currentAmount: liquidPot,
    targetMonths,
    targetAmount,
    monthsCovered,
    source: goal ? 'goal' : 'liquid',
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

/**
 * Convenience: resolveer het display-target-in-maanden voor een lijst goals +
 * maanduitgaven, in ÉÉN stap (pick → descriptor → resolve → targetMonths). Voor
 * callers (snapshot-routes) die alléén de score-target nodig hebben.
 */
export function resolveEmergencyTargetMonths(
  goals: readonly EmergencyGoalCandidate[],
  monthlyExpenses: number,
): number {
  const goal = pickEmergencyGoal(goals)
  return resolveEmergencyFund({
    liquidPot: 0, // niet-relevant voor de target
    effectiveMonthlyExpenses: monthlyExpenses,
    goal: goal ? emergencyGoalTarget(goal, monthlyExpenses) : null,
  }).targetMonths
}
