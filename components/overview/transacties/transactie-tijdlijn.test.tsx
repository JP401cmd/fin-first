import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TransactieTijdlijn } from './transactie-tijdlijn'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

const base: AnalysisTransaction = {
  id: '1', date: '2026-01-19', amount: -70.76, description: 'DUIVEN, 6921RJ, NLD, 14:10',
  counterparty_name: 'Hornbach Duiven', counterparty_iban: null, budget_id: null, category: null,
  account_id: 'acc1', account_name: 'Betaal', is_income: false, transaction_type: null, bank_code: 'bc',
  running_balance: 901.63, creditor_id: null, fx_amount: null, fx_currency: null, fx_rate: null,
}

describe('TransactieTijdlijn', () => {
  it('toont opgeschoonde naam + bedrag', () => {
    render(<TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText('Hornbach')).toBeInTheDocument()
    // Transacties tonen centen (formatCurrencyDecimals): €70,76. Het bedrag staat
    // zowel in het dagkop-totaal als op de regel; assert op de cijfers (niet het
    // euro-glyph, dat een non-breaking space kan dragen).
    expect(screen.getAllByText(/70,76/).length).toBeGreaterThan(0)
  })
  it('toont lopend saldo alleen als aanwezig (graceful degradation)', () => {
    const { rerender } = render(<TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText(/saldo/i)).toBeInTheDocument()
    rerender(<TransactieTijdlijn transactions={[{ ...base, running_balance: null }]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.queryByText(/saldo/i)).not.toBeInTheDocument()
  })
  it('filtert op Inkomsten-chip', () => {
    const txns: AnalysisTransaction[] = [
      { ...base, id: 'x', amount: -10, counterparty_name: 'Uitgave', description: 'desc-x' },
      { ...base, id: 'y', amount: 50, counterparty_name: 'Inkomst', description: 'desc-y', transaction_type: null, bank_code: 'cb', is_income: true },
    ]
    render(<TransactieTijdlijn transactions={txns} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /inkomsten/i }))
    expect(screen.getByText('Inkomst')).toBeInTheDocument()
    expect(screen.queryByText('Uitgave')).not.toBeInTheDocument()
  })
  it('lege staat toont geen eigen koppel/importeer-CTA (banner op de pagina dekt dit al)', () => {
    render(<TransactieTijdlijn transactions={[]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText('Nog geen transacties.')).toBeInTheDocument()
    // Geen losstaande CTA-knop/link meer, en zeker niet naar de omweg-pagina.
    expect(screen.queryByText(/koppel of importeer/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('zoekt op naam', () => {
    const txns: AnalysisTransaction[] = [
      { ...base, id: 'x', amount: -10, counterparty_name: 'Hornbach Duiven', description: 'x' },
      { ...base, id: 'y', amount: -5, counterparty_name: 'Albert Heijn 1032', description: 'y' },
    ]
    render(<TransactieTijdlijn transactions={txns} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'albert' } })
    expect(screen.getByText('Albert Heijn')).toBeInTheDocument()
    expect(screen.queryByText('Hornbach')).not.toBeInTheDocument()
  })
})
