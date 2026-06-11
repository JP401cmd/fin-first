/**
 * lib/budget-perspective.ts
 *
 * Pure perspectief-rekenlaag voor budgetten (geen React, geen Supabase).
 *
 * De budgetten-pagina toont budgetten in drie perspectieven:
 *   • 'personal'  — eigen blik: gedeelde budgetten tellen PRO-RATA op jouw
 *     aandeel (mySharePct), eigen-persoonlijke budgetten ×1.
 *   • 'household' — huishoud-blik: alles ×1 (volledige bedragen).
 *   • 'partner'   — spiegel van personal: gedeelde budgetten op het
 *     partner-aandeel (1 − mySharePct/100), eigen-persoonlijke budgetten ×1.
 *
 * Uitgaven per budget worden in TWEE sommen bijgehouden:
 *   • personalSum — transacties met ownership='personal' (jouw eigen geld,
 *     telt áltijd ×1, ook wanneer geboekt op een gedeeld budget).
 *   • sharedSum   — transacties met ownership='shared' (×aandeel in personal/
 *     partner-blik, ×1 in household-blik).
 *
 * Deze laag is bewust puur zodat ze los te unit-testen is; budgets-client.tsx
 * (Supabase + React) consumeert het resultaat.
 */

import type { Perspective } from '@/lib/household-data'

/**
 * Het aandeel (0-1) dat in dit perspectief telt voor een item met de gegeven
 * ownership.
 *
 * - personal: shared → mySharePct/100, anders 1
 * - household: altijd 1 (volledige bedragen)
 * - partner: shared → 1 − mySharePct/100, anders 1
 *
 * `mySharePct` is een geheel of decimaal percentage (0-100). Wordt naar [0,1]
 * geklemd zodat een buiten-bereik-waarde nooit negatieve of >100% bedragen
 * oplevert.
 */
export function shareFractionFor(
  perspective: Perspective,
  ownership: string | undefined,
  mySharePct: number,
): number {
  // Alleen gedeelde budgetten worden pro-rata verdeeld; persoonlijke ×1.
  if (ownership !== 'shared') return 1
  if (perspective === 'household') return 1

  const clampedPct = Math.min(100, Math.max(0, Number.isFinite(mySharePct) ? mySharePct : 50))
  const myFraction = clampedPct / 100
  return perspective === 'partner' ? 1 - myFraction : myFraction
}

/**
 * Stempel elk budget met een `_shareFraction` voor het gegeven perspectief.
 *
 * Niet-mutating: levert nieuwe objecten met de bestaande velden + het aandeel.
 * Display-call-sites vermenigvuldigen limit/spent/carried/goal-progress hiermee
 * in niet-household-perspectieven; editing leest/schrijft altijd volledige
 * bedragen.
 */
export function stampBudgetShares<T extends { ownership?: string }>(
  budgets: T[],
  perspective: Perspective,
  mySharePct: number,
): (T & { _shareFraction: number })[] {
  return budgets.map((budget) => ({
    ...budget,
    _shareFraction: shareFractionFor(perspective, budget.ownership, mySharePct),
  }))
}

/**
 * Combineer de twee uitgaven-sommen tot één perspectief-correct bedrag.
 *
 * personalSum telt altijd ×1 (jouw eigen geld), sharedSum wordt geschaald met
 * het aandeel-voor-gedeeld in dit perspectief.
 */
export function combineSpending(
  personalSum: number,
  sharedSum: number,
  perspective: Perspective,
  mySharePct: number,
): number {
  const sharedFraction = shareFractionFor(perspective, 'shared', mySharePct)
  return personalSum + sharedSum * sharedFraction
}

/** Eén budget-key in de uitgaven-map: gesplitst naar herkomst van het geld. */
export interface SpendingSums {
  /** Som van |bedrag| van transacties met ownership='personal'. */
  personalSum: number
  /** Som van |bedrag| van transacties met ownership='shared'. */
  sharedSum: number
}

/**
 * Bouw een per-budget uitgaven-map met twee sommen (personal/shared).
 *
 * Gebruikt `Math.abs(amount)` — gelijk aan de bestaande spending-map-semantiek
 * (uitgaven zijn negatief in de DB, maar de map houdt positieve bedragen bij).
 * Rijen zonder `budget_id` worden overgeslagen. Een ontbrekende `ownership`
 * telt als 'personal' (eigen geld), conform de DB-default.
 */
export function buildSpendingSums(
  rows: Array<{ budget_id: string | null; amount: number; ownership?: string }>,
): Map<string, SpendingSums> {
  const map = new Map<string, SpendingSums>()
  for (const row of rows) {
    if (!row.budget_id) continue
    const entry = map.get(row.budget_id) ?? { personalSum: 0, sharedSum: 0 }
    const value = Math.abs(Number(row.amount) || 0)
    if (row.ownership === 'shared') {
      entry.sharedSum += value
    } else {
      entry.personalSum += value
    }
    map.set(row.budget_id, entry)
  }
  return map
}

/**
 * Uitleg-onderschrift bij pro-rata weergegeven bedragen, bv.
 * "o.b.v. jouw aandeel (50%)". `mySharePct` wordt naar een geheel % afgerond.
 */
export function formatShareCaption(mySharePct: number): string {
  const pct = Math.round(Number.isFinite(mySharePct) ? mySharePct : 50)
  return `o.b.v. jouw aandeel (${pct}%)`
}
