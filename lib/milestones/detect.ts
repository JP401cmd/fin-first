// ── Mijlpaal-detectie (puur) ─────────────────────────────────────────
//
// Vijf canonieke getallen in, sleutels uit. GEEN Supabase, GEEN IO, GEEN eigen
// berekening van welk cijfer dan ook (ADR 0123 §3): elke waarde die hier
// binnenkomt heeft elders al een canoniek huis. Een eigen som zou per definitie
// een tweede grondslag introduceren voor een getal dat de app al kent — precies
// de driftklasse die de bundel moet uitsluiten.
//
// De functie is bewust STAND-gebaseerd en niet gebeurtenis-gebaseerd: hij zegt
// "deze drempels zijn nú gepasseerd". Dat het maar één keer telt, is het werk
// van de unieke sleutel in de DB (`run.ts`), niet van deze functie.

import {
  DEBT_FREE_MILESTONE_KEY,
  EMERGENCY_MILESTONE_KEY,
  GOAL_CHECKPOINT_MIN_HORIZON_MS,
  GOAL_CHECKPOINT_PERCENTS,
  goalCheckpointKey,
  MILESTONE_FREEDOM_KEY_BY_PERCENT,
  MILESTONE_FREEDOM_PERCENTS,
  MILESTONE_WEALTH_KEY_BY_THRESHOLD,
  MILESTONE_WEALTH_THRESHOLDS,
  type GoalCheckpointObservation,
  type MilestoneCandidate,
  type MilestoneObservation,
} from './types'

/** `null`/`undefined`/NaN/Infinity → geen bruikbaar getal. */
function usable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Welke mijlpalen zijn op dit moment gepasseerd?
 *
 * Regels (alle vergelijkingen zijn `>=`, dus de drempel zelf telt mee):
 *  - vermogen     — `netWorth >= drempel`, per drempel uit de ladder
 *  - vrijheid     — `freedomPct >= pct`; `null` → geen enkele kandidaat
 *  - schuldenvrij — `totalDebts === 0` (exact nul; een restschuld is schuld)
 *  - noodfonds    — `monthsCovered >= targetMonths`; ontbrekend doel → geen kandidaat
 *
 * Doel-mijlpalen zitten hier bewust NIET in: die komen niet uit een stand maar
 * uit de `goals`-tabel, en worden in `run.ts` toegevoegd.
 */
export function evaluateMilestones(obs: MilestoneObservation): MilestoneCandidate[] {
  const candidates: MilestoneCandidate[] = []

  // ── Vermogen — euro's, volledige netto vermogen (ADR 0123 §4) ──────
  if (usable(obs.netWorth)) {
    for (const threshold of MILESTONE_WEALTH_THRESHOLDS) {
      if (obs.netWorth >= threshold) {
        candidates.push({
          key: MILESTONE_WEALTH_KEY_BY_THRESHOLD[threshold],
          kind: 'vermogen',
          thresholdValue: threshold,
          observedValue: obs.netWorth,
        })
      }
    }
  }

  // ── Vrijheid — procenten van het FIRE-doel ─────────────────────────
  // `null` betekent "de app weet het percentage niet" (geen uitgaven, geen
  // doel). Dat is uitdrukkelijk iets anders dan 0% en mag nooit als
  // "0% gepasseerd" lezen — vandaar de harde uitsluiting in plaats van een
  // `?? 0`-terugval.
  if (usable(obs.freedomPct)) {
    for (const pct of MILESTONE_FREEDOM_PERCENTS) {
      const key = MILESTONE_FREEDOM_KEY_BY_PERCENT[pct]
      if (!key) continue
      if (obs.freedomPct >= pct) {
        candidates.push({
          key,
          kind: 'vrijheid',
          thresholdValue: pct,
          observedValue: obs.freedomPct,
        })
      }
    }
  }

  // ── Schuldenvrij ───────────────────────────────────────────────────
  // Exact nul, niet `<= 0`: een negatieve schuldsom is een data-anomalie en
  // geen prestatie. De log legt vast wat de app waarnam (ADR 0123, Gevolgen).
  if (usable(obs.totalDebts) && obs.totalDebts === 0) {
    candidates.push({
      key: DEBT_FREE_MILESTONE_KEY,
      kind: 'schuldenvrij',
      thresholdValue: 0,
      observedValue: 0,
    })
  }

  // ── Noodfonds gevuld — MAANDEN, geen euro's ────────────────────────
  // Beide waarden staan in maanden (`resolveEmergencyFund`); ze mogen dus
  // nooit als bedrag door de vrijheidstijd-vertaling. Een doel van 0 maanden
  // is de degeneratietak: dan zou iedereen met €0 buffer meteen "gevuld"
  // heten. Die tak levert bewust geen kandidaat op.
  if (
    usable(obs.emergencyFundMonthsCovered) &&
    usable(obs.emergencyFundTargetMonths) &&
    obs.emergencyFundTargetMonths > 0 &&
    obs.emergencyFundMonthsCovered >= obs.emergencyFundTargetMonths
  ) {
    candidates.push({
      key: EMERGENCY_MILESTONE_KEY,
      kind: 'noodfonds',
      thresholdValue: obs.emergencyFundTargetMonths,
      observedValue: obs.emergencyFundMonthsCovered,
    })
  }

  return candidates
}

