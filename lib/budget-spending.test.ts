import { describe, it, expect } from 'vitest'
import {
  buildBudgetSpendingMap,
  budgetFillRatio,
  budgetSpentPct,
  budgetBarPct,
  isExpenseDirectionBudget,
  isIncomeDirectionBudget,
  showsFreedomTime,
  spendingContribution,
  spentForBudget,
} from '@/lib/budget-spending'

/**
 * Type-map voor de tests: alle gebruikte budget-ids zijn UITGAVEN-budgetten,
 * want daarop geldt de inkomst-/transfer-uitsluiting. De richting-scoping zelf
 * staat in het blok "richting van het budget" onderaan.
 */
const EXPENSE_TYPES = new Map<string, string>([
  ['a', 'expense'],
  ['b', 'expense'],
  ['c', 'expense'],
])

describe('buildBudgetSpendingMap', () => {
  it('somt |amount| per budget_id', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: -10 },
      { budget_id: 'b', amount: -25 },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 50, b: 25 })
  })

  it('trekt een inkomst af (is_income)', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: 3000, is_income: true }, // salaris op hetzelfde budget
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 40 - 3000 })
  })

  it('trekt inkomsten af op het TEKEN, ook als is_income false/afwezig is', () => {
    // is_income is BOOLEAN DEFAULT false zonder CHECK tegen het teken, dus die
    // kolom alleen is niet betrouwbaar. Het teken is de harde marker:
    // amount > 0 = inkomst. Dit is de productiecase van melding 6142d204.
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -1265 },
      { budget_id: 'a', amount: 6000, is_income: false },
      { budget_id: 'a', amount: 2000 },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: -6735 })
  })

  it('het negatieve bedrag wordt NIET op 0 geklemd', () => {
    // Expliciete eigenaarskeuze: hij wil zien dat er netto geld binnenkwam.
    const map = buildBudgetSpendingMap(
      [{ budget_id: 'a', amount: 5000 }],
      [],
      EXPENSE_TYPES,
    )
    expect(map.a).toBeLessThan(0)
    expect(map.a).toBe(-5000)
  })

  it('een inkomst gelijk aan de uitgave geeft precies 0', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -1265 },
      { budget_id: 'a', amount: 1265 },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 0 })
  })

  it('accepteert string-bedragen (NUMERIC komt als string terug)', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: '-40.50' },
      { budget_id: 'a', amount: '6000' },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 40.5 - 6000 })
  })

  it('positief opgeslagen split-regels tellen mee (geen teken-filter op splits)', () => {
    // transaction_splits.amount staat POSITIEF in de DB — het teken-filter
    // geldt alleen voor transactie-rijen, nooit voor split-regels.
    const map = buildBudgetSpendingMap(
      [{ id: 't1', budget_id: 'a', amount: -29.24, is_split: true }],
      [
        { budget_id: 'a', amount: 4.5 },
        { budget_id: 'b', amount: 24.74 },
      ],
      EXPENSE_TYPES,
    )
    expect(map).toEqual({ a: 4.5, b: 24.74 })
  })

  it('sluit transfers uit (transaction_type)', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: -500, transaction_type: 'transfer' },
      { budget_id: 'a', amount: -500, transaction_type: 'joint_transfer' },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 40 })
  })

  it('slaat de parent-rij van een split over en telt de split-bedragen', () => {
    const map = buildBudgetSpendingMap(
      [
        { id: 't1', budget_id: 'a', amount: -100, is_split: true }, // parent-rij: overslaan
        { budget_id: 'b', amount: -20 },
      ],
      [
        { budget_id: 'a', amount: -60 },
        { budget_id: 'c', amount: -40 },
      ],
      EXPENSE_TYPES,
    )
    expect(map).toEqual({ a: 60, b: 20, c: 40 })
  })

  it('negeert transacties zonder budget_id', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: null, amount: -40 },
      { amount: -10 },
      { budget_id: 'a', amount: -5 },
    ], [], EXPENSE_TYPES)
    expect(map).toEqual({ a: 5 })
  })
})

