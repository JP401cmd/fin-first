import { createClient } from '@supabase/supabase-js'
import type { TestReport, TestSuiteConfig, TestResult } from './test-types'
import { loadAllTests } from './test-registry'
import { runTestSuite, type TestProgressCallback, setRoleSwitcher, clearRoleSwitcher } from './test-runner'
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
let _supabaseUrl: string = ''
let _supabaseAnonKey: string = ''
let _accessToken: string = ''
let _testUserId: string = ''
let _currentRole: 'superadmin' | 'user' = 'user'

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
// The test account is 'user' by default in the database. Tests that verify
// admin-only features (beheer pages, admin API endpoints) need 'superadmin'
// access. The test runner auto-switches via requiredRole/defaultRole on
// TestCase/TestCategory, then restores to 'user' after the test.

/**
 * Switch the test account's profile.role in the database.
 * Uses the Supabase REST API directly with the authenticated session.
 *
 * @param role - The role to set ('user' or 'superadmin')
 * @returns true if the switch succeeded, false otherwise
 */
async function switchTestAccountRole(role: 'superadmin' | 'user'): Promise<boolean> {
  if (!_supabaseUrl || !_supabaseAnonKey || !_accessToken || !_testUserId) {
    console.warn('[server-runner] Role switch unavailable: missing credentials')
    return false
  }

  try {
    const fetchFn = _originalFetch ?? globalThis.fetch
    const res = await fetchFn(
      `${_supabaseUrl}/rest/v1/profiles?id=eq.${_testUserId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${_accessToken}`,
          'apikey': _supabaseAnonKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ role }),
      },
    )
    if (res.ok || res.status === 204) {
      _currentRole = role
      return true
    }
    console.warn(`[server-runner] Role switch to '${role}' failed: ${res.status} ${res.statusText}`)
    return false
  } catch (err) {
    console.warn(`[server-runner] Role switch to '${role}' error:`, err)
    return false
  }
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
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`

  // Expose credentials for unauthenticatedFetch() and role-switching helpers
  _originalFetch = originalFetch
  _baseUrl = baseUrl
  _supabaseUrl = supabaseUrl
  _supabaseAnonKey = supabaseAnonKey
  _accessToken = accessToken
  _testUserId = authData.user.id

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

  // ── 6. Confirm 'user' role (default in database) ─────────────────────
  // The test account is 'user' in the database. No role switch needed at startup.
  // Tests/categories that need admin access declare requiredRole: 'superadmin'
  // or defaultRole: 'superadmin' and the test runner auto-switches.
  _currentRole = 'user'

  // Register role-switching callback with the test runner
  setRoleSwitcher(switchTestAccountRole)

  // ── 7. Load tests and run ──────────────────────────────────────────────
  try {
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
    // Ensure role is restored to 'user' (the DB default) before cleanup
    if (_currentRole !== 'user') {
      await switchTestAccountRole('user').catch(() => {
        console.error('[server-runner] Failed to restore user role during cleanup')
      })
    }

    globalThis.fetch = originalFetch
    _originalFetch = null
    _baseUrl = ''
    _supabaseUrl = ''
    _supabaseAnonKey = ''
    _accessToken = ''
    _testUserId = ''
    _currentRole = 'user'

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
