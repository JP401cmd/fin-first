'use client'

import { useState, useMemo } from 'react'
import { Shield, Lock, Unlock, CheckCircle, XCircle, ChevronRight } from 'lucide-react'
import { computeFeatureAccess, isFeatureAccessible, type FeatureAccessData } from '@/lib/compute-feature-access'
import { PHASES, FEATURES, DEFAULT_MATRIX, computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { FeatureGate } from '@/components/app/feature-gate'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'

/**
 * Public test page for Feature #116: "Sovereignty level drives FeatureGate correctly"
 *
 * Tests that:
 * 1. computeSovereigntyLevel() correctly maps financial data to levels
 * 2. levelToPhaseId() correctly maps levels to phases
 * 3. computeFeatureAccess() correctly builds feature access map
 * 4. FeatureGate components show/hide/lock based on the sovereignty level
 * 5. Changing sovereignty level updates FeatureGate behavior
 */

const SCENARIOS = [
  { id: 'recovery-neg', label: 'Recovery (Level -2)', assets: 0, debts: 15000, debtType: 'credit_card', expenses: 2000, expectedLevel: -2, expectedPhase: 'recovery' },
  { id: 'recovery-neg1', label: 'Recovery (Level -1)', assets: 0, debts: 5000, debtType: 'mortgage', expenses: 2000, expectedLevel: -1, expectedPhase: 'recovery' },
  { id: 'recovery-zero', label: 'Recovery (Level 0)', assets: 500, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 0, expectedPhase: 'recovery' },
  { id: 'stability-1', label: 'Stability (Level 1)', assets: 5000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 1, expectedPhase: 'stability' },
  { id: 'stability-2', label: 'Stability (Level 2)', assets: 10000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 2, expectedPhase: 'stability' },
  { id: 'momentum-3', label: 'Momentum (Level 3)', assets: 80000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 3, expectedPhase: 'momentum' },
  { id: 'momentum-4', label: 'Momentum (Level 4)', assets: 300000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 4, expectedPhase: 'momentum' },
  { id: 'mastery-5', label: 'Mastery (Level 5)', assets: 500000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 5, expectedPhase: 'mastery' },
  { id: 'mastery-6', label: 'Mastery (Level 6)', assets: 700000, debts: 0, debtType: 'none', expenses: 2000, expectedLevel: 6, expectedPhase: 'mastery' },
]

function computeForScenario(sc: typeof SCENARIOS[0]): FeatureAccessData {
  const debts = sc.debtType !== 'none' ? [{ current_balance: sc.debts, debt_type: sc.debtType }] : []
  const assets = [{ current_value: sc.assets }]
  const transactions = [
    { amount: -sc.expenses, is_income: false },
    { amount: -sc.expenses, is_income: false },
    { amount: -sc.expenses, is_income: false },
  ]
  return computeFeatureAccess({ assets, debts, transactions, activeSubscriptions: [], userFeaturePrefs: null, matrixJson: null })
}

export default function TestSovereigntyGatingPage() {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const sc = SCENARIOS[selectedIdx]

  const featureAccess = useMemo(() => computeForScenario(sc), [sc])

  // Run all verification tests
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // Test 1: Level computation correct
  tests.push({
    name: `computeSovereigntyLevel returns level ${sc.expectedLevel}`,
    pass: featureAccess.level === sc.expectedLevel,
    detail: `Expected: ${sc.expectedLevel}, Got: ${featureAccess.level}`,
  })

  // Test 2: Phase mapping correct
  tests.push({
    name: `levelToPhaseId maps level to "${sc.expectedPhase}"`,
    pass: featureAccess.phase === sc.expectedPhase,
    detail: `Expected: ${sc.expectedPhase}, Got: ${featureAccess.phase}`,
  })

  // Test 3: Feature access map complete
  tests.push({
    name: 'Feature access map has all 19 defined features',
    pass: Object.keys(featureAccess.features).length === FEATURES.length,
    detail: `Features: ${Object.keys(featureAccess.features).length}/${FEATURES.length}`,
  })

  // Test 4: Each feature matches matrix for current phase
  const mismatches: string[] = []
  for (const feat of FEATURES) {
    const expected = DEFAULT_MATRIX[feat.id]?.[featureAccess.phase] ?? false
    const actual = isFeatureAccessible(featureAccess.features, feat.id)
    if (expected !== actual) mismatches.push(feat.id)
  }
  tests.push({
    name: `All features match matrix for "${featureAccess.phase}" phase`,
    pass: mismatches.length === 0,
    detail: mismatches.length === 0
      ? `All ${FEATURES.length} features correct`
      : `Mismatches: ${mismatches.join(', ')}`,
  })

  // Test 5: Recovery-specific checks
  if (featureAccess.phase === 'recovery') {
    const recoveryUnlocked = ['budget_optimalisatie', 'schulden_aflosplan', 'nibud_benchmark']
    const recoveryLocked = ['box3_belasting', 'asset_allocatie', 'monte_carlo', 'withdrawal_strategie']
    tests.push({
      name: 'Recovery: correct features unlocked/locked',
      pass: recoveryUnlocked.every(id => isFeatureAccessible(featureAccess.features, id)) &&
            recoveryLocked.every(id => !isFeatureAccessible(featureAccess.features, id)),
      detail: `Unlocked: ${recoveryUnlocked.filter(id => isFeatureAccessible(featureAccess.features, id)).join(', ')} | Locked: ${recoveryLocked.filter(id => !isFeatureAccessible(featureAccess.features, id)).join(', ')}`,
    })
  }

  // Test 6: Mastery-specific checks
  if (featureAccess.phase === 'mastery') {
    tests.push({
      name: 'Mastery: withdrawal_strategie unlocked',
      pass: isFeatureAccessible(featureAccess.features, 'withdrawal_strategie'),
      detail: `withdrawal_strategie: ${isFeatureAccessible(featureAccess.features, 'withdrawal_strategie')}`,
    })
  }

  // Test 7: Cross-scenario verification - run all scenarios
  const crossResults: { scenario: string; levelOk: boolean; phaseOk: boolean }[] = []
  for (const s of SCENARIOS) {
    const fa = computeForScenario(s)
    crossResults.push({
      scenario: s.label,
      levelOk: fa.level === s.expectedLevel,
      phaseOk: fa.phase === s.expectedPhase,
    })
  }
  const allCrossPass = crossResults.every(r => r.levelOk && r.phaseOk)
  tests.push({
    name: 'All 9 scenarios compute correct level and phase',
    pass: allCrossPass,
    detail: allCrossPass
      ? 'All 9 scenarios verified'
      : crossResults.filter(r => !r.levelOk || !r.phaseOk).map(r => r.scenario).join(', '),
  })

  const accessible = FEATURES.filter(f => isFeatureAccessible(featureAccess.features, f.id))
  const locked = FEATURES.filter(f => !isFeatureAccessible(featureAccess.features, f.id))
  const allPass = tests.every(t => t.pass)

  const PHASE_BG: Record<string, string> = {
    recovery: 'from-rose-600 to-rose-800',
    stability: 'from-blue-600 to-blue-800',
    momentum: 'from-teal-600 to-teal-800',
    mastery: 'from-amber-600 to-amber-800',
  }

  return (
    <FeatureAccessProvider data={featureAccess}>
      <div className="min-h-screen bg-zinc-50 pb-20">
        {/* Hero */}
        <div className={`bg-gradient-to-br ${PHASE_BG[featureAccess.phase]} px-6 py-10 text-white`}>
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Sovereignty-Driven FeatureGate Test
            </h1>
            <p className="mt-1 text-sm text-white/80">Feature #116: Verify sovereignty level drives FeatureGate correctly</p>

            <div className="mt-4 flex flex-wrap gap-3" data-testid="hero-stats">
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium" data-testid="hero-phase">
                Fase: {PHASES.find(p => p.id === featureAccess.phase)?.label}
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium" data-testid="hero-level">
                Level: {featureAccess.level}
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Vrijheid: {featureAccess.freedomPct.toFixed(1)}%
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Vermogen: EUR {featureAccess.netWorth.toLocaleString('nl-NL')}
              </div>
              <div className={`rounded-lg px-3 py-1.5 text-sm font-bold ${allPass ? 'bg-green-500/30' : 'bg-red-500/30'}`} data-testid="test-summary">
                {allPass ? '✓' : '✗'} {tests.filter(t => t.pass).length}/{tests.length} tests
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
          {/* Scenario selector */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="scenario-selector">
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Kies scenario (verandert soevereiniteitsniveau):</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedIdx(i)}
                  className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedIdx === i
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-semibold ring-2 ring-blue-200'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                  }`}
                  data-testid={`scenario-btn-${s.id}`}
                >
                  <span className="flex items-center gap-1">
                    {selectedIdx === i && <ChevronRight className="h-3 w-3" />}
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Test results */}
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="test-results">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
              <h2 className="font-semibold text-zinc-800">Verification Tests</h2>
            </div>
            <div className="p-5 space-y-2">
              {tests.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    t.pass ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}
                  data-testid={`test-${i}`}
                >
                  {t.pass ? (
                    <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs opacity-75">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live FeatureGate Demo */}
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="live-gates">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
              <h2 className="font-semibold text-zinc-800">Live FeatureGate Components</h2>
              <p className="text-xs text-zinc-500">
                Accessible: {accessible.length} | Locked: {locked.length}
              </p>
            </div>
            <div className="p-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(feat => (
                <FeatureGate key={feat.id} featureId={feat.id} fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3" data-testid={`gate-${feat.id}`}>
                    <div className="flex items-center gap-1.5">
                      <Unlock className="h-4 w-4 text-green-600" />
                      <p className="font-medium text-green-800 text-sm">{feat.label}</p>
                    </div>
                  </div>
                </FeatureGate>
              ))}
            </div>
          </div>

          {/* Summary counts */}
          <div className="grid grid-cols-2 gap-4" data-testid="summary-counts">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
              <Unlock className="mx-auto h-6 w-6 text-green-600" />
              <p className="mt-1 text-2xl font-bold text-green-700" data-testid="accessible-count">{accessible.length}</p>
              <p className="text-sm text-green-600">Toegankelijk</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <Lock className="mx-auto h-6 w-6 text-red-600" />
              <p className="mt-1 text-2xl font-bold text-red-700" data-testid="locked-count">{locked.length}</p>
              <p className="text-sm text-red-600">Vergrendeld</p>
            </div>
          </div>
        </div>
      </div>
    </FeatureAccessProvider>
  )
}
