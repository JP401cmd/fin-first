import { createClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import type { TestReport, TestSuiteConfig, TestResult } from './test-types'
import { loadAllTests } from './test-registry'
import {
  runTestSuite,
  type TestProgressCallback,
  setRoleSwitcher,
  clearRoleSwitcher,
  setInitialRunnerRole,
} from './test-runner'
import { seedTestData, cleanupTestData } from './test-seed'

// ── Server-side Regression Test Runner ──────────────────────────────────────
//
// Wraps the existing test runner infrastructure so tests execute on the
// server under a dedicated test account. The caller's browser session is
// never touched — all Supabase auth happens via a standalone client.
//
// Key responsibilities:
//   1. Sign in as the regression-test account to obtain an access_token
//   2. Patch globalThis.fetch so relative URLs and auth headers work
//   3. Provide an in-memory localStorage polyfill for performance tests
//   4. Delegate to the existing runTestSuite() engine
//   5. Restore all patches after execution

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServerRunConfig {
  categories?: string[]
}

// ── In-memory localStorage polyfill ──────────────────────────────────────────

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return keys[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  // Index signature required by Storage interface
  [name: string]: unknown
}

// ── Unauthenticated fetch for auth-guard tests ─────────────────────────────
//
// The server-runner patches globalThis.fetch with Authorization headers so
// tests run as the dedicated test account. Auth-guard tests, however, need
// to make requests WITHOUT auth to verify 401 responses. This module-level
// helper uses the original (unpatched) fetch while still resolving relative
// URLs to the local dev server.

let _originalFetch: typeof globalThis.fetch | null = null
let _baseUrl: string = ''

/**
 * Get the base URL used for resolving relative paths in tests.
 *
 * Returns the URL set during test suite initialization, or a sensible default
 * using NEXT_PUBLIC_SITE_URL / PORT env vars. Test suites should use this
 * instead of hardcoding 'http://localhost:3000'.
 */
export function getBaseUrl(): string {
  if (_baseUrl) return _baseUrl
  return process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT || 3000}`
}
let _accessToken: string = ''
let _testUserId: string = ''
let _currentRole: 'superadmin' | 'user' = 'user'
/** De rol die het testaccount had vóór de run — daar zetten we 'm ook op terug. */
let _initialRole: 'superadmin' | 'user' = 'user'

// ── Cookie credentials (set during test suite init) ─────────────────────────
let _cookieName: string = ''
let _cookieValue: string = ''

/**
 * Make an HTTP request WITH the test account's authentication headers.
 *
 * Use this instead of bare `fetch()` in test suites. It explicitly resolves
 * relative URLs and adds auth headers, so it works reliably even if
 * Next.js re-patches globalThis.fetch during HMR / hot reload.
 *
 * Relative paths (starting with `/`) are resolved against the local dev server.
 * Authorization (Bearer token) and Cookie headers are added automatically.
 */
export function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const fetchFn = _originalFetch ?? globalThis.fetch

  let url: string
  if (typeof input === 'string') {
    url = input.startsWith('/') ? `${getBaseUrl()}${input}` : input
  } else if (input instanceof URL) {
    url = input.toString()
  } else {
    // Request object
    url = input.url
    if (url.startsWith('/')) url = `${getBaseUrl()}${url}`
  }

  // Merge auth headers
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization') && _accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`)
  }
  if (!headers.has('Cookie') && _cookieName && _cookieValue) {
    headers.set('Cookie', `${_cookieName}=${encodeURIComponent(_cookieValue)}`)
  }

  const patchedInit: RequestInit = {
    ...init,
    headers,
  }

  return fetchFn(url, patchedInit)
}

/**
 * Make an HTTP request WITHOUT authentication headers.
 *
 * Use this in auth-guard tests that need to verify 401 responses.
 * Relative paths (starting with `/`) are resolved against the local dev server.
 * No Authorization or Cookie headers are added.
 */
export function unauthenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const fetchFn = _originalFetch ?? globalThis.fetch

  let url: string
  if (typeof input === 'string') {
    url = input.startsWith('/') ? `${_baseUrl}${input}` : input
  } else if (input instanceof URL) {
    url = input.toString()
  } else {
    // Request object
    url = input.url
    if (url.startsWith('/')) url = `${_baseUrl}${url}`
  }

  return fetchFn(url, init)
}

