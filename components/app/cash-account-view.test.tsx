import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

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
    // Vereist voor de "Budgetteren uitschakelen"-flow (loadLinkedAsset draait
    // alleen wanneer een companion-rij een linked_asset_id draagt).
    linked_asset_id: 'asset-1',
  }
  const linkedAsset = {
    id: 'asset-1',
    name: 'Betaalrekening',
    current_value: 1000,
    institution: 'Testbank',
    // Geen `account_number`: die kolom wordt niet meer opgevraagd (plaintext,
    // staat op de droplijst) en het bewerkscherm toonde 'm nooit.
    subtype: 'checking',
    net_worth_inclusion_pct: 100,
    expected_return: 0,
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
  return { account, linkedAsset, budget, tx }
})

// ── Mutatie-log: registreert elke .update()/.delete() die de component via de
//    supabase-client-mock uitvoert, zodat tests kunnen bewijzen dat een flow
//    GEEN client-directe bank_accounts-mutatie meer doet (ADR 0058: muteren
//    via een API-route). Wordt per test gereset. ──
type Mutation = { table: string; op: 'update' | 'delete'; payload?: Record<string, unknown> }
let mutationLog: Mutation[] = []

// ── Query-log: registreert elke chainbare query-methode (select/eq/order/…) met
//    haar argumenten, per tabel. Nodig om te kunnen BEWIJZEN welke kolommen een
//    loader opvraagt — een `select('*')` op een tabel met crypto-kolommen stuurt
//    server-only afgeleiden naar de browser zonder dat er iets zichtbaar
//    verandert. Wordt per test gereset. ──
type QueryCall = { table: string; method: string; args: unknown[] }
let queryLog: QueryCall[] = []

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
      // .maybeSingle() (loadLinkedAsset) — geen array-wrap nodig, zie de
      // then()-narrowing hieronder die alleen bij isSingle van .single() slaat.
      case 'assets':
        return fixtures.linkedAsset
      default:
        return []
    }
  }
  function builder(table: string, isSingle = false): Record<string, unknown> {
    const target: Record<string, unknown> = {
      single: () => builder(table, true),
      update: (payload: Record<string, unknown>) => {
        mutationLog.push({ table, op: 'update', payload })
        return builder(table, isSingle)
      },
      delete: () => {
        mutationLog.push({ table, op: 'delete' })
        return builder(table, isSingle)
      },
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
        // (chainbare) builder terug — en legt zichzelf vast in `queryLog`.
        return (...args: unknown[]) => {
          queryLog.push({ table, method: prop, args })
          return builder(table, isSingle)
        }
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

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

/**
 * `/api/own-accounts/ibans` is GEEN optioneel endpoint (anders dan de rest die
 * hier ge-no-op't wordt): sinds de IBAN-encryptie komt `account.iban` daarvandaan
 * en niet meer uit de `bank_accounts`-kolom, omdat ontsleutelen de server-only
 * sleutels vraagt. `loadAccount` gebruikt bewust de STRIKTE variant — een
 * onvolledige IBAN-set zou eigen-rekening-verschuivingen als gewone inkomsten en
 * uitgaven laten doorgaan — dus een 404 hierop laat het hele scherm terecht
 * falen. Elke fetch-stub in dit bestand moet 'm daarom beantwoorden.
 */
function ownAccountIbansResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      accounts: [{ id: fixtures.account.id, iban: fixtures.account.iban, is_active: true }],
      unreadable: 0,
    }),
  } as unknown as Response
}

