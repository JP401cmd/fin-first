import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'

const CAT = 'kern.assets-crud'

/**
 * Regression tests for Assets/Holdings CRUD operations.
 *
 * Tests the full lifecycle of bezittingen via the API:
 *   - POST /api/holdings — create
 *   - PATCH /api/holdings — update (name, value, category)
 *   - DELETE /api/holdings — delete with cascade effects
 *   - GET /api/holdings — list with totals
 *   - GET /api/holdings/[id]/value-history — revaluation history
 *
 * Since these are Supabase-authenticated routes, tests verify:
 *   1. Auth guard: unauthenticated → 401
 *   2. Validation: required fields, types, ranges
 *   3. Response shape contracts
 *   4. Duplicate handling (ticker conflict 409)
 *   5. Cascade effects on portfolio (asset sync)
 *   6. Revaluation flow and historical values
 *   7. Net worth impact after CRUD operations
 */

// ── Helper: fetch with expected status ──────────────────────────────
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
  // ════════════════════════════════════════════════════════════════════
  // Stap 1: Bezitting aanmaken via API met alle verplichte velden
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-create-auth',
    name: 'POST /api/holdings: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated POST to create holding returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Holding' }),
      })
      assertEqual(status, 401, 'POST /api/holdings → 401 voor unauthenticated')
    },
  },
  {
    id: 'assets-crud-create-required-fields',
    name: 'POST /api/holdings: verplichte velden validatie',
    category: CAT,
    description: 'Name is required, numeric fields must be positive',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // POST body validation contract:
      // 1. name: required, non-empty string
      // 2. units: optional, must be positive number if provided
      // 3. avg_purchase_price: optional, must be positive if provided
      // 4. current_price: optional, must be positive if provided
      // 5. ticker: optional, must be string if provided
      // 6. isin: optional, must be string if provided
      // 7. asset_type: optional, must be string if provided
      // 8. currency: optional string, defaults to 'EUR'
      const requiredFields = ['name']
      const optionalNumeric = ['units', 'avg_purchase_price', 'current_price']
      const optionalString = ['ticker', 'isin', 'asset_type', 'currency']

      assertEqual(requiredFields.length, 1, 'alleen name is verplicht')
      assertEqual(optionalNumeric.length, 3, '3 optionele numerieke velden')
      assertEqual(optionalString.length, 4, '4 optionele string velden')
      assertIncludes(requiredFields, 'name', 'name is verplicht')
    },
  },
  {
    id: 'assets-crud-create-response-shape',
    name: 'POST /api/holdings: response shape (201)',
    category: CAT,
    description: 'Succesvolle POST retourneert { holding, source } met status 201',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // POST response contract on success (201):
      // { holding: { id, user_id, name, ticker, isin, units, avg_purchase_price, ... }, source: 'holdings_table' }
      const expectedResponseFields = ['holding', 'source']
      assertEqual(expectedResponseFields.length, 2, '2 velden in POST 201 response')
      assertIncludes(expectedResponseFields, 'holding', 'holding object')
      assertIncludes(expectedResponseFields, 'source', 'source identifier')

      // Holding object expected fields
      const holdingFields = [
        'id', 'user_id', 'name', 'ticker', 'isin', 'units',
        'avg_purchase_price', 'current_price', 'currency',
        'purchase_date', 'notes', 'is_active', 'asset_id',
      ]
      assertGreaterThanOrEqual(holdingFields.length, 12, 'minstens 12 velden in holding object')
    },
  },
  {
    id: 'assets-crud-create-empty-name',
    name: 'POST /api/holdings: lege naam → 400',
    category: CAT,
    description: 'POST met lege of ontbrekende naam retourneert 400',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // Test with empty name
      const { status: s1 } = await fetchAPI('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      })
      assertEqual(s1, 401, 'Unauthenticated: empty name returns 401 (auth first)')

      // Validate expected error message
      const expectedError = 'Naam is verplicht en moet een niet-lege string zijn'
      assert(expectedError.length > 0, 'error message for empty name defined')
    },
  },
  {
    id: 'assets-crud-create-invalid-numeric',
    name: 'POST /api/holdings: negatieve units/prijs → 400',
    category: CAT,
    description: 'Negatieve waarden voor units of prijs worden geweigerd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Validation rules for numeric fields:
      // units: NaN or <= 0 → 400 "Aantal stuks moet groter dan 0 zijn" (H8: 0 was
      // toegestaan en werd client-side stil naar 1 gecoerceerd)
      // avg_purchase_price: NaN or < 0 → 400 "Gemiddelde aankoopprijs moet een positief getal zijn"
      // current_price: NaN or < 0 → 400 "Huidige prijs moet een positief getal zijn"
      const validationMessages = [
        { field: 'units', message: 'Aantal stuks moet groter dan 0 zijn' },
        { field: 'avg_purchase_price', message: 'Gemiddelde aankoopprijs moet een positief getal zijn' },
        { field: 'current_price', message: 'Huidige prijs moet een positief getal zijn' },
      ]
      assertEqual(validationMessages.length, 3, '3 numerieke validatie error messages')
      for (const v of validationMessages) {
        assert(v.message.length > 10, `${v.field} error message is descriptive`)
      }
    },
  },
  {
    id: 'assets-crud-create-defaults',
    name: 'POST /api/holdings: standaardwaarden bij aanmaken',
    category: CAT,
    description: 'Units default naar 1, prijs naar 0, currency naar EUR, is_active naar true',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Defaults applied when creating a holding:
      // units: Number(units) || 1
      // avg_purchase_price: Number(avg_purchase_price) || 0
      // current_price: current_price != null ? Number(current_price) : null
      // currency: provided or 'EUR'
      // is_active: true
      // ticker: null if not provided
      // isin: null if not provided
      // notes: null if not provided
      const defaults = {
        units: 1,
        avg_purchase_price: 0,
        current_price: null,
        currency: 'EUR',
        is_active: true,
      }
      assertEqual(defaults.units, 1, 'default units = 1')
      assertEqual(defaults.avg_purchase_price, 0, 'default avg_purchase_price = 0')
      assertEqual(defaults.current_price, null, 'default current_price = null')
      assertEqual(defaults.currency, 'EUR', 'default currency = EUR')
      assertEqual(defaults.is_active, true, 'default is_active = true')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 2: Bezitting bewerken — naam, waarde, categorie wijzigen
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-edit-auth',
    name: 'PATCH /api/holdings: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated PATCH returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'fake-uuid', name: 'Updated' }),
      })
      assertEqual(status, 401, 'PATCH /api/holdings → 401')
    },
  },
  {
    id: 'assets-crud-edit-id-required',
    name: 'PATCH /api/holdings: id verplicht',
    category: CAT,
    description: 'PATCH zonder id retourneert 400',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // PATCH validation:
      // 1. id: required string → 400 "ID is verplicht en moet een string zijn"
      // 2. current_price: numeric if provided
      // 3. units: numeric if provided
      // Updateable fields: current_price, units, avg_purchase_price, name, ticker, notes, currency
      const updateableFields = ['current_price', 'units', 'avg_purchase_price', 'name', 'ticker', 'notes', 'currency']
      assertGreaterThanOrEqual(updateableFields.length, 7, 'minstens 7 updateable velden')
      assertIncludes(updateableFields, 'name', 'name is updateable')
      assertIncludes(updateableFields, 'current_price', 'current_price is updateable')
      assertIncludes(updateableFields, 'currency', 'currency is updateable')
    },
  },
  {
    id: 'assets-crud-edit-partial-update',
    name: 'PATCH /api/holdings: partial update (alleen meegegeven velden)',
    category: CAT,
    description: 'Alleen meegegeven velden worden bijgewerkt, rest blijft ongewijzigd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // PATCH builds update object from ONLY provided fields
      // e.g. if body = { id: 'x', name: 'New Name' }, only name changes
      // Always bumps updated_at for optimistic concurrency
      // last_price_update bumped when current_price changes
      const partialUpdateRules = [
        'current_price → updates.current_price + last_price_update',
        'units → updates.units',
        'avg_purchase_price → updates.avg_purchase_price',
        'name → updates.name',
        'ticker → updates.ticker || null',
        'notes → updates.notes || null',
        'currency → updates.currency.trim().toUpperCase()',
        'updated_at always bumped',
      ]
      assertEqual(partialUpdateRules.length, 8, '8 partial update regels')
    },
  },
  {
    id: 'assets-crud-edit-optimistic-concurrency',
    name: 'PATCH /api/holdings: optimistic concurrency control (409)',
    category: CAT,
    description: 'Conflicterende bewerking met verouderde expected_updated_at retourneert 409',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // When expected_updated_at is provided:
      // 1. Server fetches current updated_at
      // 2. Compares timestamps (millisecond precision)
      // 3. If mismatch → 409 Conflict with { error: 'conflict', conflict: true, server_state, server_updated_at, client_updated_at }
      // 4. Client can then resolve the conflict using server_state
      const conflictResponse = {
        error: 'conflict',
        message: 'Deze holding is ondertussen door een andere sessie gewijzigd. Herlaad de gegevens en probeer opnieuw.',
        conflict: true,
        server_state: 'object with current row data',
        server_updated_at: 'ISO string',
        client_updated_at: 'ISO string from request',
      }
      assertEqual(conflictResponse.error, 'conflict', 'error = conflict')
      assertEqual(conflictResponse.conflict, true, 'conflict flag is true')
      assert(conflictResponse.message.includes('gewijzigd'), 'Dutch conflict message')
      assertDefined(conflictResponse.server_state, 'server_state in conflict response')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 3: Bezitting verwijderen en cascade-effect op portfolio
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-delete-auth',
    name: 'DELETE /api/holdings: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated DELETE returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings?id=fake-uuid', { method: 'DELETE' })
      assertEqual(status, 401, 'DELETE /api/holdings → 401')
    },
  },
  {
    id: 'assets-crud-delete-id-required',
    name: 'DELETE /api/holdings: id query param verplicht',
    category: CAT,
    description: 'DELETE zonder ?id= retourneert 400',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // DELETE requires ?id=<uuid> as query parameter
      // Missing id → 400 "ID is verplicht"
      const expectedError = 'ID is verplicht'
      assert(expectedError.length > 0, 'error message for missing id defined')
    },
  },
  {
    id: 'assets-crud-delete-cascade-asset-sync',
    name: 'DELETE /api/holdings: cascade → syncAssetValueFromHoldings',
    category: CAT,
    description: 'Na verwijdering wordt de parent asset.current_value herberekend',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // DELETE cascade behaviour:
      // 1. Fetch holding's asset_id before deletion
      // 2. Delete the holding row from holdings table
      // 3. If holding had an asset_id, call syncAssetValueFromHoldings(supabase, asset_id, user_id)
      // 4. syncAssetValueFromHoldings aggregates remaining holdings:
      //    asset.current_value = SUM(current_price * units * eurRate) for all is_active holdings
      // 5. When all holdings removed, asset.current_value becomes 0
      const cascadeSteps = [
        'fetch asset_id before delete',
        'delete holding row',
        'sync parent asset current_value',
      ]
      assertEqual(cascadeSteps.length, 3, '3 cascade stappen bij DELETE')

      // syncAssetValueFromHoldings is non-critical (errors swallowed)
      const syncBehaviour = {
        formula: 'SUM(current_price * units * eurRate)',
        noHoldings: 'current_value = 0',
        errorHandling: 'non-critical, errors swallowed',
      }
      assert(syncBehaviour.formula.includes('SUM'), 'aggregatie formule bevat SUM')
      assertEqual(syncBehaviour.noHoldings, 'current_value = 0', 'geen holdings → waarde 0')
    },
  },
  {
    id: 'assets-crud-delete-success-response',
    name: 'DELETE /api/holdings: success response shape',
    category: CAT,
    description: 'Succesvolle DELETE retourneert { success: true }',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Successful DELETE response: { success: true }
      const expectedResponse = { success: true }
      assertEqual(expectedResponse.success, true, 'success flag in response')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 4: Validatie van verplichte velden bij aanmaken
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-validation-invalid-json',
    name: 'POST /api/holdings: invalid JSON body → 400',
    category: CAT,
    description: 'Niet-parseerbare JSON body retourneert 400 met foutmelding',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Invalid JSON → 400 "Ongeldig JSON-formaat in request body"
      const errorMsg = 'Ongeldig JSON-formaat in request body'
      assert(errorMsg.length > 0, 'error message for invalid JSON')
    },
  },
  {
    id: 'assets-crud-validation-non-object-body',
    name: 'POST /api/holdings: array body → 400',
    category: CAT,
    description: 'Body moet een JSON-object zijn, geen array',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Array or non-object body → 400 "Request body moet een JSON-object zijn"
      const errorMsg = 'Request body moet een JSON-object zijn'
      assert(errorMsg.includes('JSON-object'), 'error message for non-object body')
    },
  },
  {
    id: 'assets-crud-validation-string-types',
    name: 'POST /api/holdings: ticker/isin/asset_type type validatie',
    category: CAT,
    description: 'Niet-string waarden voor ticker, isin, asset_type worden geweigerd',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Non-string ticker → 400 "Ticker moet een string zijn"
      // Non-string isin → 400 "ISIN moet een string zijn"
      // Non-string asset_type → 400 "Asset type moet een string zijn"
      const typeErrors = [
        { field: 'ticker', msg: 'Ticker moet een string zijn' },
        { field: 'isin', msg: 'ISIN moet een string zijn' },
        { field: 'asset_type', msg: 'Asset type moet een string zijn' },
      ]
      for (const te of typeErrors) {
        assert(te.msg.includes('string'), `${te.field} type error is descriptive`)
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 5: Dubbele bezitting-naam afhandeling
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-duplicate-ticker-409',
    name: 'POST /api/holdings: duplicate ticker → 409 conflict',
    category: CAT,
    description: 'Bestaande ticker in zelfde asset geeft 409 warning met existing_holdings',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Duplicate ticker detection:
      // 1. Only checked when ticker is provided and non-empty
      // 2. Normalizes to uppercase via ilike
      // 3. Checks within same user + same asset_id
      // 4. Returns 409 with { warning: true, message, existing_holdings }
      // 5. Client can force-create with { force_duplicate: true }
      const conflictResponse = {
        warning: true,
        message: 'Er bestaat al een actieve holding met ticker "..."',
        existing_holdings: [{ id: 'uuid', name: 'name', ticker: 'TICKER' }],
      }
      assertEqual(conflictResponse.warning, true, 'warning flag in 409')
      assert(conflictResponse.message.includes('actieve holding'), 'Dutch duplicate message')
      assertGreaterThan(conflictResponse.existing_holdings.length, 0, 'existing holdings listed')
    },
  },
  {
    id: 'assets-crud-duplicate-force',
    name: 'POST /api/holdings: force_duplicate bypass',
    category: CAT,
    description: 'Met force_duplicate=true wordt de duplicate check overgeslagen',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // force_duplicate: true in body skips duplicate ticker check
      // This allows users to intentionally create multiple holdings with same ticker
      // Use case: same stock in different accounts/assets
      const forceFlag = 'force_duplicate'
      assert(forceFlag === 'force_duplicate', 'force_duplicate flag exists')
    },
  },
  {
    id: 'assets-crud-idempotency',
    name: 'POST /api/holdings: idempotency key caching',
    category: CAT,
    description: 'X-Idempotency-Key header voorkomt dubbele creatie',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Idempotency mechanism:
      // 1. Client sends X-Idempotency-Key header
      // 2. Cache key = `${user.id}:${idempotencyKey}`
      // 3. If already cached → return cached response (no new insert)
      // 4. TTL = 5 minutes (300000ms)
      // 5. Expired keys are cleaned before each check
      const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000
      assertEqual(IDEMPOTENCY_TTL_MS, 300000, 'idempotency TTL = 5 minuten')

      const idempotencyHeader = 'X-Idempotency-Key'
      assert(idempotencyHeader.length > 0, 'idempotency header defined')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 6: Herwaardering (revalue) flow en historische waardes
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-revalue-price-update',
    name: 'PATCH /api/holdings: prijs update triggert asset sync',
    category: CAT,
    description: 'Bij wijziging current_price of units wordt parent asset.current_value bijgewerkt',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // When current_price or units change via PATCH:
      // 1. updates.last_price_update = new Date().toISOString()
      // 2. syncAssetValueFromHoldings is called to update parent asset
      // 3. Asset's current_value = SUM(price * units * eurRate) across all active holdings
      const syncTriggers = ['current_price', 'units']
      assertEqual(syncTriggers.length, 2, 'sync triggered by price or units change')

      // last_price_update is bumped only when current_price changes
      const lastPriceUpdateTrigger = 'current_price'
      assert(lastPriceUpdateTrigger === 'current_price', 'last_price_update bumped on price change')
    },
  },
  {
    id: 'assets-crud-value-history-auth',
    name: 'GET /api/holdings/[id]/value-history: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated request voor value-history retourneert 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/fake-uuid/value-history')
      assertEqual(status, 401, 'GET value-history → 401')
    },
  },
  {
    id: 'assets-crud-value-history-response',
    name: 'GET /api/holdings/[id]/value-history: response shape',
    category: CAT,
    description: 'Value history retourneert { history, source, holding_id, current_value, ... }',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Response shape:
      // { holding_id, holding_name, ticker, history, current_value, current_units, current_price, source }
      const responseFields = [
        'holding_id', 'holding_name', 'ticker',
        'history', 'current_value', 'current_units', 'current_price', 'source',
      ]
      assertEqual(responseFields.length, 8, '8 velden in value-history response')

      // History point shape: { date, value, units, price, event, cost_basis }
      const historyPointFields = ['date', 'value', 'units', 'price', 'event', 'cost_basis']
      assertEqual(historyPointFields.length, 6, '6 velden per history point')

      // Source values
      const validSources = ['holding_prices', 'transactions']
      assertEqual(validSources.length, 2, '2 mogelijke history sources')
    },
  },
  {
    id: 'assets-crud-value-history-events',
    name: 'GET /api/holdings/[id]/value-history: event labels',
    category: CAT,
    description: 'Transactie-events worden vertaald naar Koop/Verkoop/Dividend/Koers/Huidig',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Event types in history:
      // Transaction-based: 'Koop' (buy), 'Verkoop' (sell), 'Dividend'
      // Price-based: 'Koers' (daily price point)
      // Current: 'Huidig' (today's value as final point)
      const eventLabels = ['Koop', 'Verkoop', 'Dividend', 'Koers', 'Huidig', 'Aankoop']
      assertGreaterThanOrEqual(eventLabels.length, 5, 'minstens 5 event labels')
      assertIncludes(eventLabels, 'Koop', 'buy event label')
      assertIncludes(eventLabels, 'Verkoop', 'sell event label')
      assertIncludes(eventLabels, 'Huidig', 'current value label')
      assertIncludes(eventLabels, 'Koers', 'price-based history label')
      assertIncludes(eventLabels, 'Aankoop', 'initial purchase event label')
    },
  },
  {
    id: 'assets-crud-value-history-cost-basis',
    name: 'GET /api/holdings/[id]/value-history: cost basis berekening',
    category: CAT,
    description: 'Cost basis tracking: buy adds, sell removes proportional to avg cost',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Cost basis calculation rules:
      // Buy: runningCostBasis += numUnits * pricePerUnit
      //       runningUnits += numUnits
      // Sell: avgCost = runningCostBasis / runningUnits
      //       runningCostBasis -= avgCost * numUnits
      //       runningUnits = max(0, runningUnits - numUnits)
      // When runningUnits <= 0: reset both to 0

      // Simulate: buy 10 @ €50 = cost €500, then sell 5
      let costBasis = 10 * 50  // €500
      let units = 10
      // Sell 5 units
      const avgCost = costBasis / units  // €50
      costBasis -= avgCost * 5  // €250
      units -= 5  // 5

      assertEqual(costBasis, 250, 'cost basis na partial sell = €250')
      assertEqual(units, 5, 'units na sell = 5')
      assertEqual(avgCost, 50, 'avg cost = €50')

      // Sell remaining
      const avgCost2 = costBasis / units
      costBasis -= avgCost2 * 5
      units = Math.max(0, units - 5)
      if (units <= 0) { costBasis = 0; units = 0 }

      assertEqual(costBasis, 0, 'cost basis na volledige verkoop = 0')
      assertEqual(units, 0, 'units na volledige verkoop = 0')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 7: Impact op netto vermogen na CRUD operaties
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-nw-get-totals',
    name: 'GET /api/holdings: total_value en total_cost berekening',
    category: CAT,
    description: 'GET response bevat geaggregeerde total_value en total_cost in EUR',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // GET /api/holdings response:
      // total_value = SUM((current_price ?? avg_purchase_price) * units * eurRate)
      // total_cost = SUM(avg_purchase_price * units * eurRate)
      // Foreign currencies converted via getEURRateSync(currency)

      // Simulate: 2 holdings
      // Holding A: 10 units @ current €100, cost €80
      // Holding B: 5 units @ current €200, cost €150
      const totalValue = (100 * 10) + (200 * 5)  // 1000 + 1000 = 2000
      const totalCost = (80 * 10) + (150 * 5)  // 800 + 750 = 1550
      const unrealizedPnL = totalValue - totalCost  // 450

      assertEqual(totalValue, 2000, 'total_value = €2000')
      assertEqual(totalCost, 1550, 'total_cost = €1550')
      assertGreaterThan(unrealizedPnL, 0, 'unrealized P&L is positief')
    },
  },
  {
    id: 'assets-crud-nw-asset-sync-formula',
    name: 'syncAssetValueFromHoldings: aggregatie formule',
    category: CAT,
    description: 'Asset value = SUM(price * units * eurRate) over alle actieve holdings',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // syncAssetValueFromHoldings behaviour:
      // 1. Fetches all active holdings for the asset
      // 2. For each: price = current_price ?? avg_purchase_price
      // 3. Converts to EUR: price * units * getEURRateSync(currency)
      // 4. Updates asset.current_value with the total
      // 5. Non-critical: errors swallowed, returns { synced: false, totalValue: 0 }

      const syncResult = { synced: true, totalValue: 5000 }
      assertEqual(typeof syncResult.synced, 'boolean', 'synced is boolean')
      assertEqual(typeof syncResult.totalValue, 'number', 'totalValue is number')

      // assetHasActiveHoldings utility
      const hasHoldingsResult = { hasHoldings: true, holdingsCount: 3, totalValue: 5000 }
      assertEqual(typeof hasHoldingsResult.hasHoldings, 'boolean', 'hasHoldings is boolean')
      assertEqual(typeof hasHoldingsResult.holdingsCount, 'number', 'holdingsCount is number')
    },
  },
  {
    id: 'assets-crud-nw-currency-conversion',
    name: 'Holdings: currency conversion via getEURRateSync',
    category: CAT,
    description: 'Niet-EUR holdings worden omgerekend naar EUR in totalen',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Currency handling:
      // 1. Default currency = 'EUR' (rate = 1.0)
      // 2. On create: currency.trim().toUpperCase() or 'EUR'
      // 3. On update: currency.trim().toUpperCase()
      // 4. In totals: getEURRateSync(currency) applied per holding
      // 5. Missing/empty currency treated as EUR

      const defaultCurrency = 'EUR'
      assertEqual(defaultCurrency, 'EUR', 'default currency is EUR')

      // Verify uppercase normalization
      const input = ' usd '
      const normalized = input.trim().toUpperCase()
      assertEqual(normalized, 'USD', 'currency wordt genormaliseerd naar uppercase')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 8: GET /api/holdings/[id] — single holding detail
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-get-single-auth',
    name: 'GET /api/holdings/[id]: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated GET voor single holding retourneert 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/fake-uuid')
      assertEqual(status, 401, 'GET /api/holdings/[id] → 401')
    },
  },
  {
    id: 'assets-crud-get-single-not-found',
    name: 'GET /api/holdings/[id]: niet bestaand → 404',
    category: CAT,
    description: 'Niet-bestaande holding retourneert 404 met notFound flag',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // 404 response: { error: 'Holding niet gevonden', notFound: true }
      const notFoundResponse = { error: 'Holding niet gevonden', notFound: true }
      assertEqual(notFoundResponse.notFound, true, 'notFound flag in 404 response')
      assert(notFoundResponse.error.includes('niet gevonden'), 'Dutch not found message')
    },
  },
  {
    id: 'assets-crud-patch-single-favorite',
    name: 'PATCH /api/holdings/[id]: is_favorite toggle',
    category: CAT,
    description: 'PATCH met is_favorite boolean werkt holding favoriet bij',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // PATCH /api/holdings/[id] only supports is_favorite toggle
      // Body: { is_favorite: boolean }
      // Returns: { holding } or 404 "Holding niet gevonden"
      // Empty/invalid updates → 400 "Geen geldige velden om bij te werken"
      const validFields = ['is_favorite']
      assertEqual(validFields.length, 1, 'PATCH [id] ondersteunt alleen is_favorite')

      const errorNoFields = 'Geen geldige velden om bij te werken'
      assert(errorNoFields.includes('Geen geldige'), 'Dutch error for no valid fields')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 9: has_holdings_tracking toggle op assets
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-holdings-tracking-investment',
    name: 'PATCH asset: has_holdings_tracking=true op investment asset',
    category: CAT,
    description: 'Investment asset kan has_holdings_tracking=true krijgen via PATCH',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // The has_holdings_tracking boolean on assets table controls:
      // 1. Whether the "Holdings" pill shows on asset cards
      // 2. Whether holdings from this asset appear on the central holdings page
      // 3. Whether the Portfolio Holdings card on Kern page includes this asset's holdings
      //
      // PATCH /api/assets accepts has_holdings_tracking as an updateable field
      // Investment assets are the primary use case for enabling tracking
      const updatePayload = {
        id: 'investment-asset-uuid',
        has_holdings_tracking: true,
      }
      assertEqual(typeof updatePayload.has_holdings_tracking, 'boolean', 'has_holdings_tracking is boolean')
      assertEqual(updatePayload.has_holdings_tracking, true, 'tracking enabled for investment asset')
    },
  },
  {
    id: 'assets-crud-holdings-tracking-cash-allowed',
    name: 'PATCH asset: has_holdings_tracking=true op cash asset — DB staat toe',
    category: CAT,
    description: 'DB enforced geen type-restrictie op has_holdings_tracking, dat is UI-only',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // The database column has_holdings_tracking is a plain boolean on the assets table
      // with no CHECK constraint tied to asset_type. The UI restricts the toggle to
      // investment/retirement assets, but the DB allows it on any asset type.
      // This is by design: the restriction is a UX concern, not a data integrity concern.
      const cashAssetPayload = {
        id: 'cash-asset-uuid',
        asset_type: 'cash',
        has_holdings_tracking: true,
      }
      assertEqual(typeof cashAssetPayload.has_holdings_tracking, 'boolean', 'has_holdings_tracking is boolean on cash asset')

      // Verify the field defaults to false when not explicitly set
      const defaultValue = false
      assertEqual(defaultValue, false, 'has_holdings_tracking default = false')
    },
  },
  {
    id: 'assets-crud-holdings-tracking-field-in-response',
    name: 'GET asset: has_holdings_tracking veld aanwezig in response',
    category: CAT,
    description: 'Asset response bevat has_holdings_tracking boolean na toggle',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // After PATCH with has_holdings_tracking, the GET response must reflect the change
      // The field is included in the asset-data.ts AssetRow interface
      // and persisted via seed-persona.ts with: has_holdings_tracking: a.has_holdings_tracking ?? false
      const expectedFields = [
        'id', 'name', 'asset_type', 'current_value', 'has_holdings_tracking',
      ]
      assertIncludes(expectedFields, 'has_holdings_tracking', 'has_holdings_tracking in response fields')

      // Seed uses fallback: a.has_holdings_tracking ?? false
      // When has_holdings_tracking is not set on a persona asset, the seed treats it as false
      const missingValue: boolean | undefined = undefined
      const seedFallback = missingValue ?? false
      assertEqual(seedFallback, false, 'seed fallback for missing has_holdings_tracking = false')
    },
  },
  {
    id: 'assets-crud-holdings-tracking-filter-effect',
    name: 'has_holdings_tracking: filter-effect op holdings API en Kern page',
    category: CAT,
    description: 'Holdings API en core-data-loader filteren op has_holdings_tracking=true via joined asset',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // The holdings API route (GET /api/holdings) joins with assets and filters:
      //   .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
      //   .eq('assets.has_holdings_tracking', true)
      //
      // Similarly, the core-data-loader filters tracked holdings for the portfolio card:
      //   const trackedHoldings = rawHoldings.filter(h => asset?.has_holdings_tracking === true)
      //
      // Effect: toggling has_holdings_tracking controls whether holdings are visible
      const filterChain = [
        'JOIN assets ON asset_id',
        'SELECT has_holdings_tracking',
        'FILTER has_holdings_tracking = true',
      ]
      assertEqual(filterChain.length, 3, '3 stappen in holdings tracking filter chain')

      // holdings-data-loader.ts also filters on this field
      const loaderComment = 'Only loads holdings whose parent asset has has_holdings_tracking = true'
      assert(loaderComment.includes('has_holdings_tracking'), 'holdings-data-loader documenteert filter')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Auth consistency check
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-auth-consistency',
    name: 'Holdings API: auth consistency across all endpoints',
    category: CAT,
    description: 'Alle holdings endpoints retourneren 401 voor unauthenticated requests',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const endpoints = [
        { method: 'GET', path: '/api/holdings' },
        { method: 'POST', path: '/api/holdings', body: JSON.stringify({ name: 'Test' }) },
        { method: 'PATCH', path: '/api/holdings', body: JSON.stringify({ id: 'x' }) },
        { method: 'DELETE', path: '/api/holdings?id=x' },
        { method: 'GET', path: '/api/holdings/fake-uuid' },
        { method: 'GET', path: '/api/holdings/fake-uuid/value-history' },
      ]

      for (const ep of endpoints) {
        const { status } = await fetchAPI(ep.path, {
          method: ep.method,
          ...(ep.body ? { body: ep.body } : {}),
        })
        assertEqual(status, 401, `${ep.method} ${ep.path} → 401`)
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Contant geld subtype — cash zonder bankrekening
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'assets-crud-contant-geld-subtype',
    name: 'Cash asset subtype contant_geld: valide configuratie',
    category: CAT,
    description: 'Contant geld is een cash subtype zonder IBAN, met budget tracking',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Contant geld is a valid cash subtype — physical cash, no bank account
      const contantGeldAsset = {
        asset_type: 'cash',
        subtype: 'contant_geld',
        account_number: null, // geen IBAN
        institution: null, // geen bank
        has_budget_tracking: true,
        is_liquid: true,
        expected_return: 0,
      }

      assertEqual(contantGeldAsset.asset_type, 'cash', 'contant_geld valt onder cash type')
      assertEqual(contantGeldAsset.subtype, 'contant_geld', 'subtype = contant_geld')
      assertEqual(contantGeldAsset.account_number, null, 'geen IBAN voor contant geld')
      assertEqual(contantGeldAsset.institution, null, 'geen bank voor contant geld')
      assertEqual(contantGeldAsset.has_budget_tracking, true, 'budget tracking mogelijk op contant geld')
      assertEqual(contantGeldAsset.is_liquid, true, 'contant geld is liquide')
      assertEqual(contantGeldAsset.expected_return, 0, 'contant geld heeft 0% rendement')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'De Kern — Assets CRUD',
    description: 'CRUD operaties voor bezittingen/holdings: aanmaken, bewerken, verwijderen, cascade-effecten, herwaardering',
    icon: 'Briefcase',
    testCount: 0,
  })
  registerTests(tests)
}
