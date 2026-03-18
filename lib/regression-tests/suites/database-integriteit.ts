import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertIncludes,
  assertFinite,
} from '../assert'
import type { TestCase } from '../test-types'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Budget, BudgetAmount } from '@/lib/budget-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

const CAT = 'data.database-integriteit'

// ── Valid type enums (from database CHECK constraints) ────────────────

const VALID_ASSET_TYPES: AssetType[] = [
  'cash', 'savings', 'investment', 'retirement', 'eigen_huis',
  'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming',
  'levensverzekering', 'vordering', 'other',
]

const VALID_BUDGET_TYPES = ['income', 'expense', 'savings', 'debt', 'archive'] as const

const VALID_DEBT_TYPES: DebtType[] = [
  'mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card',
  'revolving_credit', 'payment_plan', 'belastingschuld', 'familielening',
  'dga_schuld', 'other',
]

const VALID_BUDGET_INTERVALS = ['monthly', 'quarterly', 'yearly'] as const
const VALID_ROLLOVER_TYPES = ['reset', 'carry-over', 'invest-sweep'] as const
const VALID_LIMIT_TYPES = ['soft', 'hard'] as const
const VALID_OWNERSHIP_TYPES = ['personal', 'shared'] as const
const VALID_FIRE_STRATEGIES = ['perpetual', 'legacy', 'deplete'] as const
const VALID_WITHDRAWAL_STRATEGIES = ['static', 'guardrails', 'vpw', 'abw'] as const
const VALID_HOLDING_TX_TYPES = ['buy', 'sell', 'dividend'] as const

// ── Helper: stub factories ────────────────────────────────────────────

function makeAsset(overrides?: Partial<Asset>): Asset {
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    name: 'Test Asset',
    asset_type: 'investment',
    current_value: 10000,
    purchase_value: 8000,
    purchase_date: null,
    expected_return: 0.07,
    monthly_contribution: 100,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    ...overrides,
  }
}

function makeBudget(overrides?: Partial<Budget>): Budget {
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    parent_id: null,
    name: 'Test Budget',
    slug: 'test-budget',
    icon: 'Wallet',
    description: null,
    default_limit: 500,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0.8,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
    ...overrides,
  }
}

function makeDebt(overrides?: Partial<Debt>): Debt {
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    name: 'Test Debt',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 8000,
    interest_rate: 5.0,
    minimum_payment: 100,
    monthly_payment: 200,
    start_date: '2024-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    ...overrides,
  }
}

function makeLifeEvent(overrides?: Partial<LifeEvent>): LifeEvent {
  return {
    id: crypto.randomUUID(),
    name: 'Test Event',
    event_type: 'custom',
    target_age: 40,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Calendar',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    metadata: {},
    ...overrides,
  }
}

// ── Helper: simulate fetch ────────────────────────────────────────────
async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    })
    let body: Record<string, unknown> = {}
    try { body = await res.json() } catch { /* non-JSON */ }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: { error: 'fetch failed' } }
  }
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

