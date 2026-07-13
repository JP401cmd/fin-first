import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import HoldingTransactionLog from './holding-transaction-log'

// Bouwt N buy-transacties met dalende datum, zoals de API ze teruggeeft.
function makeTx(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `tx-${i}`,
    holding_id: 'h1',
    type: 'buy' as const,
    units: 1,
    price_per_unit: 100,
    total_amount: 100,
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    running_units: i + 1,
    running_cost_basis: (i + 1) * 100,
    running_avg_price: 100,
    realized_pnl: 0,
    cumulative_realized_pnl: 0,
    cumulative_dividends: 0,
  }))
}

const summary = {
  total_invested: 1000, total_sold: 0, realized_pnl: 0, unrealized_pnl: 0,
  dividend_income: 0, total_return: 0, current_units: 10, current_avg_price: 100, current_price: 100,
}

function mockFetch(transactions: ReturnType<typeof makeTx>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ transactions, summary }),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(makeTx(0)))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HoldingTransactionLog — paginering', () => {
  it('toont maximaal 100 rijen en een "Toon meer"-knop bij >100 transacties', async () => {
    vi.stubGlobal('fetch', mockFetch(makeTx(130)))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)

    await waitFor(() => expect(screen.getByTestId('transaction-list')).toBeInTheDocument())

    const list = screen.getByTestId('transaction-list')
    expect(within(list).getAllByTestId(/^transaction-item-/)).toHaveLength(100)

    const showMore = screen.getByTestId('show-more-transactions')
    expect(showMore).toHaveTextContent('Toon meer (30)')
  })

  it('na "Toon meer" is elke transactie bereikbaar en verdwijnt de knop', async () => {
    vi.stubGlobal('fetch', mockFetch(makeTx(130)))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)
    await waitFor(() => expect(screen.getByTestId('transaction-list')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('show-more-transactions'))

    const list = screen.getByTestId('transaction-list')
    expect(within(list).getAllByTestId(/^transaction-item-/)).toHaveLength(130)
    expect(within(list).getByTestId('transaction-item-tx-129')).toBeInTheDocument()
    expect(screen.queryByTestId('show-more-transactions')).not.toBeInTheDocument()
  })

  it('toont geen "Toon meer" bij ≤100 transacties', async () => {
    vi.stubGlobal('fetch', mockFetch(makeTx(40)))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)
    await waitFor(() => expect(screen.getByTestId('transaction-list')).toBeInTheDocument())

    expect(screen.getAllByTestId(/^transaction-item-/)).toHaveLength(40)
    expect(screen.queryByTestId('show-more-transactions')).not.toBeInTheDocument()
  })

  it('klik op een rij klapt alleen die rij uit (detail zichtbaar)', async () => {
    vi.stubGlobal('fetch', mockFetch(makeTx(5)))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)
    await waitFor(() => expect(screen.getByTestId('transaction-list')).toBeInTheDocument())

    const item = screen.getByTestId('transaction-item-tx-0')
    fireEvent.click(within(item).getByRole('button'))
    expect(within(item).getByTestId('tx-detail')).toBeInTheDocument()
    // Andere rijen blijven ingeklapt.
    expect(within(screen.getByTestId('transaction-item-tx-1')).queryByTestId('tx-detail')).not.toBeInTheDocument()
  })
})

describe('HoldingTransactionLog — transactie-eigen gegevens in uitklappaneel (M-08)', () => {
  it('toont "eenheden @ prijs" in het detailpaneel na uitklappen', async () => {
    // In compact is de "eenheden @ prijs"-regel in de rij verborgen; via het
    // uitklappaneel moet die info altijd bereikbaar blijven.
    const tx = [{ ...makeTx(1)[0], units: 12, price_per_unit: 48.2, total_amount: 578.4 }]
    vi.stubGlobal('fetch', mockFetch(tx))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)
    await waitFor(() => expect(screen.getByTestId('transaction-list')).toBeInTheDocument())

    const item = screen.getByTestId('transaction-item-tx-0')
    fireEvent.click(within(item).getByRole('button'))

    const detail = within(item).getByTestId('tx-detail')
    expect(within(detail).getByTestId('tx-units-at-price')).toHaveTextContent(/12 eenheden @/)
  })
})

describe('InlineTransactionForm — gekoppelde labels (C-06)', () => {
  async function openForm() {
    vi.stubGlobal('fetch', mockFetch(makeTx(0)))
    render(<HoldingTransactionLog holdingId="h1" holdingName="Test" />)
    await waitFor(() => expect(screen.getByTestId('new-transaction-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('new-transaction-btn'))
  }

  it('koppelt de labels van de normale (koop) tak aan hun inputs', async () => {
    await openForm()
    // Standaard txType = 'buy' → Eenheden / Prijs / Datum zichtbaar.
    expect(screen.getByLabelText(/Eenheden/)).toBe(screen.getByTestId('tx-units-input'))
    expect(screen.getByLabelText(/Prijs/)).toBe(screen.getByTestId('tx-price-input'))
    expect(screen.getByLabelText(/Datum/)).toBe(screen.getByTestId('tx-date-input'))
  })

  it('koppelt de labels van de split-tak aan hun inputs', async () => {
    await openForm()
    fireEvent.click(screen.getByTestId('tx-type-split'))
    expect(screen.getByLabelText(/Split ratio/)).toBe(screen.getByTestId('tx-units-input'))
    expect(screen.getByLabelText(/Datum/)).toBe(screen.getByTestId('tx-date-input'))
  })
})
