/**
 * Doelscenario — pure bouwlaag ("verkennen wordt richten", ronde 4 stap 3).
 *
 * Pure, isomorfe module: GEEN `'use client'`, geen Supabase, geen `Date.now()`.
 * Zet een vastgelegde lab-stand om naar concrete parameter-doel-rijen voor de
 * `goals`-tabel én levert het doel-gewogen totaalrendement dat het rendement-doel
 * en de fin-data-loader consumeren. De promotie-route (`app/api/toekomst-doel`)
 * is de enige schrijver; deze module rekent en normaliseert, maar raakt geen I/O.
 *
 * Eén bron voor ranges/iconen: `GOAL_TYPE_META` / `GOAL_TYPE_ICONS` uit `goal-data.ts`
 * (géén eigen constanten). Eén bron voor de categorie-weging: dezelfde regels als
 * `buildCategorieReturnGroups` in `toekomst-scenario.ts` (actief, inclusion-gewogen,
 * `expected_return/100` nul-basis) plus de per-categorie rendement-delta.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { ASSET_TYPE_TO_CATEGORIE } from '@/lib/horizon-kernel/adapter/potten'
import { GOAL_TYPE_META, GOAL_TYPE_ICONS, type GoalType } from '@/lib/goal-data'
import { DOEL_PARAMETERS, type DoelParameter } from '@/lib/horizon/toekomst-scenario'

// ── Parameter → goal_type (één bron, ook voor de route + loader) ──────────────

/**
 * Vaste koppeling van de vier promoveerbare lab-parameters naar hun `goal_type`.
 * De route gebruikt `PARAMETER_GOAL_TYPES` om exact deze vier typen te verwijderen
 * bij "loslaten"; de loader (stap 4) mapt terug via dezelfde bron.
 */
export const PARAM_TO_GOAL_TYPE: Record<DoelParameter, GoalType> = {
  spaarquote: 'savings_rate',
  salaris: 'salary',
  rendement: 'expected_return',
  fire: 'fire_age',
}

/** De vier goal-typen die door het lab-doelscenario worden beheerd (in DOEL_PARAMETERS-volgorde). */
export const PARAMETER_GOAL_TYPES: readonly GoalType[] = DOEL_PARAMETERS.map(
  (p) => PARAM_TO_GOAL_TYPE[p],
)

/**
 * Kleurfamilie voor álle parameter-doelen: één familie ('purple' = de Toekomst/
 * horizon-module in `GOAL_COLORS`, rendert via `getGoalColorClasses` naar `horizon-*`).
 * Bewust module-identiteit (Toekomst) i.p.v. per-parameter kleur — één visuele familie.
 */
const PARAMETER_GOAL_COLOR = 'purple'

// ── Doel-gewogen totaalrendement ──────────────────────────────────────────────

/**
 * Doel-gewogen TOTAALrendement (%) over de bezittingen: dezelfde weging als
 * `buildCategorieReturnGroups` (actieve assets, inclusion-gewogen, `expected_return/100`
 * op nul-basis) met de per-categorie rendement-delta erbovenop —
 * `Σ w·(er + delta) / Σ w · 100`.
 *
 * NUL-BASIS + delta spiegelen exact wat de kernel toepast (`buildAssetPotten`:
 * `expected_return/100`; `applyReturnDeltasToAssets`: `0 + delta`), zodat het
 * getoonde doelrendement niet drift met wat de simulatie werkelijk laat landen.
 * Geen assets met waarde (> 0) → `null` (geen betekenisvol gewogen gemiddelde).
 */
export function doelGewogenRendement(
  assets: readonly Asset[],
  returnDeltaByCategorie: Partial<Record<AssetCategorie, number>> | undefined,
): number | null {
  let totalWeight = 0
  let weightedSum = 0

  for (const a of assets) {
    if (a.is_active === false) continue
    const inclFactor = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const value = Number(a.current_value ?? 0) * (Number.isFinite(inclFactor) ? inclFactor : 1)
    if (!(value > 0)) continue

    const categorie = ASSET_TYPE_TO_CATEGORIE[a.asset_type as AssetType] ?? 'Overig'
    const er = Number(a.expected_return ?? 0) / 100
    const safeEr = Number.isFinite(er) ? er : 0
    const delta = returnDeltaByCategorie?.[categorie]
    const safeDelta = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0

    totalWeight += value
    weightedSum += value * (safeEr + safeDelta)
  }

  if (totalWeight <= 0) return null
  return (weightedSum / totalWeight) * 100
}

