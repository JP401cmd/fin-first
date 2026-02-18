'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  id: string
  name: string
  passed: boolean
  details: string
}

interface VerificationResponse {
  feature: string
  summary: string
  all_passing: boolean
  total: number
  passing: number
  failing: number
  results: TestResult[]
}

export default function TestHoldingsSyncPage() {
  const [data, setData] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-holdings-sync')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-zinc-900">Verificatie laden...</h1>
          <div className="mt-4 animate-pulse space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-zinc-200" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-red-600">Fout bij verificatie</h1>
          <p className="mt-2 text-zinc-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Group results by step
  const steps = [
    { prefix: 'step1', title: 'Stap 1: Bereken totale portfoliowaarde uit actieve holdings' },
    { prefix: 'step2', title: 'Stap 2: Automatisch synchroniseren naar asset current_value' },
    { prefix: 'step3', title: 'Stap 3: Portfolio tracker is bron van waarheid' },
    { prefix: 'step4', title: 'Stap 4: Sync bij holding aanmaken/bijwerken/verwijderen' },
    { prefix: 'step5', title: 'Stap 5: Sync bij prijsfeed updates' },
    { prefix: 'step6', title: 'Stap 6: Handmatig herwaarderen blokkeren/waarschuwen' },
    { prefix: 'bonus', title: 'Bonus: Foutafhandeling en imports' },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">{data.feature}</h1>
          <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            data.all_passing
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {data.all_passing ? '✅' : '❌'} {data.summary}
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Verifieert dat de portfolio tracker automatisch synchroniseert met asset waardes
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {steps.map(step => {
            const stepResults = data.results.filter(r => r.id.startsWith(step.prefix))
            if (stepResults.length === 0) return null
            const allPassed = stepResults.every(r => r.passed)

            return (
              <div key={step.prefix} className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className={`flex items-center gap-2 rounded-t-xl border-b px-4 py-3 ${
                  allPassed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                }`}>
                  <span className="text-lg">{allPassed ? '✅' : '❌'}</span>
                  <h2 className="text-sm font-semibold text-zinc-800">{step.title}</h2>
                </div>
                <div className="divide-y divide-zinc-100">
                  {stepResults.map(result => (
                    <div key={result.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 text-sm">{result.passed ? '✅' : '❌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-700">{result.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{result.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Architecture Diagram */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-800">🏗️ Sync Architectuur</h2>
          <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-300 leading-relaxed">{`
┌─────────────────────────────────────────────────────┐
│                   TRIGGERS                          │
│                                                     │
│  POST /api/holdings           (create holding)      │
│  PATCH /api/holdings          (update holding)      │
│  DELETE /api/holdings         (delete holding)      │
│  POST /api/holding-transactions  (buy/sell)         │
│  POST /api/holdings/refresh-prices (price refresh)  │
│  PATCH /api/holdings/refresh-prices (manual price)  │
│                                                     │
│         All call:                                   │
│         ▼                                           │
│  ┌──────────────────────────────────────────────┐   │
│  │  syncAssetValueFromHoldings()                │   │
│  │  lib/holdings-sync.ts                        │   │
│  │                                              │   │
│  │  1. SELECT units, current_price,             │   │
│  │     avg_purchase_price FROM holdings         │   │
│  │     WHERE asset_id=? AND is_active=true      │   │
│  │                                              │   │
│  │  2. totalValue = SUM(                        │   │
│  │       (current_price ?? avg_price) * units   │   │
│  │     )                                        │   │
│  │                                              │   │
│  │  3. UPDATE assets SET current_value =        │   │
│  │     totalValue WHERE id=asset_id             │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  UI Prevention Layer                         │   │
│  │                                              │   │
│  │  GET /api/assets/has-holdings?asset_id=      │   │
│  │  → { has_holdings, holdings_count }          │   │
│  │                                              │   │
│  │  If has_holdings:                            │   │
│  │  • Banner: "Portfolio tracker actief"        │   │
│  │  • Revalue btn: disabled                     │   │
│  │  • Value input: readOnly                     │   │
│  │  • Valuation modal: warning shown            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
`}</pre>
        </div>

        {/* Source Files */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800">📁 Betrokken bestanden</h2>
          <ul className="space-y-1.5 text-xs text-zinc-600">
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">lib/holdings-sync.ts</code> — Core sync logic (syncAssetValueFromHoldings, assetHasActiveHoldings)</li>
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">app/api/holdings/route.ts</code> — CRUD: sync on create, update, delete</li>
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">app/api/holding-transactions/route.ts</code> — Transaction: sync on buy/sell</li>
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">app/api/holdings/refresh-prices/route.ts</code> — Price feed: sync on refresh &amp; manual override</li>
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">app/api/assets/has-holdings/route.ts</code> — Check endpoint for UI prevention</li>
            <li><code className="rounded bg-zinc-100 px-1.5 py-0.5">app/(app)/core/assets/page.tsx</code> — UI: warning banner, disabled revalue, readonly value</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