// ── Role switching for admin vs normal-user tests ────────────────────────────
//
// Tests that verify admin-only features (beheer pages, admin API endpoints)
// need 'superadmin'; tests die juist het NIET-admin-gedrag afdekken hebben
// 'user' nodig. Het testrunner-engine wisselt automatisch via requiredRole/
// defaultRole op TestCase/TestCategory.
//
// De wissel loopt via de SERVICE-ROLE-client. Reden: de self-service PATCH die
// hier eerder stond ging via het anon/authenticated bearer-token van het
// testaccount zelf en liep daarmee tegen de anti-privilege-escalatie-trigger
// `guard_profiles_role()` (migraties 20260717132003 + 20260720081332) aan —
// terecht, want die trigger is een bewuste security-fix. De trigger stelt alles
// buiten 'authenticated'/'anon' expliciet vrij, dus service-role mag wél. Zonder
// die route kon de suite GEEN ENKEL niet-admin-gedrag testen.
//
// DEV-ONLY: zie assertHarnessEnvironment() hieronder.

/**
 * Weiger elke service-role-actie van de regressieharness buiten lokale
 * development.
 *
 * Drie onafhankelijke lagen houden dit pad uit productie:
 *   1. BUILD-TIME — `runServerTestSuite` heeft precies één aanroeper,
 *      `app/api/regression/run/route.ts`, en die opent met
 *      `if (process.env.NODE_ENV !== 'development') return forbidden(...)`.
 *      Next/Turbopack vouwt die constante bij `next build` weg: in de
 *      productiebundel is de handler letterlijk gereduceerd tot een
 *      onvoorwaardelijke 403 en is deze module niet eens meegebundeld.
 *      Runtime-env of headers kunnen daar niet meer aan tornen.
 *   2. PROXY — /api/regression/* valt onder de `/api/`-protected-prefix in
 *      lib/supabase/proxy.ts en staat niet in publicPaths: 401 zonder sessie.
 *   3. RUNTIME (hier) — het vangnet voor een consument die de build-time-gate
 *      niet heeft, bv. een script of test die deze module direct importeert.
 *      NODE_ENV én de Vercel-systeemvariabelen worden los gecontroleerd, zodat
 *      één verkeerd gezette env-var de gate niet opent.
 */
function assertHarnessEnvironment(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'De regressieharness draait uitsluitend in development ' +
      `(NODE_ENV='${process.env.NODE_ENV}').`,
    )
  }
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    throw new Error(
      'De regressieharness draait niet op een Vercel-deployment ' +
      `(VERCEL_ENV='${process.env.VERCEL_ENV}').`,
    )
  }
}

/**
 * Switch the test account's profile.role in the database via de service-role.
 *
 * De update is hard gescopet op `_testUserId` — de id uit de geverifieerde
 * signInWithPassword-respons van REGRESSION_TEST_EMAIL. Er komt geen
 * client-input aan te pas; er is dus geen pad waarlangs een andere rij geraakt
 * kan worden.
 *
 * @param role - The role to set ('user' or 'superadmin')
 * @returns true if the switch succeeded, false otherwise
 */
async function switchTestAccountRole(role: 'superadmin' | 'user'): Promise<boolean> {
  if (!_testUserId) {
    console.warn('[server-runner] Role switch unavailable: geen testaccount-id')
    return false
  }

  try {
    assertHarnessEnvironment()
    const service = getServiceClient()
    const { error } = await service.from('profiles').update({ role }).eq('id', _testUserId)
    if (error) {
      console.warn(`[server-runner] Role switch to '${role}' failed:`, error.message)
      return false
    }
    _currentRole = role
    return true
  } catch (err) {
    console.warn(`[server-runner] Role switch to '${role}' error:`, err)
    return false
  }
}

/**
 * Lees de WERKELIJKE rol van het testaccount uit de database.
 *
 * De runner nam deze stand vroeger hard aan ('user'). Klopte die aanname niet,
 * dan sloeg de short-circuit in ensureRole() toe en werd er nooit gewisseld —
 * waardoor elke `requiredRole: 'user'`-test alsnog als superadmin draaide en
 * misleidend rood werd. Aannemen mag hier dus niet; we lezen.
 */
async function readTestAccountRole(): Promise<'superadmin' | 'user'> {
  assertHarnessEnvironment()
  const service = getServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select('role')
    .eq('id', _testUserId)
    .maybeSingle()

  if (error || !data) {
    throw new Error(
      'Kon de rol van het regressietest-account niet uitlezen: ' +
      `${error?.message ?? 'geen profielrij gevonden'}. ` +
      'Zonder geverifieerde beginrol kan de suite geen betrouwbaar rolgebonden signaal geven.',
    )
  }
  return data.role === 'superadmin' ? 'superadmin' : 'user'
}

