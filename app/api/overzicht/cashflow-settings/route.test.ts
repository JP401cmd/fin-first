import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

/**
 * GET /api/overzicht/cashflow-settings — de lazy data-route van het
 * instellingen-blok onderaan /overzicht/budget (perf Task 2.2, stap 5).
 *
 * Vier eigenschappen die er echt toe doen, en die geen van alle uit de loader
 * zelf volgen:
 *
 *  1. **Auth-gate**: zonder claims 401 met de app-brede tekst 'Niet ingelogd'
 *     (ADR 0044), zónder de loader aan te raken. De route staat op een bundel
 *     met inkomens- en uitgavenbedragen; dit is de enige poort ervoor. De gate
 *     eist bovendien een `sub`, niet alleen een claims-object.
 *  2. **Geen lege bundel bij een null-loader**: dan óók 401. Een lege bundel
 *     zou als "je verdient €0" renderen — stiller en verwarrender dan een fout.
 *  3. **Verse data per verzoek**: er zit BEWUST geen cache voor deze route. Het
 *     blok dat 'm consumeert schrijft dezelfde velden ook weg; een TTL-venster
 *     zou een zojuist opgeslagen bedrag na een remount terugdraaien naar de
 *     oude waarde. Deze test is de vangrail die verhindert dat zo'n cache
 *     terugsluipt.
 *  4. **Geen rauwe fout naar de client**, en de response draagt `no-store`.
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

  it('geeft 401 bij claims zonder sub — een token zonder identiteit telt niet', async () => {
    mockGetAuthClaims.mockResolvedValue({ email: 'x@y.nl' })

    const res = await GET()

    expect(res.status).toBe(401)
    expect(mockLoadSettings).not.toHaveBeenCalled()
  })

  it('geeft 401 — geen lege bundel — wanneer de loader null teruggeeft', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })
})

describe('GET /api/overzicht/cashflow-settings — payload', () => {
  it('levert de loader-bundel ongewijzigd door', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(bundle(4200))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ netMonthlyIncome: 4200 })
  })

  it('stuurt de bundel als private, no-store', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValue(bundle(4200))

    const res = await GET()

    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('leest ELK verzoek vers — geen cache voor een bundel die het blok zelf bewerkt', async () => {
    // Het instellingen-blok schrijft net_monthly_income / estimated_monthly_expenses
    // weg via PUT /api/parameters. Zou deze route een TTL-cache krijgen, dan
    // toont een remount binnen dat venster het bedrag van vóór de bewerking.
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-a' })
    mockLoadSettings.mockResolvedValueOnce(bundle(4200)).mockResolvedValueOnce(bundle(5100))

    const first = await GET()
    const second = await GET()

    expect(mockLoadSettings).toHaveBeenCalledTimes(2)
    expect(await first.json()).toEqual({ netMonthlyIncome: 4200 })
    expect(await second.json()).toEqual({ netMonthlyIncome: 5100 })
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