// Globale fetch neutraliseren: alle optionele endpoints (bank-connect status,
// cashflow-forecast, household) mogen no-op teruggeven. Plus een ResizeObserver-
// stub die jsdom mist (de Sankey-geldstroom gebruikt 'm in een effect).
function setupEnv() {
  mutationLog = []
  queryLog = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch,
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

/**
 * Regressie: `handleDisconnectTracking` muteerde ooit client-direct
 * (`bank_accounts.delete()` — botste op de FK van `bank_connection_accounts`
 * — en/of een nulling van `linked_asset_id` die bij herkoppelen een tweede
 * cash-asset opleverde). De canonieke schrijver is nu `/api/assets/
 * toggle-budget` (ADR 0058: muteren via een API-route, niet client-direct);
 * het component doet alleen nog een `fetch('/api/assets/toggle-budget', ...)`.
 */
describe('CashAccountView — "Budgetteren uitschakelen" gaat via de API-route, niet client-direct', () => {
  it('bevestigen roept fetch("/api/assets/toggle-budget") aan met { id, enabled: false } en muteert bank_accounts niet client-direct', async () => {
    setupEnv()
    const toggleBudgetCalls: Array<{ id: unknown; enabled: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
        if (input === '/api/assets/toggle-budget' && init?.method === 'POST') {
          toggleBudgetCalls.push(JSON.parse(init.body as string))
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              asset: { id: 'asset-1', has_budget_tracking: false, name: 'Betaalrekening' },
              budgeting_active: true,
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      }) as unknown as typeof fetch,
    )

    render(<CashAccountView accountId="acc-1" />)

    // Instellingen → "Rekening bewerken" opent het bewerkscherm (BottomSheet
    // met AssetEditForm) — dat vereist dat loadLinkedAsset al is doorgelopen.
    fireEvent.click(await screen.findByTitle('Instellingen'))
    fireEvent.click(await screen.findByText('Rekening bewerken'))

    // In het bewerkscherm: "Budgetteren uitschakelen" → inline bevestigen.
    // Beide bevestigingsstappen voeren bewust dezelfde actie-taal
    // ("Uitschakelen") i.p.v. een generiek "Bevestigen"; we pakken daarom per
    // stap de laatst gerenderde knop — tijdens de overgang kan het
    // bewerkscherm nog kort naast de overlay in de DOM staan.
    fireEvent.click(await screen.findByText('Budgetteren uitschakelen'))
    const inlineButtons = await screen.findAllByRole('button', { name: 'Uitschakelen' })
    fireEvent.click(inlineButtons[inlineButtons.length - 1])

    // Dat opent de ShellOverlay-confirm ("Budgetteren uitschakelen?") met de
    // actie-knop "Uitschakelen".
    await screen.findByText('Budgetteren uitschakelen?')
    const confirmButtons = await screen.findAllByRole('button', { name: 'Uitschakelen' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => expect(toggleBudgetCalls).toHaveLength(1))
    expect(toggleBudgetCalls[0]).toEqual({ id: 'asset-1', enabled: false })

    // De kern van de regressie: geen enkele client-directe bank_accounts-
    // mutatie (delete of een linked_asset_id: null-update) tijdens deze flow.
    const bankAccountMutations = mutationLog.filter((m) => m.table === 'bank_accounts')
    expect(bankAccountMutations.some((m) => m.op === 'delete')).toBe(false)
    expect(
      bankAccountMutations.some(
        (m) => m.op === 'update' && m.payload && 'linked_asset_id' in m.payload && m.payload.linked_asset_id === null,
      ),
    ).toBe(false)
  })
})

/**
 * De koppelingen-loader (`loadGcAccounts`) leest NIET meer client-direct.
 *
 * Voorgeschiedenis: deze loader deed een `select()` op `bank_connection_accounts`
 * met de PLAINTEXT `iban`-kolom erin, omdat `ConnectedAccountCard` het volledige
 * rekeningnummer toonde. Dat was de laatste lezer die het droppen van die kolom
 * tegenhield — en de tripwire hier pinde toen alleen dát de kolomlijst expliciet
 * was (geen `select('*')`, want dat lekt de blind index `iban_hash` naar de
 * browser) en dat de ordening niet op `iban` stond.
 *
 * Beide zorgen zijn nu bij de bron weg: er ís geen client-query meer. De loader
 * haalt `GET /api/bank-connect/linked-accounts` op, die alleen een IBAN-STAARTJE
 * van vier tekens teruggeeft en de crypto-kolommen server-side houdt. Deze suite
 * bewaakt dus niet langer de vórm van een query maar het BESTAAN ervan — een
 * teruggekeerde client-read is de regressie.
 *
 * En anders dan de oude versie dekt dit wél "werkt na de drop": een leespad dat
 * de kolom niet noemt, kan er niet op stukslaan.
 */
describe('CashAccountView — koppelingen komen van de server, niet uit de browser', () => {
  /** Bank Connect ingeschakeld — anders draait `loadGcAccounts` nooit door. */
  function setupBankConnectEnabled() {
    setupEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
        if (input === '/api/bank-connect/status') {
          return { ok: true, status: 200, json: async () => ({ enabled: true }) } as unknown as Response
        }
        if (input === '/api/bank-connect/linked-accounts') {
          return { ok: true, status: 200, json: async () => ({ accounts: [] }) } as unknown as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      }) as unknown as typeof fetch,
    )
  }

  /** De URL's die de component tijdens deze render heeft opgehaald. */
  function fetchedUrls(): string[] {
    const mock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    return mock.mock.calls.map((c) => String(c[0]))
  }

  it('haalt de koppelingen op via de server-route', async () => {
    setupBankConnectEnabled()
    render(<CashAccountView accountId="acc-1" />)

    await waitFor(() => {
      expect(fetchedUrls()).toContain('/api/bank-connect/linked-accounts')
    })
  })

  it('doet geen enkele client-directe query op bank_connection_accounts', async () => {
    setupBankConnectEnabled()
    render(<CashAccountView accountId="acc-1" />)

    // Wachten tot de route-fetch geweest is; pas dán is "geen query" een uitspraak
    // over een afgeronde loader en niet over een nog niet gestarte.
    await waitFor(() => {
      expect(fetchedUrls()).toContain('/api/bank-connect/linked-accounts')
    })
    expect(queryLog.filter((q) => q.table === 'bank_connection_accounts')).toEqual([])
  })
})

/**
 * De companion-asset-loader (`loadLinkedAsset`) vraagt `account_number` niet meer op.
 *
 * Die kolom werd opgehaald en tot in de props van het bewerkscherm doorgegeven,
 * maar nergens getoond — een dode lezer van de plaintext-kolom die het droppen
 * ervan tegenhield zonder er iets voor terug te geven. Na de drop zou hij een
 * PostgREST 400 geven, en deze loader zet bij een fout stil `null` (het
 * bewerkscherm verdwijnt dan geruisloos).
 */
describe('CashAccountView — companion-asset zonder plaintext rekeningnummer', () => {
  it('noemt account_number niet in de assets-select', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-1" />)

    await waitFor(() => {
      const call = queryLog.find((q) => q.table === 'assets' && q.method === 'select')
      expect(call).toBeDefined()
      // `account_number_encrypted` zou hier als substring doorheen glippen; de
      // kolomlijst wordt daarom op losse namen getoetst.
      const requested = String(call!.args[0] ?? '').split(',').map((c) => c.trim())
      expect(requested).not.toContain('account_number')
    })
  })
})
