import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// ── Fixtures (hoisted zodat de vi.mock-factories eronder ze mogen gebruiken) ──
const fixtures = vi.hoisted(() => {
  const account = {
    id: 'acc-1',
    name: 'Betaalrekening',
    iban: 'NL01BANK0123456789',
    bank_name: 'Testbank',
    account_type: 'checking',
    balance: 1000,
    is_active: true,
    sort_order: 0,
    ownership: 'personal',
  }
  const budget = {
    id: 'b1',
    name: 'Boodschappen',
    parent_id: null,
    icon: 'shopping-cart',
    budget_type: 'expense',
    default_limit: 300,
    sort_order: 0,
  }
  const tx = {
    id: 'tx-1',
    account_id: 'acc-1',
    budget_id: 'b1',
    date: '2026-07-15',
    amount: -42.5,
    description: 'Albert Heijn',
    counterparty_name: 'Albert Heijn',
    counterparty_iban: null,
    transaction_type: 'regular',
    ownership: 'personal',
    category_source: 'manual',
    is_split: false,
    user_id: 'u1',
    notes: null,
  }
  return { account, budget, tx }
})

// ── Supabase-client-mock: een chainbare, thenable query-builder die per
//    tabel de juiste rijen teruggeeft. Genoeg om de mount-loaders te voeden. ──
function makeSupabase() {
  const dataFor = (table: string): unknown => {
    switch (table) {
      case 'transactions':
        return [fixtures.tx]
      case 'bank_accounts':
        return [fixtures.account]
      case 'budgets':
        return [fixtures.budget]
      case 'profiles':
        return { budgeting_active: true }
      default:
        return []
    }
  }
  function builder(table: string, isSingle = false): Record<string, unknown> {
    const target: Record<string, unknown> = {
      single: () => builder(table, true),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        let data = dataFor(table)
        if (isSingle && Array.isArray(data)) data = data[0] ?? null
        return Promise.resolve(resolve({ data, error: null }))
      },
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        // Elke query-methode (select/eq/gte/lt/in/order/...) geeft dezelfde
        // (chainbare) builder terug.
        return () => builder(table, isSingle)
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))
vi.mock('@/lib/budgeting-active', () => ({ syncBudgetingActive: async () => true }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Provider-hooks: vaste, stabiele waarden (geen household, geen partner-privacy).
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal' }),
  usePerspectiveAbort: () => undefined,
}))
vi.mock('@/components/app/ownership-toggle', () => ({
  useHouseholdStatus: () => ({ hasHousehold: false, householdId: null }),
  OwnershipToggle: () => null,
}))
vi.mock('@/components/app/privacy-hidden-notice', () => ({
  usePartnerPrivacy: () => ({ partnerPrivacy: null, hiddenCategories: [] }),
  PrivacyHiddenNotice: () => null,
}))
vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ activeModules: ['budgetteren'] }),
}))

// FeatureGate/ModuleGate: render kinderen ongefilterd — de charts erbinnen
// blijven alsnog achter hun eigen data-guards (geen sankey-/forecast-data).
vi.mock('@/components/app/feature-gate', () => ({
  FeatureGate: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ModuleGate: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

// Bewerk-formulier: lichte stub zodat we kunnen waarnemen dat het opent.
vi.mock('@/components/app/transaction-form', () => ({
  TransactionForm: () => <div data-testid="transaction-form-stub" />,
}))

import { CashAccountView } from './cash-account-view'

// Globale fetch neutraliseren: alle optionele endpoints (bank-connect status,
// cashflow-forecast, household) mogen no-op teruggeven. Plus een ResizeObserver-
// stub die jsdom mist (de Sankey-geldstroom gebruikt 'm in een effect).
function setupEnv() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CashAccountView — transactierij toegankelijkheid (B-01)', () => {
  it('rendert de transactierij als role="button" met een beschrijvend aria-label', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-1" />)

    // De rij is een role="button" met accessible name = omschrijving + bedrag.
    // Op de oude code (kaal <div onClick>) bestaat deze rol/naam niet.
    const row = await screen.findByRole('button', { name: /^Albert Heijn,/ })
    expect(row).toBeInTheDocument()
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('opent het bewerk-formulier bij Enter op de rij (toetsenbord-pad)', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-1" />)

    const row = await screen.findByRole('button', { name: /^Albert Heijn,/ })
    expect(screen.queryByTestId('transaction-form-stub')).not.toBeInTheDocument()

    fireEvent.keyDown(row, { key: 'Enter' })

    expect(await screen.findByTestId('transaction-form-stub')).toBeInTheDocument()
  })

  it('opent het bewerk-formulier ook bij Spatie op de rij', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-1" />)

    const row = await screen.findByRole('button', { name: /^Albert Heijn,/ })
    fireEvent.keyDown(row, { key: ' ' })

    expect(await screen.findByTestId('transaction-form-stub')).toBeInTheDocument()
  })
})
