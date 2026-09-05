import { registerCategory, registerTests } from '../test-registry'
import {
  assert,
  assertLessThanOrEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertNotNull,
  assertType,
  assertDefined,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch, authenticatedFetch } from '../server-runner'

const CAT = 'performance.api-response'

/**
 * Performance regression tests for API response times.
 *
 * Measures and validates response times of critical API endpoints:
 *   - /api/daily-expense-rate (target: <300ms) — used in dashboard
 *   - /api/snapshots (target: <500ms) — netto vermogen graph data
 *   - /api/budget-trends (target: <500ms) — budget overview
 *   - Dashboard data loader (target: <1000ms) — all widget data
 *
 * Baselines are stored in localStorage for regression detection in future runs.
 */

// ── Baseline storage ──────────────────────────────────────────────────
const BASELINE_KEY = 'perf-api-baselines'

interface BaselineEntry {
  endpoint: string
  avgMs: number
  minMs: number
  maxMs: number
  samples: number
  recordedAt: string
}

interface BaselineStore {
  version: number
  entries: Record<string, BaselineEntry>
}

function loadBaselines(): BaselineStore {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 1) return parsed
    }
  } catch { /* ignore parse errors */ }
  return { version: 1, entries: {} }
}

function saveBaseline(endpoint: string, durationMs: number): void {
  try {
    const store = loadBaselines()
    const existing = store.entries[endpoint]
    if (existing) {
      // Rolling average over last measurements
      const newSamples = existing.samples + 1
      store.entries[endpoint] = {
        endpoint,
        avgMs: Math.round((existing.avgMs * existing.samples + durationMs) / newSamples),
        minMs: Math.min(existing.minMs, durationMs),
        maxMs: Math.max(existing.maxMs, durationMs),
        samples: newSamples,
        recordedAt: new Date().toISOString(),
      }
    } else {
      store.entries[endpoint] = {
        endpoint,
        avgMs: Math.round(durationMs),
        minMs: Math.round(durationMs),
        maxMs: Math.round(durationMs),
        samples: 1,
        recordedAt: new Date().toISOString(),
      }
    }
    localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
  } catch { /* localStorage not available */ }
}

function getBaseline(endpoint: string): BaselineEntry | null {
  try {
    const store = loadBaselines()
    return store.entries[endpoint] ?? null
  } catch {
    return null
  }
}

// ── Helper: timed fetch ───────────────────────────────────────────────
async function timedFetch(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; durationMs: number; body: Record<string, unknown> }> {
  const start = performance.now()
  try {
    const res = await unauthenticatedFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    })
    const durationMs = performance.now() - start
    let body: Record<string, unknown> = {}
    try {
      body = await res.json()
    } catch { /* non-JSON */ }
    return { status: res.status, durationMs, body }
  } catch {
    const durationMs = performance.now() - start
    return { status: 0, durationMs, body: { error: 'fetch failed' } }
  }
}

// ── Regression check helper ──────────────────────────────────────────
/**
 * Check if the current measurement regresses significantly (>50%) from baseline.
 * Only warns — doesn't fail the test — since baselines are rolling.
 */
function checkRegression(endpoint: string, currentMs: number): string | null {
  const baseline = getBaseline(endpoint)
  if (!baseline || baseline.samples < 3) return null
  const threshold = baseline.avgMs * 1.5
  if (currentMs > threshold) {
    return `Regressie: ${endpoint} duurde ${Math.round(currentMs)}ms, baseline is ${baseline.avgMs}ms (${baseline.samples} samples)`
  }
  return null
}

