/**
 * Regressie UR2-18 — "geen plausibiliteitscheck op extreme transactiebedragen".
 *
 * Een uitgave van €99.999.999 werd zonder enige wedervraag opgeslagen en werkte
 * daarna door in élk aggregaat: saldo, spaarquote, gezondheidsgetal, briefing.
 * De invoer is niet ongeldig — hij is onwaarschijnlijk. Dat vraagt om een
 * VRAAG, niet om een cap: een harde grens zou een legitieme grote boeking
 * blokkeren.
 *
 * Deze suite borgt de twee netten die daarvoor in de plaats komen:
 *  1. de wedervraag vóór opslaan — op het NIEUWE én het BEWERK-pad;
 *  2. de ongedaan-maken-toast ná opslaan van een nieuwe, uitzonderlijke rij.
 *
 * En even belangrijk: dat een gewoon bedrag niets extra's te verduren krijgt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransactionForm } from './transaction-form'
import { TRANSACTION_AMOUNT_CONFIRM_THRESHOLD } from '@/lib/transactions/amount-plausibility'
import type { Toast } from '@/components/app/toast-provider'
import type { Budget } from '@/lib/budget-data'

// ── Supabase mock ──────────────────────────────────────────────
// Legt inserts, updates én deletes vast; elke keten-methode geeft de builder
// terug en de builder is thenable, zodat `await` op elk punt in de keten werkt.

type Payload = Record<string, unknown>
let inserts: { table: string; payload: Payload }[] = []
let updates: { table: string; payload: Payload }[] = []
let deletes: { table: string }[] = []

function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'is', 'in', 'ilike', 'gte', 'lte', 'order', 'limit', 'range']) {
    builder[method] = () => builder
  }
  builder.insert = (payload: Payload) => {
    inserts.push({ table, payload })
    return builder
  }
  builder.update = (payload: Payload) => {
    updates.push({ table, payload })
    return builder
  }
  builder.delete = () => {
    deletes.push({ table })
    return builder
  }
  builder.single = () => Promise.resolve({ data: { id: 'new-tx' }, error: null })
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
  builder.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data: [], error: null })
  return builder
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => makeQueryBuilder(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))

// Dagtarief: gemockt zodat de vrijheidstijd-regel in de wedervraag deterministisch
// is (de echte provider haalt 'm bij /api/daily-expense-rate op).
vi.mock('@/components/app/freedom-time-label', () => ({
  useDailyExpenseRate: () => ({
    dailyExpenseRate: 100,
    loading: false,
    source: 'transactions' as const,
    dataMonths: 12,
  }),
}))

let toasts: Omit<Toast, 'id'>[] = []
vi.mock('@/components/app/toast-provider', () => ({
  useOptionalToast: () => ({
    toasts: [],
    addToast: (toast: Omit<Toast, 'id'>) => {
      toasts.push(toast)
    },
    removeToast: () => {},
  }),
}))

// ── Testdata ───────────────────────────────────────────────────

const BOODSCHAPPEN = {
  id: 'b-food',
  name: 'Boodschappen',
  slug: null,
  icon: 'Circle',
  description: null,
  default_limit: 100,
  budget_type: 'expense',
  parent_id: null,
} as Budget

const BUDGET_GROUPS = [{ parent: BOODSCHAPPEN, children: [] }]

const BOVEN_DREMPEL = String(TRANSACTION_AMOUNT_CONFIRM_THRESHOLD)
const ONDER_DREMPEL = String(TRANSACTION_AMOUNT_CONFIRM_THRESHOLD - 1)
/** Het bedrag uit de bevinding zelf. */
const GEMELD_BEDRAG = '99999999'

function renderNieuw() {
  return render(
    <TransactionForm
      accountId="acc-1"
      budgetGroups={BUDGET_GROUPS}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
}

function vulIn(bedrag: string, omschrijving = 'Tikfout') {
  fireEvent.change(screen.getByLabelText(/Bedrag/), { target: { value: bedrag } })
  fireEvent.change(screen.getByLabelText('Beschrijving'), { target: { value: omschrijving } })
  fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))
}

/** De INSERT op transactions (de recurring-insert is een andere tabel). */
function txInsert(): Payload | undefined {
  return inserts.find((i) => i.table === 'transactions')?.payload
}

