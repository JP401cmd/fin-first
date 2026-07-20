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

// ── Update-capture (voor de transfer-vlag-tests) ───────────────────────
// Elke `.update(payload)` op `transactions` die via `.in('id', ids)` of
// `.eq('id', id)` wordt afgesloten, leggen we per transactie-id vast zodat de
// tests kunnen asserten dat transaction_type='transfer' (niet) is meegeschreven.
type UpdatePayload = Record<string, unknown>
let transactionUpdates: { ids: string[]; payload: UpdatePayload }[] = []

// Privé-modus: de sheet leest profiles.privacy_mode via een own-row
// .select().eq('id').maybeSingle(). Per test in te stellen.
let profilePrivacyMode: boolean | null = false

// The fetch now pages with `.range(offset, ...)` (PostgREST capt één query op
// 1000 rijen, dus de fetch lust door in chunks van 1000). Elke `.from()` maakt
// een verse builder; we leveren `allTimeData` op de eerste pagina (offset 0) en
// een lege chunk daarna, zodat de loop netjes stopt. De testdata blijft < 1000
// rijen, dus in de praktijk volstaat één pagina.
function makeQueryBuilder(table: string) {
  // The chain returns itself until a terminal call is awaited. `.range()` and the
  // thenable resolution return the actual { data, error } pair; write-chains
  // (`update`/`insert`/`delete`) resolve to { error: null } and capture the payload.
  const builder: Record<string, (...args: unknown[]) => unknown> & {
    then?: (resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) => void
  } = {}
  // State carried through the chain so a terminal can read what was set upstream.
  let pendingUpdate: UpdatePayload | null = null
  const eqFilters: { col: string; val: unknown }[] = []

  const chainable = ['select', 'is', 'neq', 'order', 'not', 'ilike']
  for (const method of chainable) {
    builder[method] = (...args: unknown[]) => {
      supabaseCalls.push({ method, args })
      return builder
    }
  }
  builder.eq = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'eq', args })
    if (typeof args[0] === 'string') eqFilters.push({ col: args[0], val: args[1] })
    return builder
  }
  builder.update = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'update', args })
    pendingUpdate = (args[0] ?? {}) as UpdatePayload
    return builder
  }
  builder.insert = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'insert', args })
    return builder
  }
  builder.delete = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'delete', args })
    return builder
  }
  builder.in = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'in', args })
    // Terminal for batched applyAssignments writes.
    if (table === 'transactions' && pendingUpdate && args[0] === 'id') {
      transactionUpdates.push({ ids: (args[1] as string[]) ?? [], payload: pendingUpdate })
    }
    return Promise.resolve({ data: null, error: null })
  }
  builder.range = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'range', args })
    const offset = typeof args[0] === 'number' ? args[0] : 0
    // Alleen de eerste pagina levert data; volgende pagina's zijn leeg zodat de
    // pagineer-loop stopt. (Een error op pagina 0 propageert direct.)
    const data = offset === 0 ? allTimeData : []
    return Promise.resolve({ data, error: offset === 0 ? allTimeError : null })
  }
  // Own-row scalar-select terminal: de sheet leest profiles.privacy_mode zo.
  builder.maybeSingle = (...args: unknown[]) => {
    supabaseCalls.push({ method: 'maybeSingle', args })
    return Promise.resolve({
      data: table === 'profiles' ? { privacy_mode: profilePrivacyMode } : null,
      error: null,
    })
  }
  // Thenable: an `await`-ed builder without an explicit terminal. handleSave does
  // `await supabase.from('transactions').update(...).eq('id', id)` — capture that
  // single-id write here.
  builder.then = (resolve) => {
    if (table === 'transactions' && pendingUpdate) {
      const idFilter = eqFilters.find((f) => f.col === 'id')
      if (idFilter) transactionUpdates.push({ ids: [String(idFilter.val)], payload: pendingUpdate })
    }
    resolve({ data: null, error: null })
  }
  return builder
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-test' } }, error: null }),
    },
    from: (table: string) => {
      supabaseCalls.push({ method: 'from', args: [table] })
      return makeQueryBuilder(table)
    },
  }),
}))

// BottomSheet renders into a portal in real life — render its children
// inline so testing-library queries can find them in the same root. De
// `footerSlot` (waar de wizard zijn primaire acties in portalt) rendert ook
// inline, ná de content, zodat de vier keuzes + "Stoppen" vindbaar blijven.
vi.mock('./bottom-sheet', () => ({
  BottomSheet: ({ children, title, footerSlot }: { children: React.ReactNode; title?: string; footerSlot?: React.ReactNode }) => (
    <div data-testid="bottom-sheet" aria-label={title}>
      {children}
      {footerSlot}
    </div>
  ),
}))

// De Sleepmodus-overlay wordt via next/dynamic geladen en sleept dnd-kit mee —
// mock 'm als lichte stub zodat we alleen verifiëren dat de knop de overlay opent.
vi.mock('@/components/app/sleepmodus/sleepmodus-overlay', () => ({
  SleepmodusOverlay: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="sleepmodus-overlay">
      <button type="button" onClick={onExit}>Sluit sleepmodus</button>
    </div>
  ),
}))

