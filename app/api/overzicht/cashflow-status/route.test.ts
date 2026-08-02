import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DashboardData } from '@/lib/types/dashboard'
import type { CashflowData } from '@/lib/cashflow-data-loader'
import type { VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import {
  __resetCashflowStatusCache,
  CASHFLOW_STATUS_CACHE_TTL_MS,
} from '@/lib/cashflow-status-cache'

/**
 * GET /api/overzicht/cashflow-status — de vier sidebar-statuskleuren.
 *
 * De route draait loadDashboardData + loadCashflowData + loadVasteLastenSummary
 * om VIER kleuren te leveren; de pagina heeft datzelfde werk net gedaan, maar
 * React `cache()` overleeft de request-grens niet. Wat hier bewaakt wordt:
 *
 *  1. de TTL-cache slaat de loaders daadwerkelijk OVER bij een hit (spy-tellers,
 *     niet alleen "er kwam een waarde terug");
 *  2. na TTL-verval draait het volle pad weer;
 *  3. een andere gebruiker en een ander perspectief delen NOOIT een entry;
 *  4. de statussen die de route teruggeeft blijven exact die van
 *     `buildCashflowCards` (die draait hier echt mee — niet gemockt).
 */

const {
  mockCreateClient,
  mockGetAuthClaims,
  mockGetServerPerspective,
  mockLoadDashboardData,
  mockLoadCashflowData,
  mockLoadVasteLastenSummary,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
  mockGetServerPerspective: vi.fn(),
  mockLoadDashboardData: vi.fn(),
  mockLoadCashflowData: vi.fn(),
  mockLoadVasteLastenSummary: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))
vi.mock('@/lib/household/server-perspective', () => ({
  getServerPerspective: mockGetServerPerspective,
}))
vi.mock('@/lib/dashboard-data-loader', () => ({
  loadDashboardData: mockLoadDashboardData,
}))
vi.mock('@/lib/cashflow-data-loader', () => ({
  loadCashflowData: mockLoadCashflowData,
}))
vi.mock('@/lib/vaste-lasten-summary', () => ({
  loadVasteLastenSummary: mockLoadVasteLastenSummary,
}))

import { GET } from './route'

// ── Fixture ────────────────────────────────────────────────────
// Zo gekozen dat de vier kaarten UITEENLOPENDE statussen krijgen, zodat een
// verwisselde sleutel in de payload zichtbaar wordt:
//   budget      → budgetScore 90 ≥ 70            → 'good'
//   transacties → 3000 in / 3300 uit (−10%)      → 'bad'
//   vaste lasten→ 1800 / 3000 = 60% (>50%, ≤70%) → 'warn'
//   forecast    → baseline 3000 − 2000 = +1000   → 'good'
const dashboardData = {
  budgetingActive: true,
  budgetTotals: { expense: { limit: 1000, spent: 200 } },
  monthSummary: { budgetScore: 90 },
  currentMonthIncome: 3000,
  currentMonthExpenses: 3300,
  monthlyIncome: 3000,
} as unknown as DashboardData

const cashflow = {
  recurrings: [],
  baselineIncome: 3000,
  baselineExpenses: 2000,
  startingBalance: 1000,
} as unknown as CashflowData

const vasteLasten = { totalMonthly: 1800, count: 3 } as unknown as VasteLastenSummary

const EXPECTED = {
  budget: 'good',
  transacties: 'bad',
  vasteLasten: 'warn',
  forecast: 'good',
}

