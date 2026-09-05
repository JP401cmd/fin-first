import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRunwayCoveragePct } from './core-metrics'
import { eindMaandVan } from './horizon-kernel/gap'

/**
 * ADR 0129 B3/D5 (F3a) — de horizon-loader kiest per PLAN: kapitaalratio onder
 * `solved`, DEKKING onder een vast anker — met `ankerMaand` uit de bridge als nulpunt.
 * Zelfde mock-patroon als `fire-surface-consistency.test.ts`.
 *
 * TOLERANTIE: absoluut (0,01 pp) — identiteit met de primitief op dezelfde invoer.
 */
const loadHorizonRawMock = vi.fn()
const computeHorizonFireSimMock = vi.fn()

vi.mock('./horizon/raw-data-loader', () => ({
  loadHorizonRaw: (...args: unknown[]) => loadHorizonRawMock(...args),
  HORIZON_SETUP_COMPLETED_SLUG: 'horizon_setup_completed',
  HORIZON_EXIT_NOTICE_DISMISSED_SLUG: 'horizon_exit_notice_dismissed',
  HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG: 'horizon_tips_first_close_navigated',
}))
vi.mock('./fire-target-shared', () => ({
  computeHorizonFireSim: (...args: unknown[]) => computeHorizonFireSimMock(...args),
}))

import { loadHorizonData } from './horizon-data-loader'

const SUPABASE = {} as never
const NET_WORTH = 500_000
const START_AGE = 42
const END_AGE = 90
const EIND_MAAND = eindMaandVan(END_AGE, START_AGE)
// Geboortedatum zodat ageAtDate(dob) vandaag exact START_AGE oplevert.
const now = new Date()
const DOB = `${now.getFullYear() - START_AGE}-01-01`

function rawBundle(anchor: 'solved' | 'aow' | 'now' | { kind: 'age'; age: number }) {
  const planAnchor = typeof anchor === 'string' ? { kind: anchor } : anchor
  return {
    budgetingActive: true,
    effectiveInput: { dateOfBirth: DOB },
    firePlan: { anchor: planAnchor, endForm: 'deplete', endAge: END_AGE, legacyAmount: 0 },
    freedomBasis: {
      homeExcludedFromFire: false,
      netWorthInclHome: NET_WORTH,
      fireEligibleNetWorth: NET_WORTH,
      scalarRequiredPortfolioExclHome: 800_000,
    },
    healthScoreInputBase: {
      savingsRate6m: 20, totalAssets: NET_WORTH, totalDebts: 0, emergencyFundMonths: 6, emergencyTargetMonths: 3,
      netMonthlyIncome: 4000, debtMonthlyPayments: 0, largestAssetTypeShare: 0.4, budgetCategories: [], assetTypeCount: 3,
    },
  }
}

function armKernel(sim: Record<string, unknown>) {
  computeHorizonFireSimMock.mockResolvedValue({
    sim: { requiredFirePortfolio: 1_000_000, requiredFireNetWorth: 1_000_000, fireAgeFractional: 57.75, displayEndAge: END_AGE, ...sim },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('loadHorizonData — vrijheids-% per plan-anker', () => {
  it('solved: de kapitaalratio uit de kernel-noemer (ongewijzigd)', async () => {
    loadHorizonRawMock.mockResolvedValue(rawBundle('solved'))
    armKernel({ requiredFireIsAnchorPortfolio: false, stopAnker: null, ankerMaand: null, kernelDepletionMonth: null })
    const data = await loadHorizonData(SUPABASE)
    expect(data.freedomPct).toBeCloseTo(50, 2)
    expect(data.requiredPortfolioExclHome).toBe(1_000_000)
    expect(data.healthScoreInput.fireStopAnchor).toBe('solved')
  })

  it('aow: DEKKING met het stopmoment als nulpunt — geen kapitaalratio, geen doel', async () => {
    loadHorizonRawMock.mockResolvedValue(rawBundle('aow'))
    const ankerMaand = (67 - START_AGE) * 12
    const depletion = 480
    armKernel({ requiredFireIsAnchorPortfolio: true, stopAnker: { soort: 'aow' }, ankerMaand, kernelDepletionMonth: depletion })
    const data = await loadHorizonData(SUPABASE)
    const verwacht = computeRunwayCoveragePct({ kernelDepletionMonth: depletion, eindMaand: EIND_MAAND, ankerMaand })
    expect(data.freedomPct).toBeCloseTo(verwacht, 2)
    expect(data.freedomPct).toBeCloseTo(((depletion - ankerMaand) / (EIND_MAAND - ankerMaand)) * 100, 2)
    expect(data.freedomPct).not.toBeCloseTo(50, 2)
    expect(data.requiredPortfolioExclHome).toBeNull()
    expect(data.healthScoreInput.freedomPct).toBe(data.freedomPct)
    expect(data.healthScoreInput.fireStopAnchor).toBe('aow')
  })

  it('now: ankerMaand 0 ⇒ letterlijk de ADR 0127-tijdsdekking', async () => {
    loadHorizonRawMock.mockResolvedValue(rawBundle('now'))
    armKernel({ requiredFireIsAnchorPortfolio: true, stopAnker: { soort: 'nu' }, ankerMaand: 0, kernelDepletionMonth: EIND_MAAND / 2 })
    const data = await loadHorizonData(SUPABASE)
    expect(data.freedomPct).toBeCloseTo(50, 2)
    expect(data.healthScoreInput.fireStopAnchor).toBe('now')
  })

  it('age 58: gedekt tot het plan-einde ⇒ 100', async () => {
    loadHorizonRawMock.mockResolvedValue(rawBundle({ kind: 'age', age: 58 }))
    armKernel({ requiredFireIsAnchorPortfolio: true, stopAnker: { soort: 'leeftijd', leeftijd: 58 }, ankerMaand: (58 - START_AGE) * 12, kernelDepletionMonth: null })
    const data = await loadHorizonData(SUPABASE)
    expect(data.freedomPct).toBe(100)
    expect(data.healthScoreInput.fireStopAnchor).toBe('age')
  })

  it('vast anker zonder kernel-run ⇒ 0 (onbekend), niet de scalar-kapitaalratio', async () => {
    loadHorizonRawMock.mockResolvedValue(rawBundle('aow'))
    computeHorizonFireSimMock.mockResolvedValue(null)
    const data = await loadHorizonData(SUPABASE)
    expect(data.freedomPct).toBe(0)
    expect(data.requiredPortfolioExclHome).toBeNull()
    expect(data.fireEngine).toBe('scalar')
  })
})