/**
 * Run a callback with the test account temporarily set to role='user'.
 * After the callback completes (or throws), the role is restored to its previous value.
 *
 * NOTE: With the new automatic role-switching (via requiredRole on TestCase or
 * defaultRole on TestCategory), you typically don't need this anymore.
 * The test runner handles role switching automatically.
 */
export async function withUserRole(fn: () => void | Promise<void>): Promise<void> {
  const previousRole = _currentRole
  if (_currentRole === 'user') {
    // Already user, just run
    await fn()
    return
  }
  const switched = await switchTestAccountRole('user')
  if (!switched) {
    throw new Error(
      'Kon de testaccount-rol niet wisselen naar "user". ' +
      'Controleer of het RLS-beleid op profiles self-update toestaat voor de role kolom.',
    )
  }
  try {
    await fn()
  } finally {
    if (previousRole !== 'user') {
      const restored = await switchTestAccountRole(previousRole)
      if (!restored) {
        console.error(`[server-runner] CRITICAL: Failed to restore role to '${previousRole}'!`)
      }
    }
  }
}

/**
 * Run a callback with the test account temporarily set to role='superadmin'.
 * After the callback completes (or throws), the role is restored to 'user'.
 *
 * NOTE: With the new automatic role-switching (via requiredRole on TestCase or
 * defaultRole on TestCategory), you typically don't need this anymore.
 */
export async function withSuperadminRole(fn: () => void | Promise<void>): Promise<void> {
  const previousRole = _currentRole
  if (_currentRole === 'superadmin') {
    await fn()
    return
  }
  const switched = await switchTestAccountRole('superadmin')
  if (!switched) {
    throw new Error('Kon de testaccount-rol niet wisselen naar "superadmin".')
  }
  try {
    await fn()
  } finally {
    if (previousRole !== 'superadmin') {
      const restored = await switchTestAccountRole(previousRole)
      if (!restored) {
        console.error(`[server-runner] CRITICAL: Failed to restore role to '${previousRole}'!`)
      }
    }
  }
}

/**
 * Get the current role of the test account (as tracked by the server-runner).
 */
export function getCurrentTestRole(): 'superadmin' | 'user' {
  return _currentRole
}

// ── Core runner ──────────────────────────────────────────────────────────────

/**
 * Run the regression test suite on the server as the dedicated test account.
 *
 * @param config - Optional categories filter
 * @param onResult - Callback invoked after each individual test completes
 * @returns The full TestReport once all tests finish
 */
