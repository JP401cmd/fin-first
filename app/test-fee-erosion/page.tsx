'use client'

import { FeeErosionChart } from '@/components/app/core/fee-erosion-chart'

/**
 * Test page for the fee-erosion dramatic visualization.
 * Renders the chart with sample data to verify:
 * - Two growth lines are shown
 * - Difference in end wealth is clearly visible
 * - Difference is shown in EUR and freedom time
 * - Chart uses configurable user-specific data
 */
export default function TestFeeErosionPage() {
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-12">
      <h1 className="text-2xl font-bold text-[var(--ink)]">
        Fee-erosie visualisatie test
      </h1>

      {/* Scenario 1: Typical investor — €200k, 0.45% TER, 7% return */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          Scenario 1: Typische belegger (€200k, 0,45% TER)
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          Portfolio: €200.000 · Rendement: 7% · Huidige TER: 0,45% · Alternatief: 0,20% · Horizon: 30 jaar · Jaarlijkse inleg: €12.000
        </p>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
          <FeeErosionChart
            portfolioValue={200000}
            grossReturn={0.07}
            currentTER={0.0045}
            lowTER={0.002}
            years={30}
            annualContribution={12000}
            dailyExpenses={100}
          />
        </div>
      </section>

      {/* Scenario 2: Expensive fund — high TER */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          Scenario 2: Duur fonds (€500k, 1,5% TER)
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          Portfolio: €500.000 · Rendement: 7% · Huidige TER: 1,50% · Alternatief: 0,20% · Horizon: 30 jaar · Geen extra inleg
        </p>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
          <FeeErosionChart
            portfolioValue={500000}
            grossReturn={0.07}
            currentTER={0.015}
            lowTER={0.002}
            years={30}
            annualContribution={0}
            dailyExpenses={150}
          />
        </div>
      </section>

      {/* Scenario 3: Small difference — low TER already */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          Scenario 3: Al goedkoop (€100k, 0,22% TER)
        </h2>
        <p className="text-sm text-[var(--ink-3)]">
          Portfolio: €100.000 · Rendement: 7% · Huidige TER: 0,22% · Alternatief: 0,07% · Horizon: 20 jaar
        </p>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
          <FeeErosionChart
            portfolioValue={100000}
            grossReturn={0.07}
            currentTER={0.0022}
            lowTER={0.0007}
            years={20}
            annualContribution={6000}
            dailyExpenses={80}
          />
        </div>
      </section>
    </div>
  )
}