/**
 * Checkpoint-passages op verre doelen (plan-voorstel 3c, goal-gradient).
 *
 * Puur, net als `evaluateMilestones`: de voortgang komt als canoniek getal
 * binnen (`computeGoalProgress().pct` via de aanroeper), hier wordt niets
 * gerekend. Regels:
 *  - checkpoints op 25/50/75%; `>= pct` telt (de drempel zelf mee);
 *  - `progressPct >= 100` levert NIETS: dan is het doel zélf de gebeurtenis
 *    (`doel-behaald:<id>`), en het doelen-scherm viert die al — checkpoints
 *    zouden er een tweede viering naast zetten;
 *  - een niet-bruikbare voortgang (NaN/negatief) levert niets.
 * De aanroeper geeft alleen actieve, VERRE doelen mee (zie
 * `isFarHorizonGoal`); deze functie herbeoordeelt dat criterium bewust niet.
 */
export function evaluateGoalCheckpoints(
  goals: readonly GoalCheckpointObservation[],
): MilestoneCandidate[] {
  const candidates: MilestoneCandidate[] = []
  for (const goal of goals) {
    if (!usable(goal.progressPct) || goal.progressPct < 0 || goal.progressPct >= 100) continue
    for (const pct of GOAL_CHECKPOINT_PERCENTS) {
      if (goal.progressPct >= pct) {
        candidates.push({
          key: goalCheckpointKey(goal.id, pct),
          kind: 'doel',
          thresholdValue: pct,
          observedValue: goal.progressPct,
        })
      }
    }
  }
  return candidates
}

/**
 * Verdient dit doel checkpoints? Alleen bij een looptijd (aanmaak →
 * streefdatum) van minstens ~2 jaar. Ontbreekt de streefdatum, dan geen
 * checkpoints (er is geen horizon om op te knippen); ontbreekt de
 * aanmaakdatum, dan geldt de streefdatum t.o.v. `now` als benadering.
 */
export function isFarHorizonGoal(
  targetDate: string | null | undefined,
  createdAt: string | null | undefined,
  now: Date,
): boolean {
  if (!targetDate) return false
  const target = Date.parse(targetDate)
  if (!Number.isFinite(target)) return false
  const start = createdAt ? Date.parse(createdAt) : NaN
  const basis = Number.isFinite(start) ? start : now.getTime()
  return target - basis >= GOAL_CHECKPOINT_MIN_HORIZON_MS
}
