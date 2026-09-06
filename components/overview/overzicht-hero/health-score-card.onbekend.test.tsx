// Onbekend is geen nul (ADR 0131, UR3-01): de hero-kaart toont bij een
// onthouden oordeel géén cijfer en géén band-label — één zin en één knop.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthScoreCard } from './health-score-card'
import { computeHealthScoreFromInputs, type HealthScoreInput } from '@/lib/financial-health'
import { GRONDSLAG_ONBEKEND_KOP } from '@/lib/grondslag-guard'

/** Sanne: "Later invullen" bij inkomen én uitgaven, wél spaargeld. */
const sanne: HealthScoreInput = {
  savingsRate6m: 0,
  totalAssets: 14_000,
  totalDebts: 9_000,
  emergencyFundMonths: 0,
  freedomPct: 0,
  currentAge: 31,
  fireAgeFractional: null,
  netMonthlyIncome: 0,
  debtMonthlyPayments: 120,
  largestAssetTypeShare: 1,
  budgetCategories: [],
  incomeBasis: 'unknown',
  expensesBasis: 'unknown',
}

describe('HealthScoreCard — onbekend inkomen (ADR 0131)', () => {
  // Given: de canonieke engine met beide grondslagen 'unknown'.
  // When: de hero-kaart rendert.
  // Then: geen "van 100", geen "Kritiek", wél de kop, de zin en de knop.
  it('toont geen cijfer en geen oordeel, maar één zin en één knop', () => {
    const health = computeHealthScoreFromInputs(sanne, true)
    render(<HealthScoreCard health={health} onOpenReceipt={() => {}} />)

    expect(screen.getByTestId('health-score-onbekend')).toBeTruthy()
    expect(screen.getByText(GRONDSLAG_ONBEKEND_KOP)).toBeTruthy()
    expect(screen.getByText(/inkomen en uitgaven nog niet/)).toBeTruthy()
    const knop = screen.getByRole('link', { name: 'Vul je inkomen en uitgaven in' })
    expect(knop.getAttribute('href')).toBe('/overzicht/budget/transacties')

    expect(screen.queryByText(/van 100/)).toBeNull()
    expect(screen.queryByText(/kritiek/i)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // AC4: met bekend inkomen is het gedrag ongewijzigd.
  it('toont bij bekende grondslagen gewoon het cijfer (regressie)', () => {
    const health = computeHealthScoreFromInputs(
      { ...sanne, savingsRate6m: 20, netMonthlyIncome: 3_000, incomeBasis: 'manual', expensesBasis: 'manual' },
      true,
    )
    render(<HealthScoreCard health={health} onOpenReceipt={() => {}} />)
    expect(screen.queryByTestId('health-score-onbekend')).toBeNull()
    expect(screen.getByText('van 100')).toBeTruthy()
  })
})
