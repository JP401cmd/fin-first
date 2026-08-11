/**
 * Component test for TransactionForm — boeken op "Eigen rekening".
 *
 * De kern van wat hier geborgd wordt: of iets een échte inkomst/uitgave is,
 * bepaalt de hele app UITSLUITEND op `transaction_type` (`isRealAggRow` in
 * lib/server-data/tx-aggregates.ts) — niet op het budget. Een formulier dat bij
 * een keuze voor "Eigen rekening" alléén `budget_id` wegschrijft, levert dus een
 * transactie op die zichtbaar op de archive-post staat en tóch meetelt in
 * inkomsten, uitgaven, spaarquote en grenzenpotten. Dat is precies het soort
 * fout dat niets kapot maakt en alleen de cijfers stil scheeftrekt.
 *
 * Verifieert:
 *  1. "Eigen rekening" is kiesbaar in de budget-dropdown (archive-emmer wordt als
 *     platte optie getoond) en toont de uitleg dat het niet meetelt.
 *  2. Die keuze schrijft het canonieke trio: transaction_type='transfer',
 *     category_source='transfer' én het eigen-rekening-budget.
 *  3. Andersom: een bestaande verschuiving die een gewoon budget krijgt, raakt
 *     zijn markering kwijt (anders blijft een echte uitgave buiten de spaarquote).
 *  4. Een gewone budgetwijziging laat `transaction_type` ONGEMOEID — importherkomst
 *     ('DEBIT', 'payment', …) mag niet sneuvelen op een categoriewijziging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransactionForm } from './transaction-form'
import { BUDGET_SLUGS, type Budget } from '@/lib/budget-data'

// ── Supabase mock ──────────────────────────────────────────────
// Chainable builder die elke `.update(payload)` vastlegt. Elke keten-methode
// geeft de builder terug, en de builder is zelf thenable — zo werkt `await` op
// welk punt in de keten de code ook afsluit (`.eq(...)`, `.ilike(...)`, `.in(...)`).

type UpdatePayload = Record<string, unknown>
let updates: { table: string; payload: UpdatePayload }[] = []
let inserts: { table: string; payload: UpdatePayload }[] = []

function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {}
  const passthrough = ['select', 'eq', 'neq', 'is', 'in', 'ilike', 'gte', 'lte', 'order', 'limit', 'delete', 'range']
  for (const method of passthrough) {
    builder[method] = () => builder
  }
  builder.update = (payload: UpdatePayload) => {
    updates.push({ table, payload })
    return builder
  }
  builder.insert = (payload: UpdatePayload) => {
    inserts.push({ table, payload })
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

// ── Testdata ───────────────────────────────────────────────────

function budget(partial: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    slug: null,
    icon: 'Circle',
    description: null,
    default_limit: 100,
    budget_type: 'expense',
    parent_id: null,
    ...partial,
  } as Budget
}

const BOODSCHAPPEN = budget({ id: 'b-food', name: 'Boodschappen' })
const UITGAVEN_PARENT = budget({ id: 'b-parent', name: 'Vaste lasten' })
const EIGEN_REKENING_SUB = budget({
  id: 'b-eigen-sub',
  name: 'Eigen rekening',
  slug: BUDGET_SLUGS.EIGEN_REKENING_SUB,
  budget_type: 'archive',
  parent_id: 'b-eigen',
})
const EIGEN_REKENING_PARENT = budget({
  id: 'b-eigen',
  name: 'Eigen rekening',
  slug: BUDGET_SLUGS.EIGEN_REKENING,
  budget_type: 'archive',
})

const BUDGET_GROUPS = [
  { parent: UITGAVEN_PARENT, children: [BOODSCHAPPEN] },
  { parent: EIGEN_REKENING_PARENT, children: [EIGEN_REKENING_SUB] },
]

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    account_id: 'acc-1',
    budget_id: 'b-food',
    date: '2026-07-20',
    amount: -8000,
    description: 'Terug',
    counterparty_name: 'Mw L Buddingh',
    counterparty_iban: null,
    is_income: false,
    notes: null,
    category_source: 'manual',
    transaction_type: null,
    ...overrides,
  } as React.ComponentProps<typeof TransactionForm>['transaction']
}

/** Kies een budget, sla op en bevestig met "Alleen deze transactie". */
async function saveWithBudget(budgetId: string) {
  fireEvent.change(screen.getByLabelText('Budget'), { target: { value: budgetId } })
  fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))
  const scopeButton = await screen.findByText('Alleen deze transactie')
  fireEvent.click(scopeButton)
  await waitFor(() => expect(updates.some((u) => u.table === 'transactions')).toBe(true))
}