describe('richting van het budget — de kwalificatie "op een uitgaven-budget"', () => {
  // REGRESSIE. Zonder deze scoping sloeg de inkomst-uitsluiting óók op
  // inkomsten-, spaar- en archief-budgetten. Gemeten op productie (augustus
  // 2026): €4.401,81 aan realisatie op 2 income-budgetten zou naar €0 vallen,
  // en de 19 transfer-rijen (€277,56) van de archief-post "Eigen rekening" ook.

  it('een income-budget: positieve rij telt op, negatieve gaat eraf (spiegel)', () => {
    // Eigenaarsnorm: "inkomstenbudgetten zitten precies andersom in elkaar".
    // Een salariscorrectie verlaagt de gerealiseerde inkomsten.
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'salaris', amount: 3200 },
        { budget_id: 'salaris', amount: -100 },
      ],
      [],
      new Map([['salaris', 'income']]),
    )
    expect(map).toEqual({ salaris: 3100 })
  })

  it('een savings-budget spiegelt net zo (inleg op, opname eraf)', () => {
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'spaarpot', amount: 500 },
        { budget_id: 'spaarpot', amount: -120 },
      ],
      [],
      new Map([['spaarpot', 'savings']]),
    )
    expect(map).toEqual({ spaarpot: 380 })
  })

  it('isIncomeDirectionBudget dekt precies income en savings', () => {
    expect(isIncomeDirectionBudget('income')).toBe(true)
    expect(isIncomeDirectionBudget('savings')).toBe(true)
    expect(isIncomeDirectionBudget('expense')).toBe(false)
    expect(isIncomeDirectionBudget('debt')).toBe(false)
    expect(isIncomeDirectionBudget('archive')).toBe(false)
    expect(isIncomeDirectionBudget(undefined)).toBe(false)
  })

  it('een income-budget houdt zijn positieve rij (dat IS daar de realisatie)', () => {
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'salaris', amount: 4328.81 },
        { budget_id: 'teruggave', amount: 73 },
      ],
      [],
      new Map([['salaris', 'income'], ['teruggave', 'income']]),
    )
    expect(map).toEqual({ salaris: 4328.81, teruggave: 73 })
  })

  it('een archive-budget houdt zijn transfers (dat IS daar de realisatie)', () => {
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'eigen-rekening', amount: -200, transaction_type: 'transfer' },
        { budget_id: 'eigen-rekening', amount: -77.56, transaction_type: 'joint_transfer' },
      ],
      [],
      new Map([['eigen-rekening', 'archive']]),
    )
    expect(map).toEqual({ 'eigen-rekening': 277.56 })
  })

  it('een savings-budget houdt een positieve inleg', () => {
    const map = buildBudgetSpendingMap(
      [{ budget_id: 'spaarpot', amount: 500 }],
      [],
      new Map([['spaarpot', 'savings']]),
    )
    expect(map).toEqual({ spaarpot: 500 })
  })

  it('archive blijft absoluut tellen — geen richting, dus geen aftrek', () => {
    // De "Deze maand: EUR X verschoven"-teller van de post "Eigen rekening".
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'eigen-rekening', amount: -200, transaction_type: 'transfer' },
        { budget_id: 'eigen-rekening', amount: 77.56, transaction_type: 'transfer' },
      ],
      [],
      new Map([['eigen-rekening', 'archive']]),
    )
    expect(map).toEqual({ 'eigen-rekening': 277.56 })
  })

  it('een debt-budget telt als uitgaven-richting: inkomst gaat eraf', () => {
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'lening', amount: -300 },
        { budget_id: 'lening', amount: 1000 },
      ],
      [],
      new Map([['lening', 'debt']]),
    )
    expect(map).toEqual({ lening: -700 })
  })

  it('twee budgetten met verschillende richting in één ronde', () => {
    const map = buildBudgetSpendingMap(
      [
        { budget_id: 'boodschappen', amount: -50 },
        { budget_id: 'boodschappen', amount: 6000 },
        { budget_id: 'salaris', amount: 4328.81 },
      ],
      [],
      new Map([['boodschappen', 'expense'], ['salaris', 'income']]),
    )
    // Uitgaven-richting trekt af, inkomsten-richting telt gewoon op.
    expect(map).toEqual({ boodschappen: -5950, salaris: 4328.81 })
  })

  it('onbekend budget-type krijgt geen aftrek (bewering vereist kennis)', () => {
    const map = buildBudgetSpendingMap(
      [{ budget_id: 'onbekend', amount: 6000 }],
      [],
      new Map(),
    )
    expect(map).toEqual({ onbekend: 6000 })
  })

  it('isExpenseDirectionBudget dekt precies expense en debt', () => {
    expect(isExpenseDirectionBudget('expense')).toBe(true)
    expect(isExpenseDirectionBudget('debt')).toBe(true)
    expect(isExpenseDirectionBudget('income')).toBe(false)
    expect(isExpenseDirectionBudget('savings')).toBe(false)
    expect(isExpenseDirectionBudget('archive')).toBe(false)
    expect(isExpenseDirectionBudget(undefined)).toBe(false)
    expect(isExpenseDirectionBudget(null)).toBe(false)
  })

  it('spendingContribution: dezelfde rij, andere richting, ander teken', () => {
    const inkomstRij = { budget_id: 'x', amount: 6000 }
    expect(spendingContribution(inkomstRij, 'expense')).toBe(-6000)
    expect(spendingContribution(inkomstRij, 'income')).toBe(6000)
  })

  it('spendingContribution: transfer draagt 0 bij op een uitgaven-budget', () => {
    expect(spendingContribution({ budget_id: 'x', amount: -500, transaction_type: 'transfer' }, 'expense')).toBe(0)
    expect(spendingContribution({ budget_id: 'x', amount: -500, transaction_type: 'joint_transfer' }, 'debt')).toBe(0)
    // Op archive telt de transfer juist wel mee (dat IS daar de realisatie).
    expect(spendingContribution({ budget_id: 'x', amount: -500, transaction_type: 'transfer' }, 'archive')).toBe(500)
  })
})