// ── Auto-cat-context mock (gedeelde regel/eigen-rekening-context) ───────────
// De AI-flow draait een pre-detectie via loadAutoCatContext. We controleren het
// resultaat per test via `autoCatContext` zodat de IBAN/naam- en spiegelpaar-
// paden deterministisch te toetsen zijn.
import type { AutoCatContext } from '@/lib/auto-categorize'

const EIGEN_REKENING_BUDGET_ID = 'eigen-rekening-budget'
let autoCatContext: AutoCatContext = {
  budgets: [],
  corrections: [],
  freqMap: new Map(),
  ownIbans: new Set<string>(),
  ownNamePatterns: [],
  eigenRekeningBudgetId: EIGEN_REKENING_BUDGET_ID,
}
// Argument-capture: de sheet hoort de PLATTE budgetlijst door te geven
// (flatBudgets), ook wanneer de caller een boom (parents met geneste
// children) aanlevert — zie de salaris-regressietest hieronder.
let autoCatContextCalls: unknown[][] = []
vi.mock('@/lib/auto-categorize-context', () => ({
  loadAutoCatContext: (...args: unknown[]) => {
    autoCatContextCalls.push(args)
    return Promise.resolve(autoCatContext)
  },
}))

// ── Lokale privé-modus-mocks (geen WebGPU/model-download in de test) ──────────
// Per test instelbaar: geschiktheid, modelstaat en het resolver-resultaat. De
// factory-arrows lezen de vars lui (bij aanroep), zelfde patroon als de
// auto-cat-context-mock hierboven.
import type { CombinedAiBatchItem as LocalBatchItem, CombinedAiResult as LocalResult } from '@/lib/auto-categorize'

let localCapabilityOk = true
let localModelReady = true
const localResolverSpy = vi.fn((batch: LocalBatchItem[]): Promise<LocalResult[]> =>
  Promise.resolve(batch.map((t) => ({ id: t.id, budget_id: 'b-boodschappen', confidence: 0.95, reasoning: 'lokaal' }))),
)
const createLocalResolverSpy = vi.fn((..._args: unknown[]) => localResolverSpy)

vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: () =>
    Promise.resolve({
      ok: localCapabilityOk,
      reasons: localCapabilityOk ? [] : ['Je browser ondersteunt WebGPU niet.'],
      shaderF16: localCapabilityOk,
      deviceMemoryGb: 8,
    }),
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: () =>
    Promise.resolve({ state: localModelReady ? 'klaar' : 'niet-gedownload', bytes: null }),
}))
vi.mock('@/lib/ai/local/local-categorize-resolver', () => ({
  createLocalAiResolver: (...args: unknown[]) => createLocalResolverSpy(...args),
  LOCAL_INTERNAL_BATCH_SIZE: 10,
  // Canonieke waarde uit de resolver (WP-E2, feature #881): de sheet importeert
  // dit nu rechtstreeks i.p.v. een inline kopie, dus de mock moet 'm meenemen —
  // anders gooit vitest een fout bij het lezen van een niet-gemockte export.
  LOCAL_REP_BATCH_SIZE: 3,
  // Zekerheidsgrens die de wizard (via de sheet gerenderd) importeert om een
  // voorstel met lage confidence als "minder zeker" te labelen — zelfde reden.
  LOCAL_MIN_CONFIDENCE: 0.8,
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
  transactionUpdates = []
  autoCatContextCalls = []
  profilePrivacyMode = false
  localCapabilityOk = true
  localModelReady = true
  localResolverSpy.mockClear()
  createLocalResolverSpy.mockClear()
  // Default: AI-context met een eigen-rekening-budget, geen IBAN/naam/spiegelparen.
  autoCatContext = {
    budgets: [],
    corrections: [],
    freqMap: new Map(),
    ownIbans: new Set<string>(),
    ownNamePatterns: [],
    eigenRekeningBudgetId: EIGEN_REKENING_BUDGET_ID,
  }
  // Default AI-call: lege resultaten (per test te overschrijven).
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) })),
  )
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
    expect(methodCalls).toContain('range')
    expect(methodCalls).not.toContain('neq')

    expect(supabaseCalls.find(c => c.method === 'from')?.args).toEqual(['transactions'])
    expect(supabaseCalls.find(c => c.method === 'is')?.args).toEqual(['budget_id', null])
    expect(supabaseCalls.find(c => c.method === 'eq')?.args).toEqual(['account_id', 'acc-1'])
    // Eerste pagina: range(0, 999) — chunkgrootte 1000 (PostgREST-cap).
    expect(supabaseCalls.find(c => c.method === 'range')?.args).toEqual([0, 999])
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

// ── Choice-fase: handmatige opties blijven, optie 4 is weg ────────────────────
//
// Harde eis bij het verwijderen van de kaart "Eigen rekening herkennen":
// de twee handmatige paden (Sleepmodus + Handmatig categoriseren) moeten
// volledig blijven bestaan en werken. Deze suite borgt dat als regressie.

function renderSheet() {
  return render(
    <AICategorizeSheet
      transactions={monthTransactions}
      budgets={mockBudgets}
      budgetGroups={mockGroups}
      onClose={() => {}}
      onSaved={() => {}}
    />
  )
}

