import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Legt de toegangsgrens van de force-error-testtool vast: de route is óók op
 * productie bereikbaar (dat is het doel — de live UAT-run draait daar), maar
 * uitsluitend voor een superadmin. Elke andere bezoeker krijgt een 404 via
 * `notFound()`, niet een 403 — een 403 zou bevestigen dat de route bestaat.
 */

const mockIsSuperAdmin = vi.fn<() => Promise<boolean>>()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({}) as unknown),
}))

vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...(args as [])),
}))

// notFound() gooit in Next een speciale fout die het renderen afbreekt; de
// mock bootst dat na, zodat de test ziet dát de render stopt.
const NOT_FOUND = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND
  },
}))

vi.mock('./force-error-client', () => ({
  ForceErrorClient: () => null,
}))

import BeheerForceErrorPage from './page'

beforeEach(() => {
  mockIsSuperAdmin.mockReset()
})

describe('/beheer/testtools/force-error — toegangsgrens', () => {
  it('geeft een 404 (notFound) voor een niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    await expect(BeheerForceErrorPage()).rejects.toBe(NOT_FOUND)
  })

  it('rendert de testtool voor een superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    await expect(BeheerForceErrorPage()).resolves.toBeTruthy()
  })
})
