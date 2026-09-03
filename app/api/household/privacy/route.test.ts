import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/household/privacy — het app_settings-terugvalpad (ADR 0044).
 *
 * Als de `privacy_settings`-update op household_members faalt, valt de route
 * terug op een upsert in app_settings. Faalt óók die, dan ging tot de
 * security-sweep van 3 sep 2026 de rauwe upsert-fout (RLS-/kolomdetails van
 * app_settings) als `{ error }` naar de ingelogde client. Nu: `serverError()`.
 */

const RAW_UPSERT_MESSAGE =
  'new row violates row-level security policy for table "app_settings" (policy "app_settings insert")'

let upsertResult: { error: unknown } = { error: null }

const mockFrom = vi.fn((table: string) => {
  if (table === 'household_members') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'm1', household_id: 'h1' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({
          error: { code: '42703', message: 'column "privacy_settings" of relation "household_members" does not exist' },
        }),
      })),
    }
  }
  if (table === 'app_settings') {
    return { upsert: vi.fn().mockResolvedValue(upsertResult) }
  }
  throw new Error(`onverwachte tabel: ${table}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  })),
  getAuthClaims: vi.fn(async () => ({ sub: 'u1' })),
}))

import { PATCH } from './route'

const ALL_TOTALS = {
  vermogen: 'totalen',
  schulden: 'totalen',
  budgetten: 'totalen',
  transacties: 'totalen',
  inkomen: 'totalen',
}

const patch = (privacySettings: Record<string, string>) =>
  PATCH(
    new NextRequest('http://localhost/api/household/privacy', {
      method: 'PATCH',
      body: JSON.stringify({ privacySettings }),
    }),
  )

beforeEach(() => {
  upsertResult = { error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PATCH /api/household/privacy — terugvalpad zonder rauwe DB-tekst', () => {
  it('kolom-update én app_settings-upsert falen → 500 generiek, RLS-tekst blijft server-side', async () => {
    upsertResult = { error: { code: '42501', message: RAW_UPSERT_MESSAGE } }

    const res = await patch(ALL_TOTALS)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Opslaan mislukt', code: 'server_error' })
    expect(JSON.stringify(body)).not.toMatch(/row-level security|app_settings|42501/)
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('[household-privacy:PATCH]')
    expect(logged).toContain('row-level security')
  })

  it('kolom-update faalt maar de upsert slaagt → 200 (terugvalpad werkt nog)', async () => {
    const res = await patch(ALL_TOTALS)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.dbPrivacySettings.assets).toBe('totals')
  })
})
