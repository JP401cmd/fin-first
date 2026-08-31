// ── Mijlpalen — contracten & sleutel-grammatica ──────────────────────
//
// ADR 0123: "een mijlpaal is een gelogde gebeurtenis, geen live herberekende
// stand". Dit bestand draagt uitsluitend de TAAL van die log: welke soorten er
// zijn, hoe een sleutel eruitziet en hoe een rij eruitziet. Er wordt hier niets
// gerekend en niets opgehaald — de detectie staat in `detect.ts` (puur) en de
// IO in `run.ts`.
//
// EEN SLEUTEL IS DE IDENTITEIT. De uniciteit `(user_id, milestone_key)` in de
// DB is de hele idempotentie van de motor: een drempel die na een dip opnieuw
// wordt gepasseerd botst op de bestaande rij. Verander een sleutel dus nooit
// achteraf — dat zou een tweede rij (en een tweede viering) opleveren voor
// dezelfde gebeurtenis. Vandaar dat de grammatica hier als const staat en niet
// als format-functie: een format-functie nodigt uit tot "even anders".

import { MILESTONE_PERCENTS } from '@/lib/freedom-milestones'

/** Soort mijlpaal — bepaalt welke drempel-semantiek `threshold_value` draagt. */
export type MilestoneKind = 'vermogen' | 'vrijheid' | 'schuldenvrij' | 'noodfonds' | 'doel'

/**
 * Herkomst van de rij.
 *  - `seed`   — stil toebedeeld bij de allereerste run (viert niets, ADR 0123 §5)
 *  - `detect` — daadwerkelijk waargenomen passage
 * Consumenten die vieren MOETEN op `detect` filteren; `seed`-rijen zijn historie.
 */
export type MilestoneSource = 'seed' | 'detect'

// ── Sleutel-grammatica ───────────────────────────────────────────────

export type WealthMilestoneKey =
  | 'vermogen-10k'
  | 'vermogen-25k'
  | 'vermogen-50k'
  | 'vermogen-100k'
  | 'vermogen-250k'
  | 'vermogen-500k'
  | 'vermogen-1m'

export type FreedomMilestoneKey =
  | 'vrijheid-25'
  | 'vrijheid-50'
  | 'vrijheid-75'
  | 'vrijheid-100'

export type DebtFreeMilestoneKey = 'schuldenvrij'
export type EmergencyMilestoneKey = 'noodfonds-gevuld'
export type GoalMilestoneKey = `doel-behaald:${string}`
export type GoalCheckpointKey = `doel-checkpoint:${string}`

export type MilestoneKey =
  | WealthMilestoneKey
  | FreedomMilestoneKey
  | DebtFreeMilestoneKey
  | EmergencyMilestoneKey
  | GoalMilestoneKey
  | GoalCheckpointKey

export const DEBT_FREE_MILESTONE_KEY: DebtFreeMilestoneKey = 'schuldenvrij'
export const EMERGENCY_MILESTONE_KEY: EmergencyMilestoneKey = 'noodfonds-gevuld'

/**
 * Vermogensdrempels in €, oplopend.
 *
 * Grondslag = het VOLLEDIGE netto vermogen incl. eigen woning (ADR 0123 §4) —
 * dezelfde grootheid als `net_worth_snapshots.net_worth`, waaruit de
 * historische datering bij de seed-run komt. Een andere grondslag voor de
 * live-toets dan voor de datering misdateert elke geseede mijlpaal.
 *
 * Dit is bewust GEEN financiële aanname (geen rendement/SWR/inflatie) maar de
 * mijlpaal-ladder zelf; hij hoort daarom bij de sleutel-grammatica en niet in
 * `lib/constants.ts`.
 */
