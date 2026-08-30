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
 *   • personalSum — bestedingen met ownership='personal' (jouw eigen geld,
 *     telt áltijd ×1, ook wanneer geboekt op een gedeeld budget).
 *   • sharedSum   — bestedingen met ownership='shared' (×aandeel in personal/
 *     partner-blik, ×1 in household-blik).
 *
 * Wat als "besteding" telt is NIET van deze laag: dat predicaat woont in
 * lib/budget-spending.ts (`spendingContribution`) en wordt hier geconsumeerd.
 *
 * Deze laag is bewust puur zodat ze los te unit-testen is; budgets-client.tsx
 * (Supabase + React) consumeert het resultaat.
 */

import type { Perspective } from '@/lib/household-data'
import { spendingContribution, splitContribution } from '@/lib/budget-spending'

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

/**
 * Eén budget-key in de uitgaven-map: gesplitst naar herkomst van het geld.
 *
 * Beide sommen KUNNEN NEGATIEF ZIJN: op een uitgaven-budget gaat een inkomst
 * van de besteding af (norm 30 aug 2026). Klem ze niet af — de weergave toont
 * bewust dat er netto geld binnenkwam.
 */
export interface SpendingSums {
  /** Getekende bestedingssom van rijen met ownership='personal'. */
  personalSum: number
  /** Getekende bestedingssom van rijen met ownership='shared'. */
  sharedSum: number
}

/** Transactie-rij voor de bestedingssom — gaat door `spendingContribution`. */
export interface SpendingSumTxRow {
  budget_id: string | null
  amount: number
  ownership?: string
  is_income?: boolean | null
  transaction_type?: string | null
  is_split?: boolean | null
}

/**
 * Split-regel (`transaction_splits`) voor de bestedingssom. Bewust een EIGEN
 * type: split-bedragen staan POSITIEF in de DB en mogen dus nooit door het
 * teken-regel van `spendingContribution`. `ownership` erft van de oudertransactie.
 */
export interface SpendingSumSplitRow {
  budget_id: string | null
  amount: number
  ownership?: string
}

/**
 * Bouw een per-budget uitgaven-map met twee sommen (personal/shared).
 *
 * Twee gescheiden lussen — gelijk aan het canonieke
 * `buildBudgetSpendingMap(transactions, splits)` in lib/budget-spending.ts:
 *
 *   1. transacties: elke rij levert zijn GETEKENDE bijdrage via
 *      `spendingContribution`. Op een uitgaven-budget telt een uitgave op en
 *      gaat een inkomst eraf; een transfer draagt 0 bij. De parent-rij van een
 *      split wordt overgeslagen — die bedragen leven op de splits.
 *   2. split-regels: `splitContribution`, altijd positief en zónder teken-toets.
 *      `transaction_splits.amount` wordt positief opgeslagen, dus een teken-
 *      regel over deze rijen zou elke split als inkomst aftrekken.
 *
 * `splits` én `budgetTypes` zijn bewust VERPLICHT (geen default): een caller
 * die de twee soorten rijen op één hoop gooit, of die de richting van het
 * budget niet meelevert, moet stuklopen op de compiler in plaats van stil het
 * verkeerde getal te tonen. Geen splits? Geef `[]` mee.
 *
 * `budgetTypes` is de canonieke type-map uit `buildBudgetTypeMap`
 * (lib/budget-utils.ts), inclusief de parent→child-erfregel. Zonder die
 * richting zou de inkomst-uitsluiting óók op inkomsten-, spaar- en
 * archief-budgetten slaan, waar de positieve rij juist de realisatie is.
 *
 * De map houdt positieve bedragen bij. Rijen zonder `budget_id` worden
 * overgeslagen; een ontbrekende `ownership` telt als 'personal' (eigen geld),
 * conform de DB-default.
 */
export function buildSpendingSums(
  transactions: SpendingSumTxRow[],
  splits: SpendingSumSplitRow[],
  budgetTypes: Map<string, string>,
): Map<string, SpendingSums> {
  const map = new Map<string, SpendingSums>()

  // `value` is de GETEKENDE bijdrage; geen Math.abs hier, dat zou de aftrek
  // van een inkomst weer in een optelling veranderen.
  const add = (budgetId: string, ownership: string | undefined, value: number) => {
    const entry = map.get(budgetId) ?? { personalSum: 0, sharedSum: 0 }
    if (ownership === 'shared') {
      entry.sharedSum += value
    } else {
      entry.personalSum += value
    }
    map.set(budgetId, entry)
  }

  for (const row of transactions) {
    if (row.is_split) continue // bedragen leven op de splits
    if (!row.budget_id) continue
    add(row.budget_id, row.ownership, spendingContribution(row, budgetTypes.get(row.budget_id)))
  }

  for (const row of splits) {
    if (!row.budget_id) continue
    add(row.budget_id, row.ownership, splitContribution(row))
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
