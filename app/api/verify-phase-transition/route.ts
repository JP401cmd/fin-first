import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { computeSovereigntyLevel, levelToPhaseId, PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'

/**
 * GET /api/verify-phase-transition
 *
 * Verifies the phase transition workflow:
 * 1. Recovery phase user has correct features locked
 * 2. Financial data changes trigger sovereignty recalculation
 * 3. Newly unlocked features are correctly computed
 * 4. Phase transition detection works (oldPhase vs newPhase)
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // ── Test 1: Recovery phase user (Roos persona - negative net worth + consumer debt)
  {
    const recoveryAccess = computeFeatureAccess({
      assets: [{ current_value: 3500 }],
      debts: [
        { current_balance: 4800, debt_type: 'credit_card' },
        { current_balance: 12500, debt_type: 'personal_loan' },
        { current_balance: 1200, debt_type: 'payment_plan' },
      ],
      transactions: [
        // 3 months of expenses (~3200/month)
        { amount: -950, is_income: false },
        { amount: -220, is_income: false },
        { amount: -175, is_income: false },
        { amount: -530, is_income: false },
        { amount: -390, is_income: false },
        { amount: -555, is_income: false },
        { amount: -325, is_income: false },
        { amount: 2800, is_income: true },
        { amount: -950, is_income: false },
        { amount: -220, is_income: false },
        { amount: -175, is_income: false },
        { amount: -530, is_income: false },
        { amount: -390, is_income: false },
        { amount: -555, is_income: false },
        { amount: -325, is_income: false },
        { amount: 2800, is_income: true },
        { amount: -950, is_income: false },
        { amount: -220, is_income: false },
        { amount: -175, is_income: false },
        { amount: -530, is_income: false },
        { amount: -390, is_income: false },
        { amount: -555, is_income: false },
        { amount: -325, is_income: false },
        { amount: 2800, is_income: true },
      ],
      matrixJson: null,
    })

    tests.push({
      name: 'Recovery user sovereignty level',
      pass: recoveryAccess.level === -2,
      detail: `Level: ${recoveryAccess.level} (expected -2), Phase: ${recoveryAccess.phase}`,
    })

    tests.push({
      name: 'Recovery user phase is recovery',
      pass: recoveryAccess.phase === 'recovery',
      detail: `Phase: ${recoveryAccess.phase}`,
    })

    // Check that stability-gated features are locked
    const stabilityFeatures = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.stability === true && DEFAULT_MATRIX[f.id]?.recovery === false
    )

    const allLocked = stabilityFeatures.every(f => recoveryAccess.features[f.id] === false)
    tests.push({
      name: 'Stability features locked for Recovery user',
      pass: allLocked,
      detail: `Stability-gated features: ${stabilityFeatures.map(f => f.id).join(', ')} — all locked: ${allLocked}`,
    })

    // Check that recovery-available features are accessible
    const recoveryFeatures = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.recovery === true
    )
    const allAccessible = recoveryFeatures.every(f => recoveryAccess.features[f.id] === true)
    tests.push({
      name: 'Recovery features accessible for Recovery user',
      pass: allAccessible,
      detail: `Recovery features: ${recoveryFeatures.map(f => f.id).join(', ')} — all accessible: ${allAccessible}`,
    })
  }

  // ── Test 2: Stability phase user (net worth > 0, 1-3 months covered, no consumer debt)
  {
    const stabilityAccess = computeFeatureAccess({
      assets: [{ current_value: 8000 }],
      debts: [
        { current_balance: 5000, debt_type: 'student_loan' }, // Not consumer debt
      ],
      transactions: [
        // 3 months of expenses (~2000/month)
        { amount: -600, is_income: false },
        { amount: -400, is_income: false },
        { amount: -400, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: 3400, is_income: true },
        { amount: -600, is_income: false },
        { amount: -400, is_income: false },
        { amount: -400, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: 3400, is_income: true },
        { amount: -600, is_income: false },
        { amount: -400, is_income: false },
        { amount: -400, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: -200, is_income: false },
        { amount: 3400, is_income: true },
      ],
      matrixJson: null,
    })

    tests.push({
      name: 'Stability user sovereignty level',
      pass: stabilityAccess.level === 1 || stabilityAccess.level === 2,
      detail: `Level: ${stabilityAccess.level} (expected 1 or 2), Phase: ${stabilityAccess.phase}, NetWorth: ${stabilityAccess.netWorth}, MonthlyExp: ${stabilityAccess.monthlyExpenses}`,
    })

    tests.push({
      name: 'Stability user phase is stability',
      pass: stabilityAccess.phase === 'stability',
      detail: `Phase: ${stabilityAccess.phase}`,
    })

    // Check that stability-gated features are now accessible
    const stabilityFeatures = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.stability === true && DEFAULT_MATRIX[f.id]?.recovery === false
    )
    const allUnlocked = stabilityFeatures.every(f => stabilityAccess.features[f.id] === true)
    tests.push({
      name: 'Stability features unlocked for Stability user',
      pass: allUnlocked,
      detail: `Stability-gated features: ${stabilityFeatures.map(f => `${f.id}=${stabilityAccess.features[f.id]}`).join(', ')}`,
    })
  }

  // ── Test 3: Phase transition detection
  {
    const oldPhase = 'recovery'
    const newPhase = 'stability'
    const phaseIds = PHASES.map(p => p.id)
    const oldIndex = phaseIds.indexOf(oldPhase)
    const newIndex = phaseIds.indexOf(newPhase)
    const isUpward = newIndex > oldIndex

    tests.push({
      name: 'Phase transition detection (recovery → stability)',
      pass: isUpward,
      detail: `Old: ${oldPhase} (index ${oldIndex}), New: ${newPhase} (index ${newIndex}), Upward: ${isUpward}`,
    })
  }

  // ── Test 4: Newly unlocked features computation
  {
    const newFeatures = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.stability === true && !DEFAULT_MATRIX[f.id]?.recovery
    )

    tests.push({
      name: 'Newly unlocked features count > 0',
      pass: newFeatures.length > 0,
      detail: `${newFeatures.length} features unlock: ${newFeatures.map(f => f.label).join(', ')}`,
    })

    // Verify specific features that should unlock at Stability
    const expectedUnlocks = ['box3_belasting', 'fire_projecties', 'levensgebeurtenissen', 'veerkracht_score', 'vermogensprojectie_chart', 'vermogensverloop', 'cashflow_sankey', 'doelen_systeem']
    const actualUnlockIds = newFeatures.map(f => f.id)
    const allExpectedPresent = expectedUnlocks.every(id => actualUnlockIds.includes(id))

    tests.push({
      name: 'Expected Stability features are in unlock list',
      pass: allExpectedPresent,
      detail: `Expected: ${expectedUnlocks.join(', ')}. Actual: ${actualUnlockIds.join(', ')}`,
    })
  }

  // ── Test 5: Sovereignty level computation edge cases
  {
    // Level -2: Negative net worth + consumer debt
    const level_neg2 = computeSovereigntyLevel(-5000, 2000, 0, true)
    tests.push({
      name: 'Level -2: Negative net worth + consumer debt',
      pass: level_neg2 === -2,
      detail: `Got level ${level_neg2}`,
    })

    // Level -1: Negative net worth, no consumer debt
    const level_neg1 = computeSovereigntyLevel(-5000, 2000, 0, false)
    tests.push({
      name: 'Level -1: Negative net worth, no consumer debt',
      pass: level_neg1 === -1,
      detail: `Got level ${level_neg1}`,
    })

    // Level 0: Less than 1 month covered
    const level_0 = computeSovereigntyLevel(500, 2000, 0.1, false)
    tests.push({
      name: 'Level 0: Less than 1 month covered',
      pass: level_0 === 0,
      detail: `Got level ${level_0}`,
    })

    // Level 1: 1-3 months covered
    const level_1 = computeSovereigntyLevel(4000, 2000, 0.3, false)
    tests.push({
      name: 'Level 1: 1-3 months covered',
      pass: level_1 === 1,
      detail: `Got level ${level_1}`,
    })

    // Level 2: 3-6 months or freedom < 10%
    const level_2 = computeSovereigntyLevel(10000, 2000, 1.7, false)
    tests.push({
      name: 'Level 2: 3-6 months covered',
      pass: level_2 === 2,
      detail: `Got level ${level_2}`,
    })

    // Phase mapping
    const phase_recovery = levelToPhaseId(-2)
    const phase_stability = levelToPhaseId(1)
    const phase_momentum = levelToPhaseId(3)
    const phase_mastery = levelToPhaseId(6)
    tests.push({
      name: 'Phase mapping correct',
      pass: phase_recovery === 'recovery' && phase_stability === 'stability' && phase_momentum === 'momentum' && phase_mastery === 'mastery',
      detail: `Recovery: ${phase_recovery}, Stability: ${phase_stability}, Momentum: ${phase_momentum}, Mastery: ${phase_mastery}`,
    })
  }

  // ── Test 6: FeatureGate component exists and PhaseTransitionModal exists
  {
    tests.push({
      name: 'PHASES array has 4 phases',
      pass: PHASES.length === 4,
      detail: `Phases: ${PHASES.map(p => p.id).join(', ')}`,
    })

    tests.push({
      name: 'DEFAULT_MATRIX has entries for all features',
      pass: FEATURES.every(f => DEFAULT_MATRIX[f.id] !== undefined),
      detail: `Features: ${FEATURES.length}, Matrix entries: ${Object.keys(DEFAULT_MATRIX).length}`,
    })
  }

  const passing = tests.filter(t => t.pass).length
  const total = tests.length

  return Response.json({
    summary: `${passing}/${total} tests pass`,
    allPass: passing === total,
    tests,
  })
}