export const MILESTONE_WEALTH_THRESHOLDS = [
  10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const

/** Sleutel per vermogensdrempel — vaste grammatica, geen afleiding. */
export const MILESTONE_WEALTH_KEY_BY_THRESHOLD: Readonly<Record<number, WealthMilestoneKey>> = {
  10000: 'vermogen-10k',
  25000: 'vermogen-25k',
  50000: 'vermogen-50k',
  100000: 'vermogen-100k',
  250000: 'vermogen-250k',
  500000: 'vermogen-500k',
  1000000: 'vermogen-1m',
}

/** Sleutel per vrijheidspercentage — vaste grammatica, geen afleiding. */
export const MILESTONE_FREEDOM_KEY_BY_PERCENT: Readonly<Record<number, FreedomMilestoneKey>> = {
  25: 'vrijheid-25',
  50: 'vrijheid-50',
  75: 'vrijheid-75',
  100: 'vrijheid-100',
}

/**
 * De vrijheidspercentages komen uit `lib/freedom-milestones.ts` — één huis.
 * Zouden ze hier opnieuw gedefinieerd worden, dan kan de gevierde mijlpaal
 * afdrijven van de mijlpaal die /toekomst projecteert.
 */
export const MILESTONE_FREEDOM_PERCENTS: readonly number[] = MILESTONE_PERCENTS

/** Sleutel voor een behaald doel — het doel-id maakt hem uniek per doel. */
export function goalMilestoneKey(goalId: string): GoalMilestoneKey {
  return `doel-behaald:${goalId}`
}

// ── Checkpoints op verre doelen (goal-gradient, plan-voorstel 3c) ────
//
// Eén ver doel produceert geen gradient; drie nabije checkpoints produceren
// drie sprints. Alleen doelen met een LANGE looptijd krijgen checkpoints —
// een doel van zes maanden heeft de tussenstations niet nodig en zou er
// alleen vierings-ruis van krijgen.

/** Checkpoint-percentages op een ver doel. Bewust zonder 100: dat ís het doel. */
export const GOAL_CHECKPOINT_PERCENTS = [25, 50, 75] as const

/** Minimale looptijd (aanmaak → streefdatum) voordat een doel checkpoints krijgt. */
export const GOAL_CHECKPOINT_MIN_HORIZON_MS = 2 * 365.25 * 24 * 60 * 60 * 1000

/** Sleutel per checkpoint — doel-id + percentage maken hem uniek. */
export function goalCheckpointKey(goalId: string, pct: number): GoalCheckpointKey {
  return `doel-checkpoint:${goalId}:${pct}`
}

/**
 * Observatie voor de checkpoint-detectie: canonieke voortgang uit
 * `computeGoalProgress` (`GoalProgress.pct`) — de motor rekent zelf niets.
 * De aanroeper levert alleen actieve (niet-voltooide) verre doelen aan.
 */
export interface GoalCheckpointObservation {
  id: string
  name: string
  /** Canonieke voortgang 0–100 uit `computeGoalProgress().pct`. */
  progressPct: number
}

/**
 * Venster waarin een mijlpaal "vers" heet: hij mag boven de vouw in de briefing
 * en levert een melding op. Daarna zakt hij terug naar gewone historie
 * (ADR 0123 §6). Eén constante, twee consumenten (briefing + meldingen) — zodat
 * de melding niet 48 uur draait terwijl het briefje al 24 uur weg is.
 */
export const MILESTONE_FRESH_WINDOW_HOURS = 48
export const MILESTONE_FRESH_WINDOW_MS = MILESTONE_FRESH_WINDOW_HOURS * 60 * 60 * 1000

// ── Rij-contract ─────────────────────────────────────────────────────

/**
 * Eén rij uit `achieved_milestones` (own-row RLS, `UNIQUE (user_id, milestone_key)`).
 *
 * Handmatig getypeerd: er zijn in dit pad geen gegenereerde DB-types. De
 * snake_case volgt de kolomnamen, zodat een `select('*')` rechtstreeks in dit
 * type past zonder mapper.
 */
export interface AchievedMilestoneRow {
  id: string
  user_id: string
  milestone_key: string
  kind: MilestoneKind
  /**
   * De gepasseerde drempel in de EENHEID VAN `kind`:
   *  - `vermogen`  → euro's
   *  - `vrijheid`  → procenten (0–100)
   *  - `noodfonds` → MAANDEN dekking (géén euro's)
   *  - `schuldenvrij` → 0 (euro's schuld)
   *  - `doel`      → null
   * Consumenten mogen dit veld dus NOOIT blind als bedrag behandelen.
   */
  threshold_value: number | null
  /** De waargenomen waarde op het moment van passeren, zelfde eenheid als `threshold_value`. */
  observed_value: number | null
  achieved_at: string
  acknowledged_at: string | null
  source: MilestoneSource
}

/** Kandidaat vóór hij een rij is — de uitkomst van de pure detectie. */
export interface MilestoneCandidate {
  key: MilestoneKey
  kind: MilestoneKind
  thresholdValue: number | null
  observedValue: number | null
}

/**
 * De vijf canonieke getallen waarop de motor toetst. Alle vijf komen uit de
 * bestaande bundel/engines — de motor rekent er zelf niets bij (ADR 0123 §3):
 *  - `netWorth`                     → `lib/dashboard-data-loader.ts`
 *  - `freedomPct`                   → `computeFreedomProgress`
 *  - `totalDebts`                   → `lib/dashboard-data-loader.ts`
 *  - `emergencyFund*`               → `resolveEmergencyFund` (`lib/emergency-fund.ts`)
 */
export interface MilestoneObservation {
  netWorth: number
  freedomPct: number | null
  totalDebts: number
  /** Dekking in MAANDEN (niet euro's) — zie `resolveEmergencyFund().monthsCovered`. */
  emergencyFundMonthsCovered: number | null
  /** Doel in MAANDEN (niet euro's) — zie `resolveEmergencyFund().targetMonths`. */
  emergencyFundTargetMonths: number | null
}
