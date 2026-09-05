/**
 * Tests voor lib/emergency-fund.ts — de CANONIEKE noodfonds-resolver.
 *
 * Dekt:
 * - resolveEmergencyFund: de salaris-norm (3 × netto maandsalaris), de
 *   uitgaven-terugval bij nul inkomen, de aparte runway, 0-noemers.
 * - pickEmergencyGoal + isEmergencyGoal: marker B (goal_type / metadata),
 *   deterministische keuze, geen doel. Deze helpers herkennen het noodfonds-doel
 *   op /toekomst/doelen; ze sturen sinds 29 jul 2026 de score-norm NIET meer.
 * - emergencyGoalTarget: maanden- vs €-doel, twee-weg-afgeleide.
 * - emergencyScoreTargetMonths + score-curve: vloer/plafond, curve-vorm.
 * - CROSS-SURFACE PARITEIT (D1): loader-bundel monthsCovered == de emergency_fund-
 *   pijler rawValue-maanden uit de gezondheidsscore, incl. inclusion-weging.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveEmergencyFund,
  EMERGENCY_STANDAARD_DOEL_KEY,
  emergencyScoreTargetMonths,
  emergencyGoalTarget,
  pickEmergencyGoal,
  isEmergencyGoal,
  DEFAULT_EMERGENCY_TARGET_MONTHS,
  TARGET_EMERGENCY_SALARY_MONTHS,
  MIN_EMERGENCY_SCORE_TARGET_MONTHS,
  MAX_EMERGENCY_DISPLAY_TARGET_MONTHS as MAX_EMERGENCY_TARGET_MONTHS,
  type EmergencyGoalCandidate,
} from '@/lib/emergency-fund'
import { computeLiquidPot } from '@/lib/dashboard-wealth-weighting'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
} from '@/lib/health-score-input'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'

// ── resolveEmergencyFund — de salaris-norm ────────────────────────────────────

describe('resolveEmergencyFund — norm is 3 × netto maandsalaris', () => {
  it('salaris bekend → source=salary, 3 mnd, targetAmount = 3 × salaris', () => {
    const r = resolveEmergencyFund({
      liquidPot: 12_000,
      effectiveMonthlyExpenses: 2_000,
      netMonthlyIncome: 4_000,
    })
    expect(r.source).toBe('salary')
    expect(r.targetMonths).toBe(TARGET_EMERGENCY_SALARY_MONTHS) // 3
    expect(r.targetAmount).toBe(12_000) // 3 × 4000
    expect(r.currentAmount).toBe(12_000)
    expect(r.monthsCovered).toBeCloseTo(3, 5) // 12.000 / 4.000
  })

  it('de maanduitgaven raken de norm niet — alleen de runway', () => {
    // Zelfde pot en salaris, half zo hoge uitgaven: de norm blijft 3 × 4.000,
    // maar je komt er twee keer zo lang van rond.
    const duur = resolveEmergencyFund({
      liquidPot: 12_000, effectiveMonthlyExpenses: 2_000, netMonthlyIncome: 4_000,
    })
    const zuinig = resolveEmergencyFund({
      liquidPot: 12_000, effectiveMonthlyExpenses: 1_000, netMonthlyIncome: 4_000,
    })
    expect(zuinig.targetAmount).toBe(duur.targetAmount)
    expect(zuinig.monthsCovered).toBeCloseTo(duur.monthsCovered, 10)
    expect(duur.runwayMonths).toBeCloseTo(6, 5)
    expect(zuinig.runwayMonths).toBeCloseTo(12, 5)
  })

  it('geen salaris → terugval op 6 × maanduitgaven (source=expenses)', () => {
    const r = resolveEmergencyFund({
      liquidPot: 12_000,
      effectiveMonthlyExpenses: 2_000,
      netMonthlyIncome: 0,
    })
    expect(r.source).toBe('expenses')
    expect(r.targetMonths).toBe(DEFAULT_EMERGENCY_TARGET_MONTHS) // 6
    expect(r.targetAmount).toBe(12_000) // 6 × 2000
    expect(r.monthsCovered).toBeCloseTo(6, 5)
  })

  it('nul salaris én nul uitgaven → geen divide-by-zero', () => {
    const r = resolveEmergencyFund({
      liquidPot: 10_000, effectiveMonthlyExpenses: 0, netMonthlyIncome: 0,
    })
    expect(r.monthsCovered).toBe(0)
    expect(r.runwayMonths).toBe(0)
    expect(r.targetAmount).toBe(0)
  })

  it('nul uitgaven bij bekend salaris: norm blijft geldig, runway 0', () => {
    const r = resolveEmergencyFund({
      liquidPot: 9_000, effectiveMonthlyExpenses: 0, netMonthlyIncome: 3_000,
    })
    expect(r.targetAmount).toBe(9_000)
    expect(r.monthsCovered).toBeCloseTo(3, 10)
    expect(r.runwayMonths).toBe(0)
  })

  it('targetMonths × maandbasis == targetAmount blijft een geldige gelijkheid', () => {
    // In het oude doel-gestuurde model was targetAmount een vrij euro-bedrag en
    // targetMonths een afgeronde afgeleide; die vermenigvuldiging klopte dan niet
    // meer. De widget reconstrueert de maandbasis nu uit deze gelijkheid.
    const r = resolveEmergencyFund({
      liquidPot: 1, effectiveMonthlyExpenses: 3_500, netMonthlyIncome: 5_000,
    })
    expect(r.targetAmount / r.targetMonths).toBeCloseTo(5_000, 10)
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
  it('absurd hoge target wordt begrensd — de pijler kan niet permanent op 0 blijven', () => {
    expect(emergencyScoreTargetMonths(389)).toBe(MAX_EMERGENCY_TARGET_MONTHS)
    expect(emergencyScoreTargetMonths(Infinity)).toBe(DEFAULT_EMERGENCY_TARGET_MONTHS)
  })
})

// ── Backfill-marker: code en migratie moeten dezelfde sleutel schrijven ───────
// De marker-waarde leeft in TypeScript (EMERGENCY_STANDAARD_DOEL_KEY) maar staat
// als string-literal in de backfill-migratie. Deze test bewaakt die naad: gaat de
// constante ooit veranderen, dan wordt de migratie (en daarmee de detectie op
// bestaande rijen) stil inert — precies de bug die deze kaart terugstuurde.

describe('backfill-migratie — marker blijft in sync met de resolver', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260729120000_backfill_noodfonds_standaarddoel_marker.sql',
    ),
    'utf8',
  )

  it('schrijft exact de sleutel/waarde die isEmergencyGoal detecteert', () => {
    expect(sql).toContain(`{"standaardDoel":"${EMERGENCY_STANDAARD_DOEL_KEY}"}`)
  })

  it('overschrijft nooit een bestaande marker (idempotent)', () => {
    expect(sql).toContain("metadata->>'standaardDoel' IS NULL")
  })

  it('de legacy-productievorm (savings, metadata {}) wordt zonder marker NIET herkend', () => {
    // Dit is de rij zoals ze op productie stond: naam "Noodfonds", savings,
    // metadata {} → géén detectie. Daarom de backfill.
    const legacy: EmergencyGoalCandidate = { goal_type: 'savings', target_value: '10500.00', metadata: {} }
    expect(isEmergencyGoal(legacy)).toBe(false)
    expect(pickEmergencyGoal([legacy])).toBeNull()

    // Na de backfill draagt dezelfde rij de marker → herkend als hét
    // noodfonds-doel op /toekomst/doelen. De score-NORM raakt dit niet meer
    // (die is altijd 3 × netto maandsalaris, eigenaar-besluit 29 jul 2026).
    const backfilled: EmergencyGoalCandidate = {
      ...legacy,
      metadata: { standaardDoel: EMERGENCY_STANDAARD_DOEL_KEY },
    }
    expect(isEmergencyGoal(backfilled)).toBe(true)
    expect(
      resolveEmergencyFund({
        liquidPot: 0,
        effectiveMonthlyExpenses: 3_500,
        netMonthlyIncome: 5_000,
      }).targetAmount,
    ).toBe(15_000)
  })
})

describe('score-curve anti-gaming via computeHealthScoreFromInputs', () => {
  const base = {
    savingsRate6m: 20,
    totalAssets: 100_000,
    totalDebts: 0,
    freedomPct: 25,
    currentAge: null,
    fireAgeFractional: null,
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

  it('salaris-norm (3): drie maandsalarissen → 100, anderhalf → 60', () => {
    const vol = computeHealthScoreFromInputs({ ...base, emergencyFundMonths: 3 }, true)
    expect(vol.pillars.find((p) => p.id === 'emergency_fund')!.score).toBe(100)

    const half = computeHealthScoreFromInputs({ ...base, emergencyFundMonths: 1.5 }, true)
    expect(half.pillars.find((p) => p.id === 'emergency_fund')!.score).toBe(60)
  })

  it('uitgaven-terugval (target 6) behoudt de oude curve-vorm (3 mnd → 60)', () => {
    const score = computeHealthScoreFromInputs(
      { ...base, emergencyFundMonths: 3, emergencyTargetMonths: 6 },
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
  const avgMonthlyExpenses = 1_500
  // Norm-grondslag: 11.000 / 2.000 = 5,5 maandsalarissen.
  const netMonthlySalary = 2_000

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
      netMonthlyIncome: netMonthlySalary,
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
        netMonthlySalary,
        incomeBasis: 'manual' as const,
        expensesBasis: 'manual' as const,
        // Legacy leeftijdsblind pad — de peer-relatieve fire_progress-cases
        // staan in financial-health.test.ts.
        currentAge: null,
        fireAgeFractional: null,
      },
      {
        assets,
        unlinkedCash,
        budgets: [],
        transactions: [],
        splits: [],
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
      resolveEmergencyFund({
        liquidPot,
        effectiveMonthlyExpenses: avgMonthlyExpenses,
        netMonthlyIncome: netMonthlySalary,
      }).monthsCovered * 10,
    ) / 10

    const input = buildHealthScoreInput(
      {
        savingsRate6m: 20,
        totalAssets: 116_000,
        totalDebts: 0,
        freedomPct: 20,
        avgMonthlyExpenses,
        netMonthlyIncome: 4_000,
        netMonthlySalary,
        incomeBasis: 'manual' as const,
        expensesBasis: 'manual' as const,
        // Legacy leeftijdsblind pad — de peer-relatieve fire_progress-cases
        // staan in financial-health.test.ts.
        currentAge: null,
        fireAgeFractional: null,
      },
      {
        assets,
        unlinkedCash,
        budgets: [],
        transactions: [],
        splits: [],
        householdType: 'alleenstaand',
        debtMonthlyPayments: 0,
      },
    )
    const score = computeHealthScoreFromInputs(input, false)
    const pillarRaw = score.pillars.find((p) => p.id === 'emergency_fund')!.rawValue // "5.5 × salaris"
    expect(pillarRaw).toBe(`${bundleMonths.toFixed(1)} × salaris`)
  })
})

// ── Een noodfonds-DOEL stuurt de score-norm niet meer ─────────────────────────
// Eigenaar-besluit 29 jul 2026. Deze test pint het expliciet vast, zodat een
// latere "handige" herintroductie van goal-steering meteen rood wordt.

describe('noodfonds-doel is losgekoppeld van de score-norm', () => {
  it('de norm hangt uitsluitend aan het salaris, niet aan een doelbedrag', () => {
    const zonderDoel = resolveEmergencyFund({
      liquidPot: 6_000, effectiveMonthlyExpenses: 2_000, netMonthlyIncome: 3_000,
    })
    expect(zonderDoel.targetAmount).toBe(9_000)
    expect(zonderDoel.targetMonths).toBe(TARGET_EMERGENCY_SALARY_MONTHS)
    // Een gebruiker met een €18.000-noodfondsdoel krijgt exact dezelfde norm.
    expect(emergencyGoalTarget(
      { goal_type: 'savings', target_value: 18_000, metadata: { standaardDoel: EMERGENCY_STANDAARD_DOEL_KEY } },
      2_000,
    ).targetAmount).toBe(18_000) // het doel bestaat nog steeds ...
    expect(zonderDoel.targetAmount).toBe(9_000) // ... maar stuurt de norm niet
  })
})
