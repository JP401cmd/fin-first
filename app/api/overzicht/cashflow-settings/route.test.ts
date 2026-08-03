import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import { __resetCashflowSettingsCache } from '@/lib/cashflow-settings-cache'

/**
 * GET /api/overzicht/cashflow-settings — de lazy data-route van het
 * instellingen-blok onderaan /overzicht/cashflow (perf Task 2.2, stap 5).
 *
 * Vier eigenschappen die er echt toe doen, en die geen van alle uit de
 * loader zelf volgen:
 *
 *  1. **Auth-gate**: zonder claims 401 met de app-brede tekst 'Niet ingelogd'
 *     (ADR 0044). De route staat op een bundel met inkomens- en
 *     uitgavenbedragen; dit is de enige poort ervoor.
 *  2. **Geen lege bundel bij een null-loader**: dan óók 401. Een lege bundel
 *     zou als "je verdient €0" renderen — stiller en verwarrender dan een fout.
 *  3. **TTL-cache**: het tweede verzoek binnen het venster draait `loadCoreData`
 *     NIET opnieuw. Dat is de hele reden dat de cache bestaat; zonder assertie
 *     zou een weggevallen cache-read alleen als "traag" merkbaar zijn.
 *  4. **Cross-account-isolatie**: de sleutel bevat de user-id, dus gebruiker B
 *     krijgt nooit de gecachete bundel van gebruiker A. Dit is de reden dat de
 *     TTL server-side staat en niet in de browser (zie lib/cashflow-settings-
 *     cache.ts) — een test die dat niet vastpint, laat de motivatie los hangen.
 */

const { mockCreateClient, mockGetAuthClaims, mockLoadSettings } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
  mockLoadSettings: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))
vi.mock('@/lib/cashflow-settings-data', () => ({
  loadCashflowSettingsData: mockLoadSettings,
}))

import { GET } from './route'

/** Minimale, herkenbare bundel — alleen de velden die de asserties aanraken. */
function bundle(netMonthlyIncome: number): CashflowSettingsData {
  return { netMonthlyIncome } as unknown as CashflowSettingsData
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetCashflowSettingsCache()
  mockCreateClient.mockResolvedValue({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/overzicht/cashflow-settings — auth', () => {
  it('geeft 401 met de app-brede tekst wanneer er geen claims zijn', async () => {
    mockGetAuthClaims.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(mockLoadSettings).not.toHaveBeenCalled()
  })

  it('geeft 401 — geen lege bundel — wanneer de loader null teruggeeft', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })
})

describe('GET /api/overzicht/cashflow-settings — payload + TTL-cache', () => {
  it('levert de loader-bundel ongewijzigd door', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(bundle(4200))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ netMonthlyIncome: 4200 })
  })

  it('draait de loader niet opnieuw bij een tweede verzoek binnen de TTL', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(bundle(4200))

    await GET()
    const second = await GET()

    expect(mockLoadSettings).toHaveBeenCalledTimes(1)
    expect(await second.json()).toEqual({ netMonthlyIncome: 4200 })
  })

  it('houdt de cache per gebruiker gescheiden', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(bundle(4200))
    await GET()

    mockGetAuthClaims.mockResolvedValue({ sub: 'user-b' })
    mockLoadSettings.mockResolvedValue(bundle(1900))
    const res = await GET()

    expect(mockLoadSettings).toHaveBeenCalledTimes(2)
    expect(await res.json()).toEqual({ netMonthlyIncome: 1900 })
  })
})

describe('GET /api/overzicht/cashflow-settings — foutafhandeling', () => {
  it('lekt geen rauwe foutmelding naar de client', async () => {
    // `serverError` logt server-side; dempen houdt de testuitvoer schoon zonder
    // de assertie te verzwakken.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockRejectedValue(new Error('relation "profiles" does not exist'))

    const res = await GET()
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).not.toContain('profiles')
    expect(body.error).toBe('Er ging iets mis. Probeer het later opnieuw.')
    expect(logged).toHaveBeenCalled()
  })
})
