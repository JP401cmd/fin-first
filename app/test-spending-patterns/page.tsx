'use client'

import { useState, useEffect } from 'react'
import { SpendingInsightsSection, SpendingInsightCard } from '@/components/app/spending-insight-card'
import type { SpendingInsight } from '@/lib/spending-patterns'

// Demo data for visual testing
const DEMO_INSIGHTS: SpendingInsight[] = [
  {
    id: 'pattern-seasonal_high-boodschappen',
    pattern: {
      type: 'seasonal_high',
      category: 'Boodschappen',
      categoryIcon: 'shopping-cart',
      description: 'Je geeft in december gemiddeld 30% meer uit aan boodschappen',
      confidence: 'high',
      monthsAffected: ['december'],
      percentageChange: 30,
      averageAmount: 450,
      peakAmount: 585,
      impactDays: 2.7,
    },
    title: 'Seizoenspatroon: Boodschappen',
    description: 'Je geeft in december gemiddeld 30% meer uit aan boodschappen',
    icon: 'calendar',
    severity: 'info',
  },
  {
    id: 'pattern-rising_trend-vervoer',
    pattern: {
      type: 'rising_trend',
      category: 'Vervoer',
      categoryIcon: 'car',
      description: 'Je uitgaven aan vervoer stijgen gemiddeld €25 per maand',
      confidence: 'medium',
      percentageChange: 8,
      averageAmount: 310,
      impactDays: 6.0,
    },
    title: 'Stijgende trend: Vervoer',
    description: 'Je uitgaven aan vervoer stijgen gemiddeld €25 per maand',
    icon: 'trending-up',
    severity: 'warning',
  },
  {
    id: 'pattern-anomaly_high-kleding',
    pattern: {
      type: 'anomaly_high',
      category: 'Kleding',
      categoryIcon: 'shirt',
      description: 'Je geeft deze maand 65% meer uit aan kleding dan gemiddeld',
      confidence: 'high',
      percentageChange: 65,
      averageAmount: 120,
      peakAmount: 198,
      impactDays: 1.6,
    },
    title: 'Opvallend hoog: Kleding',
    description: 'Je geeft deze maand 65% meer uit aan kleding dan gemiddeld',
    icon: 'alert-triangle',
    severity: 'warning',
  },
  {
    id: 'pattern-falling_trend-uit-eten',
    pattern: {
      type: 'falling_trend',
      category: 'Uit eten',
      categoryIcon: 'utensils',
      description: 'Je uitgaven aan uit eten dalen gemiddeld €15 per maand — goed bezig!',
      confidence: 'high',
      percentageChange: -6,
      averageAmount: 250,
      impactDays: 3.6,
    },
    title: 'Dalende trend: Uit eten',
    description: 'Je uitgaven aan uit eten dalen gemiddeld €15 per maand — goed bezig!',
    icon: 'trending-down',
    severity: 'positive',
  },
  {
    id: 'pattern-anomaly_low-entertainment',
    pattern: {
      type: 'anomaly_low',
      category: 'Entertainment',
      categoryIcon: 'music',
      description: 'Je geeft deze maand 52% minder uit aan entertainment dan gemiddeld — goed bezig!',
      confidence: 'high',
      percentageChange: -52,
      averageAmount: 180,
      peakAmount: 86,
      impactDays: 1.9,
    },
    title: 'Opvallend laag: Entertainment',
    description: 'Je geeft deze maand 52% minder uit aan entertainment dan gemiddeld — goed bezig!',
    icon: 'check-circle',
    severity: 'positive',
  },
]

export default function TestSpendingPatternsPage() {
  const [verifyResults, setVerifyResults] = useState<{ total: number; passing: number; results: { name: string; passed: boolean; detail?: string }[] } | null>(null)
  const [apiResults, setApiResults] = useState<{ insights: SpendingInsight[]; hasData: boolean; dataMonths: number; message: string } | null>(null)

  useEffect(() => {
    fetch('/api/verify-spending-patterns')
      .then(r => r.json())
      .then(setVerifyResults)
      .catch(() => {})

    fetch('/api/spending-patterns')
      .then(r => r.json())
      .then(setApiResults)
      .catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-8" data-testid="test-spending-patterns-page">
      <h1 className="mb-2 text-2xl font-bold">Spending Patterns Test Page</h1>
      <p className="mb-8 text-zinc-500">Feature #226: AI-powered spending pattern predictions</p>

      {/* Verification Results */}
      <section className="mb-10" data-testid="verification-section">
        <h2 className="mb-4 text-lg font-semibold">Verification Tests</h2>
        {verifyResults ? (
          <div>
            <div className={`mb-4 rounded-lg p-3 text-sm font-medium ${
              verifyResults.passing === verifyResults.total
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {verifyResults.passing}/{verifyResults.total} tests passing
            </div>
            <div className="space-y-1">
              {verifyResults.results.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${r.passed ? 'text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  <span>{r.passed ? '✓' : '✗'}</span>
                  <span>{r.name}</span>
                  {r.detail && <span className="text-xs text-red-400 ml-2">{r.detail}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-pulse rounded-lg bg-zinc-100 p-4">Loading...</div>
        )}
      </section>

      {/* API Results (live data) */}
      <section className="mb-10" data-testid="api-results-section">
        <h2 className="mb-4 text-lg font-semibold">Live API Results (/api/spending-patterns)</h2>
        {apiResults ? (
          <div>
            <div className="mb-3 text-sm text-zinc-500">
              hasData: {String(apiResults.hasData)} | dataMonths: {apiResults.dataMonths} | insights: {apiResults.insights?.length ?? 0}
            </div>
            {apiResults.insights && apiResults.insights.length > 0 ? (
              <SpendingInsightsSection
                insights={apiResults.insights}
                dataMonths={apiResults.dataMonths}
                message={apiResults.message}
              />
            ) : (
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500">
                {apiResults.message || 'No insights from live API (expected if no authenticated user or insufficient data)'}
              </div>
            )}
          </div>
        ) : (
          <div className="animate-pulse rounded-lg bg-zinc-100 p-4">Loading API...</div>
        )}
      </section>

      {/* Demo Scenarios */}
      <section className="mb-10" data-testid="demo-section">
        <h2 className="mb-4 text-lg font-semibold">Demo: Full Insights Section</h2>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <SpendingInsightsSection
            insights={DEMO_INSIGHTS}
            dataMonths={18}
            message="18 maanden geanalyseerd — seizoenspatronen gedetecteerd"
          />
        </div>
      </section>

      {/* Individual Card Types */}
      <section className="mb-10" data-testid="card-types-section">
        <h2 className="mb-4 text-lg font-semibold">Individual Card Types</h2>
        <div className="space-y-4">
          {DEMO_INSIGHTS.map(insight => (
            <div key={insight.id}>
              <p className="mb-1 text-xs font-medium text-zinc-400 uppercase">{insight.pattern.type}</p>
              <SpendingInsightCard insight={insight} />
            </div>
          ))}
        </div>
      </section>

      {/* Empty States */}
      <section className="mb-10" data-testid="empty-states-section">
        <h2 className="mb-4 text-lg font-semibold">Empty States</h2>
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">Insufficient data (2 months)</p>
            <SpendingInsightsSection insights={[]} dataMonths={2} message="2 maanden data. Minimaal 3 maanden nodig." />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">Sufficient data, no patterns</p>
            <SpendingInsightsSection insights={[]} dataMonths={14} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">Loading state</p>
            <SpendingInsightsSection insights={[]} dataMonths={0} isLoading />
          </div>
        </div>
      </section>
    </div>
  )
}
