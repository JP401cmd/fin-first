import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TransactieTijdlijn, type AccountOption } from './transactie-tijdlijn'
import { accountSourceSuffix } from '@/components/core/account-source-icon'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * Stub voor de gedeelde dagtarief-bron (`DailyExpenseProvider` →
 * `/api/daily-expense-rate` → `lib/expense-rate.ts`). De provider fetcht; in een
 * component-test zetten we het canonieke tarief hier rechtstreeks, zodat een test
 * kan bewijzen WELKE grondslag de dagkop leest.
 *
 * De defaults zijn bewust de begintoestand van de echte context (`loading: true`,
 * geen tarief): elke test die het tarief niet zelf zet, ziet exact wat een
 * gebruiker vóór het antwoord van de API ziet — geen vrijheidsregel.
 */
const dagtarief = vi.hoisted(() => ({
  dailyExpenseRate: 0,
  loading: true,
  source: 'none' as 'transactions' | 'none',
  dataMonths: 0,
}))

vi.mock('@/components/app/freedom-time-label', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/freedom-time-label')>()),
  useDailyExpenseRate: () => dagtarief,
}))

beforeEach(() => {
  dagtarief.dailyExpenseRate = 0
  dagtarief.loading = true
  dagtarief.source = 'none'
  dagtarief.dataMonths = 0
})

const base: AnalysisTransaction = {
  id: '1', date: '2026-01-19', amount: -70.76, description: 'DUIVEN, 6921RJ, NLD, 14:10',
  counterparty_name: 'Hornbach Duiven', counterparty_iban: null, budget_id: null, category: null,
  account_id: 'acc1', account_name: 'Betaal', is_income: false, transaction_type: null, bank_code: 'bc',
  running_balance: 901.63, creditor_id: null, fx_amount: null, fx_currency: null, fx_rate: null,
}

describe('TransactieTijdlijn', () => {
  it('toont opgeschoonde naam + bedrag', () => {
    render(<TransactieTijdlijn transactions={[base]} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText('Hornbach')).toBeInTheDocument()
    // Transacties tonen centen (formatCurrencyDecimals): €70,76. Het bedrag staat
    // zowel in het dagkop-totaal als op de regel; assert op de cijfers (niet het
    // euro-glyph, dat een non-breaking space kan dragen).
    expect(screen.getAllByText(/70,76/).length).toBeGreaterThan(0)
  })
  it('toont lopend saldo alleen als aanwezig (graceful degradation)', () => {
    const { rerender } = render(<TransactieTijdlijn transactions={[base]} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.getByText(/saldo/i)).toBeInTheDocument()
    rerender(<TransactieTijdlijn transactions={[{ ...base, running_balance: null }]} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    expect(screen.queryByText(/saldo/i)).not.toBeInTheDocument()
  })
  it('filtert op Inkomsten-chip', () => {
    const txns: AnalysisTransaction[] = [
      { ...base, id: 'x', amount: -10, counterparty_name: 'Uitgave', description: 'desc-x' },
      { ...base, id: 'y', amount: 50, counterparty_name: 'Inkomst', description: 'desc-y', transaction_type: null, bank_code: 'cb', is_income: true },
    ]
    render(<TransactieTijdlijn transactions={txns} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /inkomsten/i }))
    expect(screen.getByText('Inkomst')).toBeInTheDocument()
    expect(screen.queryByText('Uitgave')).not.toBeInTheDocument()
  })
  it('lege staat toont geen eigen koppel/importeer-CTA (banner op de pagina dekt dit al)', () => {
    render(<TransactieTijdlijn transactions={[]} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
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
    render(<TransactieTijdlijn transactions={txns} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
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

/**
 * REGRESSIE (M22) — de dagkop rekent op het canonieke dagtarief.
 *
 * Given een bekend canoniek dagtarief uit de gedeelde bron, When de tijdlijn een
 * dagkop rendert, Then komt het aantal vrijheidsdagen uit DAT tarief — en beweegt
 * het niet mee met de transacties die toevallig in beeld staan.
 *
 * Wat deze drie asserties tegenhouden: hier stond een eigen
 * `avgDailyExpense(transactions, windowDays)`, die de uitgaven van het zichtbare
 * filtervenster door de vensterlengte deelde. Daardoor kantelde de wisselkoers
 * "€ → tijd" mee met elke periodekeuze en elk filter — € 2.500 las op de
 * transactielijst als 6000,0 vrijheidsdagen en op de check-in als 6083: twee
 * koersen binnen één app, op precies het scherm dat "geld is opgeslagen tijd" het
 * vaakst uitspreekt. Vóór de fix rendeerde de eerste case hieronder
 * "≈ 30,0 vrijheidsdagen kwijt" i.p.v. "≈ 3,0".
 */
describe('TransactieTijdlijn — dagkop leest het canonieke dagtarief (M22)', () => {
  /** Eén post op één dag; de dagkop telt netto over de dag. */
  function post(id: string, date: string, amount: number): AnalysisTransaction {
    return { ...base, id, date, amount, counterparty_name: `Post ${id}`, description: id }
  }

  function toon(transactions: AnalysisTransaction[]) {
    return render(
      <TransactieTijdlijn
        transactions={transactions}
        accounts={[]}
        selectedAccountId={null}
        onSelectAccount={() => {}}
      />,
    )
  }

  beforeEach(() => {
    dagtarief.dailyExpenseRate = 30
    dagtarief.loading = false
    dagtarief.source = 'transactions'
    dagtarief.dataMonths = 12
  })

  it('deelt het netto dagbedrag door het tarief uit de gedeelde bron', () => {
    // € 90 netto uitgegeven ÷ € 30/dag = 3,0 vrijheidsdagen.
    toon([post('a', '2026-01-19', -90)])
    expect(screen.getByText(/≈ 3,0 vrijheidsdagen kwijt/)).toBeInTheDocument()
  })

  it('houdt dat label vast wanneer de rest van de lijst verandert', () => {
    // De discriminerende toets: een tweede dag van € 3.000 verandert wél het
    // gemiddelde van het zichtbare venster, maar niet het canonieke dagtarief.
    // Het label van 19 januari hoort dus identiek te blijven.
    const { unmount } = toon([post('a', '2026-01-19', -90)])
    expect(screen.getByText(/≈ 3,0 vrijheidsdagen kwijt/)).toBeInTheDocument()
    unmount()

    toon([post('a', '2026-01-19', -90), post('b', '2026-01-18', -3000)])
    expect(screen.getByText(/≈ 3,0 vrijheidsdagen kwijt/)).toBeInTheDocument()
  })

  it('laat de vrijheidsregel weg zolang er geen tarief bekend is, maar houdt het bedrag', () => {
    // Vóór het antwoord van /api/daily-expense-rate is er geen eerlijke koers.
    // Dan liever geen tijdclaim dan een verzonnen tijdclaim — zelfde degradatie
    // als de buur `bulk/bulk-impact.tsx`.
    dagtarief.dailyExpenseRate = 0
    dagtarief.loading = true
    dagtarief.source = 'none'

    toon([post('a', '2026-01-19', -90)])
    expect(screen.queryByText(/vrijheidsdag/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/90,00/).length).toBeGreaterThan(0)
  })
})