// ── Parameter-doel-rijen ───────────────────────────────────────────────────────

/**
 * Invoer voor `buildParameterGoalRows`. De CLIENT (die de live-sim heeft) levert de
 * doelwaarden; de builder VALIDEERT/CLAMPT ze en herberekent NIETS. Alleen aangevinkte
 * parameters (`true`) worden een rij; een aangevinkte parameter zonder bijbehorende
 * (eindige) doelwaarde wordt tolerant overgeslagen (zie `BuildParameterGoalRowsResult`).
 */
export interface ParameterGoalInput {
  parameters: Partial<Record<DoelParameter, true>>
  doelwaarden: {
    /** Spaarquote-doel in procenten (0–100). */
    spaarquotePct?: number
    /** Salaris-doel in €/maand (target_value van het `salary`-doel is dit maandbedrag). */
    salarisMnd?: number
    /** Rendement-doel in procenten (0–20) — doel-gewogen totaalrendement uit de live-sim. */
    rendementPct?: number
    /** Vrijheidsleeftijd-doel in jaren (18–100). Fractioneel → afgerond op halve stap (naar boven). */
    fireLeeftijd?: number
    /** Marge in jaren t.o.v. de vrijheidsleeftijd (criterium van het FIRE-doel; floor op halve stap, ≥ 0). */
    margeJaren?: number
  }
}

/**
 * Eén gegenereerde parameter-doel-rij (server-side compleet: kleur/icoon/metadata worden
 * hier bepaald, nooit door de client geleverd). De route voegt enkel `user_id` en de vaste
 * kolommen toe. `parameter` koppelt de rij terug aan de pref-cache (`doel.goalIds`).
 */
export interface ParameterGoalRow {
  parameter: DoelParameter
  goal_type: GoalType
  name: string
  target_value: number
  icon: string
  color: string
  metadata: Record<string, unknown>
}

/**
 * Resultaat van `buildParameterGoalRows`: de gebouwde rijen plus welke aangevinkte
 * parameters zijn OVERGESLAGEN (aangevinkt, maar geen bruikbare doelwaarde). De route
 * schrijft `rows` en kan `overgeslagen` terugmelden aan de UI.
 */
export interface BuildParameterGoalRowsResult {
  rows: ParameterGoalRow[]
  overgeslagen: DoelParameter[]
}

/** true als `x` een echt, eindig getal is (geen NaN/Infinity/undefined). */
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/** Clamp `value` binnen de META-range van `goalType` (alleen waar min/max gedefinieerd is). */
function clampToMeta(value: number, goalType: GoalType): number {
  const meta = GOAL_TYPE_META[goalType]
  let v = value
  if (typeof meta.min === 'number') v = Math.max(meta.min, v)
  if (typeof meta.max === 'number') v = Math.min(meta.max, v)
  return v
}

/**
 * Rond omhoog naar de dichtstbijzijnde halve stap (0,5-grid). Een kleine epsilon-nudge
 * voorkomt dat een (net-)geheel getal door drijvende-komma-ruis onterecht omhoog springt
 * (bv. `58` dat als `58.0000001` binnenkomt blijft `58`, niet `58,5`).
 */
function ceilToHalf(value: number): number {
  return Math.ceil(value * 2 - 1e-9) / 2
}

/**
 * Rond omlaag naar de dichtstbijzijnde halve stap (0,5-grid). De epsilon-nudge herstelt
 * een net-op-grid-waarde die als `4.9999999` binnenkomt naar `5` (→ `2,5`) i.p.v. `2,0`.
 */
function floorToHalf(value: number): number {
  return Math.floor(value * 2 + 1e-9) / 2
}

// nl-NL-formatters voor de doel-namen.
/** Getal met max. 1 decimaal (komma), trailing `.0` weg: `45` / `58,5`. */
function fmtNum1(v: number): string {
  return v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}
