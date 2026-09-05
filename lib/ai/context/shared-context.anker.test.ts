import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import type { HorizonFireSim } from '@/lib/fire-target-shared'

/**
 * ADR 0129 F3a (I) — Fin krijgt onder een vast stop-anker ÉÉN contextregel (anker,
 * stopmoment, vrij mogelijk vanaf, reikt tot, plan-eind, dekking) en de gate
 * `isFinanciallyFree` leest het anker. Geen FIRE-doel-/FIRE-datum-regel meer onder een
 * vast anker (D4: geen doelvermogen), en geen "eerder vrij"-coaching bij dekking < 100.
 */
const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({ loadCoreData: () => loadCoreDataMock() }))

const horizonFireSimMock = vi.fn<() => Promise<HorizonFireSim | null>>()
const solvedFireAgeMock = vi.fn<() => Promise<number | null>>()
vi.mock('@/lib/fire-target-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fire-target-shared')>()),
  computeHorizonFireSim: () => horizonFireSimMock(),
  computeHorizonSolvedFireAge: () => solvedFireAgeMock(),
}))

import { buildSharedContext } from './shared-context'

function makeCoreData(overrides: Record<string, unknown> = {}): CorePageData {
  const base = {
    userName: 'Test', currentAge: 42, hasTransactions: true, retirementMethodUsed: 'essential_budgets', budgetingActive: true,
    savingsRate6m: 9, effectiveSavingsRatePct: 25,
    fireParams: { effectiveSwr: 0.0288, grossReturn: 0.07, inflationRate: 0.02 },
    fireTargetFromHorizon: null, fireNetWorthTargetFromHorizon: null,
    rawFinancials: { monthlyIncome: 4000, monthlyExpenses: 3000, totalAssets: 600_000, totalDebts: 200_000, extrapolatedIncome: 48_000, yearlyMustExpenses: 24_000, yearlyRetirementExpenses: 24_000 },
    fullAssets: [], fullDebts: [],
    firePlan: { anchor: { kind: 'age', age: 58.5 }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
    healthScoreInput: { freedomPct: 62.4 },
  }
  return { ...(base as unknown as CorePageData), ...(overrides as Partial<CorePageData>) }
}

function makeSupabase(profile: Record<string, unknown> | null) {
  return { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) } as never
}

function makeRun(sim: Record<string, unknown>): HorizonFireSim {
  return {
    sim: { fireAge: 59, fireAgeFractional: 58.5, requiredFireIsAnchorPortfolio: true, stopAnker: { soort: 'leeftijd', leeftijd: 58.5 }, vastStopLeeftijd: 58.5, kernelDepletionMonth: (83 - 42) * 12, displayEndAge: 90, ...sim },
    unifiedRows: [],
    aowAgeFractional: 67,
  } as unknown as HorizonFireSim
}

beforeEach(() => {
  loadCoreDataMock.mockReset()
  horizonFireSimMock.mockReset()
  solvedFireAgeMock.mockReset()
})

describe('buildSharedContext — het stop-anker', () => {
  it('age 58,5 met tekort: één anker-regel met stopmoment (58,5), vrij mogelijk vanaf, reikt tot, plan-eind en dekking; geen vrij-verklaring', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(makeRun({}))
    solvedFireAgeMock.mockResolvedValue(54.2)
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    const regel = ctx.split('\n').find((l) => l.startsWith('Stopmoment:'))
    expect(regel).toBeDefined()
    expect(regel).toContain('vast op 58,5 (zelfgekozen leeftijd)')
    expect(regel).toContain('Vrij mogelijk vanaf 54')
    expect(regel).toContain('Liquide vermogen reikt tot 83')
    expect(regel).toContain('plan tot 90')
    expect(regel).toMatch(/dekking 62[,.]4/)
    expect(regel).toContain('Zeg nooit dat de gebruiker "kan stoppen"')
    // De dekking is het vrijheids-% dat Fin citeert (consume, don't recompute).
    expect(ctx).toMatch(/Vrijheids-%:\s*62[,.]4/)
    // Geen FIRE-doel/-datum en geen levensfase-vrij onder een vast anker met tekort.
    expect(ctx).not.toMatch(/^FIRE-doel:/m)
    expect(ctx).not.toMatch(/^Verwachte FIRE-datum:/m)
    expect(ctx).not.toContain('gebruiker is AL financieel vrij')
  })

  it('aow-anker, 30 jaar, dekking 100: NIET vrij (de gate), wel de anker-regel', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData({ currentAge: 30, firePlan: { anchor: { kind: 'aow' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }, healthScoreInput: { freedomPct: 100 } }))
    horizonFireSimMock.mockResolvedValue(makeRun({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: 67, kernelDepletionMonth: null }))
    solvedFireAgeMock.mockResolvedValue(null)
    const ctx = await buildSharedContext(makeSupabase({}))
    expect(ctx).not.toContain('gebruiker is AL financieel vrij')
    const regel = ctx.split('\n').find((l) => l.startsWith('Stopmoment:'))!
    expect(regel).toContain('vast op 67 (AOW-leeftijd)')
    expect(regel).toContain('Vrij mogelijk vanaf niet binnen de horizon')
    expect(regel).toContain('reikt tot 90')
  })

  it('now-anker gedekt: de gate staat open (anker per definitie bereikt)', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData({ firePlan: { anchor: { kind: 'now' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }, healthScoreInput: { freedomPct: 100 } }))
    horizonFireSimMock.mockResolvedValue(makeRun({ stopAnker: { soort: 'nu' }, vastStopLeeftijd: 42, kernelDepletionMonth: null }))
    solvedFireAgeMock.mockResolvedValue(null)
    const ctx = await buildSharedContext(makeSupabase({}))
    expect(ctx).toContain('gebruiker is AL financieel vrij')
    expect(ctx.split('\n').find((l) => l.startsWith('Stopmoment:'))).toContain('vast op nu (vandaag)')
  })

  it('solved: geen anker-regel, geen tweede run, FIRE-doel-regel zoals voorheen', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData({ firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }, fireTargetFromHorizon: 500_000 }))
    horizonFireSimMock.mockResolvedValue(null)
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    expect(ctx).not.toMatch(/^Stopmoment:/m)
    expect(ctx).toMatch(/^FIRE-doel:/m)
    expect(solvedFireAgeMock).not.toHaveBeenCalled()
  })
})
