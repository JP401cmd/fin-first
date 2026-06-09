/**
 * Pure beslis-logica voor de twee "automatisch indelen"-opties op het
 * "Transacties categoriseren"-scherm (AICategorizeSheet):
 *
 *  - `computeAutoCategorization` — optie 3 "Slimme regels": deelt elke
 *    transactie in via de volledige keten (correctieregels → frequentie →
 *    trefwoordregels → eigen-rekening-detectie). Hergebruikt
 *    `categorizeTransaction` zodat het exact dezelfde uitkomst geeft als de
 *    import-flow.
 *  - `computeOwnAccountDetection` — optie 4 "Eigen rekening herkennen":
 *    markeert alleen onderlinge overboekingen tussen eigen rekeningen
 *    (IBAN-set + naam-patronen) zodat die niet als uitgave/inkomen tellen.
 *
 * Beide zijn puur (geen DB, geen React) → makkelijk te testen. De sheet laadt
 * de context, draait een van deze functies en past het resultaat gebatcht toe.
 */

import {
  categorizeTransaction,
  isOwnAccountTransfer,
  type CategoryCorrection,
  type FrequencyMatch,
} from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

/** Minimale transactievorm die beide functies nodig hebben. */
export type AutoCatTx = {
  id: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
}

/** Gedeelde context (regels, geschiedenis, eigen-rekening-identifiers). */
export type AutoCatContext = {
  budgets: Budget[]
  corrections: CategoryCorrection[]
  freqMap: Map<string, FrequencyMatch>
  /** Genormaliseerd: geen spaties, uppercase. */
  ownIbans: Set<string>
  /** Lowercase substrings die een eigen rekening aanduiden. */
  ownNamePatterns: string[]
  /** Doel-budget voor herkende overboekingen; null = geen eigen-rekening-budget. */
  eigenRekeningBudgetId: string | null
}

/** Eén voorgestelde toewijzing, klaar om gebatcht naar de DB te schrijven. */
export type AutoAssignment = {
  id: string
  budget_id: string
  /** 'transfer' | 'manual' | 'rule' — landt in transactions.category_source. */
  category_source: string
  isTransfer: boolean
}

export type AutoCatResult = {
  assignments: AutoAssignment[]
  /** Aantal niet-transfer-toewijzingen (regel/frequentie/correctie). */
  ruleCount: number
  /** Aantal als eigen-rekening herkende overboekingen. */
  transferCount: number
  /** Aantal transacties die niet automatisch ingedeeld konden worden. */
  unmatchedCount: number
}

/**
 * Optie 3 — deelt elke transactie in via de volledige categorisatie-keten.
 * Transfers (priority 0 in categorizeTransaction) krijgen het eigen-rekening-
 * budget; lukt dat niet (geen budget geconfigureerd), dan telt de transactie
 * als onmatched in plaats van fout ingedeeld te worden.
 */
export function computeAutoCategorization(txs: AutoCatTx[], ctx: AutoCatContext): AutoCatResult {
  const assignments: AutoAssignment[] = []
  let ruleCount = 0
  let transferCount = 0
  let unmatchedCount = 0

  for (const tx of txs) {
    const res = categorizeTransaction(
      tx.description,
      tx.counterparty_name,
      tx.amount,
      ctx.budgets,
      ctx.corrections,
      ctx.ownIbans,
      tx.counterparty_iban,
      ctx.freqMap,
      ctx.ownNamePatterns,
    )

    if (res.isTransfer) {
      if (ctx.eigenRekeningBudgetId) {
        assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true })
        transferCount++
      } else {
        unmatchedCount++
      }
    } else if (res.budget_id) {
      assignments.push({
        id: tx.id,
        budget_id: res.budget_id,
        category_source: res.category_source ?? 'rule',
        isTransfer: false,
      })
      ruleCount++
    } else {
      unmatchedCount++
    }
  }

  return { assignments, ruleCount, transferCount, unmatchedCount }
}

export type OwnAccountResult = {
  assignments: AutoAssignment[]
  transferCount: number
  unmatchedCount: number
}

/**
 * Optie 4 — markeert uitsluitend overboekingen tussen eigen rekeningen
 * (IBAN-set + naam-patronen). Geen budget geconfigureerd → niets toewijzen.
 */
export function computeOwnAccountDetection(txs: AutoCatTx[], ctx: AutoCatContext): OwnAccountResult {
  if (!ctx.eigenRekeningBudgetId) {
    return { assignments: [], transferCount: 0, unmatchedCount: txs.length }
  }

  const assignments: AutoAssignment[] = []
  for (const tx of txs) {
    if (isOwnAccountTransfer(tx.counterparty_iban, ctx.ownIbans, tx.counterparty_name, ctx.ownNamePatterns)) {
      assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true })
    }
  }

  return {
    assignments,
    transferCount: assignments.length,
    unmatchedCount: txs.length - assignments.length,
  }
}