describe('AICategorizeSheet — choice-fase handmatige opties', () => {
  it('toont Sleepmodus en Handmatig categoriseren, maar NIET meer "Eigen rekening herkennen"', () => {
    renderSheet()

    expect(screen.getByRole('button', { name: /Sleepmodus/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Handmatig categoriseren/i })).toBeInTheDocument()
    // De aparte optie-4-kaart is bewust verwijderd (transfer-detectie zit nu
    // in "Slimme regels" en als pre-stap in de AI-flow).
    expect(screen.queryByText(/Eigen rekening herkennen/i)).toBeNull()
  })

  it('opent de review-/keuzelijst-flow via "Handmatig categoriseren"', () => {
    renderSheet()

    fireEvent.click(screen.getByRole('button', { name: /Handmatig categoriseren/i }))

    // Review-fase: sticky header + per transactie een keuzelijst ("Kies handmatig").
    expect(screen.getByText(/nog te beoordelen/i)).toBeInTheDocument()
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(monthTransactions.length)
    expect(screen.getAllByText('Kies handmatig').length).toBe(monthTransactions.length)
  })

  it('opent de Sleepmodus-overlay via de Sleepmodus-knop', async () => {
    renderSheet()

    fireEvent.click(screen.getByRole('button', { name: /Sleepmodus/i }))

    // De overlay wordt via next/dynamic lazy geladen — findBy wacht daarop.
    expect(await screen.findByTestId('sleepmodus-overlay')).toBeInTheDocument()
  })
})

// ── AI-flow transfer-behandeling ──────────────────────────────────────────────
//
// GEDRAGSWIJZIGING (combined pass, Notion-kaart jul 2026, eis 2): in de "Vraag
// Fin"-automaat wordt NIETS meer stil toegepast — óók sterke IBAN/naam-
// transfers landen als review-voorstel (label "Overboeking"). Deze suite
// vergrendelt:
//  (a) spiegelpaar-only → geen silent write, wél een review-suggestie;
//  (b) een geaccepteerde eigen-rekening-suggestie schrijft transaction_type=
//      'transfer' bij opslaan;
//  (c) óók het sterke IBAN/naam-pad wordt VOORGELEGD in plaats van stil
//      toegepast (was vóór jul 2026 silent — bewust omgedraaid).

// Eigen-rekening-budget zit zowel in de platte budgets als in een groep, zodat
// de naam-resolutie in TransactionRow en acceptSuggestion 'm vinden.
const eigenRekeningBudget = {
  id: EIGEN_REKENING_BUDGET_ID,
  name: 'Eigen rekening',
  slug: 'eigen-rekening-sub',
  type: 'expense',
  parent_id: null,
  sort_order: 0,
  default_limit: '0',
  icon: null,
  color: null,
  is_income: false,
} as unknown as Budget

const budgetsWithEigen: Budget[] = [eigenRekeningBudget]
const groupsWithEigen: { parent: Budget; children: Budget[] }[] = [
  { parent: eigenRekeningBudget, children: [eigenRekeningBudget] },
]

// Een spiegelpaar: gelijk bedrag, tegengesteld teken, zelfde dag, andere rekening.
function mirrorPairTxs() {
  return [
    {
      id: 'mp-out',
      date: '2026-04-01',
      description: 'Overboeking eruit',
      counterparty_name: 'Onbekend',
      counterparty_iban: null,
      amount: -300,
      import_hash: 'hash-mp-out',
      budget_id: null,
      account_id: 'acc-1',
    },
    {
      id: 'mp-in',
      date: '2026-04-01',
      description: 'Overboeking erin',
      counterparty_name: 'Onbekend',
      counterparty_iban: null,
      amount: 300,
      import_hash: 'hash-mp-in',
      budget_id: null,
      account_id: 'acc-2',
    },
  ]
}

