// Onbekend is geen nul (ADR 0131, UR3-01): de kassabon toont bij een
// onthouden oordeel geen totaal en geen beoordeling, en de weggevallen
// pijlers als "nog niet bekend" in plaats van 0 %.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { HealthScoreReceipt } from './health-score-receipt'
import { computeHealthScoreFromInputs, type HealthScoreInput } from '@/lib/financial-health'
import { GRONDSLAG_ONBEKEND_LABEL } from '@/lib/grondslag-guard'

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openWithContext: vi.fn(), openChat: vi.fn() }),
}))

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

describe('HealthScoreReceipt — onbekend inkomen (ADR 0131)', () => {
  it('geen totaalscore, geen beoordeling; wel de zin en de knop', () => {
    const health = computeHealthScoreFromInputs(sanne, true)
    render(<HealthScoreReceipt health={health} />)

    expect(screen.queryByLabelText(/Totaalscore/)).toBeNull()
    expect(screen.queryByText('Beoordeling')).toBeNull()
    expect(screen.getByText(/inkomen en uitgaven nog niet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Vul je inkomen en uitgaven in' })).toBeTruthy()
  })

  it("de weggevallen pijlers staan als 'nog niet bekend', niet als 0%", () => {
    const health = computeHealthScoreFromInputs(sanne, true)
    render(<HealthScoreReceipt health={health} />)

    const sectie = screen.getByLabelText('Pijlers die nog niet bekend zijn')
    for (const naam of ['Spaarquote', 'Noodfonds', 'Schuldenlast', 'FIRE-voortgang']) {
      expect(within(sectie).getByText(naam)).toBeTruthy()
    }
    expect(within(sectie).getAllByText(GRONDSLAG_ONBEKEND_LABEL.toLowerCase()).length).toBe(4)
    // Nergens een nul-pijler die als meting leest.
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.queryByText(/× salaris/)).toBeNull()
  })
})
