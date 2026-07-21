/**
 * Tests voor lib/emergency-fund.ts — de CANONIEKE noodfonds-resolver.
 *
 * Dekt:
 * - resolveEmergencyFund: doel aan/afwezig, target-gestuurde velden, geen
 *   dubbeltelling (goal.current_value nooit teller), source-veld, 0-uitgaven.
 * - pickEmergencyGoal + isEmergencyGoal: marker B (goal_type / metadata),
 *   deterministische keuze, geen doel.
 * - emergencyGoalTarget: maanden- vs €-doel, twee-weg-afgeleide.
 * - emergencyScoreTargetMonths + score-curve: anti-gaming vloer (klein target ≠
 *   100% bij lage dekking), vorm-behoud bij default target.
 * - CROSS-SURFACE PARITEIT (D1): loader-bundel monthsCovered == de emergency_fund-
 *   pijler rawValue-maanden uit de gezondheidsscore, incl. inclusion-weging.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveEmergencyFund,
  emergencyScoreTargetMonths,
  emergencyGoalTarget,
  pickEmergencyGoal,
  isEmergencyGoal,
  resolveEmergencyTargetMonths,
  DEFAULT_EMERGENCY_TARGET_MONTHS,
  MIN_EMERGENCY_SCORE_TARGET_MONTHS,
  type EmergencyGoalCandidate,
} from '@/lib/emergency-fund'
import { computeLiquidPot } from '@/lib/dashboard-wealth-weighting'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
} from '@/lib/health-score-input'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'

// ── resolveEmergencyFund — doel afwezig (liquide-tak) ─────────────────────────

describe('resolveEmergencyFund — geen doel (liquide-tak)', () => {
  it('geen doel → source=liquid, default 6 mnd, targetAmount = 6 × uitgaven', () => {
    const r = resolveEmergencyFund({
      liquidPot: 12_000,
      effectiveMonthlyExpenses: 2_000,
      goal: null,
    })
    expect(r.source).toBe('liquid')
    expect(r.targetMonths).toBe(DEFAULT_EMERGENCY_TARGET_MONTHS) // 6
    expect(r.targetAmount).toBe(12_000) // 6 × 2000
    expect(r.currentAmount).toBe(12_000)
    expect(r.monthsCovered).toBeCloseTo(6, 5)
  })

  it('avgMonthlyExpenses = 0 → monthsCovered 0 (geen divide-by-zero)', () => {
    const r = resolveEmergencyFund({ liquidPot: 10_000, effectiveMonthlyExpenses: 0, goal: null })
    expect(r.monthsCovered).toBe(0)
  })
})

// ── resolveEmergencyFund — doel aanwezig (stuurt target) ──────────────────────

describe('resolveEmergencyFund — met doel', () => {
  it('emergency_fund-doel (maanden) stuurt targetMonths, source=goal', () => {
    const r = resolveEmergencyFund({
      liquidPot: 8_000,
      effectiveMonthlyExpenses: 2_000,
      goal: { targetMonths: 4 },
    })
    expect(r.source).toBe('goal')
    expect(r.targetMonths).toBe(4)
    expect(r.targetAmount).toBe(8_000) // 4 × 2000
    expect(r.monthsCovered).toBeCloseTo(4, 5)
  })

  it('savings-doel (€) stuurt targetAmount, targetMonths afgeleid', () => {
    const r = resolveEmergencyFund({
      liquidPot: 5_000,
      effectiveMonthlyExpenses: 2_500,
      goal: { targetAmount: 15_000 },
    })
    expect(r.source).toBe('goal')
    expect(r.targetAmount).toBe(15_000)
    expect(r.targetMonths).toBeCloseTo(6, 5) // 15000 / 2500
  })

  it('currentAmount = liquide pot, NOOIT de goal.current_value (geen dubbeltelling)', () => {
    // Een doel-descriptor draagt alleen een target; de teller is puur de pot.
    const r = resolveEmergencyFund({
      liquidPot: 3_000,
      effectiveMonthlyExpenses: 1_000,
      goal: { targetMonths: 6, targetAmount: 6_000 },
    })
    expect(r.currentAmount).toBe(3_000) // niet 6000, niet 6000+3000
    expect(r.monthsCovered).toBeCloseTo(3, 5)
  })
})

// ── marker B: isEmergencyGoal + pickEmergencyGoal ─────────────────────────────

describe('isEmergencyGoal — marker B', () => {
  it('goal_type === emergency_fund → true', () => {
    expect(isEmergencyGoal({ goal_type: 'emergency_fund' })).toBe(true)
  })
  it('metadata.standaardDoel === noodfonds → true', () => {
    expect(isEmergencyGoal({ goal_type: 'savings', metadata: { standaardDoel: 'noodfonds' } })).toBe(true)
  })
  it('gewoon spaardoel zonder marker → false', () => {
    expect(isEmergencyGoal({ goal_type: 'savings', metadata: { standaardDoel: 'vakantie' } })).toBe(false)
    expect(isEmergencyGoal({ goal_type: 'savings' })).toBe(false)
    expect(isEmergencyGoal({ goal_type: 'net_worth', metadata: null })).toBe(false)
  })
})

describe('pickEmergencyGoal — deterministische keuze', () => {
  it('geen noodfonds-doel → null', () => {
    expect(pickEmergencyGoal([{ goal_type: 'savings' }, { goal_type: 'net_worth' }])).toBeNull()
  })
  it('kiest emergency_fund boven een marker-savings-doel (prioriteit)', () => {
    const goals: (EmergencyGoalCandidate & { id: string })[] = [
      { id: 'a', goal_type: 'savings', metadata: { standaardDoel: 'noodfonds' } },
      { id: 'b', goal_type: 'emergency_fund', target_value: 5 },
    ]
    expect(pickEmergencyGoal(goals)?.id).toBe('b')
  })
  it('zonder emergency_fund → eerste marker-savings-doel (ingaande volgorde)', () => {
    const goals: (EmergencyGoalCandidate & { id: string })[] = [
      { id: 'a', goal_type: 'savings', metadata: { standaardDoel: 'noodfonds' } },
      { id: 'b', goal_type: 'savings', metadata: { standaardDoel: 'noodfonds' } },
    ]
    expect(pickEmergencyGoal(goals)?.id).toBe('a')
  })
})

// ── emergencyGoalTarget — target_value-semantiek per type ─────────────────────

describe('emergencyGoalTarget', () => {
  it('emergency_fund → targetMonths uit target_value (maanden) + afgeleid bedrag', () => {
    const t = emergencyGoalTarget({ goal_type: 'emergency_fund', target_value: 3 }, 2_000)
    expect(t.targetMonths).toBe(3)
    expect(t.targetAmount).toBe(6_000)
  })
  it('savings → targetAmount uit target_value (€) + afgeleide maanden', () => {
    const t = emergencyGoalTarget({ goal_type: 'savings', target_value: 18_000, metadata: { standaardDoel: 'noodfonds' } }, 3_000)
    expect(t.targetAmount).toBe(18_000)
    expect(t.targetMonths).toBeCloseTo(6, 5)
  })
  it('string target_value (NUMERIC uit DB) wordt gecast', () => {
    const t = emergencyGoalTarget({ goal_type: 'emergency_fund', target_value: '4' }, 1_000)
    expect(t.targetMonths).toBe(4)
  })
})

// ── anti-gaming vloer ─────────────────────────────────────────────────────────

describe('emergencyScoreTargetMonths — anti-gaming vloer', () => {
  it('kleine target wordt gefloord naar het minimum (3 mnd)', () => {
    expect(emergencyScoreTargetMonths(1)).toBe(MIN_EMERGENCY_SCORE_TARGET_MONTHS)
    expect(emergencyScoreTargetMonths(2)).toBe(3)
  })
  it('target ≥ minimum blijft ongewijzigd', () => {
    expect(emergencyScoreTargetMonths(6)).toBe(6)
    expect(emergencyScoreTargetMonths(12)).toBe(12)
  })
  it('ongeldige/0 target → default 6', () => {
    expect(emergencyScoreTargetMonths(0)).toBe(DEFAULT_EMERGENCY_TARGET_MONTHS)
    expect(emergencyScoreTargetMonths(NaN)).toBe(DEFAULT_EMERGENCY_TARGET_MONTHS)
  })
})

describe('score-curve anti-gaming via computeHealthScoreFromInputs', () => {
  const base = {
    savingsRate6m: 20,
    totalAssets: 100_000,
    totalDebts: 0,
    freedomPct: 25,
    netMonthlyIncome: 4_000,
    debtMonthlyPayments: 0,
    largestAssetTypeShare: 0.4,
    budgetCategories: [{ limit: 1000, spent: 900 }],
  }

  it('1-maands-target scoort GEEN 100% bij 1 maand dekking (gefloord op 3)', () => {
    const score = computeHealthScoreFromInputs(
      { ...base, emergencyFundMonths: 1, emergencyTargetMonths: 1 },
      true,
    )
    const ef = score.pillars.find((p) => p.id === 'emergency_fund')!
    expect(ef.score).toBeLessThan(100)
    // 1 mnd tegen gefloorde target 3: half=1.5 → (1/1.5)*60 ≈ 40
    expect(ef.score).toBe(40)
  })

  it('default target 6 behoudt de oude curve-vorm (3 mnd → 60)', () => {
    const score = computeHealthScoreFromInputs(
      { ...base, emergencyFundMonths: 3 },
      true,
    )
    const ef = score.pillars.find((p) => p.id === 'emergency_fund')!
    expect(ef.score).toBe(60)
  })

  it('gebruiker-gekozen 12-maands-target verzwaart de eis (6 mnd < 100%)', () => {
    const score = computeHealthScoreFromInputs(
      { ...base, emergencyFundMonths: 6, emergencyTargetMonths: 12 },
      true,
    )
    const ef = score.pillars.find((p) => p.id === 'emergency_fund')!
    // 6 mnd tegen target 12: half=6 → precies op de 60-knik
    expect(ef.score).toBe(60)
  })
})

// ── CROSS-SURFACE PARITEIT (D1) ───────────────────────────────────────────────
// Bij identieke inputs is de loader-bundel-monthsCovered exact gelijk aan de
// emergency_fund-pijler-maanden uit de gezondheidsscore. Beide paden delen nu
// computeLiquidPot (inclusion-gewogen) → geen drift meer.

describe('D1-pariteit — loader-bundel == health-pijler (inclusion-gewogen)', () => {
  const assets: HealthScoreAsset[] = [
    { asset_type: 'savings', current_value: 10_000, net_worth_inclusion_pct: 50 }, // deel-getelde spaarrekening
    { asset_type: 'checking', current_value: 4_000 },
    { asset_type: 'investment', current_value: 100_000 }, // niet-liquide
  ]
  const unlinkedCash = 2_000
  const avgMonthlyExpenses = 2_000

  it('inclusion-weging: 50%-spaarrekening telt half mee in beide paden', () => {
    // Liquide pot = 10k×0.5 + 4k×1.0 + 2k unlinked = 11k
    const liquidPot = computeLiquidPot(
      assets.map((a) => ({
        current_value: a.current_value ?? 0,
        asset_type: a.asset_type,
        net_worth_inclusion_pct: a.net_worth_inclusion_pct,
      })),
      unlinkedCash,
    )
    expect(liquidPot).toBe(11_000)

    // (a) loader-pad: resolver
    const bundleMonths = resolveEmergencyFund({
      liquidPot,
      effectiveMonthlyExpenses: avgMonthlyExpenses,
      goal: null,
    }).monthsCovered

    // (b) health-pad: buildHealthScoreInput → emergencyFundMonths
    const input = buildHealthScoreInput(
      {
        savingsRate6m: 20,
        totalAssets: 116_000,
        totalDebts: 0,
        freedomPct: 20,
        avgMonthlyExpenses,
        netMonthlyIncome: 4_000,
      },
      {
        assets,
        unlinkedCash,
        budgets: [],
        transactions: [],
        householdType: 'alleenstaand',
        debtMonthlyPayments: 0,
      },
    )

    // Beide paden: 11k / 2k = 5,5 maanden — identiek.
    expect(bundleMonths).toBeCloseTo(5.5, 5)
    expect(input.emergencyFundMonths).toBeCloseTo(5.5, 5)
    expect(input.emergencyFundMonths).toBeCloseTo(bundleMonths, 10)
  })

  it('afgeronde weergave (loader .1 vs pijler rawValue .toFixed(1)) matcht', () => {
    const liquidPot = computeLiquidPot(
      assets.map((a) => ({
        current_value: a.current_value ?? 0,
        asset_type: a.asset_type,
        net_worth_inclusion_pct: a.net_worth_inclusion_pct,
      })),
      unlinkedCash,
    )
    const bundleMonths = Math.round(
      resolveEmergencyFund({ liquidPot, effectiveMonthlyExpenses: avgMonthlyExpenses, goal: null })
        .monthsCovered * 10,
    ) / 10

    const input = buildHealthScoreInput(
      {
        savingsRate6m: 20,
        totalAssets: 116_000,
        totalDebts: 0,
        freedomPct: 20,
        avgMonthlyExpenses,
        netMonthlyIncome: 4_000,
      },
      {
        assets,
        unlinkedCash,
        budgets: [],
        transactions: [],
        householdType: 'alleenstaand',
        debtMonthlyPayments: 0,
      },
    )
    const score = computeHealthScoreFromInputs(input, false)
    const pillarRaw = score.pillars.find((p) => p.id === 'emergency_fund')!.rawValue // "5.5 mnd"
    expect(pillarRaw).toBe(`${bundleMonths.toFixed(1)} mnd`)
  })
})

// ── resolveEmergencyTargetMonths — convenience voor snapshot-routes ────────────

describe('resolveEmergencyTargetMonths', () => {
  it('geen doel → default 6', () => {
    expect(resolveEmergencyTargetMonths([{ goal_type: 'savings' }], 2_000)).toBe(6)
  })
  it('emergency_fund-doel → doel-maanden', () => {
    expect(resolveEmergencyTargetMonths([{ goal_type: 'emergency_fund', target_value: 9 }], 2_000)).toBe(9)
  })
})