describe('AICategorizeSheet — AI-flow transfer-behandeling', () => {
  it('(a) spiegelpaar-only: GEEN silent transfer-write, wél een review-voorstel', async () => {
    render(
      <AICategorizeSheet
        transactions={mirrorPairTxs()}
        budgets={budgetsWithEigen}
        budgetGroups={groupsWithEigen}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // De review-fase laadt; het spiegelpaar-voorstel (reasoning) verschijnt per rij.
    await waitFor(() => {
      expect(screen.getAllByText(/Spiegelboeking/i).length).toBe(2)
    })

    // Cruciaal: er is GEEN transfer-write gebeurd vóór de gebruiker iets deed.
    const transferWrites = transactionUpdates.filter((u) => u.payload.transaction_type === 'transfer')
    expect(transferWrites).toHaveLength(0)

    // De info-regel voor stil-gemarkeerde transfers verschijnt niet (0 sterke).
    expect(screen.queryByText(/automatisch gemarkeerd/i)).toBeNull()
  })

  it('(b) een geaccepteerde eigen-rekening-suggestie schrijft transaction_type=transfer', async () => {
    render(
      <AICategorizeSheet
        transactions={mirrorPairTxs()}
        budgets={budgetsWithEigen}
        budgetGroups={groupsWithEigen}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))
    // Spiegelparen zijn stage-1 → de wizard opent op stap 1 (bulk-kaart,
    // auto-uitgeklapt want ≤8 rijen) met per rij de "Spiegelboeking"-reasoning.
    await waitFor(() => {
      expect(screen.getAllByText(/Spiegelboeking/i).length).toBe(2)
    })

    // Accepteer beide voorstellen via de "OK"-knoppen.
    const okButtons = screen.getAllByRole('button', { name: /^OK$/i })
    expect(okButtons.length).toBe(2)
    okButtons.forEach((b) => fireEvent.click(b))

    // Flow-revisie #881: Opslaan zit in stap 3 (Controle). Alleen stage-1 →
    // "Verder zonder toepassen" gaat direct naar stap 3, daarna Opslaan.
    fireEvent.click(screen.getByRole('button', { name: /Verder zonder toepassen/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Klaar/i)).toBeInTheDocument()
    })

    // Beide geaccepteerde eigen-rekening-rijen zijn als transfer weggeschreven.
    const transferWrites = transactionUpdates.filter((u) => u.payload.transaction_type === 'transfer')
    const writtenIds = transferWrites.flatMap((u) => u.ids).sort()
    expect(writtenIds).toEqual(['mp-in', 'mp-out'])
    // De vlag hangt aan transaction_type, niet aan het budget — beide samen.
    transferWrites.forEach((u) => {
      expect(u.payload.budget_id).toBe(EIGEN_REKENING_BUDGET_ID)
      expect(u.payload.transaction_type).toBe('transfer')
    })
  })

  it('(c) sterk IBAN/naam-signaal wordt VOORGELEGD (label "Overboeking"), niet stil toegepast', async () => {
    // Eén transactie met een eigen-rekening-IBAN (sterk signaal) + één gewone.
    autoCatContext = {
      ...autoCatContext,
      ownIbans: new Set(['NL00OWN0000000000']),
    }
    const txs = [
      {
        id: 'strong-1',
        date: '2026-04-01',
        description: 'Naar eigen spaarrekening',
        counterparty_name: null,
        counterparty_iban: 'NL00 OWN 0000000000',
        amount: -500,
        import_hash: 'hash-strong-1',
        budget_id: null,
        account_id: 'acc-1',
      },
      {
        id: 'normal-1',
        date: '2026-04-02',
        description: 'Albert Heijn',
        counterparty_name: 'Albert Heijn',
        counterparty_iban: null,
        amount: -25,
        import_hash: 'hash-normal-1',
        budget_id: null,
        account_id: 'acc-1',
      },
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={budgetsWithEigen}
        budgetGroups={groupsWithEigen}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // Het sterke signaal is stage-1 → stap 1 (bulk-kaart) toont het als
    // review-voorstel met herkomst-label.
    await waitFor(() => {
      expect(screen.getByText(/Overboeking tussen eigen rekeningen/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/^Overboeking$/)).toBeInTheDocument()

    // Cruciaal (eis 2): NIETS is stil toegepast vóór de gebruiker iets deed.
    expect(transactionUpdates).toHaveLength(0)

    // Accepteer de transfer in stap 1 (OK) en loop door naar de controle-stap:
    // stap 1 → stap 2 (de gewone tx wacht op Fin) → "Stoppen" naar stap 3 → Opslaan.
    fireEvent.click(screen.getByRole('button', { name: /^OK$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Verder zonder toepassen/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Stoppen en controleren/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en controleren/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }))
    await waitFor(() => {
      expect(screen.getByText(/Klaar/i)).toBeInTheDocument()
    })
    const transferWrites = transactionUpdates.filter((u) => u.payload.transaction_type === 'transfer')
    const writtenIds = transferWrites.flatMap((u) => u.ids)
    expect(writtenIds).toContain('strong-1')
    expect(writtenIds).not.toContain('normal-1')
  })
})

// ── Combined pass in de sheet (Notion-kaart jul 2026) ─────────────────────────
//
// Eis 1+2: "Vraag Fin" draait eerst de gratis regelmotor, stuurt alleen
// onbekende tegenpartijen (1 representant per genormaliseerde tegenpartij) naar
// de AI en propageert het oordeel — en legt ALLES ter review voor met een
// herkomst-label per rij ("Regel" / "Fin" / "Afgeleid" / "Overboeking").

const boodschappenBudget = {
  id: 'b-boodschappen',
  name: 'Boodschappen',
  slug: 'boodschappen',
  budget_type: 'expense',
  ownership: 'personal',
  parent_id: null,
} as unknown as Budget

describe('AICategorizeSheet — combined pass (regels → AI → propagatie)', () => {
  it('regel-zekere rijen verschijnen als "Regel"-voorstel in de review ZONDER AI-call', async () => {
    // De auto-cat-context kent het boodschappen-budget → de trefwoordregel
    // ("albert heijn", confidence 1.0) dekt beide transacties. Er blijft niets
    // onbekends over → er mag GEEN enkele fetch naar /api/ai/categorize gaan.
    autoCatContext = { ...autoCatContext, budgets: [boodschappenBudget] }
    const txs = [
      makeTx('ah1', { description: 'Albert Heijn 1234', counterparty_name: 'Albert Heijn' }),
      makeTx('ah2', { description: 'Albert Heijn 5678', counterparty_name: 'Albert Heijn' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/^Regel$/).length).toBe(2)
    })
    // Beide voorstellen tonen het regel-budget; niets is toegepast (review-only).
    expect(screen.getAllByText('Boodschappen').length).toBeGreaterThanOrEqual(2)
    expect(transactionUpdates).toHaveLength(0)
    // Geen AI-call gedaan: de regelmotor dekte alles. (useHouseholdStatus doet
    // een eigen fetch naar /api/household/status — daarom op URL filteren.)
    const aiCalls = vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes('/api/ai/categorize'))
    expect(aiCalls).toHaveLength(0)
  })

  it('onbekende tegenpartij: 1 AI-call voor de representant, groepkaart toont aantal + Fin-voorstel, save propageert naar siblings (WP-E2, feature #881)', async () => {
    // Twee transacties van dezelfde onbekende tegenpartij → de combined pass
    // stuurt er precies ÉÉN naar de AI en leidt de tweede af. Sinds WP-C landt
    // dit als "Vraag Fin"-WIZARD (bulk-kaart + AI-groepkaart), niet meer als
    // platte lijst — de assertie hieronder toetst dus wizard-gedrag i.p.v. een
    // losse "Afgeleid"-rij (die bestaat in de wizard niet: de gepropageerde
    // sibling zit gevouwen in dezelfde groepkaart als de representant).
    const fetchMock = vi.fn((url: string, init?: { body?: string }) => {
      // Andere fetches (o.a. /api/household/status van useHouseholdStatus) → leeg ok.
      if (!String(url).includes('/api/ai/categorize')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      const body = JSON.parse(init?.body ?? '{}') as { transactions: { import_hash: string }[] }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: body.transactions.map((t) => ({
            import_hash: t.import_hash,
            budget_slug: 'boodschappen',
            budget_id: 'b-boodschappen',
            confidence: 0.9,
            reasoning: 'Lijkt op een supermarkt',
          })),
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const txs = [
      makeTx('nw1', { description: 'Betaling 1', counterparty_name: 'Nieuwe Winkel' }),
      makeTx('nw2', { description: 'Betaling 2', counterparty_name: 'Nieuwe Winkel' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // De groepkaart toont de tegenpartij, het aantal transacties in de groep en
    // het Fin-voorstel (label + budgetnaam + reasoning van de representant).
    await waitFor(() => {
      expect(screen.getByText('Nieuwe Winkel')).toBeInTheDocument()
    })
    expect(screen.getByText(/^Fin$/)).toBeInTheDocument()
    expect(screen.getByText('Boodschappen')).toBeInTheDocument()
    expect(screen.getByText(/Lijkt op een supermarkt/i)).toBeInTheDocument()
    // "2 transacties" — de groep bevat beide tx's van dezelfde tegenpartij. De
    // tekst is over een <span> (count) en een tekstnode (label) verdeeld, dus
    // een gewone regex-match faalt ("broken up by multiple elements") — een
    // functie-matcher op het samengevoegde textContent van het leaf-element werkt wel.
    expect(
      screen.getByText((_content, node) => {
        if (!node || !/2\s*transacties/.test(node.textContent ?? '')) return false
        return Array.from(node.children).every((child) => !/2\s*transacties/.test(child.textContent ?? ''))
      }),
    ).toBeInTheDocument()

    // Precies één AI-call, met precies één representant in de payload — de
    // motor stuurt nooit de hele groep naar de AI.
    const aiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/ai/categorize'))
    expect(aiCalls).toHaveLength(1)
    const sentBody = JSON.parse((aiCalls[0][1] as { body: string }).body) as { transactions: unknown[] }
    expect(sentBody.transactions).toHaveLength(1)
    // Review-only: niets toegepast vóór bevestiging.
    expect(transactionUpdates).toHaveLength(0)

    // Accepteer de hele groep in één keer ("Akkoord & verder") en sla op.
    fireEvent.click(screen.getByRole('button', { name: /Akkoord & verder/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Klaar/i)).toBeInTheDocument()
    })

    // Representant én sibling schrijven allebei het voorgestelde budget weg —
    // dat is de propagatie-belofte van de combined pass. category_source volgt
    // de motor-semantiek uit lib/auto-categorize.ts (propose(): elk AI-fase-
    // voorstel — representant én propagated — schrijft category_source 'ai'
    // weg; de 'ai' vs. 'propagated' onderscheid leeft alleen in het in-memory
    // `suggestion.source`-veld voor de UI-labels, niet in de DB-kolom.
    const byId = new Map(transactionUpdates.flatMap((u) => u.ids.map((id) => [id, u.payload])))
    expect(byId.get('nw1')).toMatchObject({ budget_id: 'b-boodschappen', category_source: 'ai' })
    expect(byId.get('nw2')).toMatchObject({ budget_id: 'b-boodschappen', category_source: 'ai' })
  })
})

// ── "Stoppen en controleren" (WP-E2, feature #881) ───────────────────────
//
// De wizard toont de AI-groepen één tegelijk, maar de motor kan al meerdere
// groepen tegelijk hebben beantwoord binnen dezelfde AI-ronde (cloud-pad: tot
// 20 representanten per call). Deze suite vergrendelt dat "Stoppen en
// controleren" NOOIT een voorstel opslaat dat wel al binnen is (in `rows` staat)
// maar niet expliciet is geaccepteerd — ook al is de tweede groep na acceptatie
// van de eerste meteen zichtbaar (en dus "prefetched-ongetoond" op het moment
// van stoppen).

describe('AICategorizeSheet — Stoppen en controleren slaat alleen geaccepteerde rijen op', () => {
  it('een niet-geaccepteerd, al binnengekomen groepsvoorstel wordt NIET opgeslagen bij Stoppen', async () => {
    const fetchMock = vi.fn((url: string, init?: { body?: string }) => {
      if (!String(url).includes('/api/ai/categorize')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      const body = JSON.parse(init?.body ?? '{}') as { transactions: { import_hash: string }[] }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          // Beide representanten komen in dezelfde AI-ronde terug (cloud-pad,
          // geen prefetch-gate) — group2 staat dus al "klaar" in `rows` zodra
          // group1 als eerste kaart getoond wordt.
          results: body.transactions.map((t) => ({
            import_hash: t.import_hash,
            budget_slug: 'boodschappen',
            budget_id: 'b-boodschappen',
            confidence: 0.9,
            reasoning: 'AI-voorstel',
          })),
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const txs = [
      makeTx('grp1', { description: 'Betaling 1', counterparty_name: 'Eerste Winkel' }),
      makeTx('grp2', { description: 'Betaling 2', counterparty_name: 'Tweede Winkel' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // Eerste groepkaart verschijnt (largest-first met gelijke grootte 1 → op
    // datum; beide txs delen dezelfde datum in makeTx, dus insertievolgorde).
    await waitFor(() => {
      expect(screen.getByText('Eerste Winkel')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Akkoord & verder/i }))

    // Tweede groep is nu zichtbaar (het voorstel kwam al binnen in dezelfde
    // ronde) — maar de gebruiker doet er NIETS mee.
    await waitFor(() => {
      expect(screen.getByText('Tweede Winkel')).toBeInTheDocument()
    })

    // Flow-revisie #881: "Stoppen en controleren" routeert naar stap 3
    // (Controle) i.p.v. direct op te slaan; daar bevestigt Opslaan de bewaring.
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en controleren/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Opslaan$/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Klaar/i)).toBeInTheDocument()
    })

    // Alleen de geaccepteerde eerste groep is bewaard; het al-binnengekomen,
    // niet-geaccepteerde tweede voorstel NIET.
    const savedIds = transactionUpdates.flatMap((u) => u.ids)
    expect(savedIds).toContain('grp1')
    expect(savedIds).not.toContain('grp2')
  })
})

// ── "Stoppen" routeert naar de controle-stap (flow-revisie #881) ──────────────
//
// Gedragswijziging: "Stoppen en controleren" slaat NIET meer direct op maar
// routeert vanaf stap 1/2 naar stap 3 (Controle & opslaan). Daar bepaalt de
// gebruiker met "Opslaan" wat er bewaard wordt — en verliesvrij: alleen wat
// geaccepteerd is landt in de DB.

function stopFetchMock() {
  return vi.fn((url: string, init?: { body?: string }) => {
    if (!String(url).includes('/api/ai/categorize')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    const body = JSON.parse(init?.body ?? '{}') as { transactions: { import_hash: string }[] }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        results: body.transactions.map((t) => ({
          import_hash: t.import_hash,
          budget_slug: 'boodschappen',
          budget_id: 'b-boodschappen',
          confidence: 0.9,
          reasoning: 'AI-voorstel',
        })),
      }),
    })
  })
}

describe('AICategorizeSheet — Stoppen routeert naar de controle-stap', () => {
  it('0 geaccepteerd → Stoppen toont stap 3 met Opslaan uitgeschakeld en schrijft niets weg', async () => {
    vi.stubGlobal('fetch', stopFetchMock())
    const txs = [
      makeTx('s1', { description: 'Betaling 1', counterparty_name: 'Eerste Winkel' }),
      makeTx('s2', { description: 'Betaling 2', counterparty_name: 'Tweede Winkel' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))
    await waitFor(() => {
      expect(screen.getByText('Eerste Winkel')).toBeInTheDocument()
    })

    // Niets accepteren, direct stoppen → stap 3 (Controle).
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en controleren/i }))

    // Opslaan bestaat maar is uitgeschakeld (0 geaccepteerd) → niets kan weggeschreven.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Opslaan$/i })).toBeDisabled()
    })
    expect(screen.getByText('Controle')).toBeInTheDocument()
    expect(transactionUpdates).toHaveLength(0)
  })

  it('>0 geaccepteerd → Stoppen → Opslaan bewaart alléén de geaccepteerde groep', async () => {
    vi.stubGlobal('fetch', stopFetchMock())
    const txs = [
      makeTx('k1', { description: 'Betaling 1', counterparty_name: 'Eerste Winkel' }),
      makeTx('k2', { description: 'Betaling 2', counterparty_name: 'Tweede Winkel' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))
    await waitFor(() => {
      expect(screen.getByText('Eerste Winkel')).toBeInTheDocument()
    })

    // Eén groep accepteren, dan stoppen — de andere blijft onbeoordeeld.
    fireEvent.click(screen.getByRole('button', { name: /Akkoord & verder/i }))
    await waitFor(() => {
      expect(screen.getByText('Tweede Winkel')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en controleren/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Opslaan$/i })).toBeInTheDocument()
    })
    // GWT-10: vóór de gebruiker "Opslaan" indrukt is er nog GEEN enkele
    // supabase-update-call gebeurd — "Stoppen" zelf slaat niets op — en de al
    // geaccepteerde groep staat gewoon zichtbaar in de controle-stap.
    expect(transactionUpdates).toHaveLength(0)
    expect(screen.getByText('Eerste Winkel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Klaar/i)).toBeInTheDocument()
    })

    // Verliesvrij: alleen de geaccepteerde eerste groep is bewaard.
    const savedIds = transactionUpdates.flatMap((u) => u.ids)
    expect(savedIds).toContain('k1')
    expect(savedIds).not.toContain('k2')
  })
})

