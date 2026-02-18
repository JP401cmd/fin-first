'use client'

import { useState, useEffect } from 'react'
import {
  CostSplitCalculator,
  PartnerContributionSummary,
  SharedBudgetSplitList,
  SharedDebtSplitList,
  calculateCostSplit,
  calculateAllModes,
} from '@/components/app/cost-split-calculator'
import type { SplitMode } from '@/lib/household-data'

interface TestResult {
  name: string
  step: number
  passed: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: {
    coreSteps: string
    bonusTests: string
    total: string
    allCorePassing: boolean
    allPassing: boolean
  }
  results: TestResult[]
}

// ── Demo Data ────────────────────────────────────────────────────

const DEMO_USER_ID = 'user-001'
const DEMO_PARTNER_ID = 'partner-002'
const DEMO_USER_NAME = 'Jan'
const DEMO_PARTNER_NAME = 'Lisa'
const DEMO_MY_INCOME = 4500
const DEMO_PARTNER_INCOME = 3000
const DEMO_TOTAL_EXPENSE = 2400

const DEMO_BUDGETS = [
  { id: 'b1', name: 'Boodschappen', totalAmount: 600, ownership: 'shared' as const },
  { id: 'b2', name: 'Huur / Hypotheek', totalAmount: 1200, ownership: 'shared' as const },
  { id: 'b3', name: 'Energie', totalAmount: 200, ownership: 'shared' as const },
  { id: 'b4', name: 'Persoonlijk budget', totalAmount: 300, ownership: 'personal' as const },
]

const DEMO_DEBTS = [
  { id: 'd1', name: 'Hypotheek', currentBalance: 280000, monthlyPayment: 1100, ownership: 'shared' as const },
  { id: 'd2', name: 'Studielening', currentBalance: 12000, monthlyPayment: 200, ownership: 'personal' as const },
  { id: 'd3', name: 'Autolening', currentBalance: 8000, monthlyPayment: 350, ownership: 'shared' as const },
]