/** Percentage met exact 1 decimaal (komma): `6,3`. */
function fmtPct1(v: number): string {
  return v.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
/** Euro-bedrag zonder decimalen (nl-NL duizendtal-scheiding): `6.000`. */
function fmtEur0(v: number): string {
  return Math.round(v).toLocaleString('nl-NL', { maximumFractionDigits: 0 })
}

const BASE_METADATA = { bron: 'parameter', oorsprong: 'lab' } as const

/**
 * Bouw de doel-rij voor één aangevinkte parameter, of `null` als de bijbehorende
 * doelwaarde ontbreekt/ongeldig is (tolerant overslaan). De builder herberekent niets:
 * hij clampt de client-waarde op de META-range en formatteert de naam.
 */
function buildRow(parameter: DoelParameter, dw: ParameterGoalInput['doelwaarden']): ParameterGoalRow | null {
  switch (parameter) {
    case 'spaarquote': {
      if (!isFiniteNumber(dw.spaarquotePct)) return null
      const value = clampToMeta(dw.spaarquotePct, 'savings_rate')
      return {
        parameter,
        goal_type: 'savings_rate',
        name: `Spaarquote naar ${fmtNum1(value)}%`,
        target_value: value,
        icon: GOAL_TYPE_ICONS.savings_rate,
        color: PARAMETER_GOAL_COLOR,
        metadata: { ...BASE_METADATA },
      }
    }
    case 'salaris': {
      if (!isFiniteNumber(dw.salarisMnd)) return null
      const value = clampToMeta(dw.salarisMnd, 'salary')
      return {
        parameter,
        goal_type: 'salary',
        name: `Salaris naar €${fmtEur0(value)}/mnd`,
        target_value: value,
        icon: GOAL_TYPE_ICONS.salary,
        color: PARAMETER_GOAL_COLOR,
        metadata: { ...BASE_METADATA },
      }
    }
    case 'rendement': {
      if (!isFiniteNumber(dw.rendementPct)) return null
      const value = clampToMeta(dw.rendementPct, 'expected_return')
      return {
        parameter,
        goal_type: 'expected_return',
        name: `Rendement naar ${fmtPct1(value)}%`,
        target_value: value,
        icon: GOAL_TYPE_ICONS.expected_return,
        color: PARAMETER_GOAL_COLOR,
        metadata: { ...BASE_METADATA },
      }
    }
    case 'fire': {
      if (!isFiniteNumber(dw.fireLeeftijd)) return null
      // Fractionele client-waarde → naar boven op het 0,5-grid, dan clampen op 18–100.
      const value = clampToMeta(ceilToHalf(dw.fireLeeftijd), 'fire_age')
      // Marge is criterium van het FIRE-doel (presentatie, geen extra progress-dimensie):
      // floor op 0,5-grid, nooit negatief. Ontbreekt de marge → 0.
      const marge = isFiniteNumber(dw.margeJaren) ? Math.max(0, floorToHalf(dw.margeJaren)) : 0
      return {
        parameter,
        goal_type: 'fire_age',
        name: `Vrij op ${fmtNum1(value)} jaar`,
        target_value: value,
        icon: GOAL_TYPE_ICONS.fire_age,
        color: PARAMETER_GOAL_COLOR,
        metadata: { ...BASE_METADATA, margeDoelJaren: marge },
      }
    }
  }
}

/**
 * Zet een vastgelegde doelstand om naar parameter-doel-rijen: per aangevinkte parameter
 * één rij, in `DOEL_PARAMETERS`-volgorde. De client levert de doelwaarden; de builder
 * clampt ze op de META-ranges en herberekent niets. Een aangevinkte parameter zónder
 * bruikbare doelwaarde wordt overgeslagen en gemeld in `overgeslagen`.
 */
export function buildParameterGoalRows(input: ParameterGoalInput): BuildParameterGoalRowsResult {
  const rows: ParameterGoalRow[] = []
  const overgeslagen: DoelParameter[] = []

  for (const parameter of DOEL_PARAMETERS) {
    if (input.parameters[parameter] !== true) continue
    const row = buildRow(parameter, input.doelwaarden)
    if (row) rows.push(row)
    else overgeslagen.push(parameter)
  }

  return { rows, overgeslagen }
}
