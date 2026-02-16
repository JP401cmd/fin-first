'use client'

import { useState } from 'react'
import { FreedomCardVisual, type FreedomCardData } from '@/components/app/freedom-card'

/**
 * Test page for the Freedom Card generator.
 * Uses sample data to verify the visual card renders correctly.
 * The real generator fetches from /api/share/freedom-card with auth.
 */
export default function TestFreedomCardPage() {
  const [privacyLevel, setPrivacyLevel] = useState<'anonymous' | 'named' | 'full'>('anonymous')
  const [apiData, setApiData] = useState<FreedomCardData | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiLoading, setApiLoading] = useState(false)

  // Sample data to demonstrate the card visually
  const sampleData: Record<string, FreedomCardData> = {
    anonymous: {
      privacyLevel: 'anonymous',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
    },
    named: {
      privacyLevel: 'named',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
      displayName: 'Jan Tester',
    },
    full: {
      privacyLevel: 'full',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
      displayName: 'Jan Tester',
      netWorth: 156000,
      fireTarget: 450000,
    },
  }

  async function fetchFromAPI() {
    setApiLoading(true)
    setApiError(null)
    try {
      const res = await fetch(`/api/share/freedom-card?privacy=${privacyLevel}`)
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error || `HTTP ${res.status}`)
      } else {
        setApiData(data)
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setApiLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Test: Freedom Card Generator
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Verifies the freedom card renders with real metrics from the dashboard.
      </p>

      {/* Privacy level selector */}
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Privacy Level</h3>
        <div className="flex gap-2">
          {(['anonymous', 'named', 'full'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setPrivacyLevel(level)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                privacyLevel === level
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Sample data card */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">
            Sample Data Card ({privacyLevel})
          </h3>
          <FreedomCardVisual data={sampleData[privacyLevel]} />
        </div>

        {/* API data card */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">
            API Data Card (requires auth)
          </h3>
          <button
            onClick={fetchFromAPI}
            disabled={apiLoading}
            className="mb-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {apiLoading ? 'Fetching...' : 'Fetch from /api/share/freedom-card'}
          </button>

          {apiError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          {apiData && (
            <div>
              <FreedomCardVisual data={apiData} />
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-zinc-400">Raw API response</summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs">
                  {JSON.stringify(apiData, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
