import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, configure } from '@testing-library/react'

// Elke test hier rendert CashAccountView en wacht met `findBy*` tot de
// fetch-gedreven effectketen de transactierijen heeft neergezet. De
// standaard-`asyncUtilTimeout` van testing-library is 1000 ms, en dat is te krap
// zodra de volledige suite parallel draait: de EERSTE render in dit bestand
// betaalt bovendien de module-initialisatie. Gemeten in een volle suite-run:
// 1076 ms — net eroverheen, terwijl het bestand geïsoleerd in 1,3 s klaar is.
// Dat is machinebelasting, geen traag component, dus ruimer wachten is hier de
// juiste remedie in plaats van de assertie te verzwakken. Bewust bestand-lokaal:
// een globale verhoging zou echte traagheid elders kunnen maskeren.
configure({ asyncUtilTimeout: 5000 })

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
    // Eigenaar van de rij. Draagt de eigenaar-guard op het ⋮-menu: zonder
    // `user_id` kan het scherm niet weten of de kijker mag muteren en verbergt
    // het de knoppen.
    user_id: 'u1',
    is_archive_bucket: false,
    // Vereist voor de "Budgetteren uitschakelen"-flow (loadLinkedAsset draait
    // alleen wanneer een companion-rij een linked_asset_id draagt).
    linked_asset_id: 'asset-1',
  }
  /**
   * Een rekening waarvan de companion-rij GEDEACTIVEERD is
   * (`is_active: false`) — de toestand die `syncBankAccountCompanion` achterlaat
   * zodra budgetteren voor die rekening uit gaat. De rij bestaat nog, inclusief
   * `linked_asset_id`; alleen de budget-as staat uit.
   */
  const inactiveAccount = {
    id: 'acc-2',
    name: 'credit card',
    iban: 'NL02BANK0987654321',
    bank_name: 'ICS',
    account_type: 'checking',
    balance: 1,
    is_active: false,
    sort_order: 1,
    ownership: 'personal',
    user_id: 'u1',
    is_archive_bucket: false,
    linked_asset_id: 'asset-2',
  }
  /**
   * Een GEDEELDE rekening waarvan de partner (`user_id: 'u2'`) de eigenaar is.
   *
   * Dit is de rij uit het bewezen faalscenario: in het perspectief 'huishouden'
   * versmalt `loadAccount` niet naar de eigen rijen, dus deze rekening opent
   * gewoon bij de partner — terwijl zowel de UPDATE-policy op `bank_accounts`
   * als de verwijder-RPC strikt eigen-rij zijn.
   *
   * Bewust `is_active: false`, zodat de rij buiten de brede (actief-only)
   * rekeningenlijst valt en de overige tests exact dezelfde data houden; hij
   * komt binnen via de gerichte lookup op `id`, net als `inactiveAccount`.
   */
  const partnerAccount = {
    id: 'acc-3',
    name: 'Gezamenlijke rekening',
    iban: 'NL03BANK0000000003',
    bank_name: 'Testbank',
    account_type: 'checking',
    balance: 500,
    is_active: false,
    sort_order: 2,
    ownership: 'shared',
    user_id: 'u2',
    is_archive_bucket: false,
    linked_asset_id: null,
  }
  /**
   * De archief-rekening: de bak waar boekingen naartoe verhuizen bij
   * "transacties bewaren". Verwijdert zichzelf niet (TF409 in
   * `delete_bank_account`), staat daarom op `is_active: false`.
   */
  const archiveAccount = {
    id: 'acc-4',
    name: 'Archief — verwijderde rekeningen',
    iban: null,
    bank_name: null,
    account_type: 'other',
    balance: 0,
    is_active: false,
    sort_order: 9999,
    ownership: 'personal',
    user_id: 'u1',
    is_archive_bucket: true,
    linked_asset_id: null,
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
  return { account, inactiveAccount, partnerAccount, archiveAccount, linkedAsset, budget, tx }
})

/**
 * Het actieve perspectief, per test omzetbaar. Default 'personal' — de
 * eigenaar-guard op het ⋮-menu is alleen te reproduceren in 'huishouden', want
 * daar (en alleen daar) laat `loadAccount` de gedeelde rekening van de partner
 * door. `afterEach` zet 'm terug.
 */