export async function runServerTestSuite(
  config: ServerRunConfig = {},
  onResult?: (result: TestResult) => void,
): Promise<TestReport> {
  // ── 0. Dev-only gate ───────────────────────────────────────────────────
  // Vóór élke setup: deze harness logt in met een testaccount, seedt data en
  // wisselt rollen via de service-role. Niets daarvan mag ooit buiten lokale
  // development draaien. Zie assertHarnessEnvironment() voor de drie lagen.
  assertHarnessEnvironment()

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ontbreekt. De regressieharness wisselt de rol van het ' +
      'testaccount via de service-role (de anti-escalatie-trigger op profiles blokkeert ' +
      'terecht elke self-service rolwijziging).',
    )
  }

  // ── 1. Validate environment ────────────────────────────────────────────
  const email = process.env.REGRESSION_TEST_EMAIL
  const password = process.env.REGRESSION_TEST_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Regressietest-account niet geconfigureerd. ' +
      'Stel REGRESSION_TEST_EMAIL en REGRESSION_TEST_PASSWORD in als environment variabelen.',
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase configuratie ontbreekt. ' +
      'Stel NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.',
    )
  }

  // ── 2. Sign in as the test account ─────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (authError || !authData.session) {
    throw new Error(
      `Kan niet inloggen als testaccount (${email}): ${authError?.message ?? 'geen sessie ontvangen'}`,
    )
  }

  const accessToken = authData.session.access_token
  const refreshToken = authData.session.refresh_token

  // Build the auth cookie value that Supabase SSR middleware expects.
  // The cookie name follows the pattern: sb-<project-ref>-auth-token
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieValue = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: authData.session.expires_in,
    expires_at: authData.session.expires_at,
  })

  // ── 3. Set up localStorage polyfill ────────────────────────────────────
  const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage
  const memoryStorage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    writable: true,
    configurable: true,
  })

  // ── 4. Patch globalThis.fetch ──────────────────────────────────────────
  const originalFetch = globalThis.fetch
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT || 3000}`

  // Expose credentials for authenticatedFetch(), unauthenticatedFetch() and role-switching helpers
  _originalFetch = originalFetch
  _baseUrl = baseUrl
  _accessToken = accessToken
  _testUserId = authData.user.id
  _cookieName = cookieName
  _cookieValue = cookieValue

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string
    if (typeof input === 'string') {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else {
      // Request object
      url = input.url
    }

    // Prepend base URL for relative paths
    if (url.startsWith('/')) {
      url = `${baseUrl}${url}`
    }

    // Merge auth headers
    const headers = new Headers(init?.headers)
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    if (!headers.has('Cookie')) {
      headers.set('Cookie', `${cookieName}=${encodeURIComponent(cookieValue)}`)
    }

    // Build the patched init — preserve body and other options from the original
    const patchedInit: RequestInit = {
      ...init,
      headers,
    }

    // If input was a Request object, reconstruct with new URL
    if (typeof input !== 'string' && !(input instanceof URL) && input instanceof Request) {
      return originalFetch(new Request(url, { ...patchedInit, body: input.body }), undefined)
    }

    return originalFetch(url, patchedInit)
  }

  // ── 5. Seed test data ─────────────────────────────────────────────────
  try {
    await seedTestData(supabase, _testUserId)
  } catch (seedErr) {
    // Log but don't fail — tests should still run even if seeding partially fails
    console.warn('[server-runner] Test data seeding warning:', seedErr)
  }

  // ── 7. Load tests and run ──────────────────────────────────────────────
  // Alles vanaf hier staat in de try, zodat het finally-blok de gepatchte
  // globals en de oorspronkelijke rol hoe dan ook herstelt — ook als het
  // uitlezen van de beginrol faalt.
  try {
    // ── 6. Beginrol UITLEZEN (nooit aannemen) ──────────────────────────
    // De rol van het testaccount wordt uit de database gelezen en aan de
    // testrunner doorgegeven. Nam de runner dit aan, dan short-circuit'te
    // ensureRole() op een verkeerde stand en draaide een
    // `requiredRole: 'user'`-test alsnog als superadmin — vals rood op precies
    // de tests die het niet-admin-gedrag moeten bewaken.
    _initialRole = await readTestAccountRole()
    _currentRole = _initialRole
    setInitialRunnerRole(_initialRole)

    // Register role-switching callback with the test runner
    setRoleSwitcher(switchTestAccountRole)

    await loadAllTests()

    const suiteConfig: Partial<TestSuiteConfig> = {}
    if (config.categories && config.categories.length > 0) {
      suiteConfig.categories = config.categories
    }

    const progressCallback: TestProgressCallback = (result) => {
      onResult?.(result)
    }

    const report = await runTestSuite(suiteConfig, progressCallback)
    return report
  } finally {
    // ── 8. Cleanup test data ──────────────────────────────────────────
    try {
      await cleanupTestData(supabase, _testUserId)
    } catch (cleanupErr) {
      console.warn('[server-runner] Test data cleanup warning:', cleanupErr)
    }

    // Clear role switcher from test runner
    clearRoleSwitcher()

    // ── 9. Restore original globals ────────────────────────────────────
    // Zet de rol terug op de stand die we bij aanvang UITLAZEN, niet op een
    // aangenomen 'user'. Anders degradeert een run het testaccount stilletjes
    // en is de volgende run weer niet reproduceerbaar.
    if (_currentRole !== _initialRole) {
      const restored = await switchTestAccountRole(_initialRole)
      if (!restored) {
        console.error(
          `[server-runner] CRITICAL: kon de rol van het testaccount niet terugzetten naar '${_initialRole}'.`,
        )
      }
    }

    globalThis.fetch = originalFetch
    _originalFetch = null
    _baseUrl = ''
    _accessToken = ''
    _testUserId = ''
    _cookieName = ''
    _cookieValue = ''
    _currentRole = 'user'
    _initialRole = 'user'

    if (originalLocalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      })
    } else {
      // localStorage was not defined before (typical for Node.js)
      try {
        delete (globalThis as Record<string, unknown>).localStorage
      } catch {
        // Some environments don't allow delete on globalThis properties
        Object.defineProperty(globalThis, 'localStorage', {
          value: undefined,
          writable: true,
          configurable: true,
        })
      }
    }

    // Sign out the test account session
    await supabase.auth.signOut().catch(() => {
      // Best-effort cleanup — don't let sign-out failures propagate
    })
  }
}