// ── Budget-boom flatten (salaris-bug jun 2026) ────────────────────────────────
// budgets-client geeft de budget-BOOM door (parents met geneste children);
// zonder interne flatten waren deelbudgetten onzichtbaar voor de Slimme
// regels (slugMap/idMap-miss) terwijl de AI-route wél werkte. De sheet hoort
// de PLATTE lijst (parent + children) aan de auto-cat-context te leveren —
// haal de flatBudgets-memo weg en deze test wordt rood.

describe('AICategorizeSheet — budget-boom flatten', () => {
  it('levert de auto-cat-context een platte lijst incl. deelbudgetten bij een boom-vormige budgets-prop', async () => {
    const child = {
      id: 'b-salaris',
      slug: 'salaris-uitkering',
      name: 'Salaris & uitkering',
      budget_type: 'income',
      ownership: 'personal',
      parent_id: 'b-inkomen',
    } as unknown as Budget
    const parent = {
      id: 'b-inkomen',
      slug: 'inkomen',
      name: 'Inkomen',
      budget_type: 'income',
      ownership: 'personal',
      parent_id: null,
      children: [child],
    } as unknown as Budget

    render(
      <AICategorizeSheet
        transactions={monthTransactions}
        budgets={[parent]}
        budgetGroups={[{ parent, children: [child] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Slimme regels/i }))

    await waitFor(() => {
      expect(autoCatContextCalls.length).toBeGreaterThan(0)
    })

    // Tweede argument = de budgetlijst die de sheet doorgeeft. Parent ÉN child
    // moeten als top-level items aanwezig zijn (geflattened, gededupliceerd).
    const passed = autoCatContextCalls[0][1] as Budget[]
    const ids = passed.map((b) => b.id)
    expect(ids).toEqual(expect.arrayContaining(['b-inkomen', 'b-salaris']))
    expect(ids.filter((id) => id === 'b-salaris').length).toBe(1)
  })
})

// ── Privé-modus: lokale vs. cloud resolver-keuze (ADR 0043, fase 3) ────────────
//
// De sheet leest profiles.privacy_mode bij "Vraag Fin" en kiest de resolver:
//  - uit (default) → exact bestaand cloud-gedrag (fetch /api/ai/categorize).
//  - aan + klaar → uitsluitend de lokale on-device resolver, GEEN cloud-call.
//  - aan + niet klaar → AI-fase geblokkeerd met eerlijke melding; regelmotor-
//    voorstellen (stap 1) blijven werken; NOOIT een stille cloud-fallback.

function aiCategorizeFetches() {
  return vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes('/api/ai/categorize'))
}

