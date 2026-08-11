/**
 * Componenttest voor de bulkbewerk-overlay — de drie regels die niet mogen
 * verschuiven, gemeten op het gerenderde scherm en niet op de state:
 *
 *  1. De kopcheckbox pakt alléén de zichtbare pagina (50), nooit alle treffers
 *     (340) — AC3.
 *  2. "Selecteer alle 340 gevonden transacties" is een APARTE affordance met het
 *     getal in de tekst, en pas dán staat de teller op 340 — F7/AC3.
 *  3. Een filterwissel laat de selectie vervallen en meldt dat zichtbaar — AC4.
 *
 * De vrijheidstijd-regel wordt meegetoetst tegen het canonieke dagtarief uit
 * `/api/daily-expense-rate` (R-NF6): niet "er staat een getal", maar exact de
 * uitkomst die `calculateFreedomTime` voor dezelfde invoer geeft.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { TransactionSearchRow } from '@/lib/transactions/bulk-contract'
import { BulkBewerkenOverlay, type BulkBudgetGroup } from './bulk-bewerken-overlay'

const TOTAL = 340
const PAGE_SIZE = 50
/** Vast dagtarief, zoals GET /api/daily-expense-rate het canoniek levert. */
const DAILY_RATE = 72.33

function makeRow(i: number): TransactionSearchRow {
  return {
    id: `tx-${i}`,
    date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    amount: -25,
    description: `Boeking ${i}`,
    counterparty_name: 'Albert Heijn',
    budget_id: null,
    account_id: 'acc-1',
    is_split: false,
    transaction_type: null,
    is_bank_linked: false,
  }
}

const ROWS = Array.from({ length: PAGE_SIZE }, (_, i) => makeRow(i))

const BUDGET_GROUPS: BulkBudgetGroup[] = [
  {
    parent: { id: 'b-parent', name: 'Vaste lasten', budget_type: 'expense', slug: 'vaste-lasten' },
    children: [{ id: 'b-1', name: 'Boodschappen', slug: 'boodschappen' }],
  },
]

let searchCalls: unknown[] = []
let manifestCalls: { ids?: string[] }[] = []
let deleteCalls: { ids: string[]; expectedCount: number; confirmCount?: number }[] = []
/** Tegenboekingen die de server voor een EXPLICIETE selectie oplost. */
let counterpartIdsForExplicit: string[] = []

function installFetchMock() {
  searchCalls = []
  manifestCalls = []
  deleteCalls = []
  counterpartIdsForExplicit = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : {}

      if (url.includes('/api/daily-expense-rate')) {
        return jsonResponse({ dailyExpenseRate: DAILY_RATE, dataMonths: 12 })
      }
      if (url.includes('/api/household/status')) {
        return jsonResponse({ has_household: false })
      }
      // LET OP: de manifest-route ligt ónder /search, dus die eerst matchen —
      // anders vangt de zoek-tak hem af en denkt de test dat er nooit
      // gematerialiseerd is.
      if (url.includes('/api/transactions/search/manifest')) {
        manifestCalls.push(body)
        // De id-tak (expliciete selectie) en de criterium-tak leveren dezelfde
        // vorm — dat is de hele bedoeling van ADR 0104 besluit 1.
        const ids: string[] = body.ids ?? Array.from({ length: TOTAL }, (_, i) => `tx-${i}`)
        return jsonResponse({
          ids,
          count: ids.length,
          sumPositief: 0,
          sumNegatief: -25 * ids.length,
          splitIds: [],
          linkedCounterpartIds: body.ids ? counterpartIdsForExplicit : [],
          bankLinkedCount: 0,
          truncated: false,
        })
      }
      if (url.includes('/api/transactions/bulk-delete')) {
        deleteCalls.push(body)
        return jsonResponse({
          requested: body.ids.length,
          deleted: body.ids.length,
          orphansCleared: counterpartIdsForExplicit.length,
          failedIds: [],
          truncated: false,
        })
      }
      if (url.includes('/api/transactions/search')) {
        searchCalls.push(body)
        return jsonResponse({
          rows: ROWS,
          total: TOTAL,
          page: body.page ?? 1,
          pageSize: PAGE_SIZE,
        })
      }
      return jsonResponse({})
    }),
  )
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response
}

function renderOverlay() {
  return render(
    <DailyExpenseProvider>
      <BulkBewerkenOverlay
        open
        onClose={() => {}}
        budgetGroups={BUDGET_GROUPS}
        budgetNameById={new Map([['b-1', 'Boodschappen']])}
        accounts={[{ id: 'acc-1', name: 'Betaalrekening' }]}
      />
    </DailyExpenseProvider>,
  )
}

/** De `role="status"`-regio met de permanente selectieteller. */
function statusRegion() {
  return screen.getAllByRole('status').find((el) => el.textContent?.includes('geselecteerd'))!
}

beforeEach(() => {
  installFetchMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BulkBewerkenOverlay — zoeken en tellen', () => {
  it('toont het totale aantal treffers naast de geladen pagina (AC2)', async () => {
    renderOverlay()
    expect(await screen.findByTestId('bulk-total')).toHaveTextContent('340 resultaten')
    expect(await screen.findByLabelText(/Selecteer de 50 transacties op deze pagina/)).toBeTruthy()
  })
})

