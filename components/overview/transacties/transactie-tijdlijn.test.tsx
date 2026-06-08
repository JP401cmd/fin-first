import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TransactieTijdlijn } from './transactie-tijdlijn'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

const base: AnalysisTransaction = {
  id: '1', date: '2026-01-19', amount: -70.76, description: 'DUIVEN, 6921RJ, NLD, 14:10',
  counterparty_name: 'Hornbach Duiven', counterparty_iban: null, budget_id: null, category: null,
  account_id: 'acc1', account_name: 'Betaal', is_income: false, transaction_type: 'bc',
  running_balance: 901.63, creditor_id: null, fx_amount: null, fx_currency: null, fx_rate: null,
}

describe('TransactieTijdlijn', () => {
  it('toont opgeschoonde naam + bedrag', () => {
    render(<TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText('Hornbach')).toBeInTheDocument()
    // formatCurrency rondt af op hele euro's (app-conventie): €70,76 → "€ 71".
    // Het bedrag verschijnt zowel in de dagkop-totaal als op de regel; assert op
    // de cijfers (niet het euro-glyph, dat een non-breaking space kan dragen).
    expect(screen.getAllByText(/71/).length).toBeGreaterThan(0)
  })
  it('toont lopend saldo alleen als aanwezig (graceful degradation)', () => {
    const { rerender } = render(<TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText(/saldo/i)).toBeInTheDocument()
    rerender(<TransactieTijdlijn transactions={[{ ...base, running_balance: null }]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.queryByText(/saldo/i)).not.toBeInTheDocument()
  })
})