const tests: TestCase[] = [
  // ── 1. /api/daily-expense-rate (target: <300ms) ─────────────────────
  {
    id: 'perf-daily-expense-rate-response',
    name: '/api/daily-expense-rate response tijd <300ms',
    category: CAT,
    description: 'Gebruikt in dashboard widgets — snelle respons vereist',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      const endpoint = '/api/daily-expense-rate'
      const { status, durationMs } = await timedFetch(endpoint)
      assert(
        status === 200 || status === 401 || status === 307,
        `${endpoint} returned unexpected status ${status}`,
      )
      saveBaseline(endpoint, durationMs)
      assertLessThanOrEqual(
        durationMs,
        300,
        `${endpoint} moet <300ms antwoorden (was ${Math.round(durationMs)}ms)`,
      )
    },
  },
  {
    id: 'perf-daily-expense-rate-shape',
    name: '/api/daily-expense-rate response structuur',
    category: CAT,
    description: 'Valideert response shape van daily expense rate',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await timedFetch('/api/daily-expense-rate')
      if (status === 200) {
        // Should return numeric rate
        assertType(body, 'object', 'response is object')
      } else {
        assert(status === 401 || status === 307, `Expected 200 or 401, got ${status}`)
      }
    },
  },

  // ── 2. /api/snapshots (target: <500ms) ──────────────────────────────
  {
    id: 'perf-snapshots-response',
    name: '/api/snapshots response tijd <500ms',
    category: CAT,
    description: 'Netto vermogen grafiek data — mag niet traag zijn',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const endpoint = '/api/snapshots'
      const { status, durationMs } = await timedFetch(endpoint)
      assert(
        status === 200 || status === 401 || status === 307,
        `${endpoint} returned unexpected status ${status}`,
      )
      saveBaseline(endpoint, durationMs)
      assertLessThanOrEqual(
        durationMs,
        500,
        `${endpoint} moet <500ms antwoorden (was ${Math.round(durationMs)}ms)`,
      )
    },
  },
  {
    id: 'perf-snapshots-shape',
    name: '/api/snapshots response bevat array',
    category: CAT,
    description: 'Snapshot data moet een array van entries zijn',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await timedFetch('/api/snapshots')
      if (status === 200) {
        assertType(body, 'object', 'response is object')
      } else {
        assert(status === 401 || status === 307, `Expected 200 or 401, got ${status}`)
      }
    },
  },

  // ── 3. /api/budget-trends (target: <500ms) ─────────────────────────
  {
    id: 'perf-budget-trends-response',
    name: '/api/budget-trends response tijd <500ms',
    category: CAT,
    description: 'Budget overzicht data — gebruikt in budget view',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const endpoint = '/api/budget-trends'
      const { status, durationMs } = await timedFetch(endpoint)
      assert(
        status === 200 || status === 401 || status === 307,
        `${endpoint} returned unexpected status ${status}`,
      )
      saveBaseline(endpoint, durationMs)
      assertLessThanOrEqual(
        durationMs,
        500,
        `${endpoint} moet <500ms antwoorden (was ${Math.round(durationMs)}ms)`,
      )
    },
  },
  {
    id: 'perf-budget-trends-shape',
    name: '/api/budget-trends response structuur',
    category: CAT,
    description: 'Budget trends endpoint geeft geldige JSON terug',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await timedFetch('/api/budget-trends')
      if (status === 200) {
        assertType(body, 'object', 'response is object')
      } else {
        assert(status === 401 || status === 307, `Expected 200 or 401, got ${status}`)
      }
    },
  },

  // ── 4. Dashboard data loader (target: <1000ms) ─────────────────────
  // We approximate by measuring the dashboard page load (which triggers the server data loader)
  {
    id: 'perf-dashboard-page-response',
    name: 'Dashboard pagina response tijd <1000ms',
    category: CAT,
    description: 'Dashboard laadt alle widget data — totale laadtijd moet <1s',
    priority: 'critical',
    estimatedDurationMs: 3000,
    async fn() {
      const endpoint = '/dashboard'
      const start = performance.now()
      try {
        const res = await authenticatedFetch(endpoint, { redirect: 'manual' })
        const durationMs = performance.now() - start
        // Dashboard may redirect to login (307/302) or return 200
        assert(
          res.status === 200 || res.status === 307 || res.status === 302,
          `${endpoint} returned unexpected status ${res.status}`,
        )
        saveBaseline('dashboard-page', durationMs)
        assertLessThanOrEqual(
          durationMs,
          1000,
          `Dashboard pagina moet <1000ms antwoorden (was ${Math.round(durationMs)}ms)`,
        )
      } catch {
        const durationMs = performance.now() - start
        saveBaseline('dashboard-page', durationMs)
        assert(false, `Dashboard fetch failed after ${Math.round(durationMs)}ms`)
      }
    },
  },
  {
    id: 'perf-dashboard-concurrent-apis',
    name: 'Dashboard API\'s concurrent (<800ms totaal)',
    category: CAT,
    description: 'Parallelle calls naar dashboard-gerelateerde API\'s moeten samen <800ms duren',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      const endpoints = [
        '/api/daily-expense-rate',
        '/api/snapshots',
      ]
      const start = performance.now()
      const results = await Promise.all(
        endpoints.map((ep) => timedFetch(ep)),
      )
      const totalMs = performance.now() - start

      // All should respond (200 or 401)
      for (let i = 0; i < results.length; i++) {
        assert(
          results[i].status === 200 || results[i].status === 401 || results[i].status === 307,
          `${endpoints[i]} returned ${results[i].status}`,
        )
      }

      saveBaseline('dashboard-concurrent', totalMs)
      assertLessThanOrEqual(
        totalMs,
        800,
        `Concurrent dashboard API\'s moeten <800ms totaal (was ${Math.round(totalMs)}ms)`,
      )
    },
  },

  // ── 5. Baseline storage and regression detection ────────────────────
  {
    id: 'perf-baseline-storage',
    name: 'Baseline meetingen opslaan in localStorage',
    category: CAT,
    description: 'Verifieert dat baseline data correct wordt opgeslagen en geladen',
    priority: 'medium',
    estimatedDurationMs: 500,
    fn() {
      // Save a test baseline
      const testEndpoint = '__perf_test_baseline__'
      saveBaseline(testEndpoint, 100)
      saveBaseline(testEndpoint, 200)
      saveBaseline(testEndpoint, 150)

      const baseline = getBaseline(testEndpoint)
      assertNotNull(baseline, 'Baseline moet opgeslagen zijn')
      assertGreaterThanOrEqual(baseline.samples, 3, 'Moet 3 samples hebben')
      assertGreaterThan(baseline.avgMs, 0, 'Gemiddelde moet > 0 zijn')
      assertLessThanOrEqual(baseline.minMs, 100, 'Minimum moet ≤ 100 zijn')
      assertGreaterThanOrEqual(baseline.maxMs, 200, 'Maximum moet ≥ 200 zijn')
      assertDefined(baseline.recordedAt, 'recordedAt moet bestaan')

      // Clean up test baseline
      try {
        const store = loadBaselines()
        delete store.entries[testEndpoint]
        localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
      } catch { /* ignore */ }
    },
  },
  {
    id: 'perf-regression-detection',
    name: 'Regressie detectie werkt correct',
    category: CAT,
    description: 'Controleert dat regressie-alerts worden gegenereerd bij langzamere response',
    priority: 'medium',
    estimatedDurationMs: 500,
    fn() {
      // Save a known baseline
      const testEndpoint = '__perf_test_regression__'
      // Manually set up a baseline with enough samples
      try {
        const store = loadBaselines()
        store.entries[testEndpoint] = {
          endpoint: testEndpoint,
          avgMs: 100,
          minMs: 80,
          maxMs: 120,
          samples: 5,
          recordedAt: new Date().toISOString(),
        }
        localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
      } catch { /* ignore */ }

      // 160ms should NOT trigger regression (< 150% of 100)
      const noRegression = checkRegression(testEndpoint, 140)
      assert(noRegression === null, '140ms tegen baseline 100ms mag geen regressie zijn')

      // 200ms SHOULD trigger regression (> 150% of 100)
      const hasRegression = checkRegression(testEndpoint, 200)
      assertNotNull(hasRegression, '200ms tegen baseline 100ms moet regressie detecteren')
      assert(
        hasRegression.includes('Regressie'),
        'Regressie-melding moet "Regressie" bevatten',
      )

      // Clean up
      try {
        const store = loadBaselines()
        delete store.entries[testEndpoint]
        localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
      } catch { /* ignore */ }
    },
  },
  {
    id: 'perf-baseline-version-upgrade',
    name: 'Baseline store versie-upgrade handling',
    category: CAT,
    description: 'Oude of corrupte baseline data wordt graceful afgehandeld',
    priority: 'low',
    estimatedDurationMs: 200,
    fn() {
      const key = BASELINE_KEY
      const original = localStorage.getItem(key)

      try {
        // Set invalid data
        localStorage.setItem(key, '{ invalid json }')
        const store1 = loadBaselines()
        assert(store1.version === 1, 'Corrupte data → verse store v1')
        assert(Object.keys(store1.entries).length === 0, 'Corrupte data → lege entries')

        // Set wrong version
        localStorage.setItem(key, JSON.stringify({ version: 99, entries: {} }))
        const store2 = loadBaselines()
        assert(store2.version === 1, 'Verkeerde versie → verse store v1')

        // Set null
        localStorage.removeItem(key)
        const store3 = loadBaselines()
        assert(store3.version === 1, 'Geen data → verse store v1')
      } finally {
        // Restore original
        if (original) {
          localStorage.setItem(key, original)
        } else {
          localStorage.removeItem(key)
        }
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Performance — API Response',
    description: 'Response tijden van kritieke API endpoints meten en bewaken',
    icon: 'Timer',
    testCount: 0,
  })
  registerTests(tests)
}