describe('AICategorizeSheet — privé-modus resolver-keuze', () => {
  it('privacy_mode UIT: gebruikt de cloud-resolver, niet de lokale', async () => {
    profilePrivacyMode = false
    autoCatContext = { ...autoCatContext, budgets: [boodschappenBudget] }
    const txs = [makeTx('u1', { description: 'Betaling', counterparty_name: 'Onbekende Zaak' })]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // De wizard toont de onbekende tegenpartij als AI-groepkaart (geen platte
    // "nog te beoordelen"-header meer in wizard-modus).
    await waitFor(() => {
      expect(screen.getByText('Onbekende Zaak')).toBeInTheDocument()
    })
    // Cloud-pad gebruikt (één AI-call), lokale resolver niet aangeraakt.
    expect(aiCategorizeFetches().length).toBe(1)
    expect(createLocalResolverSpy).not.toHaveBeenCalled()
  })

  it('privacy_mode AAN + klaar: gebruikt de lokale resolver, GEEN cloud-call', async () => {
    profilePrivacyMode = true
    localCapabilityOk = true
    localModelReady = true
    autoCatContext = { ...autoCatContext, budgets: [boodschappenBudget] }
    const txs = [makeTx('l1', { description: 'Betaling', counterparty_name: 'Onbekende Zaak' })]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    await waitFor(() => {
      expect(screen.getByText(/^Fin$/)).toBeInTheDocument()
    })
    // Lokale resolver gebruikt met het onbekende item; geen enkele cloud-call.
    expect(createLocalResolverSpy).toHaveBeenCalledTimes(1)
    expect(localResolverSpy).toHaveBeenCalled()
    expect(aiCategorizeFetches().length).toBe(0)
    // Het lokale voorstel landt als "Fin" op het boodschappen-budget.
    expect(screen.getAllByText('Boodschappen').length).toBeGreaterThanOrEqual(1)
  })

  it('privacy_mode AAN + capability-fout: blokkeert eerlijk met de capability-melding, geen cloud-fallback', async () => {
    profilePrivacyMode = true
    localCapabilityOk = false // geen geschikte WebGPU → capability-tak
    autoCatContext = { ...autoCatContext, budgets: [boodschappenBudget] }
    // Eén regel-zekere (Albert Heijn → Regel) + één onbekende (dwingt de AI-fase).
    const txs = [
      makeTx('r1', { description: 'Albert Heijn 1', counterparty_name: 'Albert Heijn' }),
      makeTx('x1', { description: 'Betaling', counterparty_name: 'Onbekende Zaak' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    // Gesplitste melding (fix 19 jul): capability-tak = de concrete reden uit de
    // capability-check + de transiënte-flap-hint — niet meer de oude generieke tekst.
    await waitFor(() => {
      expect(screen.getByText(/Je browser ondersteunt WebGPU niet/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/herstart dan je browser/i)).toBeInTheDocument()
    // Regelmotor-voorstel blijft werken (stap 1). Async wachten: de stage-1-review
    // rendert pas zodra structPinned settelt (aparte async-tik dan de capability-
    // melding) — synchroon getByText was hier load-flaky (task #26).
    expect(await screen.findByText(/^Regel$/)).toBeInTheDocument()
    // Fail-closed: geen lokale resolver gebouwd én géén cloud-fallback.
    expect(createLocalResolverSpy).not.toHaveBeenCalled()
    expect(aiCategorizeFetches().length).toBe(0)
  })

  it('privacy_mode AAN + model weg (eviction): blokkeert met de download-opnieuw-melding, geen cloud-fallback', async () => {
    profilePrivacyMode = true
    localCapabilityOk = true
    localModelReady = false // cache-eviction / nooit voltooide download → model-missing-tak
    autoCatContext = { ...autoCatContext, budgets: [boodschappenBudget] }
    const txs = [makeTx('x2', { description: 'Betaling', counterparty_name: 'Onbekende Zaak' })]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    await waitFor(() => {
      expect(screen.getByText(/mogelijk heeft je browser het verwijderd om ruimte te maken/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Download het opnieuw via Mijn → Privacy/i)).toBeInTheDocument()
    // Fail-closed blijft gelden: geen lokale resolver, géén cloud-fallback.
    expect(createLocalResolverSpy).not.toHaveBeenCalled()
    expect(aiCategorizeFetches().length).toBe(0)
  })
})

// ── GWT-1: wizard-modus rendert nooit de globale lijst-header (regressie) ─────
//
// De platte "X van Y nog te beoordelen"-sticky-header + "Alles goedkeuren"
// hoort uitsluitend bij reviewMode 'list' (het handmatige pad). Elke stap van
// de wizard toont zijn eigen teller/acties — deze globale header mag in
// wizard-modus nooit meerenderen (CLAUDE.md-comment in ai-categorize-sheet.tsx
// regel ~1165: "wordt in wizard-modus bewust NIET gerenderd").

describe('AICategorizeSheet — GWT-1 · wizard-modus zonder globale lijst-header', () => {
  it('reviewMode "wizard" toont nooit de sticky "nog te beoordelen"-header of "Alles goedkeuren"', async () => {
    const txs = [makeTx('w1', { description: 'Betaling', counterparty_name: 'Onbekende Zaak' })]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))

    await waitFor(() => {
      expect(screen.getByText('Onbekende Zaak')).toBeInTheDocument()
    })

    expect(screen.queryByText(/nog te beoordelen/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Alles goedkeuren$/i })).toBeNull()
  })
})

// ── GWT-16: sleepmodus-terugkeer landt weer in de wizard (stap 2), niet het
//    keuzescherm en niet terug bij stap 1 ─────────────────────────────────────
//
// "Zelf indelen (sleepmodus)" vanuit een AI-groepkaart (splitGroup) opent de
// overlay met exact die groep; bij afsluiten (finishSleepSubset) verwijdert de
// sheet die rijen uit `rows` en zet phase terug naar 'review' — de wizard-stap
// (wizardStep) leeft in de sheet en overleeft dat uitstapje ongewijzigd.

describe('AICategorizeSheet — GWT-16 · sleepmodus-terugkeer naar stap 2', () => {
  it('na "Sluit sleepmodus" verschijnt de volgende wachtende groep in de wizard — niet het keuzescherm, niet stap 1', async () => {
    vi.stubGlobal('fetch', stopFetchMock())
    const txs = [
      makeTx('sm1', { description: 'Betaling 1', counterparty_name: 'Sleep Winkel' }),
      makeTx('sm2', { description: 'Betaling 2', counterparty_name: 'Tweede Winkel' }),
    ]

    render(
      <AICategorizeSheet
        transactions={txs}
        budgets={[boodschappenBudget]}
        budgetGroups={[{ parent: boodschappenBudget, children: [boodschappenBudget] }]}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Vraag Fin/i }))
    await waitFor(() => {
      expect(screen.getByText('Sleep Winkel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Zelf indelen \(sleepmodus\)/i }))
    expect(await screen.findByTestId('sleepmodus-overlay')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Sluit sleepmodus/i }))

    // Terug in de wizard: de volgende groep verschijnt vanzelf (stap 2 blijft
    // actief) — geen terugval naar het keuzescherm ("Vraag Fin") en geen
    // terugval naar stap 1 ("Fin herkende").
    await waitFor(() => {
      expect(screen.getByText('Tweede Winkel')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('sleepmodus-overlay')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Vraag Fin$/i })).toBeNull()
    expect(screen.queryByText(/Fin herkende/i)).toBeNull()
  })
})
