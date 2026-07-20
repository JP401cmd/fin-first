import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import { computeFreedomProgress } from '@/lib/core-metrics'

// ── Mock loadCoreData ──────────────────────────────────────────
// Zowel `buildSharedContext` (cloud) als `buildLocalChatOverview` (lokaal) lezen
// hun kerngetallen via de React-cached loader. Eén mock voedt beide paden met
// dezelfde `CorePageData`, zodat de test de cijferpariteit kan vastpinnen.
const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({
  loadCoreData: () => loadCoreDataMock(),
}))

import { buildWillFinancialFacts, type FinFactsProfile } from './fin-financial-facts'
import { buildSharedContext } from './shared-context'
import { buildLocalChatOverview } from '@/lib/ai/local/local-chat-context'

// ── Fixture ────────────────────────────────────────────────────

/** CorePageData met de velden die alle drie de paden lezen. */
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
    // healthScoreInput.emergencyFundMonths voedt de lokale noodbuffer; freedomPct
    // is de OUDE lokale bron (zonder-terugval) die we bewust NIET meer lezen.
    healthScoreInput: { emergencyFundMonths: 3, freedomPct: 80 },
    fullAssets: [],
    fullDebts: [],
  }
  return { ...(base as unknown as CorePageData), ...overrides }
}

/** Fake supabase met alleen de profiles-maybeSingle die beide builders doen. */
function makeSupabase(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
    }),
  } as never
}

const INCLUDE_FULL: FinFactsProfile = { housing_strategy_config: { mode: 'include_full' } }

/** Parse "Vrijheids-%: 80%" uit de cloud-context. */
function cloudFreedomPct(ctx: string): number {
  const m = ctx.match(/Vrijheids-%:\s*([\d.]+)%/)
  if (!m) throw new Error(`Geen Vrijheids-% in context:\n${ctx}`)
  return parseFloat(m[1])
}

