/**
 * Component test for AICategorizeSheet — scope-toggle (Deze maand vs Alle tijden).
 *
 * Verifies:
 *  1. The toggle is rendered when an `accountId` or `currentUserId` is supplied.
 *  2. Clicking "Alle tijden" triggers the right Supabase query
 *     (`.is('budget_id', null).eq('account_id', ...)`). The transfer filter is
 *     intentionally applied in JS rather than SQL — see test #5 for the why.
 *  3. After the fetch resolves the displayed count switches to the all-time total.
 *  4. The toggle is hidden when no scope-source is provided (backward compatible).
 *  5. Transfer rows are filtered out in JS, including rows with NULL
 *     `transaction_type` (which would be silently dropped by a SQL `.neq` filter
 *     because PostgreSQL evaluates `NULL != 'transfer'` as UNKNOWN).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AICategorizeSheet } from './ai-categorize-sheet'
import type { Budget } from '@/lib/budget-data'

// ── Supabase mock ──────────────────────────────────────────────
//
// Build a chainable query-builder mock that records every call so the
// individual tests can assert on the exact filters that were applied.

type Call = { method: string; args: unknown[] }

let supabaseCalls: Call[] = []
let allTimeData: unknown[] = []
let allTimeError: { message: string } | null = null

function makeQueryBuilder() {
  // The chain returns itself until `.limit()` is awaited; that resolution is
  // the only place that returns the actual { data, error } pair.
  const builder: Record<string, (...args: unknown[]) => unknown> & {
    then?: (resolve: (value: { data: unknown[]; error: { message: string } | null }) => void) => void
  } = {}
  const chainable = ['select', 'is', 'neq', 'eq', 'order']
  for (const method of chainable) {
    builder[method] = (...args: unknown[]) => {
      supabaseCalls.push({ method, args })
      return builder
    }
  }
  builder.limit = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'limit', args })
    return Promise.resolve({ data: allTimeData, error: allTimeError })
  }
  return builder
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      supabaseCalls.push({ method: 'from', args: [table] })
      return makeQueryBuilder()
    },
  }),
}))

// BottomSheet renders into a portal in real life — render its children
// inline so testing-library queries can find them in the same root.
vi.mock('./bottom-sheet', () => ({
  BottomSheet: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="bottom-sheet" aria-label={title}>{children}</div>
  ),
}))

// ── Fixtures ──────────────────────────────────────────────────

const mockBudgets: Budget[] = []
const mockGroups: { parent: Budget; children: Budget[] }[] = []

function makeTx(id: string, overrides: Partial<{ description: string; amount: number; counterparty_name: string | null }> = {}) {
  return {
    id,
    date: '2026-04-01',
    description: overrides.description ?? `tx ${id}`,
    counterparty_name: overrides.counterparty_name ?? 'Test',
    counterparty_iban: null,
    amount: overrides.amount ?? -10,
    import_hash: `hash-${id}`,
    budget_id: null,
  }
}

const monthTransactions = Array.from({ length: 12 }, (_, i) => makeTx(`m${i}`))
const allTimeTransactions = Array.from({ length: 30 }, (_, i) => ({
  id: `a${i}`,
  date: '2026-01-01',
  description: `historisch ${i}`,
  counterparty_name: 'Old',
  counterparty_iban: null,
  amount: -5,
  import_hash: `hash-a${i}`,
  budget_id: null,
}))

beforeEach(() => {
  supabaseCalls = []
  allTimeData = []
  allTimeError = null
})

// ── Tests ─────────────────────────────────────────────────────

describe('AICategorizeSheet — scope toggle', () => {
  it('renders the segmented control when accountId is provided', () => {
    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
        accountId="acc-1"
        monthLabel="april 2026"
      />
    )

    // Both segmented buttons are visible with correct labels + counts.
    expect(screen.getByRole('button', { name: /Deze maand/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alle tijden/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deze maand/i }).textContent).toContain('(12)')
  })

  it('does NOT render the segmented control when no scope-source is provided', () => {
    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    expect(screen.queryByRole('button', { name: /Alle tijden/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Deze maand/i })).toBeNull()
  })

  it('fetches all-time uncategorized with the right filters when "Alle tijden" is clicked', async () => {
    allTimeData = allTimeTransactions

    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
        accountId="acc-1"
        monthLabel="april 2026"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Alle tijden/i }))

    // Wait for the count to update — fetch resolves async via the limit() call.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alle tijden/i }).textContent).toContain('(30)')
    })

    // Verify the exact filters used in the supabase query.
    // Note: there is intentionally NO `.neq('transaction_type', 'transfer')`
    // in the SQL chain — that filter happens in JS after the fetch (see test
    // "filtert transfer-transacties via JS").
    const methodCalls = supabaseCalls.map(c => c.method)
    expect(methodCalls).toContain('from')
    expect(methodCalls).toContain('is')
    expect(methodCalls).toContain('eq')
    expect(methodCalls).toContain('order')
    expect(methodCalls).toContain('limit')
    expect(methodCalls).not.toContain('neq')

    expect(supabaseCalls.find(c => c.method === 'from')?.args).toEqual(['transactions'])
    expect(supabaseCalls.find(c => c.method === 'is')?.args).toEqual(['budget_id', null])
    expect(supabaseCalls.find(c => c.method === 'eq')?.args).toEqual(['account_id', 'acc-1'])
    expect(supabaseCalls.find(c => c.method === 'limit')?.args).toEqual([500])
  })

  it('filtert transfer-transacties via JS, ook NULL transaction_type wordt meegenomen', async () => {
    // Three rows: an explicit transfer (must be excluded), a NULL row (must
    // be kept — this is the bug-fix scenario for manually-unlinked txs), and
    // a normal expense (must be kept). Final count must be (2).
    allTimeData = [
      {
        id: 'tr-1',
        date: '2026-03-15',
        description: 'Overboeking spaarpot',
        counterparty_name: 'Eigen rekening',
        counterparty_iban: null,
        amount: -100,
        import_hash: 'hash-tr-1',
        budget_id: null,
        transaction_type: 'transfer',
      },
      {
        id: 'null-1',
        date: '2026-03-10',
        description: 'Handmatig losgekoppeld',
        counterparty_name: 'Albert Heijn',
        counterparty_iban: null,
        amount: -25,
        import_hash: 'hash-null-1',
        budget_id: null,
        transaction_type: null,
      },
      {
        id: 'exp-1',
        date: '2026-03-05',
        description: 'Bakker',
        counterparty_name: 'Bakkerij',
        counterparty_iban: null,
        amount: -8,
        import_hash: 'hash-exp-1',
        budget_id: null,
        transaction_type: 'expense',
      },
    ]

    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
        accountId="acc-1"
        monthLabel="april 2026"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Alle tijden/i }))

    // Count must reflect the post-JS-filter list: 3 raw rows minus 1 transfer = 2.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alle tijden/i }).textContent).toContain('(2)')
    })
  })

  it('falls back to month-scope and surfaces an error message when the fetch fails', async () => {
    allTimeError = { message: 'database geweigerd' }

    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
        accountId="acc-1"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Alle tijden/i }))

    await waitFor(() => {
      expect(screen.getByText(/database geweigerd/i)).toBeInTheDocument()
    })

    // Pressed-state remains on "Deze maand" because the fallback resets it.
    expect(screen.getByRole('button', { name: /Deze maand/i }).getAttribute('aria-pressed')).toBe('true')
  })

  it('uses user_id filter for combined view (no accountId, currentUserId only)', async () => {
    allTimeData = allTimeTransactions

    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={mockBudgets}
        budgetGroups={mockGroups}
        onClose={() => {}}
        onSaved={() => {}}
        accountId={null}
        currentUserId="user-42"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Alle tijden/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alle tijden/i }).textContent).toContain('(30)')
    })

    expect(supabaseCalls.find(c => c.method === 'eq')?.args).toEqual(['user_id', 'user-42'])
  })
})