/** De UPDATE op de bewerkte transactie zelf (de eerste transactions-update). */
function txUpdate(): UpdatePayload {
  const hit = updates.find((u) => u.table === 'transactions')
  if (!hit) throw new Error('Geen transactions-update vastgelegd')
  return hit.payload
}

beforeEach(() => {
  updates = []
  inserts = []
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ has_household: false }) })),
  )
})

describe('TransactionForm — boeken op Eigen rekening', () => {
  it('toont "Eigen rekening" als kiesbare optie in de budget-dropdown', () => {
    render(
      <TransactionForm
        transaction={transaction()}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    const select = screen.getByLabelText('Budget') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    // De archive-emmer wordt platgeslagen: de SUBpost is de kiesbare optie,
    // niet een niet-klikbare optgroup-kop.
    expect(optionValues).toContain(EIGEN_REKENING_SUB.id)
  })

  it('legt uit dat de keuze niet meetelt, zodra Eigen rekening gekozen is', () => {
    render(
      <TransactionForm
        transaction={transaction()}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    expect(screen.queryByTestId('tx-transfer-notice')).toBeNull()
    fireEvent.change(screen.getByLabelText('Budget'), { target: { value: EIGEN_REKENING_SUB.id } })
    expect(screen.getByTestId('tx-transfer-notice')).toBeTruthy()
  })

  it('schrijft het canonieke trio bij een keuze voor Eigen rekening', async () => {
    render(
      <TransactionForm
        transaction={transaction()}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await saveWithBudget(EIGEN_REKENING_SUB.id)

    expect(txUpdate()).toMatchObject({
      budget_id: EIGEN_REKENING_SUB.id,
      category_source: 'transfer',
      transaction_type: 'transfer',
    })
  })

  it('legt géén budget-correctieregel vast voor een verschuiving', async () => {
    render(
      <TransactionForm
        transaction={transaction()}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await saveWithBudget(EIGEN_REKENING_SUB.id)

    // Een correctieregel zet alleen budget_id — toekomstige imports zouden dan op
    // de archive-post landen én tóch meetellen. Eigen-rekeningherkenning hoort in
    // user_own_ibans, niet in category_corrections.
    expect(inserts.some((i) => i.table === 'category_corrections')).toBe(false)
  })

  it('wist de markering wanneer een verschuiving een gewoon budget krijgt', async () => {
    render(
      <TransactionForm
        transaction={transaction({
          budget_id: EIGEN_REKENING_SUB.id,
          transaction_type: 'transfer',
          category_source: 'transfer',
        })}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await saveWithBudget(BOODSCHAPPEN.id)

    expect(txUpdate()).toMatchObject({
      budget_id: BOODSCHAPPEN.id,
      category_source: 'manual',
      transaction_type: null,
    })
  })

  it('laat transaction_type ongemoeid bij een gewone budgetwijziging', async () => {
    render(
      <TransactionForm
        transaction={transaction({ budget_id: null, transaction_type: 'DEBIT' })}
        accountId="acc-1"
        budgetGroups={BUDGET_GROUPS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await saveWithBudget(BOODSCHAPPEN.id)

    // Géén sleutel in de payload — anders wist een categoriewijziging stil de
    // herkomst die de import heeft vastgelegd.
    expect(Object.keys(txUpdate())).not.toContain('transaction_type')
  })
})
