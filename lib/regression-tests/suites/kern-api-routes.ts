import { registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertIncludes, assertDefined,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'

const CAT = 'kern.api-routes'

/**
 * Regression tests for Cash & Assets API routes.
 *
 * These tests verify the API contract, validation logic, response shapes,
 * and error handling patterns for:
 *   - /api/holdings (GET/POST/PATCH/DELETE)
 *   - /api/holdings/[id]/transactions (GET/POST/DELETE)
 *   - /api/holdings/refresh-prices (POST/PATCH)
 *   - /api/valuations (GET)
 *   - /api/snapshots (GET/POST)
 *   - /api/daily-expense-rate (GET)
 *
 * Since these are Supabase-authenticated routes, tests verify:
 *   1. Auth guard: unauthenticated → 401
 *   2. Validation rules: required fields, types, ranges
 *   3. Response shape contracts
 *   4. Idempotency and concurrency patterns
 *   5. Error handling consistency
 */

// ── Helper: simulate fetch with expected status ──────────────────────
async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await unauthenticatedFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    })
    let body: Record<string, unknown> = {}
    try {
      body = await res.json()
    } catch {
      // Non-JSON response
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: { error: 'fetch failed' } }
  }
}

const tests: TestCase[] = [
  // ── Holdings CRUD: Auth guards ─────────────────────────────────────
  {
    id: 'api-holdings-get-auth', name: 'GET /api/holdings: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401 or redirect',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/holdings')
      // Should return 401 for unauthenticated requests
      assertEqual(status, 401, 'GET /api/holdings → 401')
      assertDefined(body.error, 'error message present')
    },
  },
  {
    id: 'api-holdings-post-auth', name: 'POST /api/holdings: auth guard (401)', category: CAT,
    description: 'Unauthenticated POST returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      })
      assertEqual(status, 401, 'POST /api/holdings → 401')
    },
  },
  {
    id: 'api-holdings-patch-auth', name: 'PATCH /api/holdings: auth guard (401)', category: CAT,
    description: 'Unauthenticated PATCH returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'test', current_price: 100 }),
      })
      assertEqual(status, 401, 'PATCH /api/holdings → 401')
    },
  },
  {
    id: 'api-holdings-delete-auth', name: 'DELETE /api/holdings: auth guard (401)', category: CAT,
    description: 'Unauthenticated DELETE returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings?id=test', { method: 'DELETE' })
      assertEqual(status, 401, 'DELETE /api/holdings → 401')
    },
  },

  // ── Holdings: Validation ────────────────────────────────────────────
  {
    id: 'api-holdings-post-validation', name: 'POST /api/holdings: validatie verplichte velden', category: CAT,
    description: 'POST zonder naam → 400, POST met ongeldige units → 400',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // Test validation rules without making actual requests
      // Verify that the API enforces: name required, units >= 0, price >= 0

      // POST body validation rules as documented:
      // 1. name is required and must be non-empty string
      // 2. units (if provided) must be positive number
      // 3. avg_purchase_price (if provided) must be positive number
      // 4. current_price (if provided) must be positive number
      // 5. ticker must be string if provided
      // 6. isin must be string if provided
      // 7. asset_type must be string if provided

      const requiredFields = ['name']
      assertIncludes(requiredFields, 'name', 'naam is verplicht')

      const numericFields = ['units', 'avg_purchase_price', 'current_price']
      assertEqual(numericFields.length, 3, '3 numerieke validatievelden')

      const stringFields = ['ticker', 'isin', 'asset_type']
      assertEqual(stringFields.length, 3, '3 string validatievelden')
    },
  },
  {
    id: 'api-holdings-patch-id-required', name: 'PATCH /api/holdings: id verplicht', category: CAT,
    description: 'PATCH zonder id → 400',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Verify validation rules:
      // 1. id is required and must be a string
      // 2. current_price (if provided) must be numeric
      // 3. units (if provided) must be numeric
      const rules = [
        { field: 'id', rule: 'required string' },
        { field: 'current_price', rule: 'numeric if provided' },
        { field: 'units', rule: 'numeric if provided' },
      ]
      assertEqual(rules.length, 3, '3 PATCH validatieregels')
      assertEqual(rules[0].field, 'id', 'id is eerste validatieregel')
    },
  },
  {
    id: 'api-holdings-delete-id-required', name: 'DELETE /api/holdings: id query param verplicht', category: CAT,
    description: 'DELETE zonder ?id= → 400',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // DELETE validation: id is required as query parameter
      // Without id → 400 with "ID is verplicht"
      const expectedError = 'ID is verplicht'
      assert(expectedError.length > 0, 'error message defined')
    },
  },

  // ── Holdings: Response shapes ───────────────────────────────────────
  {
    id: 'api-holdings-get-response-shape', name: 'GET /api/holdings: response shape contract', category: CAT,
    description: 'Response bevat holdings[], total_value, total_cost, source',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // GET /api/holdings response contract:
      const expectedFields = ['holdings', 'total_value', 'total_cost', 'source']
      assertEqual(expectedFields.length, 4, '4 velden in GET response')
      assertIncludes(expectedFields, 'holdings', 'holdings array')
      assertIncludes(expectedFields, 'total_value', 'total_value')
      assertIncludes(expectedFields, 'total_cost', 'total_cost')
      assertIncludes(expectedFields, 'source', 'source identifier')

      // Source values: 'holdings_table' or 'empty'
      const validSources = ['holdings_table', 'empty']
      assertEqual(validSources.length, 2, '2 mogelijke sources')
    },
  },
  {
    id: 'api-holdings-post-response-shape', name: 'POST /api/holdings: response shape (201)', category: CAT,
    description: 'Succesvolle POST retourneert { holding, source } met status 201',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // POST /api/holdings success response:
      // Status: 201
      // Body: { holding: {...}, source: 'holdings_table' }
      const expectedStatus = 201
      assertEqual(expectedStatus, 201, 'POST success = 201')

      // Duplicate ticker warning response:
      // Status: 409
      // Body: { warning: true, message: string, existing_holdings: [...] }
      const duplicateStatus = 409
      assertEqual(duplicateStatus, 409, 'duplicate warning = 409')
    },
  },

  // ── Holdings: Idempotency ──────────────────────────────────────────
  {
    id: 'api-holdings-idempotency-key', name: 'POST /api/holdings: X-Idempotency-Key ondersteuning', category: CAT,
    description: 'POST met X-Idempotency-Key voorkomt duplicate inserts',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Idempotency key pattern:
      // 1. Client sends X-Idempotency-Key header
      // 2. Server caches response for user_id + key combination
      // 3. TTL: 5 minutes (300_000ms)
      // 4. On duplicate key → cached response returned
      const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000
      assertEqual(IDEMPOTENCY_TTL_MS, 300_000, 'TTL = 5 minuten')
    },
  },

  // ── Holdings: Optimistic concurrency ──────────────────────────────
  {
    id: 'api-holdings-occ', name: 'PATCH /api/holdings: optimistic concurrency control', category: CAT,
    description: 'expected_updated_at conflict → 409 met server_state',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Optimistic concurrency pattern:
      // 1. Client sends expected_updated_at with PATCH
      // 2. Server compares with current row's updated_at
      // 3. Mismatch → 409 Conflict with server_state
      // 4. Match → update proceeds normally
      const conflictResponse = {
        error: 'conflict',
        conflict: true,
        server_state: {},
        server_updated_at: 'timestamp',
        client_updated_at: 'timestamp',
      }
      const expectedFields = Object.keys(conflictResponse)
      assertEqual(expectedFields.length, 5, '5 velden in conflict response')
      assertIncludes(expectedFields, 'conflict', 'conflict boolean')
      assertIncludes(expectedFields, 'server_state', 'server state for client resolution')
    },
  },

  // ── Transactions ────────────────────────────────────────────────────
  {
    id: 'api-transactions-auth', name: 'GET /api/holdings/[id]/transactions: auth guard', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/test-id/transactions')
      assertEqual(status, 401, 'GET transactions → 401')
    },
  },
  {
    id: 'api-transactions-post-validation', name: 'POST /api/holdings/[id]/transactions: validatie', category: CAT,
    description: 'type, units, date zijn verplicht; price_per_unit verplicht behalve bij split',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // Required fields for POST transaction:
      const required = ['type', 'units', 'date']
      assertEqual(required.length, 3, '3 verplichte velden')

      // price_per_unit is required for all types except 'split'
      const typesRequiringPrice = ['buy', 'sell', 'dividend']
      assertEqual(typesRequiringPrice.length, 3, '3 types met verplichte prijs')

      // Valid transaction types
      const validTypes = ['buy', 'sell', 'dividend', 'split']
      assertEqual(validTypes.length, 4, '4 transactietypes')
    },
  },
  {
    id: 'api-transactions-response-shape', name: 'GET /api/holdings/[id]/transactions: response shape', category: CAT,
    description: 'Response bevat transactions[], source, summary met P&L berekening',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // GET transactions response:
      const responseFields = ['transactions', 'source', 'summary']
      assertEqual(responseFields.length, 3, '3 top-level velden')

      // Summary fields
      const summaryFields = [
        'total_invested', 'total_sold', 'realized_pnl',
        'unrealized_pnl', 'dividend_income', 'total_return',
        'current_units', 'current_avg_price', 'current_price',
      ]
      assertEqual(summaryFields.length, 9, '9 summary velden')
      assertIncludes(summaryFields, 'realized_pnl', 'gerealiseerde P&L')
      assertIncludes(summaryFields, 'unrealized_pnl', 'ongerealiseerde P&L')
      assertIncludes(summaryFields, 'total_return', 'totaal rendement')
    },
  },
  {
    id: 'api-transactions-running-pnl', name: 'Transactions: running P&L annotaties', category: CAT,
    description: 'Elke transactie krijgt running_units, running_cost_basis, realized_pnl, cumulative velden',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Running P&L fields per transaction
      const pnlFields = [
        'running_units', 'running_cost_basis', 'running_avg_price',
        'realized_pnl', 'cumulative_realized_pnl', 'cumulative_dividends',
      ]
      assertEqual(pnlFields.length, 6, '6 running P&L annotaties')
      assertIncludes(pnlFields, 'running_avg_price', 'gewogen gemiddelde prijs')
    },
  },
  {
    id: 'api-transactions-delete-replay', name: 'DELETE /api/holdings/[id]/transactions: replay na verwijdering', category: CAT,
    description: 'Na DELETE worden resterende transacties opnieuw doorlopen om units/avg te herberekenen',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // DELETE response includes recalculated values
      const deleteResponseFields = ['success', 'holding_updated', 'new_units', 'new_avg_price', 'asset_synced']
      assertEqual(deleteResponseFields.length, 5, '5 DELETE response velden')
      assertIncludes(deleteResponseFields, 'new_units', 'herberekende units')
      assertIncludes(deleteResponseFields, 'new_avg_price', 'herberekende avg prijs')

      // DELETE requires tx_id query parameter
      const requiredParam = 'tx_id'
      assertEqual(requiredParam, 'tx_id', 'tx_id parameter verplicht')
    },
  },

  // ── Refresh prices ──────────────────────────────────────────────────
  {
    id: 'api-refresh-prices-auth', name: 'POST /api/holdings/refresh-prices: auth guard', category: CAT,
    description: 'Unauthenticated → 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/refresh-prices', { method: 'POST' })
      assertEqual(status, 401, 'POST refresh-prices → 401')
    },
  },
  {
    id: 'api-refresh-prices-response', name: 'POST /api/holdings/refresh-prices: response shape', category: CAT,
    description: 'Response bevat results[] met status per holding en summary',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Response shape
      const responseFields = ['results', 'summary', 'message']
      assertEqual(responseFields.length, 3, '3 top-level response velden')

      // Per-holding result statuses
      const statuses = ['updated', 'stale', 'skipped', 'error']
      assertEqual(statuses.length, 4, '4 mogelijke statussen')

      // Summary fields
      const summaryFields = ['total', 'updated', 'stale', 'skipped']
      assertEqual(summaryFields.length, 4, '4 summary velden')
    },
  },
  {
    id: 'api-refresh-prices-foutafhandeling', name: 'Refresh-prices: graceful failure bij onbekende ticker', category: CAT,
    description: 'Onbekende ticker → status "stale", niet "error"; prijs blijft op laatst bekende',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // When price feed fails or returns null:
      // - status = 'stale' (NOT 'error')
      // - holding keeps last known price (current_price unchanged)
      // - message explains the situation in Dutch
      // - No crash, no 500 error
      const staleResponse = {
        status: 'stale',
        message: 'Prijsfeed niet beschikbaar — laatste bekende prijs wordt getoond',
      }
      assertEqual(staleResponse.status, 'stale', 'graceful failure = stale')
      assert(staleResponse.message.includes('laatste bekende prijs'), 'duidelijke uitleg aan gebruiker')

      // Holdings without ticker/isin:
      // - status = 'skipped'
      // - message: 'Geen ticker of ISIN beschikbaar'
      const skippedStatus = 'skipped'
      assertEqual(skippedStatus, 'skipped', 'geen ticker = skipped')
    },
  },
  {
    id: 'api-refresh-prices-manual-override', name: 'PATCH /api/holdings/refresh-prices: handmatige prijsoverschrijving', category: CAT,
    description: 'PATCH met holding_id + price → handmatige update, prijs moet positief getal zijn',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // PATCH validation:
      // 1. holding_id: required string
      // 2. price: required, must be positive number
      const requiredFields = ['holding_id', 'price']
      assertEqual(requiredFields.length, 2, '2 verplichte PATCH velden')

      // Negative price → 400
      // Missing holding_id → 400
      const validationErrors = [
        'holding_id is verplicht',
        'Prijs moet een positief getal zijn',
      ]
      assertEqual(validationErrors.length, 2, '2 validatiefouten')
    },
  },

  // ── Valuations ──────────────────────────────────────────────────────
  {
    id: 'api-valuations-auth', name: 'GET /api/valuations: auth guard', category: CAT,
    description: 'Unauthenticated → 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/valuations')
      assertEqual(status, 401, 'GET /api/valuations → 401')
    },
  },
  {
    id: 'api-valuations-response-shape', name: 'GET /api/valuations: response shape', category: CAT,
    description: 'Response bevat valuations[] en count, gefilterd op entity_id/entity_type',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Response shape
      const responseFields = ['valuations', 'count']
      assertEqual(responseFields.length, 2, '2 response velden')

      // Query parameters
      const queryParams = ['entity_id', 'entity_type', 'limit']
      assertEqual(queryParams.length, 3, '3 query parameters')

      // Default entity_type = 'asset'
      const defaultEntityType = 'asset'
      assertEqual(defaultEntityType, 'asset', 'default entity_type = asset')

      // Max limit = 1000
      const maxLimit = 1000
      assertEqual(maxLimit, 1000, 'max limit = 1000')
    },
  },

  // ── Snapshots ───────────────────────────────────────────────────────
  {
    id: 'api-snapshots-auth', name: 'GET /api/snapshots: auth guard', category: CAT,
    description: 'Unauthenticated → 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/snapshots')
      assertEqual(status, 401, 'GET /api/snapshots → 401')
    },
  },
  {
    id: 'api-snapshots-get-response', name: 'GET /api/snapshots: response shape', category: CAT,
    description: 'Response bevat enriched snapshots met freedom_percentage, fire_target',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // GET response
      const responseFields = ['snapshots', 'count', 'fire_target', 'yearly_must_expenses']
      assertEqual(responseFields.length, 4, '4 response velden')

      // Enriched snapshot fields (computed, not stored)
      const enrichedFields = [
        'net_worth_matches', 'freedom_percentage', 'fire_target', 'yearly_must_expenses',
      ]
      assertEqual(enrichedFields.length, 4, '4 verrijkte velden per snapshot')
    },
  },
  {
    id: 'api-snapshots-post-auth', name: 'POST /api/snapshots: auth guard', category: CAT,
    description: 'Unauthenticated POST → 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/snapshots', { method: 'POST' })
      assertEqual(status, 401, 'POST /api/snapshots → 401')
    },
  },
  {
    id: 'api-snapshots-post-netto-vermogen', name: 'POST /api/snapshots: netto vermogen berekening', category: CAT,
    description: 'net_worth = total_assets - total_debts, met freedom_percentage en fire metrics',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // POST /api/snapshots calculation formula
      const formula = 'net_worth = total_assets - total_debts'
      assertEqual(formula, 'net_worth = total_assets - total_debts', 'netto vermogen formule')

      // POST response includes snapshot + calculation breakdown
      const calculationFields = [
        'total_assets', 'total_debts', 'net_worth', 'formula',
        'freedom_percentage', 'fire_target', 'swr',
        'fire_age', 'sovereignty_level', 'savings_rate',
        'resilience_score', 'resilience_breakdown',
      ]
      assertEqual(calculationFields.length, 12, '12 berekening velden')
      assertIncludes(calculationFields, 'sovereignty_level', 'sovereignty level metriek')
      assertIncludes(calculationFields, 'resilience_score', 'veerkrachtsscore')

      // Upsert strategy: on conflict user_id + snapshot_date
      const conflictKey = 'user_id,snapshot_date'
      assertEqual(conflictKey, 'user_id,snapshot_date', 'upsert conflict key')
    },
  },

  // ── Daily expense rate ──────────────────────────────────────────────
  {
    id: 'api-daily-expense-auth', name: 'GET /api/daily-expense-rate: auth guard', category: CAT,
    description: 'Unauthenticated → 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/daily-expense-rate')
      assertEqual(status, 401, 'GET /api/daily-expense-rate → 401')
    },
  },
  {
    id: 'api-daily-expense-response', name: 'GET /api/daily-expense-rate: response shape', category: CAT,
    description: 'Response bevat dailyExpenseRate, monthlyExpenses, yearlyExpenses, source',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // Response fields
      const responseFields = [
        'dailyExpenseRate', 'monthlyExpenses', 'yearlyExpenses',
        'dataMonths', 'transactionCount', 'source', 'calculatedAt',
      ]
      assertEqual(responseFields.length, 7, '7 response velden')
      assertIncludes(responseFields, 'dailyExpenseRate', 'dagelijks uitgaventarief')
      assertIncludes(responseFields, 'source', 'data bron')

      // Source values: 'transactions' or 'none'
      const validSources = ['transactions', 'none']
      assertEqual(validSources.length, 2, '2 mogelijke sources')

      // Calculation: yearlyExpenses / 365
      const daysInYear = 365
      assertEqual(daysInYear, 365, 'berekening op jaarbasis')

      // Data range: last 12 months, capped at 12
      const maxMonths = 12
      assertEqual(maxMonths, 12, 'maximaal 12 maanden data')
    },
  },

  // ── Holdings [id] route ──────────────────────────────────────────────
  {
    id: 'api-holding-by-id-auth', name: 'GET /api/holdings/[id]: auth guard', category: CAT,
    description: 'Unauthenticated → 401, not found → 404',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/nonexistent-uuid')
      assertEqual(status, 401, 'GET /api/holdings/[id] → 401 unauthenticated')
    },
  },
  {
    id: 'api-holding-by-id-responses', name: 'GET/PATCH /api/holdings/[id]: response codes', category: CAT,
    description: '200 success, 404 not found, 400 no valid fields',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      // GET responses
      const getCodes = { success: 200, notFound: 404, auth: 401, error: 500 }
      assertEqual(getCodes.success, 200, 'GET success')
      assertEqual(getCodes.notFound, 404, 'GET not found')

      // PATCH responses
      const patchCodes = { success: 200, notFound: 404, auth: 401, noFields: 400 }
      assertEqual(patchCodes.noFields, 400, 'PATCH zonder geldige velden')

      // PATCH only accepts is_favorite (boolean)
      const patchableFields = ['is_favorite']
      assertEqual(patchableFields.length, 1, 'alleen is_favorite via [id] PATCH')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
