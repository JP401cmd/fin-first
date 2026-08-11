// lib/transactions/transfer-marking.ts
//
// Het CANONIEKE TRIO als pure functie: welke velden moet je schrijven wanneer een
// transactie op de "Eigen rekening"-post wordt geboekt — en welke wanneer een
// bestaande verschuiving juist een gewoon budget krijgt.
//
// ## Waarom dit een gedeelde helper is
//
// `isRealAggRow` (lib/server-data/tx-aggregates.ts) bepaalt UITSLUITEND op
// `transaction_type` of een boeking een échte inkomst/uitgave is — niet op het
// budget. Een schrijfpad dat bij "Eigen rekening" alleen `budget_id` zet, levert
// dus een transactie op die zichtbaar op de archive-post staat en tóch meetelt in
// inkomsten, uitgaven, spaarquote, vrijheids-% en de FIRE-projectie. Dat is het
// soort fout dat niets kapot maakt en alleen de cijfers stil scheeftrekt.
//
// Die regel stond tot nu toe inline in `components/app/transaction-form.tsx` en
// wordt nu ook door de bulkroute (`PATCH /api/transactions/bulk-budget`)
// geschreven. Twee kopieën van deze regel is precies de drift die AC7/AC8
// bewaken: dan hangt het van het gebruikte scherm af of een overboeking als
// verschuiving of als uitgave telt. Eén bron, twee aanroepers, een paritytest.
//
// Bewust puur en zonder imports uit server-only modules: dit bestand wordt door
// een `'use client'`-component gelezen.

import { BUDGET_SLUGS } from '@/lib/budget-data'

/**
 * De typen die als "verschuiving" gelden. Spiegelt `TRANSFER_TYPES` in
 * `lib/server-data/tx-aggregates.ts` (de lijst waar `isRealAggRow` op draait) —
 * één typelijst, drie lezers.
 */
export const TRANSFER_TYPES: ReadonlySet<string> = new Set(['transfer', 'joint_transfer'])

/** Is deze `transaction_type` NU een verschuiving? `null`/onbekend = nee. */
export function isTransferType(transactionType: string | null | undefined): boolean {
  return TRANSFER_TYPES.has(transactionType ?? '')
}

/**
 * De budget-ids van de "Eigen rekening"-posten: hoofdpost én subpost.
 *
 * Welke van de twee kiesbaar is hangt af van het budgetplan —
 * `buildBudgetSelectEntries` toont de subpost als die bestaat en valt anders
 * terug op de hoofdpost. Beide moeten dus als "dit is de archive-post" tellen,
 * anders schrijft de ene helft van de app het trio wel en de andere niet.
 *
 * Neemt een platte lijst; de aanroeper vlakt zijn eigen vorm (groepen, bundel,
 * DB-rijen) zelf af.
 */
export function collectEigenRekeningBudgetIds(
  budgets: { id: string; slug?: string | null }[],
): Set<string> {
  const ids = new Set<string>()
  for (const b of budgets) {
    if (b.slug === BUDGET_SLUGS.EIGEN_REKENING || b.slug === BUDGET_SLUGS.EIGEN_REKENING_SUB) {
      ids.add(b.id)
    }
  }
  return ids
}

/**
 * De velden die bij een verschuivings-markering geschreven moeten worden.
 *
 * `transaction_type` is OPTIONEEL aanwezig en dat is het hele punt:
 *
 *  - boekt de rij op Eigen rekening → `'transfer'`;
 *  - was de rij een verschuiving en gaat hij naar een gewoon budget → `null`
 *    (anders blijft een échte uitgave buiten de spaarquote);
 *  - in alle andere gevallen ONTBREEKT de sleutel, zodat importherkomst
 *    (`'DEBIT'`, `'payment'`, …) op de rest intact blijft. Een blanket `null`
 *    zou die stil wissen — dat is AC8.
 */
export interface TransferMarking {
  category_source: 'transfer' | 'manual'
  transaction_type?: 'transfer' | null
}

export function transferMarkingFor(input: {
  /** Boekt de rij op de "Eigen rekening"-post? */
  targetsEigenRekening: boolean
  /** De HUIDIGE markering van de rij. Onbekend = "geen verschuiving". */
  currentType?: string | null
}): TransferMarking {
  if (input.targetsEigenRekening) {
    return { category_source: 'transfer', transaction_type: 'transfer' }
  }
  if (isTransferType(input.currentType)) {
    return { category_source: 'manual', transaction_type: null }
  }
  return { category_source: 'manual' }
}
