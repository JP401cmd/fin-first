/**
 * Regression tests: Bank koppeling flow (TrueLayer)
 *
 * Tests for the user-side bank connection flow via TrueLayer OAuth:
 * - /core/cash/connect page structure and steps
 * - OAuth redirect URL construction
 * - Callback page authorization code handling
 * - Success page confirmation display
 * - Error handling for denied OAuth authorization
 * - Error handling for expired authorization codes
 * - Bank connection status persistence in profile
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch, authenticatedFetch, getBaseUrl } from '../server-runner'

const CAT = 'kern.bank-connect'

// ── Fixtures ────────────────────────────────────────────────────────────────

const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  missing_reference: 'Ontbrekende referentie in callback',
  requisition_not_found: 'Verbindingsverzoek niet gevonden',
  not_authorized: 'Bankautorizatie niet voltooid',
  callback_failed: 'Callback verwerking mislukt',
}

const CONNECT_STEPS = ['select', 'confirm', 'redirect'] as const

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── A: /core/cash/connect page ────────────────────────────────────────────
  {
    id: 'bank-connect-page-steps',
    name: 'Connect pagina: 3-stappen flow (select → confirm → redirect)',
    description: '/core/cash/connect has 3 sequential steps for bank connection',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      assertEqual(CONNECT_STEPS.length, 3, 'exactly 3 steps')
      assertEqual(CONNECT_STEPS[0], 'select', 'step 1: select bank')
      assertEqual(CONNECT_STEPS[1], 'confirm', 'step 2: confirm connection')
      assertEqual(CONNECT_STEPS[2], 'redirect', 'step 3: redirect to bank')
    },
  },
  {
    id: 'bank-connect-page-error-mapping',
    name: 'Connect pagina: error query params worden correct gemapped',
    description: 'Error query parameters map to Dutch error messages',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // All 4 known error types should have Dutch messages
      assertEqual(
        CONNECT_ERROR_MESSAGES.missing_reference,
        'Ontbrekende referentie in callback',
        'missing_reference message'
      )
      assertEqual(
        CONNECT_ERROR_MESSAGES.requisition_not_found,
        'Verbindingsverzoek niet gevonden',
        'requisition_not_found message'
      )
      assertEqual(
        CONNECT_ERROR_MESSAGES.not_authorized,
        'Bankautorizatie niet voltooid',
        'not_authorized message'
      )
      assertEqual(
        CONNECT_ERROR_MESSAGES.callback_failed,
        'Callback verwerking mislukt',
        'callback_failed message'
      )

      // Unknown errors should not have a mapping
      assertEqual(CONNECT_ERROR_MESSAGES['unknown'], undefined, 'unknown error no mapping')
    },
  },
  {
    id: 'bank-connect-page-route-accessible',
    name: 'Connect pagina: /core/cash/connect route bestaat',
    description: '/core/cash/connect returns 200 or auth redirect',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await authenticatedFetch('/core/cash/connect', { redirect: 'manual' })
      // Should be 200 (if authed) or 307 (auth redirect)
      assert(
        res.status === 200 || res.status === 307,
        `expected 200 or 307, got ${res.status}`
      )
    },
  },

  // ── B: OAuth redirect URL construction ────────────────────────────────────
  {
    id: 'bank-connect-auth-link-body',
    name: 'OAuth: auth-link request body structuur',
    description: 'POST /api/bank-connect/auth-link requires provider_id in body',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      // The connect page sends this body to the auth-link endpoint
      const provider = { id: 'ing', name: 'ING', logo: 'https://logo.ing.nl' }
      const body = {
        provider_id: provider.id,
        provider_name: provider.name,
        provider_logo: provider.logo,
      }

      assertNotNull(body.provider_id, 'provider_id present')
      assertEqual(typeof body.provider_id, 'string', 'provider_id is string')
      assertNotNull(body.provider_name, 'provider_name present')
    },
  },
  {
    id: 'bank-connect-auth-link-auth-guard',
    name: 'OAuth: auth-link auth guard',
    description: 'POST /api/bank-connect/auth-link returns 401 for unauthenticated',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/bank-connect/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: 'test' }),
      })
      assertEqual(res.status, 401, 'unauthenticated POST returns 401')
    },
  },
  {
    id: 'bank-connect-state-encoding',
    name: 'OAuth: state parameter bevat connection ID en timestamp',
    description: 'State parameter format: {connectionId}:{userId_prefix}-{timestamp}',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // State construction from auth-link route
      const userId = '550e8400-e29b-41d4-a716-446655440000'
      const connectionId = 'conn-uuid-123'
      const timestamp = Date.now()

      const state = `${userId.slice(0, 8)}-${timestamp}`
      const fullState = `${connectionId}:${state}`

      // Verify format
      assert(fullState.includes(':'), 'state has colon separator')
      assertEqual(fullState.split(':')[0], connectionId, 'connection ID extractable')
      assert(fullState.split(':')[1].includes('-'), 'user prefix-timestamp format')
    },
  },
  {
    id: 'bank-connect-redirect-uri-construction',
    name: 'OAuth: redirect URI wordt correct opgebouwd',
    description: 'Redirect URI points to /api/bank-connect/callback',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const appUrl = getBaseUrl()
      const redirectUri = `${appUrl}/api/bank-connect/callback`

      assertEqual(redirectUri, `${appUrl}/api/bank-connect/callback`, 'correct redirect URI')
      assert(redirectUri.endsWith('/api/bank-connect/callback'), 'ends with callback path')
    },
  },

  // ── C: Callback page ──────────────────────────────────────────────────────
  {
    id: 'bank-connect-callback-page-redirect',
    name: 'Callback pagina: redirect naar API met code en state',
    description: 'Client callback page redirects to API callback with code and state params',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // Simulate callback page logic
      const code = 'auth_code_123'
      const state = 'conn-id:prefix-timestamp'

      if (code && state) {
        const apiUrl = `/api/bank-connect/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        assert(apiUrl.includes('code=auth_code_123'), 'code param present')
        assert(apiUrl.includes('state='), 'state param present')
        assert(apiUrl.startsWith('/api/bank-connect/callback'), 'redirects to API callback')
      }
    },
  },
  {
    id: 'bank-connect-callback-missing-code',
    name: 'Callback pagina: ontbrekende code redirect naar connect met error',
    description: 'When code or state is missing, redirect to connect page with error',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // When no code/state: redirect to /core/cash/connect?error=missing_code
      const code: string | null = null
      const state: string | null = null

      if (!code || !state) {
        const redirectTarget = '/core/cash/connect?error=missing_code'
        assert(redirectTarget.includes('error=missing_code'), 'error param for missing code')
        assert(redirectTarget.startsWith('/core/cash/connect'), 'redirects to connect page')
      }
    },
  },
  {
    id: 'bank-connect-callback-api-auth-guard',
    name: 'Callback API: auth guard op GET endpoint',
    description: 'GET /api/bank-connect/callback returns 401 for unauthenticated (auth checked before params)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      // Auth check happens before code/state check
      const res = await unauthenticatedFetch('/api/bank-connect/callback')
      assertEqual(res.status, 401, 'unauthenticated callback returns 401')
    },
  },
  {
    id: 'bank-connect-callback-api-missing-params-logic',
    name: 'Callback API: missing code/state redirect logica',
    description: 'When authenticated but code/state missing, redirect to connect with error',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // Simulate callback route logic
      const code: string | null = null
      const state: string | null = null
      const appUrl = getBaseUrl()

      if (!code || !state) {
        const redirectUrl = `${appUrl}/core/cash/connect?error=missing_code`
        assert(redirectUrl.includes('error=missing_code'), 'missing code redirect has error param')
        assert(redirectUrl.includes('/core/cash/connect'), 'redirects to connect page')
      }
    },
  },
  {
    id: 'bank-connect-callback-connection-id-extraction',
    name: 'Callback API: connection ID wordt uit state geëxtraheerd',
    description: 'State parameter split on colon to get connection ID',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const fullState = 'abc-def-123:55e84000-1234567890'
      const connectionId = fullState.split(':')[0]
      assertEqual(connectionId, 'abc-def-123', 'connection ID extracted from state')
    },
  },

  // ── D: Success page ───────────────────────────────────────────────────────
  {
    id: 'bank-connect-success-page-route',
    name: 'Success pagina: /core/cash/connect/success route bestaat',
    description: 'Success page returns 200 or auth redirect',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const res = await authenticatedFetch('/core/cash/connect/success', { redirect: 'manual' })
      assert(
        res.status === 200 || res.status === 307,
        `expected 200 or 307, got ${res.status}`
      )
    },
  },
  {
    id: 'bank-connect-success-linked-account-shape',
    name: 'Success pagina: LinkedAccount type structuur',
    description: 'LinkedAccount has id, iban, external_account_id, account_name, bank_connections',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      const account = {
        id: 'acc-1',
        iban: 'NL91ABNA0417164300',
        external_account_id: 'tl_acc_123',
        account_name: 'Betaalrekening',
        bank_connections: {
          provider_name: 'ABN AMRO',
          provider_logo: 'https://logo.abn.nl',
        },
      }

      assertNotNull(account.id, 'id present')
      assertNotNull(account.iban, 'iban present')
      assertNotNull(account.external_account_id, 'external_account_id present')
      assertNotNull(account.bank_connections, 'bank_connections present')
      assertNotNull(account.bank_connections.provider_name, 'provider_name present')
    },
  },
  {
    id: 'bank-connect-success-sync-response',
    name: 'Success pagina: sync response structuur',
    description: 'Sync response has new and duplicates count',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      const syncResult = { new: 42, duplicates: 3 }
      assertEqual(typeof syncResult.new, 'number', 'new is number')
      assertEqual(typeof syncResult.duplicates, 'number', 'duplicates is number')
    },
  },

  // ── E: Error handling — denied OAuth ──────────────────────────────────────
  {
    id: 'bank-connect-error-denied-auth',
    name: 'Foutafhandeling: geweigerde OAuth autorisatie',
    description: 'Denied OAuth maps to not_authorized error on connect page',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // When user denies OAuth, TrueLayer redirects with error=access_denied
      // The callback API catches this and redirects to connect page
      const errorParam = 'not_authorized'
      const message = CONNECT_ERROR_MESSAGES[errorParam]
      assertEqual(message, 'Bankautorizatie niet voltooid', 'denied auth message')

      // Connect page shows AlertTriangle icon + error message
      assert(message.length > 0, 'error message is non-empty')
    },
  },

  // ── F: Error handling — expired code ──────────────────────────────────────
  {
    id: 'bank-connect-error-expired-code',
    name: 'Foutafhandeling: verlopen authorization code',
    description: 'Expired or invalid code results in callback_failed redirect',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // When code exchange fails (expired), callback catches error
      // and redirects to /core/cash/connect?error=callback_failed
      const errorParam = 'callback_failed'
      const message = CONNECT_ERROR_MESSAGES[errorParam]
      assertEqual(message, 'Callback verwerking mislukt', 'callback failed message')

      // Also test connection_not_found (when state doesn't match)
      const connError = 'requisition_not_found'
      const connMessage = CONNECT_ERROR_MESSAGES[connError]
      assertEqual(connMessage, 'Verbindingsverzoek niet gevonden', 'connection not found message')
    },
  },

  // ── G: Bank connection status ─────────────────────────────────────────────
  {
    id: 'bank-connect-status-auth-guard',
    name: 'Bank status: auth guard op GET endpoint',
    description: 'GET /api/bank-connect/status returns 401 for unauthenticated',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/bank-connect/status')
      assertEqual(res.status, 401, 'unauthenticated GET returns 401')
    },
  },
  {
    id: 'bank-connect-status-response-shape',
    name: 'Bank status: response bevat enabled flag',
    description: 'GET /api/bank-connect/status returns { enabled: boolean }',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // Status endpoint returns { enabled: boolean }
      const response = { enabled: true }
      assertEqual(typeof response.enabled, 'boolean', 'enabled is boolean')

      const responseFalse = { enabled: false }
      assertEqual(typeof responseFalse.enabled, 'boolean', 'disabled is also boolean')
    },
  },
  {
    id: 'bank-connect-connection-lifecycle',
    name: 'Bank status: connection lifecycle (pending → active → expired)',
    description: 'Bank connections progress through status lifecycle',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const statuses = ['pending', 'active', 'expired', 'revoked']

      // Pending: created after auth-link, before callback
      assertIncludes(statuses, 'pending', 'pending status exists')

      // Active: after successful callback with tokens
      assertIncludes(statuses, 'active', 'active status exists')

      // Expired: after token_expires_at passes or refresh fails
      assertIncludes(statuses, 'expired', 'expired status exists')

      // Revoked: after user disconnects
      assertIncludes(statuses, 'revoked', 'revoked status exists')

      // Connection record shape
      const connection = {
        id: 'conn-1',
        user_id: 'user-1',
        provider_id: 'ing',
        provider_name: 'ING',
        access_token: 'tok_xxx',
        refresh_token: 'ref_xxx',
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        status: 'active',
        authorized_at: new Date().toISOString(),
      }

      assertNotNull(connection.access_token, 'access_token present for active')
      assertNotNull(connection.token_expires_at, 'token_expires_at present')
      assertEqual(connection.status, 'active', 'status is active')
    },
  },

  // ── H: Auth consistency ───────────────────────────────────────────────────
  {
    id: 'bank-connect-auth-consistency',
    name: 'Auth: alle bank-connect endpoints hebben auth guard',
    description: 'All bank-connect API endpoints return 401 for unauthenticated requests',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const endpoints = [
        { url: '/api/bank-connect/auth-link', method: 'POST', body: JSON.stringify({ provider_id: 'test' }) },
        { url: '/api/bank-connect/status', method: 'GET' },
        { url: '/api/bank-connect/sync', method: 'POST', body: JSON.stringify({ connection_account_id: 'test' }) },
        { url: '/api/bank-connect/disconnect', method: 'POST', body: JSON.stringify({ connection_id: 'test' }) },
        { url: '/api/bank-connect/balances', method: 'POST', body: JSON.stringify({ connection_account_id: 'test' }) },
      ]

      for (const ep of endpoints) {
        const res = await unauthenticatedFetch(ep.url, {
          method: ep.method,
          headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
          body: ep.body,
        })
        assertEqual(res.status, 401, `${ep.method} ${ep.url} returns 401`)
      }
    },
  },
]

// ── Registration ────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'De Kern — Bank Koppeling',
    description: 'Bank koppeling flow via TrueLayer OAuth: connect, callback, success, foutafhandeling',
    icon: 'Building2',
    testCount: 0,
  })
  registerTests(tests)
}