const perspectiveState = vi.hoisted(() => ({ current: 'personal' as 'personal' | 'household' }))

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
  /**
   * `bank_accounts` is de ENIGE tabel waarvoor de mock `.eq()`-filters echt
   * toepast. Reden: de rekeningdetail doet twee verschillende leesrondes op die
   * tabel — een brede op `is_active = true` (voedt de overboekingskeuze) en een
   * gerichte op `id` voor de rekening zelf. Een mock die filters negeert kan die
   * twee niet uit elkaar houden en zou een gedeactiveerde rekening óók in de
   * brede lijst laten opduiken — precies het onderscheid dat hier getest wordt.
   * De overige tabellen leveren hun vaste fixture; daar voegt filteren niets toe.
   */
  const allBankAccounts = [
    fixtures.account,
    fixtures.inactiveAccount,
    fixtures.partnerAccount,
    fixtures.archiveAccount,
  ]
  const dataFor = (table: string, filters: Array<[string, unknown]>): unknown => {
    switch (table) {
      case 'transactions':
        return [fixtures.tx]
      case 'bank_accounts':
        return allBankAccounts.filter((row) =>
          filters.every(([col, val]) => !(col in row) || (row as Record<string, unknown>)[col] === val),
        )
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
  function builder(
    table: string,
    isSingle = false,
    filters: Array<[string, unknown]> = [],
  ): Record<string, unknown> {
    const target: Record<string, unknown> = {
      single: () => builder(table, true, filters),
      // `maybeSingle` narrowt net als `single`: de gerichte rekening-lookup
      // gebruikt 'm, en zonder narrowing kreeg die een array terug.
      maybeSingle: () => builder(table, true, filters),
      update: (payload: Record<string, unknown>) => {
        mutationLog.push({ table, op: 'update', payload })
        return builder(table, isSingle, filters)
      },
      delete: () => {
        mutationLog.push({ table, op: 'delete' })
        return builder(table, isSingle, filters)
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        let data = dataFor(table, filters)
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
          const next: Array<[string, unknown]> =
            prop === 'eq' ? [...filters, [String(args[0]), args[1]]] : filters
          return builder(table, isSingle, next)
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
  usePerspective: () => ({ perspective: perspectiveState.current }),
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
      // Ook de gedeactiveerde rekening: de route filtert `is_active` bewust
      // niet (zie app/api/own-accounts/ibans/route.ts), en de rekeningdetail
      // haalt zijn leesbare IBAN hiervandaan — óók voor een rekening waarvoor
      // budgetteren uit staat.
      accounts: [
        { id: fixtures.account.id, iban: fixtures.account.iban, is_active: true },
        { id: fixtures.inactiveAccount.id, iban: fixtures.inactiveAccount.iban, is_active: false },
      ],
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
  perspectiveState.current = 'personal'
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
/**
 * Een rekening waarvoor budgetteren UIT staat moet nog steeds te openen zijn.
 *
 * Budgetteren uitzetten verwijdert niets: `syncBankAccountCompanion` zet
 * uitsluitend `bank_accounts.is_active = false` en laat de rij én
 * `linked_asset_id` staan. `loadAccount` zocht de rekening echter alleen in de
 * lijst die op `is_active = true` gefilterd is — de brede lijst die de
 * overboekingskeuze voedt — en viel daardoor terug op "Rekening niet gevonden".
 *
 * Gevolg in de app: na budgetteren uitzetten was de rekening niet meer te zien
 * of te bewerken, en dezelfde 404 blokkeerde de herstelroute van een rekening
 * met een kwijtgeraakte bankverbinding (juist het scherm mét het herstelpad).
 *
 * De brede lijst blijft bewust actief-only; de rekening zelf komt uit een
 * gerichte lookup op `id`.
 */
describe('CashAccountView — rekening met budgetteren uit (gedeactiveerde companion)', () => {
  it('laadt de rekening en toont haar naam in plaats van "Rekening niet gevonden"', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-2" />)

    expect(await screen.findByRole('heading', { name: 'credit card' })).toBeInTheDocument()
    expect(screen.queryByText('Rekening niet gevonden')).not.toBeInTheDocument()
  })

  it('houdt de brede rekeningenlijst op actieve rekeningen', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-2" />)

    await screen.findByRole('heading', { name: 'credit card' })
    // De brede leesronde (overboekingskeuze, eigen-rekeningherkenning) blijft
    // filteren; de gerichte lookup mag dat filter juist NIET dragen.
    const bankAccountEqs = queryLog.filter((q) => q.table === 'bank_accounts' && q.method === 'eq')
    expect(bankAccountEqs.some((q) => q.args[0] === 'is_active' && q.args[1] === true)).toBe(true)
    expect(bankAccountEqs.some((q) => q.args[0] === 'id' && q.args[1] === 'acc-2')).toBe(true)
  })
})

/**
 * "Rekening verwijderen" — het enige destructieve pad op dit scherm.
 *
 * Twee dingen moeten vastliggen, want beide zijn stil te breken:
 *  1. De mutatie loopt via `DELETE /api/bank-accounts/<id>` met de gekozen
 *     transactie-behandeling in de body — nooit een client-directe
 *     `bank_accounts.delete()` (die botst op de FK van
 *     `bank_connection_accounts` en laat een half doorgevoerde mutatie achter).
 *  2. "Bewaren" staat voorgeselecteerd. Zou de default omslaan naar
 *     verwijderen, dan wist één misklik onherstelbaar de historie.
 */
describe('CashAccountView — rekening verwijderen', () => {
  type DeleteCall = { url: string; body: unknown }

  /**
   * Fetch-stub met de twee routes van deze flow: de impact-GET en de DELETE.
   * `deleteResponse` laat een test de foutstatus forceren.
   */
  function setupDeleteEnv(
    deleteResponse: { ok: boolean; status: number; json: () => Promise<unknown> } = {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'acc-1',
        movedTransactions: 12,
        deletedTransactions: 0,
        stoppedRecurrings: 2,
      }),
    },
  ) {
    setupEnv()
    const deleteCalls: DeleteCall[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
        if (input === '/api/bank-accounts/acc-1' && init?.method === 'DELETE') {
          deleteCalls.push({ url: String(input), body: JSON.parse(String(init.body)) })
          return deleteResponse as unknown as Response
        }
        if (input === '/api/bank-accounts/acc-1' && !init?.method) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'acc-1',
              name: 'Betaalrekening',
              transactionCount: 12,
              recurringCount: 2,
              hasBankLink: false,
              isArchiveBucket: false,
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      }) as unknown as typeof fetch,
    )
    return deleteCalls
  }

  /** Opent ⋮ → "Rekening verwijderen" en wacht tot de bevestiging staat. */
  async function openConfirm() {
    fireEvent.click(await screen.findByTitle('Instellingen'))
    fireEvent.click(await screen.findByText('Rekening verwijderen'))
    await screen.findByText('Rekening verwijderen?')
  }

  /**
   * De actieknop in de sticky footer (het menu-item heet hetzelfde).
   *
   * Wacht standaard tot de knop ook echt klikbaar is: hij staat bewust dicht
   * zolang de impact-GET loopt (de hele route bestaat om het aantal te tonen).
   * `{ enabled: false }` levert 'm ongeacht die toestand — voor de tests die
   * juist de dichte knop bewijzen.
   */
  async function confirmButton({ enabled = true }: { enabled?: boolean } = {}) {
    const last = () =>
      screen.getAllByRole('button', { name: 'Rekening verwijderen' }).slice(-1)[0]
    await screen.findAllByRole('button', { name: 'Rekening verwijderen' })
    if (enabled) await waitFor(() => expect(last()).not.toBeDisabled())
    return last()
  }

  it('toont "Rekening verwijderen" in het instellingenmenu van één rekening', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)

    fireEvent.click(await screen.findByTitle('Instellingen'))
    expect(await screen.findByText('Rekening verwijderen')).toBeInTheDocument()
  })

  it('toont het instellingenmenu niet in de gecombineerde weergave', async () => {
    setupDeleteEnv()
    render(<CashAccountView />)

    await screen.findByRole('heading', { name: 'Alle rekeningen' })
    expect(screen.queryByTitle('Instellingen')).not.toBeInTheDocument()
    expect(screen.queryByText('Rekening verwijderen')).not.toBeInTheDocument()
  })

  it('opent de bevestiging met "Transacties bewaren" voorgeselecteerd', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    const keep = screen.getByRole('radio', { name: /Transacties bewaren/ })
    const remove = screen.getByRole('radio', { name: /Transacties verwijderen/ })
    expect(keep).toBeChecked()
    expect(remove).not.toBeChecked()
  })

  it('stuurt { transactions: "keep" } naar de DELETE-route en muteert bank_accounts niet client-direct', async () => {
    const deleteCalls = setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    fireEvent.click(await confirmButton())

    await waitFor(() => expect(deleteCalls).toHaveLength(1))
    expect(deleteCalls[0].url).toBe('/api/bank-accounts/acc-1')
    expect(deleteCalls[0].body).toEqual({ transactions: 'keep' })

    // De kern van de regressie: geen client-directe delete op bank_accounts.
    expect(mutationLog.some((m) => m.table === 'bank_accounts' && m.op === 'delete')).toBe(false)
  })

  it('stuurt { transactions: "delete" } zodra de gebruiker daarvoor kiest', async () => {
    const deleteCalls = setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    fireEvent.click(screen.getByRole('radio', { name: /Transacties verwijderen/ }))
    // De wis-tak is type-to-confirm: zonder de overgetypte naam blijft de knop
    // dicht (apart getest hieronder).
    fireEvent.change(screen.getByLabelText(/om te bevestigen/), {
      target: { value: fixtures.account.name },
    })
    fireEvent.click(await confirmButton())

    await waitFor(() => expect(deleteCalls).toHaveLength(1))
    expect(deleteCalls[0].body).toEqual({ transactions: 'delete' })
    expect(mutationLog.some((m) => m.table === 'bank_accounts' && m.op === 'delete')).toBe(false)
  })

  it('houdt de bevestiging open met de servertekst wanneer de route faalt', async () => {
    setupDeleteEnv({
      ok: false,
      status: 409,
      // Platte envelope (ADR 0044): `error` is een string.
      json: async () => ({ error: 'Deze rekening heeft nog een actieve bankkoppeling' }),
    })
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    fireEvent.click(await confirmButton())

    expect(
      await screen.findByText('Deze rekening heeft nog een actieve bankkoppeling'),
    ).toBeInTheDocument()
    // Niet stil falen én niet half doorgevoerd: de bevestiging blijft staan.
    expect(screen.getByText('Rekening verwijderen?')).toBeInTheDocument()
  })

  /**
   * Type-to-confirm op de wis-tak (designsysteem: "nooit één-tap destructive").
   *
   * Eén klik met `deleteTxChoice === 'delete'` wist definitief élke boeking van
   * die rekening — in de praktijk duizenden. Bij "bewaren" verhuist de historie
   * en is er niets onomkeerbaars aan de boekingen; dáár zou dezelfde frictie
   * alleen maar afstompen. De asymmetrie is dus de kern van deze test.
   */
  it('houdt de rode knop dicht tot de rekeningnaam letterlijk is overgetypt', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    // Bewaren-tak: geen type-to-confirm, geen invoerveld.
    expect(await confirmButton()).not.toBeDisabled()
    expect(screen.queryByLabelText(/om te bevestigen/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Transacties verwijderen/ }))
    expect(await confirmButton({ enabled: false })).toBeDisabled()

    const input = screen.getByLabelText(/om te bevestigen/)
    // Bijna goed is niet goed: exact-match, case-sensitive (net als
    // components/app/confirm-destructive.tsx).
    fireEvent.change(input, { target: { value: 'betaalrekening' } })
    expect(await confirmButton({ enabled: false })).toBeDisabled()

    fireEvent.change(input, { target: { value: fixtures.account.name } })
    await waitFor(async () => expect(await confirmButton({ enabled: false })).not.toBeDisabled())

    // En terug naar bewaren: de knop is daar zonder overtypen gewoon open.
    fireEvent.click(screen.getByRole('radio', { name: /Transacties bewaren/ }))
    expect(await confirmButton()).not.toBeDisabled()
  })

  /**
   * De hele impact-GET bestaat om te tonen hoevéél er verdwijnt. Een klik vóór
   * dat getal binnen is, bevestigt iets wat de gebruiker nog niet gelezen heeft.
   */
  it('houdt de rode knop dicht zolang de aantallen nog binnenkomen', async () => {
    setupEnv()
    let releaseImpact: () => void = () => {}
    const impactGate = new Promise<void>((resolve) => { releaseImpact = resolve })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
        if (input === '/api/bank-accounts/acc-1' && !init?.method) {
          await impactGate
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'acc-1',
              name: 'Betaalrekening',
              transactionCount: 12,
              recurringCount: 2,
              hasBankLink: false,
              isArchiveBucket: false,
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      }) as unknown as typeof fetch,
    )

    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    expect(screen.getByText(/Aantallen ophalen/)).toBeInTheDocument()
    expect(await confirmButton({ enabled: false })).toBeDisabled()

    releaseImpact()

    await waitFor(async () => expect(await confirmButton({ enabled: false })).not.toBeDisabled())
    expect(screen.queryByText(/Aantallen ophalen/)).not.toBeInTheDocument()
  })

  /**
   * De RPC behandelt terugkerende regels ANDERS per keuze: bewaren =
   * deactiveren + meeverhuizen, wissen = verwijderen (stap 7 van
   * `20260804102500_delete_bank_account_rpc.sql`). De copy zei in beide
   * gevallen "stopgezet" — de gebruiker koos over transacties en verloor
   * ongemerkt ook zijn terugkerende regels.
   */
  it('noemt terugkerende regels stopgezet bij bewaren en verwijderd bij wissen', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    expect(
      await screen.findByText(/2 terugkerende regels van deze rekening worden stopgezet\./),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Transacties verwijderen/ }))

    expect(
      await screen.findByText(
        /2 terugkerende regels van deze rekening worden definitief verwijderd\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/2 terugkerende regels van deze rekening worden stopgezet\./),
    ).not.toBeInTheDocument()
  })

  it('noemt de terugkerende regels ook in de body van de wis-keuze', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    expect(
      screen.getByText(/De boekingen én de terugkerende regels van deze rekening worden definitief gewist/),
    ).toBeInTheDocument()
  })

  /**
   * De vraag boven de radiogroep stond op `sr-only`: schermlezers hoorden 'm,
   * ziende gebruikers zagen twee kaders zonder kop.
   */
  it('toont de vraag boven de keuze ook zichtbaar', async () => {
    setupDeleteEnv()
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    const legend = screen.getByText('Wat gebeurt er met je boekingen?')
    expect(legend).toBeInTheDocument()
    expect(legend).not.toHaveClass('sr-only')
  })

  /**
   * Een mislukte impact-GET mag niet in stilte tot een lege bevestiging leiden.
   * 404 = "bestaat niet of is niet van jou" (de route filtert op `user_id`);
   * doorklikken zou eindigen in TF404 → "Rekening niet gevonden" onder de kop
   * "Rekening verwijderen?".
   */
  it('blokkeert de bevestiging met uitleg wanneer de impact-GET 404 geeft', async () => {
    setupEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === '/api/own-accounts/ibans') return ownAccountIbansResponse()
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      }) as unknown as typeof fetch,
    )
    render(<CashAccountView accountId="acc-1" />)
    await openConfirm()

    expect(
      await screen.findByText(/Deze rekening is niet \(meer\) van jou of bestaat niet meer/),
    ).toBeInTheDocument()
    expect(await confirmButton({ enabled: false })).toBeDisabled()
  })
})

