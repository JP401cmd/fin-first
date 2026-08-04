// ── Toelatingsdrempel voor lokale AI (beheer-instelbaar) ─────────────────────
//
// Welk model wordt aangeboden, en hoe streng is de uitvoer-toets? Dat waren
// vaste waarden in de code. Ze horen in beheer, om één praktische reden: de
// upstream-runtime is Early Preview en beweegt. Zakt straks elke telefoon op één
// van de drie proefvragen terwijl de andere twee prima gaan, dan wil je die
// afweging kunnen maken zonder een release — en andersom, gaat er iets mis in
// het veld, dan wil je de lat kunnen verhogen.
//
// OPSLAG: `app_settings.local_ai_gate` (JSON), spiegel van `local_knowledge`.
// Dit bestand is de gedeelde, PURE waarheid over vorm en grenzen: de admin-route
// valideert ermee, de client leest ermee. Geen tweede lezing, geen drift.
//
// VEILIGE GRENZEN ZIJN HARD. `minPassed` kan niet onder 1 en niet boven het
// aantal proefvragen; `timeoutMs` heeft een boven- en ondergrens. Een beheerder
// kan de lat dus verschuiven, maar niet wegnemen — een drempel van nul zou de
// hele poort betekenisloos maken en precies het gat terugbrengen dat hij dicht
// moet houden.

import { z } from 'zod'
import { DEFAULT_LOCAL_MODEL_ID, LOCAL_MODEL_CATALOG, type LocalModelId } from './model-catalog'

/** De app_settings-sleutel waaronder de drempel staat. */
export const LOCAL_AI_GATE_SETTINGS_KEY = 'local_ai_gate'

/**
 * Aantal proefvragen in de toets — de bovengrens van `minPassed`.
 * Bewust hier en niet uit output-proof geïmporteerd: dat zou een cyclus geven
 * (output-proof heeft de tasks, gate-config de grenzen). Een test pint af dat
 * de twee gelijk blijven.
 */
export const PROOF_TASK_COUNT = 3

export const MIN_TIMEOUT_MS = 5_000
export const MAX_TIMEOUT_MS = 180_000

export type LocalAiGateConfig = {
  /** Welk model /mijn/privacy aanbiedt. */
  modelId: LocalModelId
  /** Hoeveel van de proefvragen een toestel minimaal goed moet doen. */
  minPassed: number
  /** Maximale wachttijd per proefantwoord vóór het als "vastgelopen" telt. */
  timeoutMs: number
  /**
   * Mag de gebruiker zelf een ander model uit de catalogus kiezen? Uit = alleen
   * `modelId` telt. Bewust apart van `modelId`: een beheerder kan een model
   * aanwijzen én de keuze dichtzetten, of juist openlaten.
   */
  allowUserModelChoice: boolean
}

/**
 * De strenge stand, en tevens de terugval bij een ontbrekende of stukke
 * instelling: het gemeten model, álle drie de proefvragen goed, ruime maar
 * begrensde wachttijd. Dat is bewust het strengste dat de grenzen toestaan —
 * een kapotte instelling mag nooit een sóépelere poort opleveren.
 */
export const DEFAULT_GATE_CONFIG: LocalAiGateConfig = {
  modelId: DEFAULT_LOCAL_MODEL_ID,
  minPassed: PROOF_TASK_COUNT,
  timeoutMs: 45_000,
  allowUserModelChoice: true,
}

const MODEL_IDS = LOCAL_MODEL_CATALOG.map((m) => m.id) as [LocalModelId, ...LocalModelId[]]

/** Schema voor de PUT-body van de beheer-route (en voor het lezen uit app_settings). */
export const LocalAiGateSchema = z.object({
  modelId: z.enum(MODEL_IDS),
  minPassed: z.number().int().min(1).max(PROOF_TASK_COUNT),
  timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS),
  allowUserModelChoice: z.boolean(),
})

/**
 * Lees een opgeslagen waarde (JSON-string of object) naar een geldige config.
 * Werpt nooit: alles wat niet klopt valt terug op de strenge standaard, veld
 * voor veld — zo blijft een half-ingevulde of verouderde rij bruikbaar in
 * plaats van de hele poort onderuit te halen.
 */
export function parseGateConfig(raw: unknown): LocalAiGateConfig {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return DEFAULT_GATE_CONFIG
    }
  }
  if (!value || typeof value !== 'object') return DEFAULT_GATE_CONFIG

  const o = value as Record<string, unknown>
  const modelId = LOCAL_MODEL_CATALOG.some((m) => m.id === o.modelId)
    ? (o.modelId as LocalModelId)
    : DEFAULT_GATE_CONFIG.modelId

  return {
    modelId,
    minPassed: clampInt(o.minPassed, 1, PROOF_TASK_COUNT, DEFAULT_GATE_CONFIG.minPassed),
    timeoutMs: clampInt(o.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_GATE_CONFIG.timeoutMs),
    allowUserModelChoice:
      typeof o.allowUserModelChoice === 'boolean'
        ? o.allowUserModelChoice
        : DEFAULT_GATE_CONFIG.allowUserModelChoice,
  }
}

/** Geheel getal binnen [min,max]; alles wat dat niet is → `fallback`. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}
