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

const loadHorizonRawMock = vi.fn()
const buildHorizonInputMock = vi.fn()
const computeConvergentieProjectionMock = vi.fn()
const toSimResultMock = vi.fn()

vi.mock('./horizon/raw-data-loader', () => ({
  loadHorizonRaw: (...args: unknown[]) => loadHorizonRawMock(...args),
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

const RAW_HAPPY = {
  effectiveInput: { dateOfBirth: '1985-04-01' },
  events: [{ id: 'evt-1' }],
  assets: [{ id: 'asset-1' }],
  debts: [{ id: 'debt-1' }],
  // De FIRE-run leest de PERSPECTIEF-rijen, niet de rauwe eigen arrays.
  fireAssets: [{ id: 'asset-1' }],
  fireDebts: [{ id: 'debt-1' }],
  fireRowsComplete: true,
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
}

function armHappyPath() {
  loadHorizonRawMock.mockResolvedValue(RAW_HAPPY)
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
    loadHorizonRawMock.mockResolvedValue({
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

  // ── H21 / ADR 0107 — perspectief-bewuste run ──────────────────────────────
  it('leest de RAUWE laag (geen loadHorizonData) — anders is de recursie terug', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'fire-target-shared.ts'), 'utf8')
    expect(src).toMatch(/loadHorizonRaw\s*\(/)
    // De afgeleide laag consumeert DEZE functie; hem hier aanroepen is oneindige recursie.
    expect(src).not.toMatch(/\bloadHorizonData\s*\(/)
  })

  it('geeft het perspectief door aan de rauwe laag; zonder argument is dat expliciet "personal"', async () => {
    await computeHorizonFireSim(SUPABASE)
    expect(loadHorizonRawMock).toHaveBeenCalledWith(SUPABASE, 'personal')

    loadHorizonRawMock.mockClear()
    await computeHorizonFireSim(SUPABASE, 'household')
    expect(loadHorizonRawMock).toHaveBeenCalledWith(SUPABASE, 'household')
  })

  it('voedt de kernel met de PERSPECTIEF-rijen (fireAssets/fireDebts), niet met de eigen arrays', async () => {
    loadHorizonRawMock.mockResolvedValue({
      effectiveInput: { dateOfBirth: '1985-04-01' },
      events: [],
      assets: [{ id: 'eigen' }],
      debts: [{ id: 'eigen-schuld' }],
      fireAssets: [{ id: 'huishoud' }],
      fireDebts: [{ id: 'huishoud-schuld' }],
      fireRowsComplete: true,
      fireStrategy: FIRE_STRATEGY,
      withdrawalStrategy: WITHDRAWAL_STRATEGY,
      fireParams: { grossReturn: 0.06, inflationRate: 0.02, box3Method: 'forfaitair' },
      box3Method: 'forfaitair',
      hasPartner: false,
      unlinkedCash: 0,
      monthlySavingsOverride: null,
      baseAnnualSavingsFromCashflow: 0,
      housingStrategy: { mode: 'include_full' },
      rawProfile: { id: 'profile-1' },
    })
    const run = await computeHorizonFireSim(SUPABASE, 'household')
    expect(run!.rawContext.assets).toEqual([{ id: 'huishoud' }])
    expect(run!.rawContext.debts).toEqual([{ id: 'huishoud-schuld' }])
    expect(buildHorizonInputMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ assets: [{ id: 'huishoud' }], debts: [{ id: 'huishoud-schuld' }] }),
    )
  })

  it('weigert te draaien op privacy-aggregaatrijen i.p.v. een pot met verzonnen aannames te bouwen', async () => {
    // Privacyniveau "totalen": één synthetische rij zónder asset_type/rendement.
    // Een SOM is daarop eerlijk, een kernel-POT niet — dus geen kernel-antwoord.
    loadHorizonRawMock.mockResolvedValue({ ...RAW_HAPPY, fireRowsComplete: false })
    expect(await computeHorizonFireSim(SUPABASE, 'household')).toBeNull()
    expect(computeConvergentieProjectionMock).not.toHaveBeenCalled()
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
    loadHorizonRawMock.mockRejectedValue(new Error('db down'))
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