export default function TestCostSplittingPage() {
  const [verifyResults, setVerifyResults] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeMode, setActiveMode] = useState<SplitMode>('equal')
  const [customPct, setCustomPct] = useState(60)

  // Fetch verification results
  useEffect(() => {
    fetch('/api/verify-cost-splitting')
      .then(r => r.json())
      .then(data => {
        setVerifyResults(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Calculate results for all 4 modes
  const allModeResults = calculateAllModes(
    DEMO_TOTAL_EXPENSE,
    DEMO_USER_ID, DEMO_PARTNER_ID,
    DEMO_MY_INCOME, DEMO_PARTNER_INCOME,
    customPct, DEMO_USER_ID,
    DEMO_USER_NAME, DEMO_PARTNER_NAME,
  )

  // Active mode result for displays
  const activeResult = calculateCostSplit(
    DEMO_TOTAL_EXPENSE,
    activeMode,
    DEMO_USER_ID, DEMO_PARTNER_ID,
    DEMO_MY_INCOME, DEMO_PARTNER_INCOME,
    activeMode === 'custom' ? customPct : null,
    DEMO_USER_ID,
    DEMO_USER_NAME, DEMO_PARTNER_NAME,
  )

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-6 text-white shadow-lg">
          <h1 className="text-2xl font-bold">Feature #256: Cost Splitting Calculation Modes</h1>
          <p className="mt-1 text-teal-200">
            Household cost splitting: 50/50, income-ratio, custom %, one-pays-all
          </p>
        </div>

        {/* Verification Results */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-800 mb-4">Verificatie Resultaten</h2>
          {loading ? (
            <p className="text-zinc-500">Laden...</p>
          ) : verifyResults ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`rounded-lg p-4 ${
                verifyResults.summary.allPassing ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">
                      {verifyResults.summary.allPassing ? '✅ Alle tests geslaagd!' : '⚠️ Sommige tests falen'}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Core: {verifyResults.summary.coreSteps} | Bonus: {verifyResults.summary.bonusTests} | Totaal: {verifyResults.summary.total}
                    </p>
                  </div>
                  <span className={`text-2xl font-bold ${
                    verifyResults.summary.allPassing ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {verifyResults.summary.total}
                  </span>
                </div>
              </div>

              {/* Individual results */}
              <div className="space-y-2">
                {verifyResults.results.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border px-4 py-3 ${
                      r.passed
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                    data-testid={`test-result-step${r.step}`}
                    data-passed={r.passed ? 'true' : 'false'}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{r.passed ? '✅' : '❌'}</span>
                      <span className="text-sm font-medium text-zinc-800">{r.name}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 ml-6">{r.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-red-500">Fout bij laden verificatie</p>
          )}
        </section>

        {/* ─── Live Demos ──────────────────────────────────────── */}

        <h2 className="text-lg font-bold text-zinc-800">Live Component Demos</h2>

        {/* Demo: All 4 Modes Comparison */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            4 Verdelingsmodi Vergelijking (€{DEMO_TOTAL_EXPENSE.toLocaleString('nl-NL')})
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Jan inkomen: €{DEMO_MY_INCOME.toLocaleString('nl-NL')}/mnd | Lisa inkomen: €{DEMO_PARTNER_INCOME.toLocaleString('nl-NL')}/mnd
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allModeResults.map((result) => (
              <div
                key={result.mode}
                className="rounded-lg border border-zinc-200 p-4"
                data-testid={`mode-result-${result.mode}`}
              >
                <p className="text-sm font-bold text-zinc-800 mb-2">
                  {result.label}
                </p>
                <p className="text-[10px] text-zinc-400 mb-3">{result.description}</p>
                {result.partners.map(p => (
                  <div key={p.userId} className="flex justify-between text-xs py-1 border-b border-zinc-100 last:border-0">
                    <span className="text-zinc-600">{p.isCurrentUser ? 'Jan (Jij)' : 'Lisa'}</span>
                    <span className="font-medium text-zinc-800 tabular-nums">
                      {p.sharePct}% = €{p.shareAmount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Demo: Interactive CostSplitCalculator (Full Mode) */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            Interactieve CostSplitCalculator (Full Mode)
          </h3>
          <CostSplitCalculator
            totalAmount={DEMO_TOTAL_EXPENSE}
            splitMode={activeMode}
            customSplitPct={customPct}
            primaryPayerId={DEMO_USER_ID}
            userId={DEMO_USER_ID}
            userName={DEMO_USER_NAME}
            partnerId={DEMO_PARTNER_ID}
            partnerName={DEMO_PARTNER_NAME}
            myIncome={DEMO_MY_INCOME}
            partnerIncome={DEMO_PARTNER_INCOME}
            itemLabel="Gedeelde maandkosten"
            showModeSelector
            onModeChange={(mode, pct) => {
              setActiveMode(mode)
              if (pct !== undefined) setCustomPct(pct)
            }}
          />
        </section>

        {/* Demo: CostSplitCalculator (Compact Mode) */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            CostSplitCalculator (Compact Mode)
          </h3>
          <CostSplitCalculator
            totalAmount={DEMO_TOTAL_EXPENSE}
            splitMode={activeMode}
            customSplitPct={customPct}
            primaryPayerId={DEMO_USER_ID}
            userId={DEMO_USER_ID}
            userName={DEMO_USER_NAME}
            partnerId={DEMO_PARTNER_ID}
            partnerName={DEMO_PARTNER_NAME}
            myIncome={DEMO_MY_INCOME}
            partnerIncome={DEMO_PARTNER_INCOME}
            compact
          />
        </section>

        {/* Demo: PartnerContributionSummary */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            PartnerContributionSummary
          </h3>
          <PartnerContributionSummary
            result={activeResult}
            itemLabel="Gedeelde maandkosten"
          />
        </section>

        {/* Demo: SharedBudgetSplitList */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            SharedBudgetSplitList
          </h3>
          <SharedBudgetSplitList
            budgets={DEMO_BUDGETS}
            splitResult={activeResult}
          />
        </section>

        {/* Demo: SharedDebtSplitList */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-700 mb-4">
            SharedDebtSplitList
          </h3>
          <SharedDebtSplitList
            debts={DEMO_DEBTS}
            splitResult={activeResult}
          />
        </section>

      </div>
    </div>
  )
}