beforeEach(() => {
  inserts = []
  updates = []
  deletes = []
  toasts = []
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ has_household: false }) })),
  )
})

describe('TransactionForm — wedervraag bij een uitzonderlijk bedrag (UR2-18)', () => {
  it('houdt het opslaan tegen en stelt de vraag bij het gemelde bedrag', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)

    expect(await screen.findByText('Klopt dit bedrag?')).toBeTruthy()
    // Cruciaal: er is nog niets weggeschreven — de vraag komt vóór de insert.
    expect(txInsert()).toBeUndefined()
  })

  it('vertaalt het bedrag naar vrijheidstijd, want daar valt een extra nul wél op', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)

    expect(await screen.findByTestId('tx-bedrag-bevestiging-vrijheid')).toBeTruthy()
  })

  it('vraagt door vanaf de drempel, en zwijgt er net onder', async () => {
    const { unmount } = renderNieuw()
    vulIn(BOVEN_DREMPEL)
    expect(await screen.findByText('Klopt dit bedrag?')).toBeTruthy()
    unmount()

    inserts = []
    renderNieuw()
    vulIn(ONDER_DREMPEL)
    await waitFor(() => expect(txInsert()).toBeDefined())
    expect(screen.queryByText('Klopt dit bedrag?')).toBeNull()
  })

  it('"Ja, dit klopt" slaat het bedrag alsnog op', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)
    fireEvent.click(await screen.findByTestId('tx-bedrag-bevestigen'))

    await waitFor(() => expect(txInsert()).toBeDefined())
    // Uitgave ⇒ negatief weggeschreven, met exact het ingevoerde bedrag.
    expect(txInsert()).toMatchObject({ amount: -99_999_999 })
  })

  it('"Aanpassen" sluit de vraag zonder iets weg te schrijven', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)
    fireEvent.click(await screen.findByRole('button', { name: 'Aanpassen' }))

    await waitFor(() => expect(screen.queryByText('Klopt dit bedrag?')).toBeNull())
    expect(txInsert()).toBeUndefined()
    // Het formulier staat er nog mét de ingevulde regel — geen herinvoer.
    expect((screen.getByLabelText(/Bedrag/) as HTMLInputElement).value).toBe(GEMELD_BEDRAG)
  })

  it('vraagt óók door op het bewerk-pad — daar ontstaat dezelfde tikfout', async () => {
    render(
      <TransactionForm
        transaction={{
          id: 'tx-1',
          account_id: 'acc-1',
          budget_id: 'b-food',
          date: '2026-08-01',
          amount: -12.5,
          description: 'Boodschappen',
          counterparty_name: null,
          counterparty_iban: null,
          is_income: false,
          notes: null,
          category_source: 'manual',
          transaction_type: null,
        }}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Bedrag/), { target: { value: GEMELD_BEDRAG } })
    fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))

    expect(await screen.findByText('Klopt dit bedrag?')).toBeTruthy()
    expect(updates.some((u) => u.table === 'transactions')).toBe(false)
  })
})

describe('TransactionForm — ongedaan maken ná opslaan (UR2-18)', () => {
  it('biedt een ongedaan-maken-actie aan bij een uitzonderlijk bedrag', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)
    fireEvent.click(await screen.findByTestId('tx-bedrag-bevestigen'))

    await waitFor(() => expect(toasts.length).toBe(1))
    expect(toasts[0].action?.label).toBe('Ongedaan maken')
  })

  it('verwijdert de zojuist opgeslagen rij wanneer je die actie gebruikt', async () => {
    renderNieuw()

    vulIn(GEMELD_BEDRAG)
    fireEvent.click(await screen.findByTestId('tx-bedrag-bevestigen'))
    await waitFor(() => expect(toasts.length).toBe(1))

    deletes = []
    toasts[0].action?.onClick()

    await waitFor(() => expect(deletes.some((d) => d.table === 'transactions')).toBe(true))
  })

  it('laat een gewoon bedrag met rust — geen toast, geen extra klik', async () => {
    renderNieuw()

    vulIn('12.50')

    await waitFor(() => expect(txInsert()).toBeDefined())
    expect(toasts).toHaveLength(0)
    expect(screen.queryByText('Klopt dit bedrag?')).toBeNull()
  })
})