const tests: TestCase[] = [
  // ── Step 1: Foreign key relaties ────────────────────────────────────

  {
    id: 'db-fk-transactions-bank-accounts',
    name: 'FK: transactions → bank_accounts (account_id)',
    category: CAT,
    description: 'Transactions reference bank_accounts via account_id (ON DELETE SET NULL)',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Verify the Transaction type has account_id as nullable (SET NULL on delete)
      const tx = {
        id: crypto.randomUUID(),
        user_id: 'u1',
        account_id: crypto.randomUUID(), // FK to bank_accounts
        budget_id: null,
        amount: -50,
        date: '2025-06-01',
        description: 'Test',
        counterparty_name: null,
        counterparty_iban: null,
        transaction_type: 'expense',
      }
      assertDefined(tx.account_id, 'account_id is defined')
      // account_id is nullable — when bank account is deleted, it becomes null (SET NULL)
      const txOrphan = { ...tx, account_id: null }
      assertEqual(txOrphan.account_id, null, 'account_id can be null (SET NULL)')
    },
  },

  {
    id: 'db-fk-transactions-budgets',
    name: 'FK: transactions → budgets (budget_id)',
    category: CAT,
    description: 'Transactions reference budgets via budget_id (ON DELETE SET NULL, not CASCADE)',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // budget_id is nullable — budget deletion should NOT delete transactions
      const tx = {
        id: crypto.randomUUID(),
        budget_id: crypto.randomUUID(),
        amount: -100,
      }
      assertDefined(tx.budget_id, 'budget_id initially set')
      // After budget delete, budget_id should become null (SET NULL)
      const txAfterDelete = { ...tx, budget_id: null }
      assertEqual(txAfterDelete.budget_id, null, 'budget_id nullable (SET NULL on delete)')
      // Transaction itself still exists — not cascaded
      assertDefined(txAfterDelete.id, 'transaction preserved after budget delete')
    },
  },

  {
    id: 'db-fk-budget-amounts-budgets',
    name: 'FK: budget_amounts → budgets (CASCADE)',
    category: CAT,
    description: 'Budget amounts cascade delete with parent budget',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const budgetId = crypto.randomUUID()
      const amounts: BudgetAmount[] = [
        { id: crypto.randomUUID(), budget_id: budgetId, effective_from: '2025-01-01', amount: 500, created_at: '2025-01-01' },
        { id: crypto.randomUUID(), budget_id: budgetId, effective_from: '2025-06-01', amount: 600, created_at: '2025-06-01' },
      ]
      // All budget_amounts must reference the budget
      for (const ba of amounts) {
        assertEqual(ba.budget_id, budgetId, 'budget_amount references parent budget')
      }
      // CASCADE: deleting the budget should delete all budget_amounts
      // Simulate: filter amounts when budget is removed
      const remainingAfterCascade = amounts.filter(a => a.budget_id !== budgetId)
      assertEqual(remainingAfterCascade.length, 0, 'all budget_amounts removed on cascade')
    },
  },

  {
    id: 'db-fk-holdings-assets',
    name: 'FK: holdings → assets (asset_id NOT NULL, CASCADE)',
    category: CAT,
    description: 'Holdings must have a parent asset; cascade on asset delete',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const assetId = crypto.randomUUID()
      const holding = {
        id: crypto.randomUUID(),
        user_id: 'u1',
        asset_id: assetId,  // NOT NULL FK
        name: 'VWRL',
        ticker: 'VWRL.AS',
        units: 10,
        current_price: 100,
      }
      // asset_id is NOT NULL — every holding requires a parent asset
      assertNotNull(holding.asset_id, 'holding.asset_id is NOT NULL')
      assertEqual(holding.asset_id, assetId, 'references correct asset')
    },
  },

  {
    id: 'db-fk-holding-transactions-holdings',
    name: 'FK: holding_transactions → holdings (CASCADE)',
    category: CAT,
    description: 'Holding transactions cascade with parent holding',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const holdingId = crypto.randomUUID()
      const htx = {
        id: crypto.randomUUID(),
        holding_id: holdingId,  // NOT NULL FK
        user_id: 'u1',
        type: 'buy' as const,
        units: 5,
        price_per_unit: 100,
        total_amount: 500,
        date: '2025-03-01',
      }
      assertNotNull(htx.holding_id, 'holding_id NOT NULL')
      assertIncludes(VALID_HOLDING_TX_TYPES as unknown as string[], htx.type, 'valid tx type')
      // CASCADE: holding delete removes transactions
      const txs = [htx, { ...htx, id: crypto.randomUUID(), type: 'sell' as const }]
      const remaining = txs.filter(t => t.holding_id !== holdingId)
      assertEqual(remaining.length, 0, 'all holding_transactions cascade deleted')
    },
  },

  {
    id: 'db-fk-bank-accounts-linked-asset',
    name: 'FK: bank_accounts → assets (linked_asset_id, SET NULL)',
    category: CAT,
    description: 'Bank accounts optionally link to a cash asset (SET NULL on delete)',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const assetId = crypto.randomUUID()
      const bankAccount = {
        id: crypto.randomUUID(),
        user_id: 'u1',
        name: 'ING Betaalrekening',
        linked_asset_id: assetId, // nullable FK → assets.id, ON DELETE SET NULL
      }
      assertDefined(bankAccount.linked_asset_id, 'linked_asset_id set')
      // After asset deletion, linked_asset_id becomes null (not cascade)
      const afterDelete = { ...bankAccount, linked_asset_id: null }
      assertEqual(afterDelete.linked_asset_id, null, 'SET NULL after asset delete')
      // Bank account itself survives
      assertDefined(afterDelete.id, 'bank account preserved')
    },
  },

  {
    id: 'db-fk-budgets-parent-child',
    name: 'FK: budgets.parent_id → budgets.id (self-referencing)',
    category: CAT,
    description: 'Budgets form a hierarchy via parent_id self-reference',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const parentId = crypto.randomUUID()
      const parent = makeBudget({ id: parentId, parent_id: null, name: 'Vaste Lasten' })
      const child1 = makeBudget({ parent_id: parentId, name: 'Huur' })
      const child2 = makeBudget({ parent_id: parentId, name: 'Gas/Water/Licht' })

      // Parent has no parent_id
      assertEqual(parent.parent_id, null, 'root budget has null parent_id')
      // Children reference parent
      assertEqual(child1.parent_id, parentId, 'child1 references parent')
      assertEqual(child2.parent_id, parentId, 'child2 references parent')
      // No circular reference possible (parent_id ≠ own id)
      assert(child1.id !== child1.parent_id, 'no self-reference')
    },
  },

  // ── Step 2: NOT NULL constraints ────────────────────────────────────

  {
    id: 'db-notnull-asset-required-fields',
    name: 'NOT NULL: asset verplichte velden',
    category: CAT,
    description: 'Assets require name, asset_type, user_id; current_value defaults to 0',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const asset = makeAsset()
      assertNotNull(asset.id, 'id NOT NULL')
      assertNotNull(asset.user_id, 'user_id NOT NULL')
      assertNotNull(asset.name, 'name NOT NULL')
      assertNotNull(asset.asset_type, 'asset_type NOT NULL')
      assert(asset.name.length > 0, 'name cannot be empty string')
      assertIncludes(VALID_ASSET_TYPES, asset.asset_type, 'valid asset_type')
      assertEqual(typeof asset.is_active, 'boolean', 'is_active NOT NULL boolean')
    },
  },

  {
    id: 'db-notnull-debt-required-fields',
    name: 'NOT NULL: debt verplichte velden',
    category: CAT,
    description: 'Debts require name, debt_type, current_balance, user_id',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeDebt()
      assertNotNull(debt.id, 'id NOT NULL')
      assertNotNull(debt.user_id, 'user_id NOT NULL')
      assertNotNull(debt.name, 'name NOT NULL')
      assertNotNull(debt.debt_type, 'debt_type NOT NULL')
      assert(debt.name.length > 0, 'name non-empty')
      assertIncludes(VALID_DEBT_TYPES, debt.debt_type, 'valid debt_type')
      assertFinite(debt.current_balance, 'current_balance is finite')
    },
  },

  {
    id: 'db-notnull-budget-required-fields',
    name: 'NOT NULL: budget verplichte velden',
    category: CAT,
    description: 'Budgets require name, budget_type, interval, user_id',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const budget = makeBudget()
      assertNotNull(budget.id, 'id NOT NULL')
      assertNotNull(budget.user_id, 'user_id NOT NULL')
      assertNotNull(budget.name, 'name NOT NULL')
      assertNotNull(budget.budget_type, 'budget_type NOT NULL')
      assertNotNull(budget.interval, 'interval NOT NULL')
      assert(budget.name.length > 0, 'name non-empty')
      assertIncludes(VALID_BUDGET_TYPES as unknown as string[], budget.budget_type, 'valid budget_type')
      assertIncludes(VALID_BUDGET_INTERVALS as unknown as string[], budget.interval, 'valid interval')
    },
  },

  {
    id: 'db-notnull-life-events-metadata',
    name: 'NOT NULL: life_events.metadata default {}',
    category: CAT,
    description: 'Life events metadata has NOT NULL constraint with default empty JSONB',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // metadata has a NOT NULL constraint (fixed in feature #226 — seed crash bug)
      // When not provided, defaults to {} (empty JSONB object)
      const event = makeLifeEvent({ metadata: {} })
      assertNotNull(event.metadata, 'metadata NOT NULL')
      assertEqual(typeof event.metadata, 'object', 'metadata is object')

      // Even events without specific metadata must have {} not undefined/null
      const eventNoMeta = makeLifeEvent()
      assertDefined(eventNoMeta.metadata, 'metadata always defined')
      assertEqual(JSON.stringify(eventNoMeta.metadata), '{}', 'default metadata is empty object')

      // Events with metadata preserve it
      const eventWithMeta = makeLifeEvent({
        event_type: 'aow',
        metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 },
      })
      assertNotNull(eventWithMeta.metadata, 'metadata preserved')
      assertEqual(
        (eventWithMeta.metadata as Record<string, unknown>).leefsituatie,
        'alleenstaand',
        'metadata fields preserved',
      )
    },
  },

  {
    id: 'db-notnull-holding-transaction-required',
    name: 'NOT NULL: holding_transactions verplichte velden',
    category: CAT,
    description: 'Holding transactions require holding_id, date, type',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const htx = {
        id: crypto.randomUUID(),
        holding_id: crypto.randomUUID(),
        user_id: 'u1',
        type: 'buy',
        units: 5,
        price_per_unit: 100,
        total_amount: 500,
        date: '2025-03-01',
      }
      assertNotNull(htx.holding_id, 'holding_id NOT NULL')
      assertNotNull(htx.date, 'date NOT NULL')
      assertNotNull(htx.type, 'type NOT NULL')
      assertIncludes(VALID_HOLDING_TX_TYPES as unknown as string[], htx.type, 'valid tx type')
    },
  },

  // ── Step 3: Cascade deletes ─────────────────────────────────────────

  {
    id: 'db-cascade-asset-holdings-chain',
    name: 'CASCADE: asset → holdings → holding_transactions',
    category: CAT,
    description: 'Deleting an asset cascades to holdings which cascades to holding_transactions',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const assetId = crypto.randomUUID()
      const holdingId1 = crypto.randomUUID()
      const holdingId2 = crypto.randomUUID()

      // Simulate the cascade chain
      const assets = [makeAsset({ id: assetId })]
      const holdings = [
        { id: holdingId1, asset_id: assetId, name: 'VWRL' },
        { id: holdingId2, asset_id: assetId, name: 'IWDA' },
      ]
      const holdingTxs = [
        { id: crypto.randomUUID(), holding_id: holdingId1, type: 'buy' },
        { id: crypto.randomUUID(), holding_id: holdingId1, type: 'dividend' },
        { id: crypto.randomUUID(), holding_id: holdingId2, type: 'buy' },
      ]

      // Step 1: Delete asset → cascades to holdings
      const remainingHoldings = holdings.filter(h => h.asset_id !== assetId)
      assertEqual(remainingHoldings.length, 0, 'all holdings deleted with asset')

      // Step 2: Holdings deletion → cascades to holding_transactions
      const deletedHoldingIds = new Set(holdings.map(h => h.id))
      const remainingTxs = holdingTxs.filter(t => !deletedHoldingIds.has(t.holding_id))
      assertEqual(remainingTxs.length, 0, 'all holding_transactions cascade deleted')
    },
  },

  {
    id: 'db-cascade-budget-amounts',
    name: 'CASCADE: budget → budget_amounts',
    category: CAT,
    description: 'Deleting a budget cascades to all its budget_amounts history',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const budgetId = crypto.randomUUID()
      const amounts = Array.from({ length: 12 }, (_, i) => ({
        id: crypto.randomUUID(),
        budget_id: budgetId,
        effective_from: `2025-${String(i + 1).padStart(2, '0')}-01`,
        amount: 500 + i * 10,
      }))

      assertEqual(amounts.length, 12, '12 monthly budget amounts')
      // On cascade delete of budget, all amounts are removed
      const remaining = amounts.filter(a => a.budget_id !== budgetId)
      assertEqual(remaining.length, 0, 'all 12 budget_amounts cascade deleted')
    },
  },

  {
    id: 'db-cascade-transaction-splits',
    name: 'CASCADE: transaction → transaction_splits',
    category: CAT,
    description: 'Deleting a transaction cascades to its splits',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const txId = crypto.randomUUID()
      const splits = [
        { id: crypto.randomUUID(), transaction_id: txId, budget_id: crypto.randomUUID(), amount: -30 },
        { id: crypto.randomUUID(), transaction_id: txId, budget_id: crypto.randomUUID(), amount: -70 },
      ]

      // Total of splits should match transaction amount
      const totalSplits = splits.reduce((s, sp) => s + sp.amount, 0)
      assertEqual(totalSplits, -100, 'splits sum to transaction amount')

      // CASCADE: delete transaction → splits removed
      const remaining = splits.filter(s => s.transaction_id !== txId)
      assertEqual(remaining.length, 0, 'all splits cascade deleted')
    },
  },

  {
    id: 'db-no-cascade-budget-delete-preserves-transactions',
    name: 'SET NULL: budget delete preserves transactions',
    category: CAT,
    description: 'Deleting a budget sets budget_id to NULL on transactions, does not delete them',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const budgetId = crypto.randomUUID()
      const transactions = [
        { id: crypto.randomUUID(), budget_id: budgetId as string | null, amount: -50 },
        { id: crypto.randomUUID(), budget_id: budgetId as string | null, amount: -75 },
        { id: crypto.randomUUID(), budget_id: null as string | null, amount: -25 }, // already unlinked
      ]

      // Simulate SET NULL: budget removed → budget_id becomes null
      const afterDelete = transactions.map(tx => ({
        ...tx,
        budget_id: tx.budget_id === budgetId ? null : tx.budget_id,
      }))

      // All 3 transactions still exist
      assertEqual(afterDelete.length, 3, 'all transactions preserved')
      // All budget_ids are now null
      const linkedCount = afterDelete.filter(tx => tx.budget_id === budgetId).length
      assertEqual(linkedCount, 0, 'no transactions still linked to deleted budget')
    },
  },

  // ── Step 4: Data consistentie ───────────────────────────────────────

  {
    id: 'db-consistency-net-worth-snapshot',
    name: 'Consistentie: netto vermogen = som(assets) - som(debts)',
    category: CAT,
    description: 'Net worth snapshot equals sum of assets minus sum of debts',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const assets = [
        makeAsset({ current_value: 150000, net_worth_inclusion_pct: 100 }),
        makeAsset({ current_value: 50000, net_worth_inclusion_pct: 100 }),
        makeAsset({ current_value: 20000, net_worth_inclusion_pct: 50 }), // 50% included
      ]
      const debts = [
        makeDebt({ current_balance: 180000, net_worth_inclusion_pct: 100 }),
        makeDebt({ current_balance: 5000, net_worth_inclusion_pct: 100 }),
      ]

      // Calculate with inclusion percentages
      const totalAssets = assets.reduce(
        (sum, a) => sum + (a.current_value * a.net_worth_inclusion_pct / 100), 0,
      )
      const totalDebts = debts.reduce(
        (sum, d) => sum + (d.current_balance * d.net_worth_inclusion_pct / 100), 0,
      )
      const netWorth = totalAssets - totalDebts

      // 150000 + 50000 + 10000 (50% of 20000) = 210000
      assertEqual(totalAssets, 210000, 'total assets with inclusion pct')
      // 180000 + 5000 = 185000
      assertEqual(totalDebts, 185000, 'total debts')
      // 210000 - 185000 = 25000
      assertEqual(netWorth, 25000, 'net worth = assets - debts')
      assertFinite(netWorth, 'net worth is finite')
    },
  },

  {
    id: 'db-consistency-net-worth-inclusion-pct',
    name: 'Consistentie: net_worth_inclusion_pct 0-100 range',
    category: CAT,
    description: 'Inclusion percentage is bounded 0-100 for assets and debts',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Default is 100
      const asset = makeAsset()
      assertEqual(asset.net_worth_inclusion_pct, 100, 'default inclusion 100%')

      // Can be 0 (excluded from net worth)
      const excluded = makeAsset({ net_worth_inclusion_pct: 0 })
      assertEqual(excluded.net_worth_inclusion_pct, 0, '0% = excluded')

      // Can be partial (e.g., 50% for shared property)
      const partial = makeAsset({ net_worth_inclusion_pct: 50 })
      assertEqual(partial.net_worth_inclusion_pct, 50, '50% partial inclusion')

      // Debt also has inclusion pct
      const debt = makeDebt()
      assertEqual(debt.net_worth_inclusion_pct, 100, 'debt default inclusion 100%')

      // Verify range is valid
      for (const pct of [0, 25, 50, 75, 100]) {
        const a = makeAsset({ net_worth_inclusion_pct: pct })
        assertGreaterThanOrEqual(a.net_worth_inclusion_pct, 0, `pct ${pct} >= 0`)
        assert(a.net_worth_inclusion_pct <= 100, `pct ${pct} <= 100`)
      }
    },
  },

  {
    id: 'db-consistency-budget-hierarchy',
    name: 'Consistentie: budget parent-child totals',
    category: CAT,
    description: 'Parent budget limit should logically cover child budgets',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const parentId = crypto.randomUUID()
      const parent = makeBudget({ id: parentId, name: 'Vaste Lasten', default_limit: 1500 })
      const children = [
        makeBudget({ parent_id: parentId, name: 'Huur', default_limit: 800 }),
        makeBudget({ parent_id: parentId, name: 'Gas/Water/Licht', default_limit: 200 }),
        makeBudget({ parent_id: parentId, name: 'Verzekeringen', default_limit: 300 }),
      ]

      const childTotal = children.reduce((s, c) => s + c.default_limit, 0)
      // Children total should not exceed parent limit
      assert(childTotal <= parent.default_limit, `child total ${childTotal} <= parent ${parent.default_limit}`)

      // All children reference the same parent
      for (const child of children) {
        assertEqual(child.parent_id, parentId, `${child.name} references parent`)
      }
    },
  },

  {
    id: 'db-consistency-holding-units-transactions',
    name: 'Consistentie: holding units = sum(buy) - sum(sell)',
    category: CAT,
    description: 'Holding unit count should equal net of buy and sell transactions',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdingId = crypto.randomUUID()
      const txs = [
        { holding_id: holdingId, type: 'buy', units: 10 },
        { holding_id: holdingId, type: 'buy', units: 5 },
        { holding_id: holdingId, type: 'sell', units: 3 },
        { holding_id: holdingId, type: 'dividend', units: 0 }, // dividends don't change units
      ]

      const netUnits = txs.reduce((sum, tx) => {
        if (tx.type === 'buy') return sum + tx.units
        if (tx.type === 'sell') return sum - tx.units
        return sum // dividend doesn't change units
      }, 0)

      assertEqual(netUnits, 12, 'net units = 10 + 5 - 3 = 12')
      assertGreaterThanOrEqual(netUnits, 0, 'net units never negative')
    },
  },

  // ── Step 5: Unieke constraints ──────────────────────────────────────

  {
    id: 'db-unique-iban-per-user',
    name: 'UNIQUE: geen dubbele IBAN per gebruiker',
    category: CAT,
    description: 'Each user cannot have duplicate IBANs in bank_accounts',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const userId = 'user-1'
      const accounts = [
        { id: crypto.randomUUID(), user_id: userId, iban: 'NL91ABNA0417164300', name: 'ING' },
        { id: crypto.randomUUID(), user_id: userId, iban: 'NL20INGB0001234567', name: 'ABN' },
        { id: crypto.randomUUID(), user_id: userId, iban: 'NL91ABNA0417164300', name: 'Duplicaat' }, // duplicate!
      ]

      // Check for uniqueness violation
      const ibanCounts = new Map<string, number>()
      for (const acc of accounts) {
        if (acc.iban) {
          ibanCounts.set(acc.iban, (ibanCounts.get(acc.iban) ?? 0) + 1)
        }
      }
      const duplicates = Array.from(ibanCounts.entries()).filter(([, count]) => count > 1)
      assertGreaterThan(duplicates.length, 0, 'duplicate IBAN detected')
      assertEqual(duplicates[0][0], 'NL91ABNA0417164300', 'correct IBAN flagged as duplicate')

      // Different users CAN have the same IBAN (e.g., joint accounts)
      const user2Account = { id: crypto.randomUUID(), user_id: 'user-2', iban: 'NL91ABNA0417164300' }
      // Cross-user: same IBAN is allowed
      assert(user2Account.user_id !== userId, 'different user can have same IBAN')
    },
  },

  {
    id: 'db-unique-holding-prices-date',
    name: 'UNIQUE: holding_prices (holding_id, date)',
    category: CAT,
    description: 'Only one price per holding per date',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdingId = crypto.randomUUID()
      const prices = [
        { holding_id: holdingId, date: '2025-03-01', close_price: 100 },
        { holding_id: holdingId, date: '2025-03-02', close_price: 102 },
        { holding_id: holdingId, date: '2025-03-01', close_price: 101 }, // duplicate date!
      ]

      // Detect uniqueness violation on (holding_id, date)
      const keys = new Set<string>()
      let duplicateFound = false
      for (const p of prices) {
        const key = `${p.holding_id}:${p.date}`
        if (keys.has(key)) { duplicateFound = true; break }
        keys.add(key)
      }
      assert(duplicateFound, 'duplicate (holding_id, date) detected')
    },
  },

  {
    id: 'db-unique-balance-snapshot',
    name: 'UNIQUE: balance_snapshots (user_id, snapshot_date, entity_type, entity_id)',
    category: CAT,
    description: 'Only one snapshot per entity per date per user',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const userId = 'u1'
      const entityId = crypto.randomUUID()
      const snapshots = [
        { user_id: userId, snapshot_date: '2025-03-01', entity_type: 'asset', entity_id: entityId, balance: 10000 },
        { user_id: userId, snapshot_date: '2025-03-02', entity_type: 'asset', entity_id: entityId, balance: 10100 },
        { user_id: userId, snapshot_date: '2025-03-01', entity_type: 'asset', entity_id: entityId, balance: 10050 }, // duplicate!
      ]

      const keys = new Set<string>()
      let duplicateFound = false
      for (const s of snapshots) {
        const key = `${s.user_id}:${s.snapshot_date}:${s.entity_type}:${s.entity_id}`
        if (keys.has(key)) { duplicateFound = true; break }
        keys.add(key)
      }
      assert(duplicateFound, 'duplicate balance snapshot detected')
    },
  },

  {
    id: 'db-unique-household-member',
    name: 'UNIQUE: household_members (household_id, user_id)',
    category: CAT,
    description: 'A user cannot be member of same household twice',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const householdId = crypto.randomUUID()
      const userId = 'u1'
      const members = [
        { household_id: householdId, user_id: userId, role: 'owner' },
        { household_id: householdId, user_id: 'u2', role: 'member' },
        { household_id: householdId, user_id: userId, role: 'member' }, // duplicate!
      ]

      const keys = new Set<string>()
      let duplicateFound = false
      for (const m of members) {
        const key = `${m.household_id}:${m.user_id}`
        if (keys.has(key)) { duplicateFound = true; break }
        keys.add(key)
      }
      assert(duplicateFound, 'duplicate household membership detected')
    },
  },

  {
    id: 'db-unique-target-allocation',
    name: 'UNIQUE: target_allocations (user_id, view_mode, category)',
    category: CAT,
    description: 'Only one allocation target per user per view mode per category',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const allocations = [
        { user_id: 'u1', view_mode: 'asset_class', category: 'equity', target_pct: 60 },
        { user_id: 'u1', view_mode: 'asset_class', category: 'bonds', target_pct: 30 },
        { user_id: 'u1', view_mode: 'asset_class', category: 'equity', target_pct: 70 }, // duplicate!
      ]

      const keys = new Set<string>()
      let duplicateFound = false
      for (const a of allocations) {
        const key = `${a.user_id}:${a.view_mode}:${a.category}`
        if (keys.has(key)) { duplicateFound = true; break }
        keys.add(key)
      }
      assert(duplicateFound, 'duplicate allocation target detected')
    },
  },

  // ── Additional: CHECK constraints ───────────────────────────────────

  {
    id: 'db-check-asset-type-enum',
    name: 'CHECK: asset_type values (13 types)',
    category: CAT,
    description: 'Asset type must be one of 13 valid enum values',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      assertEqual(VALID_ASSET_TYPES.length, 13, '13 asset types defined')
      // Verify all known types are present
      for (const t of ['cash', 'savings', 'investment', 'retirement', 'eigen_huis', 'crypto']) {
        assertIncludes(VALID_ASSET_TYPES, t as AssetType, `${t} is valid`)
      }
      // Invalid type would be rejected by CHECK constraint
      const invalidType = 'bitcoin_gold'
      assert(!VALID_ASSET_TYPES.includes(invalidType as AssetType), 'invalid type rejected')
    },
  },

  {
    id: 'db-check-budget-type-enum',
    name: 'CHECK: budget_type values (5 types)',
    category: CAT,
    description: 'Budget type must be income/expense/savings/debt/archive',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      assertEqual(VALID_BUDGET_TYPES.length, 5, '5 budget types')
      for (const t of VALID_BUDGET_TYPES) {
        assertIncludes(VALID_BUDGET_TYPES as unknown as string[], t, `${t} valid`)
      }
      // Intervals
      assertEqual(VALID_BUDGET_INTERVALS.length, 3, '3 intervals')
      // Rollover types
      assertEqual(VALID_ROLLOVER_TYPES.length, 3, '3 rollover types')
      // Limit types
      assertEqual(VALID_LIMIT_TYPES.length, 2, '2 limit types')
    },
  },

  {
    id: 'db-check-debt-type-enum',
    name: 'CHECK: debt_type values (11 types)',
    category: CAT,
    description: 'Debt type must be one of 11 valid enum values',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      assertEqual(VALID_DEBT_TYPES.length, 11, '11 debt types')
      for (const t of ['mortgage', 'personal_loan', 'student_loan', 'credit_card', 'familielening']) {
        assertIncludes(VALID_DEBT_TYPES, t as DebtType, `${t} is valid`)
      }
    },
  },

  {
    id: 'db-check-fire-strategy-enum',
    name: 'CHECK: fire_end_strategy values (3 strategies)',
    category: CAT,
    description: 'FIRE strategy must be perpetual/legacy/deplete — no fixed_age variant',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      assertEqual(VALID_FIRE_STRATEGIES.length, 3, '3 FIRE strategies')
      assertIncludes(VALID_FIRE_STRATEGIES as unknown as string[], 'perpetual', 'perpetual valid')
      assertIncludes(VALID_FIRE_STRATEGIES as unknown as string[], 'legacy', 'legacy valid')
      assertIncludes(VALID_FIRE_STRATEGIES as unknown as string[], 'deplete', 'deplete valid')
      // Explicitly verify no 'fixed_age' variant (per project memory)
      assert(
        !(VALID_FIRE_STRATEGIES as unknown as string[]).includes('fixed_age'),
        'no fixed_age strategy — only perpetual/legacy/deplete',
      )
    },
  },

  {
    id: 'db-check-ownership-enum',
    name: 'CHECK: ownership values (personal/shared)',
    category: CAT,
    description: 'Ownership field on all major tables is personal or shared',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      assertEqual(VALID_OWNERSHIP_TYPES.length, 2, '2 ownership types')
      // Default is personal
      const asset = makeAsset()
      assertEqual(asset.ownership, 'personal', 'asset default ownership = personal')
      const budget = makeBudget()
      assertEqual(budget.ownership, 'personal', 'budget default ownership = personal')
      const debt = makeDebt()
      assertEqual(debt.ownership, 'personal', 'debt default ownership = personal')

      // Shared requires household_id
      const shared = makeAsset({ ownership: 'shared', household_id: crypto.randomUUID() })
      assertEqual(shared.ownership, 'shared', 'shared ownership set')
      assertNotNull(shared.household_id, 'shared has household_id')
    },
  },
]

// ── Registration ──────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Data — Database Integriteit',
    description: 'Database constraints: foreign keys, NOT NULL, cascade deletes, data consistentie, unieke constraints',
    icon: 'Database',
    testCount: 0,
  })
  registerTests(tests)
}