describe('spentForBudget — parent-rollup', () => {
  const spending = { parent: 5, kid1: 30, kid2: 70, blad: 12 }

  it('parent met kinderen = som van de kinderen (niet zijn eigen directe besteding)', () => {
    expect(spentForBudget('parent', ['kid1', 'kid2'], spending)).toBe(100)
  })

  it('blad-budget = zijn eigen besteding', () => {
    expect(spentForBudget('blad', [], spending)).toBe(12)
  })

  it('ontbrekend budget = 0', () => {
    expect(spentForBudget('x', [], spending)).toBe(0)
  })
})

describe('weergave-klemmen bij een negatieve besteding', () => {
  // De SOM mag negatief zijn (eigenaarskeuze: laat zien dat er netto geld
  // binnenkwam). De WEERGAVE klemt: geen negatief percentage, geen negatieve
  // ringvulling, geen vrijheidstijd.

  it('percentage is 0 bij een negatief bedrag', () => {
    expect(budgetSpentPct(-6735, 1642)).toBe(0)
    expect(budgetSpentPct(-1, 1642)).toBe(0)
  })

  it('ringvulling is 0 bij een negatief bedrag', () => {
    expect(budgetFillRatio(-6735, 1642)).toBe(0)
  })

  it('percentage en vulling blijven normaal bij een positief bedrag', () => {
    expect(budgetSpentPct(821, 1642)).toBe(50)
    expect(budgetFillRatio(821, 1642)).toBeCloseTo(0.5)
  })

  it('percentage klemt nog steeds op 100 bij overschrijding', () => {
    expect(budgetSpentPct(9265, 1642)).toBe(100)
    expect(budgetFillRatio(9265, 1642)).toBe(1)
  })

  it('limiet 0 of negatief geeft 0, geen deling door nul', () => {
    expect(budgetSpentPct(500, 0)).toBe(0)
    expect(budgetFillRatio(500, 0)).toBe(0)
    expect(budgetSpentPct(500, -10)).toBe(0)
  })

  it('geen vrijheidstijd bij een negatief totaal', () => {
    expect(showsFreedomTime(-6735)).toBe(false)
    expect(showsFreedomTime(-0.01)).toBe(false)
    expect(showsFreedomTime(0)).toBe(true)
    expect(showsFreedomTime(1265)).toBe(true)
  })
})

describe('budgetBarPct — onder geklemd, boven vrij', () => {
  it('negatief wordt 0 (geen ongeldige CSS-breedte)', () => {
    expect(budgetBarPct(-6735, 1642)).toBe(0)
  })

  it('boven de 100 blijft ONgeklemd: de over-budget-staart moet zichtbaar blijven', () => {
    expect(budgetBarPct(3284, 1642)).toBe(200)
    expect(budgetBarPct(9265, 1642)).toBeCloseTo(564.25, 2)
  })

  it('verschilt daarin bewust van budgetSpentPct', () => {
    expect(budgetSpentPct(3284, 1642)).toBe(100)
    expect(budgetBarPct(3284, 1642)).toBe(200)
  })

  it('limiet 0 geeft 0', () => {
    expect(budgetBarPct(500, 0)).toBe(0)
  })
})
