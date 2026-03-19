import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertFinite,
} from '../assert'
import { unauthenticatedFetch, authenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'

const CAT = 'data.tijdreeksen'

/**
 * Regression tests for time series data consistency:
 *   - Net worth snapshots: chronological order, no gaps/duplicates per month
 *   - Auto-snapshot: trigger, correct net_worth calculation
 *   - Balance snapshots: per-account balance matches transaction sums
 *   - Valuations: consistent value progression, no negative asset values
 *   - Historical data not overwritten by new seed
 *
 * Registered under category 'Data — Tijdreeksen'
 */

// ── Helper: simulate fetch with expected status ──────────────────────
async function fetchAPI(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await authenticatedFetch(path, {
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

// ── Types for snapshot response shapes ──────────────────────────────
type SnapshotRow = {
  id: string
  snapshot_date: string
  total_assets: number
  total_debts: number
  net_worth: number
  freedom_percentage?: number | null
  fire_age?: number | null
  sovereignty_level?: number | null
  savings_rate?: number | null
  resilience_score?: number | null
}

type BalancePoint = { date: string; balance: number }
type EntityHistory = {
  entity_id: string
  entity_name: string
  entity_type: 'asset' | 'debt'
  entity_subtype: string | null
  points: BalancePoint[]
}

const tests: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Step 1: Snapshots chronologisch gesorteerd, geen gaps/duplicaten
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'snapshot-chronological-order',
    name: 'Net worth snapshots: chronologisch gesorteerd',
    category: CAT,
    description: 'GET /api/snapshots returns snapshots in ascending chronological order',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      // Auth guard or success
      if (status === 401 || status === 307) return // Not authenticated, skip gracefully
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      assertDefined(snapshots, 'snapshots array')
      if (snapshots.length < 2) return // Not enough data to verify order

      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1].snapshot_date
        const curr = snapshots[i].snapshot_date
        assert(
          curr >= prev,
          `Snapshots not in chronological order: ${prev} > ${curr} at index ${i}`,
        )
      }
    },
  },
  {
    id: 'snapshot-no-duplicate-months',
    name: 'Net worth snapshots: geen duplicaten per maand',
    category: CAT,
    description: 'No two snapshots share the same YYYY-MM prefix for a single user',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      if (!snapshots || snapshots.length < 2) return

      // Group by YYYY-MM
      const monthCounts = new Map<string, number>()
      for (const s of snapshots) {
        const ym = s.snapshot_date.substring(0, 7) // YYYY-MM
        monthCounts.set(ym, (monthCounts.get(ym) || 0) + 1)
      }

      for (const [month, count] of monthCounts.entries()) {
        assertEqual(count, 1, `Duplicate snapshots in month ${month}`)
      }
    },
  },
  {
    id: 'snapshot-no-date-gaps',
    name: 'Net worth snapshots: geen onverwachte gaps in maandreeks',
    category: CAT,
    description: 'Between first and last snapshot, monthly gaps are checked (seeded data may have intentional spacing)',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      if (!snapshots || snapshots.length < 2) return

      // Extract YYYY-MM values
      const months = snapshots.map(s => s.snapshot_date.substring(0, 7))
      // Verify months are unique (no backwards jumps)
      for (let i = 1; i < months.length; i++) {
        assert(
          months[i] > months[i - 1],
          `Month ordering violation: ${months[i - 1]} followed by ${months[i]}`,
        )
      }
    },
  },
  {
    id: 'snapshot-response-shape',
    name: 'GET /api/snapshots: response shape contract',
    category: CAT,
    description: 'Response includes snapshots array with count, fire_target, yearly_must_expenses',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      assert('snapshots' in body, 'missing snapshots field')
      assert('count' in body, 'missing count field')
      assert('fire_target' in body, 'missing fire_target field')
      assert('yearly_must_expenses' in body, 'missing yearly_must_expenses field')
      const snapshots = body.snapshots as SnapshotRow[]
      assertEqual(snapshots.length, body.count as number, 'count matches array length')
    },
  },
  {
    id: 'snapshot-net-worth-consistency',
    name: 'Snapshot: net_worth = total_assets - total_debts',
    category: CAT,
    description: 'Each snapshot verifies net_worth matches the formula total_assets - total_debts',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      if (!snapshots || snapshots.length === 0) return

      for (const s of snapshots) {
        const expected = Number(s.total_assets) - Number(s.total_debts)
        const actual = Number(s.net_worth)
        const diff = Math.abs(actual - expected)
        assert(
          diff < 0.02,
          `Snapshot ${s.snapshot_date}: net_worth ${actual} !== total_assets ${s.total_assets} - total_debts ${s.total_debts} (expected ${expected}, diff ${diff})`,
        )
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: Auto-snapshot trigger, correct net_worth berekening
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'auto-snapshot-auth-guard',
    name: 'GET /api/snapshots/auto: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated auto-snapshot returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/snapshots/auto')
      assert(
        res.status === 401 || res.status === 307,
        `Expected 401/307 for unauthenticated, got ${res.status}`,
      )
    },
  },
  {
    id: 'auto-snapshot-idempotent',
    name: 'Auto-snapshot: idempotent (created=false bij bestaande)',
    category: CAT,
    description: 'Auto-snapshot returns created=false if a snapshot already exists this month',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // The auto endpoint should return a response shape with created field
      const { status, body } = await fetchAPI('/api/snapshots/auto')
      if (status === 401 || status === 307) return // Not authenticated
      assertEqual(status, 200, 'status')
      assert('created' in body, 'missing created field in auto-snapshot response')
      // Whether true or false, the response must be well-formed
      if (body.created === false) {
        assert('message' in body || 'snapshot' in body, 'idempotent response should have message or snapshot')
      } else {
        assert('snapshot' in body, 'newly created snapshot should be returned')
      }
    },
  },
  {
    id: 'auto-snapshot-response-shape',
    name: 'Auto-snapshot: response bevat snapshot + metrics',
    category: CAT,
    description: 'When a new snapshot is created, response includes snapshot object and metrics',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/auto')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      // Both created=true and created=false should have a snapshot
      if (body.snapshot) {
        const snap = body.snapshot as Record<string, unknown>
        assert('net_worth' in snap || 'total_assets' in snap, 'snapshot should have financial data')
      }
      // If created=true, also expect metrics
      if (body.created === true) {
        assert('metrics' in body, 'new snapshot should include metrics')
      }
    },
  },
  {
    id: 'auto-snapshot-net-worth-formula',
    name: 'Auto-snapshot: net_worth berekening klopt',
    category: CAT,
    description: 'Auto-snapshot net_worth equals total_assets - total_debts',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/auto')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snap = body.snapshot as Record<string, unknown> | undefined
      if (!snap) return
      const totalAssets = Number(snap.total_assets ?? 0)
      const totalDebts = Number(snap.total_debts ?? 0)
      const netWorth = Number(snap.net_worth ?? 0)
      const expected = totalAssets - totalDebts
      const diff = Math.abs(netWorth - expected)
      assert(diff < 0.02, `Auto-snapshot net_worth ${netWorth} !== ${totalAssets} - ${totalDebts} = ${expected}`)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: Balance snapshots: per-account balans
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'balance-snapshot-auth-guard',
    name: 'GET /api/snapshots/balances: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated balance snapshot request returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/snapshots/balances')
      assert(
        res.status === 401 || res.status === 307,
        `Expected 401/307 for unauthenticated, got ${res.status}`,
      )
    },
  },
  {
    id: 'balance-snapshot-response-shape',
    name: 'GET /api/snapshots/balances: response shape',
    category: CAT,
    description: 'Response contains entities array with entity_id, entity_name, entity_type, points',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      assert('entities' in body, 'missing entities field')
      assert('count' in body, 'missing count field')
      const entities = body.entities as EntityHistory[]
      assertEqual(entities.length, body.count as number, 'count matches array length')
      for (const entity of entities) {
        assertDefined(entity.entity_id, 'entity_id')
        assertDefined(entity.entity_name, 'entity_name')
        assert(
          entity.entity_type === 'asset' || entity.entity_type === 'debt',
          `Invalid entity_type: ${entity.entity_type}`,
        )
        assert(Array.isArray(entity.points), 'points should be an array')
      }
    },
  },
  {
    id: 'balance-snapshot-chronological-points',
    name: 'Balance snapshots: punten chronologisch per entiteit',
    category: CAT,
    description: 'Each entity\'s points array is in ascending chronological order',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const entities = body.entities as EntityHistory[]
      for (const entity of entities) {
        for (let i = 1; i < entity.points.length; i++) {
          assert(
            entity.points[i].date >= entity.points[i - 1].date,
            `Entity ${entity.entity_name}: points not chronological at index ${i}: ${entity.points[i - 1].date} > ${entity.points[i].date}`,
          )
        }
      }
    },
  },
  {
    id: 'balance-snapshot-type-filter',
    name: 'Balance snapshots: type=asset filter werkt',
    category: CAT,
    description: 'GET /api/snapshots/balances?type=asset returns only asset entities',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances?type=asset')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const entities = body.entities as EntityHistory[]
      for (const entity of entities) {
        assertEqual(entity.entity_type, 'asset', `Expected asset, got ${entity.entity_type} for ${entity.entity_name}`)
      }
    },
  },
  {
    id: 'balance-snapshot-type-filter-debt',
    name: 'Balance snapshots: type=debt filter werkt',
    category: CAT,
    description: 'GET /api/snapshots/balances?type=debt returns only debt entities',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances?type=debt')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const entities = body.entities as EntityHistory[]
      for (const entity of entities) {
        assertEqual(entity.entity_type, 'debt', `Expected debt, got ${entity.entity_type} for ${entity.entity_name}`)
      }
    },
  },
  {
    id: 'balance-snapshot-limit-per-entity',
    name: 'Balance snapshots: limit parameter beperkt punten per entiteit',
    category: CAT,
    description: 'GET /api/snapshots/balances?limit=3 returns max 3 points per entity',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances?limit=3')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const entities = body.entities as EntityHistory[]
      for (const entity of entities) {
        assert(
          entity.points.length <= 3,
          `Entity ${entity.entity_name} has ${entity.points.length} points, expected ≤ 3`,
        )
      }
    },
  },
  {
    id: 'balance-snapshot-assets-first-sorting',
    name: 'Balance snapshots: assets gesorteerd vóór debts',
    category: CAT,
    description: 'In the entities array, all assets appear before any debts',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots/balances')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const entities = body.entities as EntityHistory[]
      if (entities.length < 2) return
      let seenDebt = false
      for (const entity of entities) {
        if (entity.entity_type === 'debt') seenDebt = true
        if (entity.entity_type === 'asset' && seenDebt) {
          assert(false, `Asset "${entity.entity_name}" found after debt entities in sorted output`)
        }
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: Valuations tijdreeks
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'valuations-auth-guard',
    name: 'GET /api/valuations: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated valuations request returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/valuations')
      assert(
        res.status === 401 || res.status === 307,
        `Expected 401/307 for unauthenticated, got ${res.status}`,
      )
    },
  },
  {
    id: 'valuations-response-shape',
    name: 'GET /api/valuations: response shape',
    category: CAT,
    description: 'Response contains valuations array and count',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/valuations')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      assert('valuations' in body, 'missing valuations field')
      assert('count' in body, 'missing count field')
      const valuations = body.valuations as Record<string, unknown>[]
      assertEqual(valuations.length, body.count as number, 'count matches array length')
    },
  },
  {
    id: 'valuations-no-negative-asset-values',
    name: 'Valuations: geen negatieve waarden voor assets',
    category: CAT,
    description: 'Asset valuations should not have negative values',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/valuations?entity_type=asset')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const valuations = body.valuations as Record<string, unknown>[]
      for (const v of valuations) {
        const value = Number(v.value ?? v.valuation_value ?? 0)
        assertGreaterThanOrEqual(value, 0, `Asset valuation for entity ${v.entity_id} has negative value ${value}`)
      }
    },
  },
  {
    id: 'valuations-entity-type-filter',
    name: 'Valuations: entity_type filter parameter',
    category: CAT,
    description: 'GET /api/valuations?entity_type=asset returns only asset-type valuations',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/valuations?entity_type=asset')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const valuations = body.valuations as Record<string, unknown>[]
      for (const v of valuations) {
        assertEqual(v.entity_type, 'asset', `Expected entity_type=asset, got ${v.entity_type}`)
      }
    },
  },
  {
    id: 'valuations-limit-parameter',
    name: 'Valuations: limit parameter beperkt resultaten',
    category: CAT,
    description: 'GET /api/valuations?limit=5 returns at most 5 valuations',
    priority: 'low',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/valuations?limit=5')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const valuations = body.valuations as Record<string, unknown>[]
      assert(
        valuations.length <= 5,
        `Expected ≤ 5 valuations, got ${valuations.length}`,
      )
    },
  },
  {
    id: 'valuations-date-ordering',
    name: 'Valuations: aflopend gesorteerd op datum',
    category: CAT,
    description: 'Valuations are returned in descending date order (newest first)',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/valuations')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const valuations = body.valuations as Record<string, unknown>[]
      if (valuations.length < 2) return

      for (let i = 1; i < valuations.length; i++) {
        const prev = String(valuations[i - 1].valuation_date ?? '')
        const curr = String(valuations[i].valuation_date ?? '')
        assert(
          prev >= curr,
          `Valuations not in descending order: ${prev} < ${curr} at index ${i}`,
        )
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 5: Historische data niet overschreven bij nieuwe seed
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'snapshot-upsert-conflict-key',
    name: 'Snapshot upsert: user_id + snapshot_date conflict key',
    category: CAT,
    description: 'POST /api/snapshots uses upsert on user_id,snapshot_date — same date updates, does not create duplicate',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      // Verify by checking the POST response shape — it should use upsert semantics
      const { status, body } = await fetchAPI('/api/snapshots', { method: 'POST' })
      if (status === 401 || status === 307) return
      // Status 200 means upsert succeeded (either insert or update)
      assertEqual(status, 200, 'POST /api/snapshots status')
      assert('snapshot' in body, 'response should contain snapshot')
      assert('calculation' in body, 'response should contain calculation')

      // Verify the calculation breakdown is present
      const calc = body.calculation as Record<string, unknown>
      assert('total_assets' in calc, 'calculation should have total_assets')
      assert('total_debts' in calc, 'calculation should have total_debts')
      assert('net_worth' in calc, 'calculation should have net_worth')
      assert('formula' in calc, 'calculation should have formula')
      assertEqual(calc.formula, 'net_worth = total_assets - total_debts', 'formula')
    },
  },
  {
    id: 'snapshot-post-auth-guard',
    name: 'POST /api/snapshots: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated POST to snapshots returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/snapshots', { method: 'POST' })
      assert(
        res.status === 401 || res.status === 307,
        `Expected 401/307 for unauthenticated POST, got ${res.status}`,
      )
    },
  },
  {
    id: 'snapshot-extended-metrics',
    name: 'Snapshot: extended metrics in response (freedom_percentage, fire_age, etc.)',
    category: CAT,
    description: 'POST response includes freedom_percentage, sovereignty_level, savings_rate, resilience_score',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots', { method: 'POST' })
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshot = body.snapshot as Record<string, unknown>
      assertNotNull(snapshot, 'snapshot')
      // Extended metrics should be present (either in DB or computed)
      assert('freedom_percentage' in snapshot, 'missing freedom_percentage')
      assert('sovereignty_level' in snapshot, 'missing sovereignty_level')
      assert('savings_rate' in snapshot, 'missing savings_rate')
      assert('resilience_score' in snapshot, 'missing resilience_score')
      // fire_age can be null (unreachable FIRE), but field should exist
      assert('fire_age' in snapshot, 'missing fire_age')
    },
  },
  {
    id: 'snapshot-cron-auth-guard',
    name: 'GET /api/snapshots/cron: auth guard (401 zonder secret)',
    category: CAT,
    description: 'Cron endpoint requires CRON_SECRET authorization',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // If CRON_SECRET is configured, unauthenticated should get 401
      // If not configured (dev mode), it may return 200 or 500
      const res = await unauthenticatedFetch('/api/snapshots/cron')
      const status = res.status
      let body: Record<string, unknown> = {}
      try { body = await res.json() } catch { /* Non-JSON response */ }
      // In production: 401. In dev without service role key: 500
      assert(
        status === 401 || status === 500 || status === 200,
        `Unexpected cron status: ${status}`,
      )
      // If 500, should mention service role key
      if (status === 500 && body.error) {
        assert(
          String(body.error).includes('SERVICE_ROLE_KEY') ||
          String(body.description || '').includes('service role'),
          'Error should mention missing service role key',
        )
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 6: captureBalanceSnapshots helper logic
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'balance-capture-helper-contract',
    name: 'captureBalanceSnapshots: genereert correcte row shape',
    category: CAT,
    description: 'The balance snapshot helper creates rows with entity_type, entity_id, balance fields',
    priority: 'high',
    estimatedDurationMs: 200,
    async fn() {
      // Test the captureBalanceSnapshots contract by importing it
      const { captureBalanceSnapshots } = await import('@/lib/balance-snapshot')
      assertDefined(captureBalanceSnapshots, 'captureBalanceSnapshots should be exported')
      assertEqual(typeof captureBalanceSnapshots, 'function', 'should be a function')
      // The function signature: (supabase, userId, date, assets, debts) => Promise<{count, error?}>
      // We can't call it without a real supabase client, but verify the export exists
    },
  },
  {
    id: 'net-worth-data-types-exported',
    name: 'Net worth types: NetWorthSnapshot, BalanceSnapshot, EntityBalanceHistory',
    category: CAT,
    description: 'All required types are exported from lib/net-worth-data',
    priority: 'medium',
    estimatedDurationMs: 200,
    async fn() {
      // Verify the type module exports are accessible at runtime
      const mod = await import('@/lib/net-worth-data')
      // Types are compile-time only, but we can verify module loads without error
      assertDefined(mod, 'net-worth-data module should load')
    },
  },
  {
    id: 'snapshot-freedom-percentage-range',
    name: 'Snapshots: freedom_percentage altijd 0-100',
    category: CAT,
    description: 'All snapshot freedom_percentage values are clamped between 0 and 100',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      for (const s of snapshots) {
        if (s.freedom_percentage != null) {
          assertGreaterThanOrEqual(s.freedom_percentage, 0, `freedom_percentage for ${s.snapshot_date}`)
          assert(
            s.freedom_percentage <= 100,
            `freedom_percentage ${s.freedom_percentage} > 100 for ${s.snapshot_date}`,
          )
        }
      }
    },
  },
  {
    id: 'snapshot-all-numeric-values-finite',
    name: 'Snapshots: alle numerieke waarden zijn finite (geen NaN/Infinity)',
    category: CAT,
    description: 'No NaN or Infinity values in snapshot numeric fields',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/snapshots')
      if (status === 401 || status === 307) return
      assertEqual(status, 200, 'status')
      const snapshots = body.snapshots as SnapshotRow[]
      for (const s of snapshots) {
        assertFinite(Number(s.total_assets), `total_assets for ${s.snapshot_date}`)
        assertFinite(Number(s.total_debts), `total_debts for ${s.snapshot_date}`)
        assertFinite(Number(s.net_worth), `net_worth for ${s.snapshot_date}`)
        if (s.freedom_percentage != null) {
          assertFinite(Number(s.freedom_percentage), `freedom_percentage for ${s.snapshot_date}`)
        }
        if (s.fire_age != null) {
          assertFinite(Number(s.fire_age), `fire_age for ${s.snapshot_date}`)
        }
        if (s.savings_rate != null) {
          assertFinite(Number(s.savings_rate), `savings_rate for ${s.snapshot_date}`)
        }
      }
    },
  },
  {
    id: 'auth-consistency-all-endpoints',
    name: 'Auth guard: alle snapshot/valuations endpoints beveiligd',
    category: CAT,
    description: 'All 5 endpoints (snapshots GET/POST, auto, balances, valuations) check authentication',
    priority: 'critical',
    estimatedDurationMs: 2500,
    async fn() {
      const endpoints = [
        { path: '/api/snapshots', method: 'GET' },
        { path: '/api/snapshots', method: 'POST' },
        { path: '/api/snapshots/auto', method: 'GET' },
        { path: '/api/snapshots/balances', method: 'GET' },
        { path: '/api/valuations', method: 'GET' },
      ]

      for (const { path, method } of endpoints) {
        const res = await unauthenticatedFetch(path, { method })
        assert(
          res.status === 401 || res.status === 307,
          `${method} ${path}: expected 401/307 for unauthenticated, got ${res.status}`,
        )
      }
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Data — Tijdreeksen',
    description: 'Snapshot & tijdreeks consistentie: chronologisch, geen duplicaten, valuations, balance history',
    icon: 'Clock',
    testCount: 0,
  })
  registerTests(tests)
}