describe('BulkBewerkenOverlay — de kopcheckbox pakt alleen de pagina (AC3)', () => {
  it('zet de teller op 50, niet op 340, en biedt "alle 340" apart aan', async () => {
    renderOverlay()
    const header = await screen.findByLabelText(/Selecteer de 50 transacties op deze pagina/)

    fireEvent.click(header)

    await waitFor(() => {
      expect(within(statusRegion()).getByText('50 geselecteerd')).toBeTruthy()
    })
    expect(statusRegion().textContent).not.toContain('340 geselecteerd')

    // De aparte affordance, mét het getal in de tekst.
    expect(screen.getByRole('button', { name: 'Selecteer alle 340 gevonden transacties' })).toBeTruthy()
    // En de manifest-route is pas aangeroepen ná die expliciete klik.
    expect(manifestCalls).toHaveLength(0)
  })

  it('telt pas 340 na de expliciete keuze, en materialiseert die één keer', async () => {
    renderOverlay()
    fireEvent.click(await screen.findByLabelText(/Selecteer de 50 transacties op deze pagina/))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecteer alle 340 gevonden transacties' }),
    )

    await waitFor(() => {
      expect(within(statusRegion()).getByText('340 geselecteerd')).toBeTruthy()
    })
    expect(manifestCalls).toHaveLength(1)
  })
})

describe('BulkBewerkenOverlay — impact van de selectie (AC5, R-NF6)', () => {
  it('toont de vrijheidstijd die het canonieke dagtarief oplevert', async () => {
    renderOverlay()
    fireEvent.click(await screen.findByLabelText(/Selecteer de 50 transacties op deze pagina/))

    // 50 boekingen × € 25 = € 1.250 — omgerekend met exact hetzelfde dagtarief
    // en dezelfde engine als de UI zegt te consumeren.
    const verwacht = formatFreedomTimeString(calculateFreedomTime(50 * 25, DAILY_RATE), 'long')
    await waitFor(() => {
      expect(screen.getAllByText(new RegExp(`≈\\s*${verwacht}\\s*vrijheid`)).length).toBeGreaterThan(0)
    })
  })
})

describe('BulkBewerkenOverlay — ook een expliciete selectie wordt gematerialiseerd (C1)', () => {
  /** Vink één rij aan en open de verwijder-bevestiging. */
  async function selecteerEenRijEnOpenVerwijderen() {
    renderOverlay()
    fireEvent.click(await screen.findByLabelText(/Selecteer Boeking 0 van/))
    fireEvent.click(await screen.findByRole('button', { name: 'Verwijderen…' }))
  }

  it('haalt vóór de bevestiging het manifest op voor de aangevinkte id’s', async () => {
    await selecteerEenRijEnOpenVerwijderen()

    await waitFor(() => {
      expect(manifestCalls).toHaveLength(1)
    })
    // Id-tak: de id's reizen mee, het criterium blijft weg (de route weigert de
    // combinatie).
    expect(manifestCalls[0].ids).toEqual(['tx-0'])
    expect(Object.keys(manifestCalls[0])).toEqual(['ids'])
  })

  it('telt de tegenboeking mee in de knoptekst — ook onder de type-to-confirm-drempel', async () => {
    // Eén aangevinkte rij met een tegenboeking buiten de selectie. Vóór de fix
    // stond hier "Verwijder 1 transactie" terwijl de server er 2 verwijderde:
    // onder de drempel, dus zonder tweede poort en zonder herstelpad.
    counterpartIdsForExplicit = ['tx-tegenboeking']
    await selecteerEenRijEnOpenVerwijderen()

    expect(await screen.findByRole('button', { name: 'Verwijder 2 transacties' })).toBeTruthy()
  })

  it('stuurt het bevestigde aantal mee, niet de lengte van de eigen array (M7)', async () => {
    counterpartIdsForExplicit = ['tx-tegenboeking']
    await selecteerEenRijEnOpenVerwijderen()

    fireEvent.click(await screen.findByRole('button', { name: 'Verwijder 2 transacties' }))

    await waitFor(() => {
      expect(deleteCalls).toHaveLength(1)
    })
    // `expectedCount` is het getal uit het manifest (de selectie zelf, zonder
    // tegenboekingen — die telt de server er zelf bij), en `ids` is de bevroren
    // lijst uit datzelfde manifest.
    expect(deleteCalls[0].ids).toEqual(['tx-0'])
    expect(deleteCalls[0].expectedCount).toBe(1)
    expect(deleteCalls[0].confirmCount).toBeUndefined()
  })
})

describe('BulkBewerkenOverlay — selectie vervalt bij een filterwissel (AC4)', () => {
  it('wist de selectie en meldt dat zichtbaar', async () => {
    renderOverlay()
    fireEvent.click(await screen.findByLabelText(/Selecteer de 50 transacties op deze pagina/))
    await waitFor(() => {
      expect(within(statusRegion()).getByText('50 geselecteerd')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Richting'), { target: { value: 'expense' } })

    await waitFor(() => {
      expect(within(statusRegion()).getByText('Niets geselecteerd')).toBeTruthy()
    })
    expect(statusRegion().textContent).toMatch(/selectie is vervallen/i)
    // En de zoekopdracht is opnieuw gedraaid met het nieuwe criterium.
    await waitFor(() => {
      expect(searchCalls.some((c) => (c as { direction?: string }).direction === 'expense')).toBe(true)
    })
  })
})
