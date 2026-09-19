import { describe, it, expect } from 'vitest'
import { isUncategorizedTransaction, summarizeUncategorized } from './budget-uncategorized'

/**
 * REGRESSIE — B-055 (2026-09-18-testbug-4bdecf, Notion 3dff9e8d-568a-8167-a310-c6ec07f447cc).
 *
 * Norm: een transactie zonder budget telt als "zonder categorie" ongeacht
 * teken of `transaction_type = 'income'`. De Budget-hub ("Deze maand"), de
 * losse rekeningweergave en de "Alle tijden"-scope van de AICategorizeSheet
 * beschrijven daarmee dezelfde populatie. Vóór de fix sloten de hub-loader en
 * de hub-client inkomsten uit (uitgaven-only teller), waardoor een
 * inkomsten-transactie zonder budget in "Deze maand" stil onzichtbaar was.
 *
 * Dit bestand verving de repro `lib/budgets-data-loader.uncategorized-income.repro.test.ts`,
 * die de drie gekopieerde predikaten letterlijk naspeelde; sinds B-055 is er
 * nog maar één (lib/budget-uncategorized.ts) en staan de drie call-sites erop.
 */

const inkomstenZonderBudget = { budget_id: null, is_split: false, transaction_type: 'income', amount: 2500 }
const uitgaveZonderBudget = { budget_id: null, is_split: false, transaction_type: 'expense', amount: -42.5 }
const overboeking = { budget_id: null, is_split: false, transaction_type: 'transfer', amount: -500 }
const splitOuder = { budget_id: null, is_split: true, transaction_type: 'expense', amount: -120 }
const gekoppeld = { budget_id: 'b1', is_split: false, transaction_type: 'expense', amount: -10 }
/** Handmatig ontkoppelde rij: `transaction_type` NULL — moet meetellen (NULL-gotcha). */
const typeloos = { budget_id: null, is_split: null, transaction_type: null, amount: -7 }

describe('isUncategorizedTransaction (B-055)', () => {
  it('telt een inkomsten-transactie zonder budget mee — dit was het defect', () => {
    expect(isUncategorizedTransaction(inkomstenZonderBudget)).toBe(true)
  })

  it('telt een uitgave zonder budget mee (bestaand gedrag)', () => {
    expect(isUncategorizedTransaction(uitgaveZonderBudget)).toBe(true)
  })

  it('telt een rij zonder transaction_type mee (handmatig ontkoppeld, NULL ≠ transfer)', () => {
    expect(isUncategorizedTransaction(typeloos)).toBe(true)
  })

  it('laat overboekingen, split-ouders en gekoppelde rijen buiten beschouwing', () => {
    expect(isUncategorizedTransaction(overboeking)).toBe(false)
    expect(isUncategorizedTransaction(splitOuder)).toBe(false)
    expect(isUncategorizedTransaction(gekoppeld)).toBe(false)
  })
})

describe('summarizeUncategorized — gesplitste eurosom', () => {
  it('telt, splitst uitgaven en inkomsten en geeft de gematchte rijen terug', () => {
    const res = summarizeUncategorized([
      inkomstenZonderBudget,
      uitgaveZonderBudget,
      overboeking,
      splitOuder,
      gekoppeld,
      typeloos,
    ])
    expect(res.count).toBe(3)
    expect(res.expenseTotal).toBeCloseTo(49.5, 6)
    expect(res.incomeTotal).toBe(2500)
    expect(res.rows).toEqual([inkomstenZonderBudget, uitgaveZonderBudget, typeloos])
  })

  it('leest een NUMERIC-string als bedrag', () => {
    const res = summarizeUncategorized([{ budget_id: null, transaction_type: null, amount: '-12.34' }])
    expect(res.expenseTotal).toBeCloseTo(12.34, 6)
    expect(res.incomeTotal).toBe(0)
  })
})
