import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TransactieTijdlijn, type AccountOption } from './transactie-tijdlijn'
import { accountSourceSuffix } from '@/components/core/account-source-icon'
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

/**
 * De rekening-filterpills dragen sinds fase 7 een herkomst-symbool dat óók status
 * is (`linked-broken` vraagt om een handeling). Het symbool is `aria-hidden` — het
 * zou als geneste naam nooit voorgelezen worden — dus die betekenis MOET in de
 * accessible name van de pill staan. Zonder deze twee asserties viel dat verlies
 * stil terug: de pill heette alleen `{label}`.
 */
describe('TransactieTijdlijn — rekening-filterpills', () => {
  function account(overrides: Partial<AccountOption> = {}): AccountOption {
    return { id: 'acc1', name: 'Betaal', bankName: 'ING', ibanTail: '4321', connected: true, ...overrides }
  }

  function renderPills(accounts: AccountOption[]) {
    return render(
      <TransactieTijdlijn
        transactions={[base]}
        windowDays={30}
        accounts={accounts}
        selectedAccountId={null}
        onSelectAccount={() => {}}
      />,
    )
  }

  it('noemt de herkomst in de accessible name, met het zichtbare label vóóraan', () => {
    renderPills([account()])
    // Zichtbare tekst blijft in de naam (WCAG 2.5.3 label-in-name).
    expect(
      screen.getByRole('button', { name: `Betaal — ${accountSourceSuffix('linked')}` }),
    ).toBeInTheDocument()
  })

  it('onderscheidt handmatig van gekoppeld in die naam', () => {
    renderPills([account({ id: 'acc2', name: 'Handmatig', connected: false })])
    expect(
      screen.getByRole('button', { name: `Handmatig — ${accountSourceSuffix('manual')}` }),
    ).toBeInTheDocument()
  })

  it('laat "Alle rekeningen" zonder suffix — die pill draagt geen herkomst', () => {
    renderPills([account()])
    expect(screen.getByRole('button', { name: 'Alle rekeningen' })).toBeInTheDocument()
  })

  it('kapt een lange rekeningnaam visueel af en houdt de volledige naam bereikbaar (TXN-4)', () => {
    const lang = 'Betaalrekening gezamenlijk ABN AMRO'
    renderPills([account({ name: lang })])

    // De volledige naam blijft in de DOM (accessible name + voorlezer) …
    expect(
      screen.getByRole('button', { name: `${lang} — ${accountSourceSuffix('linked')}` }),
    ).toBeInTheDocument()
    // … en is als hover-titel bereikbaar op het label zelf, dat visueel afkapt.
    const labelSpan = screen.getByTitle(lang)
    expect(labelSpan.textContent).toBe(lang)
    expect(labelSpan.className).toContain('truncate')
  })

  it('geeft "Alle rekeningen" geen afkapping of titel — vaste, korte tekst', () => {
    renderPills([account()])
    expect(screen.queryByTitle('Alle rekeningen')).not.toBeInTheDocument()
  })

  it('erft de tekstkleur alleen op de ACTIEVE pill', () => {
    // `inheritColor` op een inactieve pill gooit de tint weg die de toestand
    // draagt; dan moet een 12px Unlink het alleen van een 12px Link2 winnen.
    const { container, unmount } = renderPills([account()])
    const inactive = container.querySelector('[aria-label="Kies rekening"] [title]')
    expect(inactive?.className).toContain('--ink-')
    unmount()

    const actief = render(
      <TransactieTijdlijn
        transactions={[base]}
        windowDays={30}
        accounts={[account()]}
        selectedAccountId="acc1"
        onSelectAccount={() => {}}
      />,
    )
    expect(
      actief.container.querySelector('[aria-label="Kies rekening"] [title]')?.className,
    ).not.toContain('--ink-')
  })
})
