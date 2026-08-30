import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/checkin/budgets — besteed per hoofdbudget, deze maand.
 *
 * Deze route droeg TWEE fouten van dezelfde klasse, en beide zijn hier
 * vastgelegd omdat ze elkaar maskeerden:
 *
 *  1. **Eigen, ongefilterde bestedingssom** (`Σ|amount|` over elke rij mét
 *     budget_id). Een inkomst op een uitgaven-budget en een
 *     eigen-rekening-transfer telden allebei als besteding. De check-in liet
 *     daardoor een ander bedrag zien dan de budgetten-pagina over exact
 *     dezelfde maand.
 *  2. **Dubbeltellende parent-rollup**: de kindersom werd BÓVENOP de eigen som
 *     van de parent geteld. Canoniek is `spentForBudget`: óf de kinderen, óf de
 *     eigen directe besteding — nooit allebei.
 *
 * Fout 2 kon alleen zichtbaar worden bij een parent die zelf óók transacties
 * draagt; de eerste testcase forceert precies dat.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET } from './route'

type BudgetRow = {
  id: string
  name: string
  icon: string
  budget_type: string
  default_limit: number
  interval: string
  parent_id: string | null
}
type TxRow = {
  id?: string
  amount: number
  budget_id: string | null
  transaction_type?: string | null
  is_income?: boolean | null
  is_split?: boolean | null
}
type SplitRow = { budget_id: string | null; amount: number }

/**
 * Minimale chainbare Supabase-stub: elke tabel levert zijn eigen rijen, elke
 * filter-methode is een no-op die `this` teruggeeft. De route filtert zelf in
 * JS op parent_id/archive, dus dat is genoeg om het rekenpad te dekken.
 */
function buildClient(budgets: BudgetRow[], transactions: TxRow[], splits: SplitRow[]) {
  const rowsFor = (table: string): unknown[] =>
    table === 'budgets' ? budgets
    : table === 'transactions' ? transactions
    : table === 'transaction_splits' ? splits
    : []

  function chain(table: string): Record<string, unknown> {
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: rowsFor(table), error: null })),
    }
    return new Proxy(target, {
      get(t, prop) {
        if (prop in t) return t[prop as string]
        return () => chain(table)
      },
    })
  }

  return { from: (table: string) => chain(table) }
}

async function callRoute(budgets: BudgetRow[], transactions: TxRow[], splits: SplitRow[] = []) {
  mockCreateClient.mockResolvedValue(buildClient(budgets, transactions, splits))
  mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
  const res = await GET()
  const body = (await res.json()) as { budgets: Array<{ id: string; limit: number; spent: number }> }
  return body.budgets
}

const parent = (id: string, type: string, limit: number): BudgetRow => ({
  id, name: id, icon: '', budget_type: type, default_limit: limit, interval: 'monthly', parent_id: null,
})
const child = (id: string, parentId: string, limit: number): BudgetRow => ({
  id, name: id, icon: '', budget_type: 'expense', default_limit: limit, interval: 'monthly', parent_id: parentId,
})

describe('GET /api/checkin/budgets', () => {
  beforeEach(() => {
    mockCreateClient.mockReset()
    mockGetAuthClaims.mockReset()
  })

  it('DUBBELTELLING: een parent met kinderen telt zijn EIGEN rij niet meer mee', async () => {
    const budgets = [parent('wonen', 'expense', 0), child('gwl', 'wonen', 200), child('huur', 'wonen', 1200)]
    const transactions: TxRow[] = [
      { amount: -100, budget_id: 'wonen' }, // rechtstreeks op de parent
      { amount: -150, budget_id: 'gwl' },
      { amount: -900, budget_id: 'huur' },
    ]
    const rows = await callRoute(budgets, transactions)
    // Oude rollup: 100 (eigen) + 150 + 900 = 1150. Canoniek: kinderen winnen.
    expect(rows.find((b) => b.id === 'wonen')?.spent).toBe(1050)
  })

  it('een parent ZONDER kinderen houdt zijn eigen directe besteding', async () => {
    const budgets = [parent('boodschappen', 'expense', 500)]
    const rows = await callRoute(budgets, [{ amount: -120, budget_id: 'boodschappen' }])
    expect(rows.find((b) => b.id === 'boodschappen')?.spent).toBe(120)
  })

  it('transfers tellen niet mee en een inkomst gaat eraf (canonieke richting)', async () => {
    const budgets = [parent('inventaris', 'expense', 1642)]
    const transactions: TxRow[] = [
      { amount: -1265, budget_id: 'inventaris' },
      { amount: 6000, budget_id: 'inventaris' }, // inkomst ⇒ −6000
      { amount: -500, budget_id: 'inventaris', transaction_type: 'transfer' }, // ⇒ 0
    ]
    const rows = await callRoute(budgets, transactions)
    // Oude som: 1265 + 6000 + 500 = 7765. Canoniek: 1265 − 6000 = −4735.
    expect(rows.find((b) => b.id === 'inventaris')?.spent).toBe(-4735)
  })

  it('op een income-budget IS de positieve rij de realisatie (richting per budget)', async () => {
    const budgets = [parent('salaris', 'income', 4000)]
    const rows = await callRoute(budgets, [
      { amount: 3200, budget_id: 'salaris' },
      { amount: -100, budget_id: 'salaris' }, // correctie/storno gaat eraf
    ])
    expect(rows.find((b) => b.id === 'salaris')?.spent).toBe(3100)
  })

  it('een kind van een ARCHIVE-parent houdt zijn richting (de type-map ziet alle budgetten)', async () => {
    // De route toont archive-parents niet, maar ze moeten wél in de type-map
    // zitten: anders verliest hun kind zijn richting en telt élk bedrag
    // absoluut. Hier controleren we dat via een zichtbare expense-parent naast
    // een archive-parent met kind — de expense-rij mag niet verschuiven.
    const budgets = [
      parent('eigen-rekening', 'archive', 0),
      child('overboekingen', 'eigen-rekening', 0),
      parent('boodschappen', 'expense', 500),
    ]
    const rows = await callRoute(budgets, [
      { amount: -50, budget_id: 'overboekingen', transaction_type: 'transfer' },
      { amount: -120, budget_id: 'boodschappen' },
    ])
    expect(rows.map((b) => b.id)).toEqual(['boodschappen']) // archive niet getoond
    expect(rows[0].spent).toBe(120)
  })

  it('split-regels tellen op hun eigen budget; de ouderrij wordt overgeslagen', async () => {
    const budgets = [parent('wonen', 'expense', 0), child('gwl', 'wonen', 200), child('huur', 'wonen', 1200)]
    const transactions: TxRow[] = [
      { id: 'ouder', amount: -29.24, budget_id: 'gwl', is_split: true },
    ]
    const splits: SplitRow[] = [
      { budget_id: 'gwl', amount: 4.5 },
      { budget_id: 'huur', amount: 24.74 },
    ]
    const rows = await callRoute(budgets, transactions, splits)
    // Ouderrij overgeslagen, splits opgeteld; parent-rollup = som van kinderen.
    expect(rows.find((b) => b.id === 'wonen')?.spent).toBeCloseTo(29.24, 10)
  })
})
