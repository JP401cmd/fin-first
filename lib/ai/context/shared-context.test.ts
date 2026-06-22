import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import { computeFreedomProgress } from '@/lib/core-metrics'

// ── Mock loadCoreData ──────────────────────────────────────────
// shared-context leunt op de React-cached loader voor alle financiële
// kerngetallen. We mocken 'm zodat de test puur de afleiding van het
// Vrijheids-% (canonieke grondslag, ADR 0009) vastpint.
const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({
  loadCoreData: () => loadCoreDataMock(),
}))

import { buildSharedContext } from './shared-context'

// ── Helpers ────────────────────────────────────────────────────

/** Minimale CorePageData met alleen de velden die shared-context leest. */
function makeCoreData(overrides: Partial<CorePageData> = {}): CorePageData {
  const base = {
    userName: 'Test',
    currentAge: 40,
    hasTransactions: true,
    retirementMethodUsed: 'essential_budgets',
    budgetingActive: true,
    savingsRate6m: 25,
    fireParams: { effectiveSwr: 0.0288, grossReturn: 0.07, inflationRate: 0.02 },
    // FIRE-doel uit de unified projection (zelfde getal als de loaders).
    fireTargetFromHorizon: 500_000,
    rawFinancials: {
      monthlyIncome: 4000,
      monthlyExpenses: 3000,
      totalAssets: 600_000,
      totalDebts: 200_000,
      extrapolatedIncome: 48_000,
      yearlyMustExpenses: 24_000,
      yearlyRetirementExpenses: 24_000,
    },
    fullAssets: [],
    fullDebts: [],
  }
  return { ...(base as unknown as CorePageData), ...overrides }
}

/** Fake supabase met alleen de profiles-maybeSingle die shared-context doet. */
function makeSupabase(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
    }),
  } as never
}

function extractFreedomPct(ctx: string): number {
  const m = ctx.match(/Vrijheids-%:\s*([\d.]+)%/)
  if (!m) throw new Error(`Geen Vrijheids-% gevonden in context:\n${ctx}`)
  return parseFloat(m[1])
}

const HOUSE_ASSET = {
  id: 'house-1',
  is_active: true,
  asset_type: 'eigen_huis',
  current_value: 400_000,
  woz_value: 400_000,
  net_worth_inclusion_pct: 100,
}

const MORTGAGE_DEBT = {
  id: 'mortgage-1',
  is_active: true,
  debt_type: 'mortgage',
  linked_asset_id: 'house-1',
  current_balance: 250_000,
  net_worth_inclusion_pct: 100,
  monthly_payment: 1000,
}

describe('buildSharedContext — Vrijheids-% (canonieke grondslag, ADR 0009)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
  })

  it('rapporteert het percentage op FIRE-eligible vermogen ÷ benodigde portfolio (include_full)', async () => {
    // netWorth = 600k - 200k = 400k; required = 500k → 80%.
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const expected = computeFreedomProgress({ fireEligibleNetWorth: 400_000, requiredPortfolio: 500_000 })
    expect(expected).toBe(80)
    expect(extractFreedomPct(ctx)).toBe(80)
  })

  it('filtert de eigen woning uit het vermogen bij exclude_from_fire (lager % dan de oude grondslag)', async () => {
    // netWorth blijft 400k voor display, maar FIRE-eligible = 400k - (400k woning - 250k hypotheek = 150k equity) = 250k.
    // required = 500k → 50%. De OUDE grondslag (vol netWorth/doel) zou 80% tonen.
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({
        fullAssets: [HOUSE_ASSET] as unknown as CorePageData['fullAssets'],
        fullDebts: [MORTGAGE_DEBT] as unknown as CorePageData['fullDebts'],
      }),
    )
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'exclude_from_fire' } }))

    const expected = computeFreedomProgress({ fireEligibleNetWorth: 250_000, requiredPortfolio: 500_000 })
    expect(expected).toBe(50)
    expect(extractFreedomPct(ctx)).toBe(50)
  })

  it('valt terug op het simpele fireTarget als de unified projection geen portfolio gaf', async () => {
    // Geen fireTargetFromHorizon → noemer = computeCoreData.fireTarget
    // (= yearlyMustExpenses / swr = 24000 / 0.0288 ≈ 833.333). eligible 400k → ~48%.
    loadCoreDataMock.mockResolvedValue(makeCoreData({ fireTargetFromHorizon: null }))
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const fallbackTarget = 24_000 / 0.0288
    const expected = computeFreedomProgress({ fireEligibleNetWorth: 400_000, requiredPortfolio: fallbackTarget })
    expect(extractFreedomPct(ctx)).toBe(Math.round(expected * 10) / 10)
  })
})

const FREE_LINE = 'gebruiker is AL financieel vrij / met pensioen'

describe('buildSharedContext — levensfase-regel (al financieel vrij / met pensioen)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
  })

  it('voegt de "al financieel vrij"-regel toe wanneer het vrijheids-% op 100 uitkomt', async () => {
    // eligible netWorth = 600k - 200k = 400k; required = 400k → 100% → vrij.
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({ fireTargetFromHorizon: 400_000 }),
    )
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFreedomPct(ctx)).toBe(100)
    expect(ctx).toContain(FREE_LINE)
  })

  it('laat de "al financieel vrij"-regel WEG wanneer het vrijheids-% onder 100 ligt', async () => {
    // eligible netWorth = 400k; required = 500k → 80% → nog op weg, geen regel.
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFreedomPct(ctx)).toBe(80)
    expect(ctx).not.toContain(FREE_LINE)
  })
})