/**
 * Eigenaar-guard op het ⋮-menu (H2).
 *
 * In het perspectief 'huishouden' versmalt `loadAccount` niet naar de eigen
 * rijen, dus partner B opent hier de GEDEELDE rekening van A. Zowel de
 * UPDATE-policy op `bank_accounts` als de verwijder-RPC zijn strikt eigen-rij:
 * B's klik op "Rekening verwijderen" liep via een 404 op de impact-GET (stil
 * geslikt → bevestiging zonder aantallen) naar TF404 → "Rekening niet
 * gevonden". Een knop die per definitie nooit kan slagen hoort er niet te
 * staan.
 */
describe('CashAccountView — mutatie-affordances alleen voor de eigenaar', () => {
  it('toont geen instellingenmenu op de gedeelde rekening van de partner', async () => {
    setupEnv()
    perspectiveState.current = 'household'
    render(<CashAccountView accountId="acc-3" />)

    await screen.findByRole('heading', { name: 'Gezamenlijke rekening' })
    expect(screen.queryByTitle('Instellingen')).not.toBeInTheDocument()
    expect(screen.queryByText('Rekening verwijderen')).not.toBeInTheDocument()
    expect(screen.queryByText('Rekening bewerken')).not.toBeInTheDocument()
  })

  it('toont het menu wél op je eigen rekening in hetzelfde perspectief', async () => {
    setupEnv()
    perspectiveState.current = 'household'
    render(<CashAccountView accountId="acc-1" />)

    await screen.findByRole('heading', { name: 'Betaalrekening' })
    fireEvent.click(await screen.findByTitle('Instellingen'))
    expect(await screen.findByText('Rekening verwijderen')).toBeInTheDocument()
  })
})

/**
 * Het archief verwijdert zichzelf niet: stap 2 van `delete_bank_account`
 * weigert met TF409. De route levert dat oordeel al mee (`isArchiveBucket`);
 * dit scherm consumeert het nu, in plaats van te leunen op de fout achteraf.
 */
describe('CashAccountView — de archief-rekening biedt geen verwijder-ingang', () => {
  it('verbergt "Rekening verwijderen" maar houdt "Rekening bewerken"', async () => {
    setupEnv()
    render(<CashAccountView accountId="acc-4" />)

    await screen.findByRole('heading', { name: 'Archief — verwijderde rekeningen' })
    fireEvent.click(await screen.findByTitle('Instellingen'))

    expect(await screen.findByText('Rekening bewerken')).toBeInTheDocument()
    expect(screen.queryByText('Rekening verwijderen')).not.toBeInTheDocument()
  })
})

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
