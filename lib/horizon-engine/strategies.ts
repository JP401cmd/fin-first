/**
 * Horizon grootboek-engine — strategie-plug-ins (verdeling & onttrekking).
 *
 * De "pot-regels" die in de huidige engine wél opgeslagen maar NIET aangesloten
 * zijn (zie het beperkingenregister): verdeling-bij-toename, verdeling-bij-afname
 * en onttrekkingsvolgorde. Hier zijn het eerste-klas pure functies die de engine
 * per jaar componeert. Generiek over string-keys (asset-id) zodat de engine ze
 * per individueel asset gebruikt.
 */

import type { AssetType } from '@/lib/asset-data'

/** Verdeling van een positieve cashflow (surplus). */
export type SurplusStrategy = 'vast' | 'alles-beleggen' | 'pro-rata' | 'aflossen-eerst'
/** Verdeling van een negatieve cashflow (tekort). */
export type ShortfallStrategy = 'sequentieel' | 'pro-rata'

/** Vermogensgroepen die surplus mogen ontvangen (beleggings-achtig). */
export const INVESTABLE_TYPES: AssetType[] = ['investment', 'crypto', 'real_estate', 'deelneming']

/** Default onttrekkingsvolgorde op type-niveau — liquide eerst, eigen huis laatst. */
export const DEFAULT_WITHDRAWAL_ORDER: AssetType[] = [
  'cash', 'savings', 'investment', 'crypto', 'retirement',
  'real_estate', 'vehicle', 'deelneming', 'physical', 'levensverzekering', 'vordering', 'other', 'eigen_huis',
]

export interface HorizonStrategyOptions {
  surplus: SurplusStrategy
  /** Vast jaarbedrag naar beleggen bij surplus-strategie 'vast' (rest naar cash). */
  vastJaarbedrag: number
  shortfall: ShortfallStrategy
  /** Volgorde (op type-niveau) waarin potten worden aangesproken in de onttrekkingsfase. */
  withdrawalOrder: AssetType[]
  /** Pot-regel "verdeling bij toename": specifieke asset-types waar surplus heen gaat
   *  (leeg/undefined = default investable). Genegeerd bij surplus='aflossen-eerst'. */
  surplusTargetTypes?: AssetType[]
  /** Pot-regel "onttrekking bij afname": aparte volgorde voor tekort-onttrekking in de
   *  opbouwfase (undefined = gebruik withdrawalOrder). */
  deficitOrder?: AssetType[]
}

export const DEFAULT_STRATEGY_OPTIONS: HorizonStrategyOptions = {
  surplus: 'pro-rata',
  vastJaarbedrag: 0,
  shortfall: 'sequentieel',
  withdrawalOrder: DEFAULT_WITHDRAWAL_ORDER,
}

function sumKeys(values: Record<string, number>, keys: string[]): number {
  return keys.reduce((s, k) => s + Math.max(0, values[k] ?? 0), 0)
}

/**
 * Verdeel `amount` pro-rata over `keys` naar hun huidige waarde.
 * Valt terug op de eerste key als alle waarden 0 zijn.
 */
export function allocateProRata(
  values: Record<string, number>,
  keys: string[],
  amount: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  if (amount <= 0 || keys.length === 0) return result
  const total = sumKeys(values, keys)
  if (total <= 0) {
    result[keys[0]] = amount
    return result
  }
  for (const k of keys) {
    const w = Math.max(0, values[k] ?? 0) / total
    if (w > 0) result[k] = amount * w
  }
  return result
}

/**
 * Onttrek `need` sequentieel volgens `order`; stopt zodra de behoefte gedekt is.
 * Retourneert wat per key is onttrokken + een eventueel onbedekt restant.
 */
export function withdrawSequential(
  values: Record<string, number>,
  order: string[],
  need: number,
): { taken: Record<string, number>; shortfall: number } {
  const taken: Record<string, number> = {}
  let remaining = Math.max(0, need)
  for (const k of order) {
    if (remaining <= 0) break
    const available = Math.max(0, values[k] ?? 0)
    const take = Math.min(available, remaining)
    if (take > 0) {
      taken[k] = take
      remaining -= take
    }
  }
  return { taken, shortfall: remaining }
}

/** Onttrek `need` pro-rata over alle aanwezige keys. */
export function withdrawProRata(
  values: Record<string, number>,
  keys: string[],
  need: number,
): { taken: Record<string, number>; shortfall: number } {
  const taken: Record<string, number> = {}
  const want = Math.max(0, need)
  const total = sumKeys(values, keys)
  if (want <= 0) return { taken, shortfall: 0 }
  if (total <= 0) return { taken, shortfall: want }
  const factor = Math.min(1, want / total)
  for (const k of keys) {
    const v = Math.max(0, values[k] ?? 0)
    if (v > 0) taken[k] = v * factor
  }
  return { taken, shortfall: Math.max(0, want - total) }
}
