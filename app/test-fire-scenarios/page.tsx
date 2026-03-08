'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeFireProjection, computeFireRange, computeScenarios, projectForward,
  type FinancialInput, type FireProjection, type FireRange, type ScenarioPath,
  type MarketWeather,
} from '@/lib/horizon-data'
import {
  simulatePayoff, payoffSummary,
  type Debt, type PayoffStrategy,
} from '@/lib/debt-data'
import { ScenariosModal } from '@/components/app/horizon/scenarios-modal'
import { ProjectionsModal } from '@/components/app/horizon/projections-modal'

/**
 * Test page for Feature #94: FIRE scenario comparison workflow.
 * Tests all verification steps:
 * 1. View default FIRE projection
 * 2. Adjust parameters (savings rate, target)
 * 3. Verify projection updates
 * 4. Compare snowball vs avalanche strategy
 * 5. Verify visual differences in projections
 */

// Test fixture data — deterministic inputs for FIRE calculations
const FIXTURE_INPUT: FinancialInput = {
  totalAssets: 180000,
  totalDebts: 45000,
  monthlyIncome: 5200,
  monthlyExpenses: 3100,
  monthlyContributions: 800,
  yearlyMustExpenses: 24000,
  dateOfBirth: '1990-03-15',
}

// Key design: smallest balance (Autolening €2800) has LOW rate (5.5%)
// while largest non-student debt (Doorlopend krediet €8500) has HIGH rate (12%).
// This forces snowball and avalanche to differ:
// - Snowball: Autolening first (smallest), then Persoonlijke lening, then Doorlopend krediet
// - Avalanche: Doorlopend krediet first (highest rate), then Persoonlijke lening, then Autolening
const FIXTURE_DEBTS: Debt[] = [
  {
    id: 'debt-1',
    user_id: 'test-user',
    name: 'Doorlopend krediet',
    debt_type: 'revolving_credit',
    original_amount: 10000,
    current_balance: 8500,
    interest_rate: 12.0,
    minimum_payment: 200,
    monthly_payment: 250,
    start_date: '2023-01-01',
    end_date: null,
    creditor: 'ABN AMRO',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2023-01-01',
    updated_at: '2024-01-01',
    subtype: 'doorlopend_krediet',
    is_tax_deductible: false,
    fixed_rate_end_date: null,
    nhg: false,
    linked_asset_id: null,
    credit_limit: 10000,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
  },
  {
    id: 'debt-2',
    user_id: 'test-user',
    name: 'Autolening',
    debt_type: 'car_loan',
    original_amount: 8000,
    current_balance: 2800,
    interest_rate: 5.5,
    minimum_payment: 120,
    monthly_payment: 180,
    start_date: '2022-06-01',
    end_date: '2027-06-01',
    creditor: 'ING',
    notes: null,
    is_active: true,
    sort_order: 1,
    created_at: '2022-06-01',
    updated_at: '2024-01-01',
    subtype: null,
    is_tax_deductible: false,
    fixed_rate_end_date: null,
    nhg: false,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
  },
  {
    id: 'debt-3',
    user_id: 'test-user',
    name: 'Persoonlijke lening',
    debt_type: 'personal_loan',
    original_amount: 15000,
    current_balance: 11000,
    interest_rate: 7.9,
    minimum_payment: 200,
    monthly_payment: 280,
    start_date: '2024-01-01',
    end_date: '2028-12-31',
    creditor: 'Rabobank',
    notes: null,
    is_active: true,
    sort_order: 2,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    subtype: 'aflopend',
    is_tax_deductible: false,
    fixed_rate_end_date: null,
    nhg: false,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
  },
]

type TestResult = {
  name: string
  passed: boolean
  details: string
}

