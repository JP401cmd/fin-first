// ── Test Session Helper ──────────────────────────────────────────────────────
//
// Utilities for the dedicated regression test account.
//
// Architecture: Tests execute SERVER-SIDE via POST /api/regression/run.
// The server-runner.ts signs in as the test account using server-only env vars
// (REGRESSION_TEST_EMAIL / REGRESSION_TEST_PASSWORD) — the caller's browser
// session is never touched.  This module provides client-side utilities for
// the UI layer (banners, guards, status checks).

// ── Constants ────────────────────────────────────────────────────────────────

/** The email of the dedicated regression test account */
export const REGRESSION_TEST_EMAIL = 'regression-test@fintwo.nl'

// ── Guards ───────────────────────────────────────────────────────────────────

/**
 * Check whether regression tests are allowed in the current environment.
 * Tests should only run in development mode to prevent accidental
 * data modification in production.
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Check whether the server-side test account credentials are configured.
 * This is a client-side heuristic — the actual env vars are server-only,
 * so we check by probing the API endpoint.
 */
export async function isTestAccountConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/regression/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: ['__probe__'] }),
    })
    // 500 with "niet geconfigureerd" means env vars are missing
    // 401 means user is not logged in (but account may be configured)
    // 200/other means account is configured
    if (res.status === 500) {
      const body = await res.json().catch(() => ({}))
      return !body.error?.includes('niet geconfigureerd')
    }
    return true
  } catch {
    return false
  }
}

// ── Session status ───────────────────────────────────────────────────────────

/**
 * Check if the current browser session belongs to the test account.
 * Used to show a warning banner if the user is accidentally logged in
 * as the test account outside of the regression test page.
 *
 * @param userEmail - The email of the currently logged-in user
 */
export function isTestSession(userEmail: string | undefined | null): boolean {
  if (!userEmail) return false
  return userEmail.toLowerCase() === REGRESSION_TEST_EMAIL.toLowerCase()
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/** Status info for the test session banner */
export interface TestSessionStatus {
  /** Whether we're in a development environment */
  isDevelopment: boolean
  /** Whether tests are currently running server-side */
  isRunning: boolean
  /** Human-readable status message */
  message: string
  /** Banner variant for styling */
  variant: 'info' | 'running' | 'error'
}

/**
 * Compute the test session status for UI display.
 */
export function getTestSessionStatus(opts: {
  isRunning: boolean
  serverError: string | null
}): TestSessionStatus {
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

  if (opts.serverError) {
    return {
      isDevelopment: isDev,
      isRunning: false,
      message: opts.serverError,
      variant: 'error',
    }
  }

  if (opts.isRunning) {
    return {
      isDevelopment: isDev,
      isRunning: true,
      message: 'Tests draaien op dedicated testaccount — je eigen data wordt niet aangeraakt',
      variant: 'running',
    }
  }

  return {
    isDevelopment: isDev,
    isRunning: false,
    message: `Tests draaien server-side op een apart testaccount (${REGRESSION_TEST_EMAIL}). Je eigen data blijft onaangetast.`,
    variant: 'info',
  }
}
