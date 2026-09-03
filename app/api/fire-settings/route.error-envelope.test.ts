import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * ADR 0044 — de drie 500-paden van PUT /api/fire-settings.
 *
 * Tot de security-sweep van 3 sep 2026 stuurden ze `details: error.message`
 * mee: de letterlijke Postgres-melding (relatie-, constraint- en poolernamen)
 * naar de ingelogde client. Nu lopen ze via `serverError()`: server-side gelogd
 * onder een tag, generieke tekst + `code: 'server_error'` naar de client.
 *
 * De nep-database is een wachtrij: elke `update().eq()` consumeert de volgende
 * fout (null = geslaagd). Zo zijn de drie paden — hoofd-update, het legacy
 * 'pensioen'-schaduwpad (safe-update) en de feature_preferences-update — apart
 * aan te sturen zonder de bestaande suite (route.test.ts) te raken.
 */

type Row = Record<string, unknown>

let updateErrors: unknown[] = []

function makeSupabase() {
  function builder() {
    let pendingUpdate = false
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.update = () => {
      pendingUpdate = true
      return q
    }
    q.eq = () => {
      if (pendingUpdate) {
        pendingUpdate = false
        const error = updateErrors.length > 0 ? updateErrors.shift() : null
        return Promise.resolve({ error })
      }
      return q
    }
    q.single = () => Promise.resolve({ data: { feature_preferences: {} }, error: null })
    q.maybeSingle = () => Promise.resolve({ data: null, error: null })
    return q
  }
  return {
    from: () => builder(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(makeSupabase()),
  getAuthClaims: () => Promise.resolve({ sub: 'u1' }),
}))

import { PUT } from './route'

const put = (body: Row) =>
  PUT(new NextRequest('http://localhost/api/fire-settings', { method: 'PUT', body: JSON.stringify(body) }))

const RAW_DB_MESSAGE = 'deadlock detected on relation "profiles_pkey" (pooler aws-0-eu-central-1)'
const CHECK_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_fire_end_strategy_check" (fire_end_strategy)',
}
const RAW_LEAK = /deadlock|profiles_pkey|pooler/

beforeEach(() => {
  updateErrors = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PUT /api/fire-settings — 500-paden lekken geen DB-tekst', () => {
  it('hoofd-update faalt → 500 met generieke envelope, géén details-veld', async () => {
    updateErrors = [{ code: 'XX000', message: RAW_DB_MESSAGE }]

    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90 })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Opslaan mislukt', code: 'server_error' })
    expect(JSON.stringify(body)).not.toMatch(RAW_LEAK)
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('[fire-settings:PUT]')
    expect(logged).toContain('deadlock detected')
  })

  it("legacy 'pensioen'-schaduwpad: safe-update faalt → 500 generiek", async () => {
    updateErrors = [CHECK_VIOLATION, { code: 'XX000', message: RAW_DB_MESSAGE }]

    const res = await put({ fire_end_strategy: 'pensioen', fire_end_age: 90 })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Opslaan mislukt', code: 'server_error' })
    expect(JSON.stringify(body)).not.toMatch(RAW_LEAK)
  })

  it("legacy 'pensioen'-schaduwpad: feature_preferences-update faalt → 500 generiek", async () => {
    updateErrors = [CHECK_VIOLATION, null, { code: 'XX000', message: RAW_DB_MESSAGE }]

    const res = await put({ fire_end_strategy: 'pensioen', fire_end_age: 90 })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Override opslaan mislukt', code: 'server_error' })
    expect(JSON.stringify(body)).not.toMatch(RAW_LEAK)
  })
})