/** Hoe vaak de drie zware loaders samen zijn aangeroepen. */
function loaderCalls(): number {
  return (
    mockLoadDashboardData.mock.calls.length +
    mockLoadCashflowData.mock.calls.length +
    mockLoadVasteLastenSummary.mock.calls.length
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetCashflowStatusCache()
  mockCreateClient.mockResolvedValue({})
  mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
  mockGetServerPerspective.mockResolvedValue('personal')
  mockLoadDashboardData.mockResolvedValue({ dashboardData })
  mockLoadCashflowData.mockResolvedValue(cashflow)
  mockLoadVasteLastenSummary.mockResolvedValue(vasteLasten)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/overzicht/cashflow-status — payload', () => {
  it('spiegelt de vier kaartstatussen uit buildCashflowCards', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EXPECTED)
  })

  it('geeft 401 met de app-brede tekst zonder de loaders te raken', async () => {
    mockGetAuthClaims.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(loaderCalls()).toBe(0)
  })

  it('lekt bij een loader-fout geen interne details naar de client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLoadCashflowData.mockRejectedValue(new Error('relation "transactions" does not exist'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).not.toContain('transactions')
    expect(body).toEqual({
      error: 'Er ging iets mis. Probeer het later opnieuw.',
      code: 'server_error',
    })
    spy.mockRestore()
  })
})

describe('GET /api/overzicht/cashflow-status — TTL-cache', () => {
  it('slaat de drie loaders over op een tweede GET binnen de TTL', async () => {
    vi.useFakeTimers()

    const first = await GET()
    expect(await first.json()).toEqual(EXPECTED)
    // Miss: elk van de drie loaders precies één keer.
    expect(mockLoadDashboardData).toHaveBeenCalledTimes(1)
    expect(mockLoadCashflowData).toHaveBeenCalledTimes(1)
    expect(mockLoadVasteLastenSummary).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CASHFLOW_STATUS_CACHE_TTL_MS - 1)
    const second = await GET()
    expect(await second.json()).toEqual(EXPECTED)
    // Hit: geen enkele extra loader-aanroep.
    expect(loaderCalls()).toBe(3)
  })

  it('draait het volle pad opnieuw zodra de TTL verlopen is', async () => {
    vi.useFakeTimers()

    await GET()
    expect(loaderCalls()).toBe(3)

    vi.advanceTimersByTime(CASHFLOW_STATUS_CACHE_TTL_MS)
    const res = await GET()
    expect(await res.json()).toEqual(EXPECTED)
    expect(mockLoadDashboardData).toHaveBeenCalledTimes(2)
    expect(mockLoadCashflowData).toHaveBeenCalledTimes(2)
    expect(mockLoadVasteLastenSummary).toHaveBeenCalledTimes(2)
  })

  it('deelt geen entry met een andere gebruiker', async () => {
    await GET()
    expect(loaderCalls()).toBe(3)

    mockGetAuthClaims.mockResolvedValue({ sub: 'user-2' })
    await GET()
    expect(loaderCalls()).toBe(6)
  })

  it('deelt geen entry met een ander perspectief', async () => {
    await GET()
    expect(loaderCalls()).toBe(3)

    mockGetServerPerspective.mockResolvedValue('household')
    await GET()
    expect(loaderCalls()).toBe(6)

    mockGetServerPerspective.mockResolvedValue('partner')
    await GET()
    expect(loaderCalls()).toBe(9)

    // Terug naar het eerste perspectief → dat is nog gecachet.
    mockGetServerPerspective.mockResolvedValue('personal')
    await GET()
    expect(loaderCalls()).toBe(9)
  })

  it('geeft bij een hit de statussen van de gecachete gebruiker, niet die van de tweede', async () => {
    // Gebruiker 1 vult de cache met de fixture-statussen.
    const first = await GET()
    expect(await first.json()).toEqual(EXPECTED)

    // Gebruiker 2 heeft ándere cijfers → moet zijn EIGEN statussen krijgen.
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-2' })
    mockLoadDashboardData.mockResolvedValue({
      dashboardData: {
        ...dashboardData,
        budgetingActive: false,
        currentMonthIncome: 4000,
        currentMonthExpenses: 1000,
      } as unknown as DashboardData,
    })
    const second = await GET()
    expect(await second.json()).toEqual({
      budget: 'neutral',
      transacties: 'good',
      vasteLasten: 'warn',
      forecast: 'good',
    })

    // En gebruiker 1 houdt de zijne (uit de cache).
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
    const third = await GET()
    expect(await third.json()).toEqual(EXPECTED)
  })
})
