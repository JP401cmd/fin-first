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
// inline so testing-library queries can find them in the same root.
vi.mock('./bottom-sheet', () => ({
  BottomSheet: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="bottom-sheet" aria-label={title}>{children}</div>
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

// ── AI-flow transfer-behandeling (code-review H1) ─────────────────────────────
//
// GEDRAGSWIJZIGING: spiegelparen (fuzzy) worden NIET meer stil als transfer
// weggeschreven vóór de gebruiker iets ziet — ze komen als review-voorstel terug.
// IBAN/naam-detectie (sterk) blijft wél stil toegepast. Deze suite vergrendelt:
//  (a) spiegelpaar-only → geen silent write, wél een review-suggestie;
//  (b) een geaccepteerde eigen-rekening-suggestie schrijft transaction_type=
//      'transfer' bij opslaan;
//  (c) het IBAN/naam-pad blijft ongewijzigd silent toegepast.

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

    fireEvent.click(screen.getByRole('button', { name: /Vraag Will/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /Vraag Will/i }))
    await waitFor(() => {
      expect(screen.getAllByText(/Spiegelboeking/i).length).toBe(2)
    })

    // Accepteer beide voorstellen via de "OK"-knoppen.
    const okButtons = screen.getAllByRole('button', { name: /^OK$/i })
    expect(okButtons.length).toBe(2)
    okButtons.forEach((b) => fireEvent.click(b))

    // Opslaan.
    fireEvent.click(screen.getByRole('button', { name: /Opslaan/i }))

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

  it('(c) IBAN/naam-pad blijft ongewijzigd: sterk signaal wordt stil toegepast', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Vraag Will/i }))

    // De info-regel meldt de stil-gemarkeerde sterke transfer (1).
    await waitFor(() => {
      expect(screen.getByText(/automatisch gemarkeerd/i)).toBeInTheDocument()
    })

    // De sterke transfer is meteen (silent) als transfer weggeschreven.
    const transferWrites = transactionUpdates.filter((u) => u.payload.transaction_type === 'transfer')
    const writtenIds = transferWrites.flatMap((u) => u.ids)
    expect(writtenIds).toContain('strong-1')
    expect(writtenIds).not.toContain('normal-1')
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