export default function TestFireScenariosPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [showProjections, setShowProjections] = useState(false)
  const [showScenarios, setShowScenarios] = useState(false)
  const [adjustedInput, setAdjustedInput] = useState(FIXTURE_INPUT)

  useEffect(() => {
    runTests()
  }, [])

  function runTests() {
    const testResults: TestResult[] = []

    // Test 1: Default FIRE projection computes correctly
    const fire = computeFireProjection(FIXTURE_INPUT)
    testResults.push({
      name: '1. View default FIRE projection',
      passed: fire.fireAge !== null && fire.fireTarget > 0 && fire.freedomPercentage > 0,
      details: `FIRE age: ${fire.fireAge !== null ? Math.round(fire.fireAge) : 'null'}, ` +
        `Target: ${formatCurrency(fire.fireTarget)}, ` +
        `Freedom: ${fire.freedomPercentage.toFixed(1)}%, ` +
        `Net worth: ${formatCurrency(fire.netWorth)}, ` +
        `Savings rate: ${fire.savingsRate.toFixed(1)}%`,
    })

    // Test 2: Range projection (optimistic/pessimistic)
    const range = computeFireRange(FIXTURE_INPUT)
    testResults.push({
      name: '2. FIRE range (optimistic/pessimistic)',
      passed: range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null &&
        range.optimistic.fireAge < range.expected.fireAge! &&
        range.pessimistic.fireAge > range.expected.fireAge!,
      details: `Optimistic: ${range.optimistic.fireAge !== null ? Math.round(range.optimistic.fireAge) : '-'}, ` +
        `Expected: ${range.expected.fireAge !== null ? Math.round(range.expected.fireAge) : '-'}, ` +
        `Pessimistic: ${range.pessimistic.fireAge !== null ? Math.round(range.pessimistic.fireAge) : '-'}`,
    })

    // Test 3: Adjust parameters → projection updates
    const adjustedIncome = { ...FIXTURE_INPUT, monthlyIncome: 6200 } // +1000/month
    const adjustedFire = computeFireProjection(adjustedIncome)
    const originalFire = fire
    testResults.push({
      name: '3. Adjusted savings rate updates projection',
      passed: adjustedFire.fireAge !== null && originalFire.fireAge !== null &&
        adjustedFire.fireAge < originalFire.fireAge,
      details: `Original FIRE age: ${originalFire.fireAge !== null ? Math.round(originalFire.fireAge) : '-'}, ` +
        `After +€1000/mnd income: ${adjustedFire.fireAge !== null ? Math.round(adjustedFire.fireAge) : '-'} ` +
        `(${originalFire.fireAge !== null && adjustedFire.fireAge !== null ? Math.round(originalFire.fireAge - adjustedFire.fireAge) + ' jaar eerder' : ''})`,
    })

    // Test 4: Three scenarios compute with different outcomes
    const scenarios = computeScenarios(FIXTURE_INPUT, 40)
    const drifter = scenarios.find(s => s.name === 'drifter')
    const current = scenarios.find(s => s.name === 'current')
    const optimizer = scenarios.find(s => s.name === 'optimizer')
    testResults.push({
      name: '4. Three scenario paths (drifter/current/optimizer)',
      passed: scenarios.length === 3 &&
        drifter !== undefined && current !== undefined && optimizer !== undefined &&
        (optimizer?.fireAge === null || current?.fireAge === null || optimizer.fireAge <= current.fireAge),
      details: `Drifter: ${drifter?.fireAge !== null ? Math.round(drifter!.fireAge!) + 'j' : 'nooit'}, ` +
        `Current: ${current?.fireAge !== null ? Math.round(current!.fireAge!) + 'j' : 'nooit'}, ` +
        `Optimizer: ${optimizer?.fireAge !== null ? Math.round(optimizer!.fireAge!) + 'j' : 'nooit'}`,
    })

    // Test 5: Market weather affects scenarios
    const normalScenarios = computeScenarios(FIXTURE_INPUT, 40, 'normal')
    const bearScenarios = computeScenarios(FIXTURE_INPUT, 40, 'bear')
    const normalCurrent = normalScenarios.find(s => s.name === 'current')
    const bearCurrent = bearScenarios.find(s => s.name === 'current')
    const normalEndNw = normalCurrent?.months[normalCurrent.months.length - 1]?.netWorth ?? 0
    const bearEndNw = bearCurrent?.months[bearCurrent.months.length - 1]?.netWorth ?? 0
    testResults.push({
      name: '5. Market weather affects scenario outcomes',
      passed: normalEndNw !== bearEndNw && normalEndNw > bearEndNw,
      details: `Normal 40yr net worth: ${formatCurrency(normalEndNw)}, ` +
        `Bear 40yr net worth: ${formatCurrency(bearEndNw)}, ` +
        `Difference: ${formatCurrency(normalEndNw - bearEndNw)}`,
    })

    // Test 6: Snowball vs Avalanche comparison
    const snowballMonths = simulatePayoff(FIXTURE_DEBTS, 'snowball', 100)
    const avalancheMonths = simulatePayoff(FIXTURE_DEBTS, 'avalanche', 100)
    const snowballSum = payoffSummary(snowballMonths)
    const avalancheSum = payoffSummary(avalancheMonths)
    testResults.push({
      name: '6. Snowball vs Avalanche strategy comparison',
      passed: snowballMonths.length > 0 && avalancheMonths.length > 0 &&
        snowballSum.totalInterest !== avalancheSum.totalInterest,
      details: `Snowball: ${snowballSum.totalMonths} mnd, rente ${formatCurrency(snowballSum.totalInterest)} | ` +
        `Avalanche: ${avalancheSum.totalMonths} mnd, rente ${formatCurrency(avalancheSum.totalInterest)} | ` +
        `Verschil: ${formatCurrency(Math.abs(snowballSum.totalInterest - avalancheSum.totalInterest))} rente, ` +
        `${Math.abs(snowballSum.totalMonths - avalancheSum.totalMonths)} maanden`,
    })

    // Test 7: Snowball targets smallest balance first
    // With fixture data: Autolening (€2800, 5.5%) is smallest balance — snowball targets first
    // Avalanche targets Doorlopend krediet (€8500, 12%) first — so Autolening pays off later in avalanche
    const autoSnowballPayoff = snowballMonths.find(m =>
      m.debts.some(d => d.balance <= 0.01 && d.id === 'debt-2')
    )
    const autoAvalanchePayoff = avalancheMonths.find(m =>
      m.debts.some(d => d.balance <= 0.01 && d.id === 'debt-2')
    )
    testResults.push({
      name: '7. Snowball targets smallest balance first (Autolening)',
      passed: autoSnowballPayoff !== undefined && autoAvalanchePayoff !== undefined &&
        autoSnowballPayoff.month < autoAvalanchePayoff.month,
      details: `Autolening (€2.800, 5.5%): Snowball payoff month ${autoSnowballPayoff?.month ?? '?'}, ` +
        `Avalanche payoff month ${autoAvalanchePayoff?.month ?? '?'} ` +
        `(Snowball pays smallest balance sooner)`,
    })

    // Test 8: Avalanche minimizes total interest
    testResults.push({
      name: '8. Avalanche minimizes total interest paid',
      passed: avalancheSum.totalInterest <= snowballSum.totalInterest,
      details: `Avalanche interest: ${formatCurrency(avalancheSum.totalInterest)}, ` +
        `Snowball interest: ${formatCurrency(snowballSum.totalInterest)}, ` +
        `Saved: ${formatCurrency(snowballSum.totalInterest - avalancheSum.totalInterest)}`,
    })

    // Test 9: Visual differences in projections (chart data points differ)
    const projForward = projectForward(FIXTURE_INPUT, 360)
    const adjustedProj = projectForward(adjustedIncome, 360)
    const midpoint = Math.floor(projForward.length / 2)
    testResults.push({
      name: '9. Visual differences in projection data',
      passed: projForward.length > 0 && adjustedProj.length > 0 &&
        projForward[midpoint].netWorth !== adjustedProj[midpoint].netWorth,
      details: `Original midpoint NW: ${formatCurrency(projForward[midpoint].netWorth)}, ` +
        `Adjusted midpoint NW: ${formatCurrency(adjustedProj[midpoint].netWorth)}, ` +
        `Difference: ${formatCurrency(adjustedProj[midpoint].netWorth - projForward[midpoint].netWorth)}`,
    })

    // Test 10: Current payoff vs optimized payoff
    const currentMonths = simulatePayoff(FIXTURE_DEBTS, 'current', 0)
    const currentSum = payoffSummary(currentMonths)
    testResults.push({
      name: '10. Optimized strategy beats current payoff',
      passed: currentSum.totalMonths > avalancheSum.totalMonths ||
        currentSum.totalInterest > avalancheSum.totalInterest,
      details: `Current: ${currentSum.totalMonths} mnd / ${formatCurrency(currentSum.totalInterest)} rente | ` +
        `Avalanche (+€100/mnd): ${avalancheSum.totalMonths} mnd / ${formatCurrency(avalancheSum.totalInterest)} rente`,
    })

    setResults(testResults)
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900">FIRE Scenario Comparison — Feature #94</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Test verifies: FIRE projections, parameter adjustments, scenario comparison,
        snowball vs avalanche strategies, and visual projection differences.
      </p>

      {/* Summary */}
      <div className={`mt-6 rounded-xl border p-4 ${passing === total ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`text-lg font-bold ${passing === total ? 'text-emerald-700' : 'text-amber-700'}`}>
          {passing}/{total} tests passing
        </p>
      </div>

      {/* Test results */}
      <div className="mt-6 space-y-3">
        {results.map((r, i) => (
          <div key={i} className={`rounded-xl border p-4 ${r.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-lg ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.passed ? '✓' : '✗'}
              </span>
              <p className="font-medium text-zinc-900">{r.name}</p>
            </div>
            <p className="mt-1 text-xs text-zinc-600">{r.details}</p>
          </div>
        ))}
      </div>

      {/* Interactive demo buttons */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-800">Interactieve demo</h2>

        {/* Parameter adjustment */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-zinc-700">Parameters aanpassen</h3>
          <p className="mt-1 text-xs text-zinc-500">Pas inkomen aan en zie het effect op FIRE</p>

          <div className="mt-4">
            <label className="text-xs font-medium text-zinc-500">
              Maandelijks inkomen: {formatCurrency(adjustedInput.monthlyIncome)}
            </label>
            <input
              type="range"
              min={2000}
              max={10000}
              step={100}
              value={adjustedInput.monthlyIncome}
              onChange={e => setAdjustedInput(prev => ({ ...prev, monthlyIncome: Number(e.target.value) }))}
              className="mt-2 w-full accent-purple-600"
            />
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-zinc-500">
              Maandelijkse uitgaven: {formatCurrency(adjustedInput.monthlyExpenses)}
            </label>
            <input
              type="range"
              min={1500}
              max={6000}
              step={100}
              value={adjustedInput.monthlyExpenses}
              onChange={e => setAdjustedInput(prev => ({ ...prev, monthlyExpenses: Number(e.target.value) }))}
              className="mt-2 w-full accent-purple-600"
            />
          </div>

          {(() => {
            const adjusted = computeFireProjection(adjustedInput)
            return (
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-purple-50 p-3 text-center">
                  <p className="text-xs text-purple-600">FIRE Leeftijd</p>
                  <p className="text-2xl font-bold text-zinc-900">
                    {adjusted.fireAge !== null ? Math.round(adjusted.fireAge) : '-'}
                  </p>
                </div>
                <div className="rounded-lg bg-purple-50 p-3 text-center">
                  <p className="text-xs text-purple-600">Spaarquote</p>
                  <p className="text-2xl font-bold text-zinc-900">{adjusted.savingsRate.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg bg-purple-50 p-3 text-center">
                  <p className="text-xs text-purple-600">FIRE Doel</p>
                  <p className="text-2xl font-bold text-zinc-900">{formatCurrency(adjusted.fireTarget)}</p>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Modal buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => setShowProjections(true)}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Open FIRE Projecties
          </button>
          <button
            onClick={() => setShowScenarios(true)}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Open Scenarios (met Snowball/Avalanche)
          </button>
        </div>
      </div>

      {/* Modals */}
      <ProjectionsModal
        input={adjustedInput}
        open={showProjections}
        onClose={() => setShowProjections(false)}
      />
      <ScenariosModal
        input={adjustedInput}
        debts={FIXTURE_DEBTS}
        open={showScenarios}
        onClose={() => setShowScenarios(false)}
      />
    </div>
  )
}
