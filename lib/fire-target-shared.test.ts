import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * WF-WILL-01 — één kernel-run voor élk FIRE-oppervlak.
 *
 * De bug: /overzicht (dashboard-data-loader) draaide een EIGEN
 * `computeConvergentieProjection` met zelf-afgeleide profiel-/uitgaven-/strategie-
 * inputs, terwijl de Kern (`fireTargetFromHorizon`) en daarmee de Fin-chat via
 * `computeHorizonFireTarget` op de Horizon-run zaten. Twee onafhankelijke runs →
 * twee FIRE-doelen → twee vrijheids-percentages (widget 99,4% naast Fin 90,8%).
 *
 * Deze suite vergrendelt de fix op twee niveaus:
 *  1. GEDRAG — `computeHorizonFireTarget` is een dunne afleiding van
 *     `computeHorizonFireSim`: exact dezelfde run, geen tweede kernel-aanroep, en
 *     de volledige uitkomst (rawContext + strategieën + AOW) komt mee zodat
 *     /overzicht 'm kan consumeren i.p.v. herberekenen.
 *  2. STRUCTUUR — `dashboard-data-loader` roept de convergentie-router NIET meer
 *     zelf aan. Dat is de eigenlijke anti-drift-grendel: een nieuwe eigen
 *     kernel-run daar is per definitie toekomstige drift (CLAUDE.md
 *     "consume, don't recompute").
 */

const loadHorizonDataMock = vi.fn()
const buildHorizonInputMock = vi.fn()
const computeConvergentieProjectionMock = vi.fn()
const toSimResultMock = vi.fn()

vi.mock('./horizon-data-loader', () => ({
  loadHorizonData: (...args: unknown[]) => loadHorizonDataMock(...args),
}))
vi.mock('./horizon/build-input', () => ({
  buildHorizonInput: (...args: unknown[]) => buildHorizonInputMock(...args),
}))
vi.mock('./horizon-kernel/convergentie-router', () => ({
  computeConvergentieProjection: (...args: unknown[]) => computeConvergentieProjectionMock(...args),
}))
vi.mock('./unified-projection', () => ({
  toSimResult: (...args: unknown[]) => toSimResultMock(...args),
}))
vi.mock('./reference-cache', () => ({
  getAowLeeftijden: () => Promise.resolve([]),
}))

import { computeHorizonFireSim, computeHorizonFireTarget } from './fire-target-shared'

const SUPABASE = {} as never

const FIRE_STRATEGY = { strategy: 'perpetual', endAge: 100, legacyAmount: 0 }
const WITHDRAWAL_STRATEGY = { strategy: 'static' }

function armHappyPath() {
  loadHorizonDataMock.mockResolvedValue({
    effectiveInput: { dateOfBirth: '1985-04-01' },
    events: [{ id: 'evt-1' }],
    assets: [{ id: 'asset-1' }],
    debts: [{ id: 'debt-1' }],
    fireStrategy: FIRE_STRATEGY,
    withdrawalStrategy: WITHDRAWAL_STRATEGY,
    fireParams: { grossReturn: 0.06, inflationRate: 0.02, box3Method: 'forfaitair' },
    box3Method: 'forfaitair',
    hasPartner: false,
    unlinkedCash: 1000,
    monthlySavingsOverride: null,
    baseAnnualSavingsFromCashflow: 12000,
    housingStrategy: { mode: 'include_full' },
    rawProfile: { id: 'profile-1', yearly_essential_expenses: 24000 },
  })
  buildHorizonInputMock.mockReturnValue({
    input: { yearlyExpenses: 30000 },
    aowAgeInt: 68,
  })
  computeConvergentieProjectionMock.mockReturnValue({ ok: true, result: { marker: 'kernel-run' } })
  toSimResultMock.mockReturnValue({
    requiredFirePortfolio: 750_000,
    requiredFireNetWorth: 900_000,
    fireAgeFractional: 58.25,
    displayEndAge: 100,
    rows: [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  armHappyPath()
})

describe('computeHorizonFireSim — de canonieke FIRE-run', () => {
  it('geeft de volledige uitkomst terug: sim + de rauwe context die de run voedde + strategieën + AOW', async () => {
    const run = await computeHorizonFireSim(SUPABASE)

    expect(run).not.toBeNull()
    expect(run!.sim.requiredFirePortfolio).toBe(750_000)
    expect(run!.sim.requiredFireNetWorth).toBe(900_000)
    // De rawContext is exact de context waarmee de kernel draaide — /overzicht geeft
    // 'm door als RegelSimSnapshot.rawContext, dus de editor-baseline is per
    // constructie dezelfde curve.
    expect(computeConvergentieProjectionMock).toHaveBeenCalledWith({ rawContext: run!.rawContext })
    expect(run!.rawContext.yearlyExpenses).toBe(30000)
    expect(run!.rawContext.profile).toMatchObject({ id: 'profile-1' })
    expect(run!.fireStrategy).toBe(FIRE_STRATEGY)
    expect(run!.withdrawalStrategy).toBe(WITHDRAWAL_STRATEGY)
    expect(run!.aowAgeInt).toBe(68)
  })

  it('geeft null (geen halve uitkomst) wanneer een essentiële input ontbreekt', async () => {
    loadHorizonDataMock.mockResolvedValue({
      effectiveInput: { dateOfBirth: null },
      fireParams: { grossReturn: 0.06, inflationRate: 0.02 },
    })
    expect(await computeHorizonFireSim(SUPABASE)).toBeNull()
    expect(computeConvergentieProjectionMock).not.toHaveBeenCalled()
  })

  it('geeft null bij een gefaalde kernel-run', async () => {
    computeConvergentieProjectionMock.mockReturnValue({ ok: false })
    expect(await computeHorizonFireSim(SUPABASE)).toBeNull()
  })
})

describe('computeHorizonFireTarget — dunne afleiding, geen eigen run', () => {
  it('leest beide doelbedragen uit dezelfde sim', async () => {
    const targets = await computeHorizonFireTarget(SUPABASE)
    expect(targets).toEqual({ requiredFirePortfolio: 750_000, requiredFireNetWorth: 900_000 })
  })

  it('poortje ≤ 0 → null per grondslag (ongewijzigd contract)', async () => {
    toSimResultMock.mockReturnValue({
      requiredFirePortfolio: 0,
      requiredFireNetWorth: 0,
      fireAgeFractional: null,
      displayEndAge: 100,
      rows: [],
    })
    expect(await computeHorizonFireTarget(SUPABASE)).toEqual({
      requiredFirePortfolio: null,
      requiredFireNetWorth: null,
    })
  })

  it('lege uitkomst wanneer de gedeelde run niet kon draaien', async () => {
    loadHorizonDataMock.mockRejectedValue(new Error('db down'))
    expect(await computeHorizonFireTarget(SUPABASE)).toEqual({
      requiredFirePortfolio: null,
      requiredFireNetWorth: null,
    })
  })
})

describe('anti-drift-grendel — /overzicht draait geen eigen kernel', () => {
  it('dashboard-data-loader roept computeConvergentieProjection niet meer zelf aan', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'dashboard-data-loader.ts'), 'utf8')
    expect(src).not.toMatch(/computeConvergentieProjection\s*\(/)
    // …maar consumeert wél de canonieke gedeelde run.
    expect(src).toMatch(/computeHorizonFireSim\s*\(/)
  })
})