/** Parse "FIRE-doel: €500.000" (nl-NL, punt = duizendtal) uit de cloud-context. */
function cloudFireGoal(ctx: string): number {
  const m = ctx.match(/FIRE-doel:\s*€([\d.]+)/)
  if (!m) throw new Error(`Geen FIRE-doel in context:\n${ctx}`)
  return parseInt(m[1].replace(/\./g, ''), 10)
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

// ── Pure extractor ─────────────────────────────────────────────

describe('buildWillFinancialFacts — pure extractor', () => {
  it('normaal geval: MET-terugval vrijheids-% + FIRE-doel op dezelfde grondslag (include_full)', () => {
    // netWorth 400k ÷ required 500k → 80%; geen woning uitgesloten → doel = 500k.
    const facts = buildWillFinancialFacts(makeCoreData(), INCLUDE_FULL)
    expect(facts.hasData).toBe(true)
    expect(facts.nettoVermogen).toBe(400_000)
    expect(facts.vrijheidsPct).toBe(80)
    expect(facts.displayFireGoal).toBe(500_000)
    expect(facts.fireDoel).toBe(500_000)
    expect(facts.spaarquotePct).toBe(25)
    expect(facts.swr).toBe(0.0288)
    // dagtarief = maanduitgaven × 12 / 365 = 3000×12/365.
    expect(facts.dagtarief).toBeCloseTo((3000 * 12) / 365, 6)
    expect(facts.maandinkomen).toBe(4000)
    expect(facts.maanduitgaven).toBe(3000)
  })

  it('randgeval fireTargetFromHorizon===null: valt terug op fireTarget → vrijheids-% NIET nul', () => {
    // Geen horizon-doel → noemer = fireTarget = 24000/0.0288 ≈ 833.333; 400k → ~48%.
    const facts = buildWillFinancialFacts(makeCoreData({ fireTargetFromHorizon: null }), INCLUDE_FULL)
    const fallbackTarget = 24_000 / 0.0288
    expect(facts.vrijheidsPct).toBeGreaterThan(0)
    expect(facts.vrijheidsPct).toBe(computeFreedomProgress({ fireEligibleNetWorth: 400_000, requiredPortfolio: fallbackTarget }))
    // FIRE-doel deelt DEZELFDE terugval-grondslag als het vrijheids-%.
    expect(facts.displayFireGoal).toBeCloseTo(fallbackTarget, 6)
    expect(facts.fireDoel).toBeCloseTo(fallbackTarget, 6)
  })

  it('exclude_from_fire: eigen woning gefilterd, doel op EXCL.-grondslag', () => {
    // FIRE-eligible = 400k − 150k equity = 250k; required 500k → 50%; doel = 500k.
    const facts = buildWillFinancialFacts(
      makeCoreData({
        fullAssets: [HOUSE_ASSET] as unknown as CorePageData['fullAssets'],
        fullDebts: [MORTGAGE_DEBT] as unknown as CorePageData['fullDebts'],
      }),
      { housing_strategy_config: { mode: 'exclude_from_fire' } },
    )
    expect(facts.vrijheidsPct).toBe(50)
    expect(facts.displayFireGoal).toBe(500_000)
    expect(facts.fireDoel).toBe(500_000)
  })

  it('geen financiële data: hasData=false, nul-cijfers, SWR blijft reëel', () => {
    const facts = buildWillFinancialFacts(
      makeCoreData({
        hasTransactions: false,
        rawFinancials: {
          monthlyIncome: 2500,
          monthlyExpenses: 2000,
          totalAssets: 0,
          totalDebts: 0,
          extrapolatedIncome: 0,
          yearlyMustExpenses: 0,
          yearlyRetirementExpenses: 0,
        } as CorePageData['rawFinancials'],
      }),
      INCLUDE_FULL,
    )
    expect(facts.hasData).toBe(false)
    expect(facts.nettoVermogen).toBe(0)
    expect(facts.vrijheidsPct).toBe(0)
    expect(facts.displayFireGoal).toBeNull()
    expect(facts.fireDoel).toBe(0)
    expect(facts.spaarquotePct).toBe(0)
    expect(facts.dagtarief).toBe(0)
    expect(facts.swr).toBe(0.0288)
    expect(facts.maandinkomen).toBe(2500)
    expect(facts.maanduitgaven).toBe(2000)
  })
})

// ── C2b cijferpariteit: cloud == lokaal == FinFacts ───────────

describe('C2b cijferpariteit — cloud-render == lokale-render == FinFacts', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
  })

  it('normaal geval: beide Fins tonen hetzelfde vrijheids-% en FIRE-doel als de extractor', async () => {
    const coreData = makeCoreData()
    loadCoreDataMock.mockResolvedValue(coreData)
    const facts = buildWillFinancialFacts(coreData, INCLUDE_FULL)

    const cloud = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    const local = await buildLocalChatOverview(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const factsPct = Math.round(facts.vrijheidsPct * 10) / 10
    const factsGoal = Math.round(facts.fireDoel)

    // Vrijheids-%: cloud-render == lokale-render == FinFacts.
    expect(cloudFreedomPct(cloud)).toBe(factsPct)
    expect(local.vrijheidsPct).toBe(factsPct)
    expect(cloudFreedomPct(cloud)).toBe(local.vrijheidsPct)

    // FIRE-doel: idem.
    expect(cloudFireGoal(cloud)).toBe(factsGoal)
    expect(local.fireDoel).toBe(factsGoal)
    expect(cloudFireGoal(cloud)).toBe(local.fireDoel)

    // Overige gedeelde cijfers: lokaal leest exact FinFacts.
    expect(local.nettoVermogen).toBe(facts.nettoVermogen)
    expect(local.spaarquotePct).toBe(facts.spaarquotePct)
    expect(local.swrPct).toBe(Math.round(facts.swr * 1000) / 10)
    expect(local.dagtarief).toBe(Math.round(facts.dagtarief))
    expect(local.maandinkomen).toBe(facts.maandinkomen)
    expect(local.maanduitgaven).toBe(facts.maanduitgaven)
  })

  it('randgeval fireTargetFromHorizon===null: lokaal gecorrigeerd van 0 → echt, gelijk aan cloud', async () => {
    // healthScoreInput.freedomPct = 0 spiegelt wat de loader (zonder-terugval) hier
    // zou opleveren; het lokale pad LAS dat vroeger → 0%. Nu leest het FinFacts.
    const coreData = makeCoreData({
      fireTargetFromHorizon: null,
      healthScoreInput: { emergencyFundMonths: 3, freedomPct: 0 } as CorePageData['healthScoreInput'],
    })
    loadCoreDataMock.mockResolvedValue(coreData)
    const facts = buildWillFinancialFacts(coreData, INCLUDE_FULL)

    const cloud = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    const local = await buildLocalChatOverview(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const factsPct = Math.round(facts.vrijheidsPct * 10) / 10

    // De correctie: NIET nul meer, en niet de stale loader-waarde (0).
    expect(factsPct).toBeGreaterThan(0)
    expect(local.vrijheidsPct).toBe(factsPct)
    expect(local.vrijheidsPct).not.toBe(coreData.healthScoreInput.freedomPct) // was 0

    // Cloud == lokaal == FinFacts, ook in het randgeval (beide met-terugval).
    expect(cloudFreedomPct(cloud)).toBe(factsPct)
    expect(cloudFreedomPct(cloud)).toBe(local.vrijheidsPct)

    // Grondslag-share: FIRE-doel deelt de terugval-noemer met het vrijheids-%.
    expect(local.fireDoel).toBe(Math.round(facts.fireDoel))
    expect(local.fireDoel).toBeGreaterThan(0)
    expect(cloudFireGoal(cloud)).toBe(local.fireDoel)
  })
})
