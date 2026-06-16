import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CashflowInstellingenBlok } from './cashflow-instellingen-blok'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import type { SavingsRateMethod } from '@/lib/core-metrics'

/**
 * Tests voor de spaarquote-sheet: de intro-zin en de aanwezigheid van de
 * 6-maands transactie-kassabon moeten meebewegen met `savingsRateMethod`.
 * Bij 'estimate'/'net_worth_delta' produceerden de maandrijen het percentage
 * NIET, dus de transactie-breakdown mag dan niet getoond worden.
 */

function makeData(method: SavingsRateMethod): CashflowSettingsData {
  const months = Array.from({ length: 12 }, (_, i) => ({
    label: `maand ${i + 1}`,
    income: 4000,
    expenses: 3000,
  }))
  return {
    estimatedAnnualIncome: 48000,
    netMonthlyIncome: 4000,
    savingsRate6m: 25,
    targetSavingsRate: null,
    estimatedMonthlyExpenses: 3000,
    retirementExpenseMethod: 'essential_budgets',
    retirementCustomAmount: 0,
    budgetingActive: false,
    fireInput: {
      totalAssets: 0,
      totalDebts: 0,
      monthlyIncome: 4000,
      monthlyExpenses: 3000,
      yearlyMustExpenses: 36000,
      monthlyContributions: 0,
      dateOfBirth: null,
      last12MonthsIncome: 48000,
    },
    grossReturn: 0.07,
    effectiveSwr: 0.04,
    inflationRate: 0.02,
    fireStrategy: { strategy: 'perpetual', endAge: 95 },
    incomeSource: 'auto',
    expensesSource: 'auto',
    savingsRateMethod: method,
    computedMonthlyExpenses: 3000,
    savingsBudgetTotal6m: 0,
    debtAflossingTotal6m: 0,
    monthlyBreakdown: months,
  }
}

function openSavingsSheet() {
  // De spaarquote-sheet opent via klik op de "Spaarquote"-SettingCard.
  const card = screen.getByText('Spaarquote').closest('button')
  expect(card).not.toBeNull()
  fireEvent.click(card as HTMLButtonElement)
  // De sheet rendert in een portal; pak de dialog/heading-scope op via de titel.
  return screen.getByRole('dialog')
}

describe('CashflowInstellingenBlok — spaarquote-sheet methode-afhankelijk', () => {
  it("'transaction': toont de 6-maands intro + de transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData('transaction')} />)
    const sheet = openSavingsSheet()
    // Intro-zin (de <details>-bronregel bevat dezelfde frase, dus matchen op de exacte intro-tekst).
    expect(
      within(sheet).getByText(
        'Berekend over je transacties van de afgelopen 6 maanden.',
      ),
    ).toBeTruthy()
    expect(within(sheet).getByText(/Σ Inkomen \(6 mnd\)/i)).toBeTruthy()
  })

  it("'estimate': toont de 'opgegeven inkomsten en uitgaven'-intro en GEEN transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData('estimate')} />)
    const sheet = openSavingsSheet()
    expect(
      within(sheet).getByText(
        /^Geschat uit je opgegeven inkomsten en uitgaven/i,
      ),
    ).toBeTruthy()
    expect(within(sheet).queryByText(/Σ Inkomen \(6 mnd\)/i)).toBeNull()
  })

  it("'net_worth_delta': toont de 'groei van je vermogen'-intro en GEEN transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData('net_worth_delta')} />)
    const sheet = openSavingsSheet()
    expect(
      within(sheet).getByText(/^Geschat uit de groei van je vermogen/i),
    ).toBeTruthy()
    expect(within(sheet).queryByText(/Σ Inkomen \(6 mnd\)/i)).toBeNull()
  })
})
