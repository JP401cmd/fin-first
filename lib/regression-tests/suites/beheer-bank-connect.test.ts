import { describe, it, expect, beforeEach, vi } from 'vitest'

// De in-app regressiesuite `beheer.bank-connect` draait als superadmin
// (`defaultRole: 'superadmin'`) tegen de ECHTE app_settings — er is geen
// aparte test-database. Een test die daar een waarde in schrijft en niet
// terugzet, muteert dus de productieconfiguratie van de bankkoppeling.
//
// Given een geconfigureerde TrueLayer-omgeving (`production`) en een
// ingeschakelde koppeling, When de suite draait, Then staat de configuratie
// na afloop nog exact zoals ervoor.
//
// Historie: een run op 31-07-2026 07:06 zette `truelayer_environment` op
// `sandbox` en liet die zo staan; de bankkoppelpagina toonde daarna alleen
// nog de sandbox-provider "Mock" — in productie én lokaal, want beide
// omgevingen delen één Supabase-project.

const settingsStore = new Map<string, string>()
const putBodies: Array<Record<string, string>> = []

/** Spiegelt MASKED_KEYS uit app/api/admin/settings/route.ts. */
const MASKED_KEYS = ['truelayer_client_id', 'truelayer_client_secret']

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response
}

/** Bootst /api/admin/settings na: GET geeft alles, PUT schrijft per sleutel. */
function fakeApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)

  if (url.includes('/api/admin/settings')) {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, string>
      putBodies.push(body)
      for (const [key, value] of Object.entries(body)) {
        // Gemaskeerde credentials worden door de route overgeslagen.
        if (typeof value === 'string' && value.includes('***')) continue
        settingsStore.set(key, value)
      }
      return Promise.resolve(jsonResponse(200, { success: true }))
    }
    // De echte route maskeert credentials in de GET-response.
    const masked = Object.fromEntries(
      [...settingsStore].map(([key, value]) => [
        key,
        MASKED_KEYS.includes(key) && value ? `${value.slice(0, 7)}***${value.slice(-4)}` : value,
      ]),
    )
    return Promise.resolve(jsonResponse(200, masked))
  }

  if (url.includes('/api/admin/bank-connect/test-connection')) {
    return Promise.resolve(jsonResponse(200, { success: true, message: 'ok', providers_count: 12 }))
  }

  // Pagina-bereikbaarheid e.d.
  return Promise.resolve(jsonResponse(200, {}))
}

vi.mock('../server-runner', () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fakeApi(input, init),
  // Zonder auth wijst de route elke aanroep af met 403 — en schrijft dus niets.
  unauthenticatedFetch: () => Promise.resolve(jsonResponse(403, { error: 'Geen toegang' })),
  getBaseUrl: () => 'http://localhost:3000',
}))

const { tests } = await import('./beheer-bank-connect')

function runTest(id: string): Promise<void> {
  const testCase = tests.find((t) => t.id === id)
  if (!testCase) throw new Error(`Testcase ${id} niet gevonden`)
  return Promise.resolve(testCase.fn())
}

beforeEach(() => {
  settingsStore.clear()
  putBodies.length = 0
  settingsStore.set('truelayer_enabled', 'true')
  settingsStore.set('truelayer_environment', 'production')
  settingsStore.set('truelayer_client_id', 'finfirst-297e8f')
  settingsStore.set('truelayer_client_secret', 'geheim')
})

describe('beheer.bank-connect regressiesuite muteert de gedeelde configuratie niet', () => {
  it('laat truelayer_environment op production staan na de environment-test', async () => {
    await runTest('bank-connect-environment-select')

    expect(settingsStore.get('truelayer_environment')).toBe('production')
  })

  it('laat truelayer_enabled op true staan na de toggle-test', async () => {
    await runTest('bank-connect-toggle-save')

    expect(settingsStore.get('truelayer_enabled')).toBe('true')
  })

  it('schrijft niets bij de admin-guard-test (die hoort ongeauthenticeerd te draaien)', async () => {
    await runTest('bank-connect-settings-admin-guard')

    expect(putBodies).toEqual([])
    expect(settingsStore.get('truelayer_enabled')).toBe('true')
  })

  it('laat de hele TrueLayer-configuratie ongewijzigd na de complete suite', async () => {
    const before = Object.fromEntries(settingsStore)

    for (const testCase of tests) {
      await testCase.fn()
    }

    expect(Object.fromEntries(settingsStore)).toEqual(before)
  })
})
