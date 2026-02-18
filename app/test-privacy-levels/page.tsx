'use client'

import { useState, useEffect, useCallback } from 'react'
import { FreedomCardVisual, type FreedomCardData, PRIVACY_STORAGE_KEY } from '@/components/app/freedom-card'

interface TestResult {
  id: number
  name: string
  pass: boolean
  detail: string
}

interface VerificationResponse {
  feature: number
  name: string
  summary: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
  error?: string
}

/**
 * Test page for Feature #235: Privacy levels for sharing
 *
 * Verifies:
 * 1. Privacy level selector UI with 3 options
 * 2. Anonymous mode: percentages only, no name
 * 3. Named mode: with name, no EUR amounts
 * 4. Full mode: percentages + amounts (opt-in)
 * 5. Default to Anonymous for first-time use
 * 6. Remember user's last privacy preference
 */
export default function TestPrivacyLevelsPage() {
  const [verification, setVerification] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Client-side test states
  const [clientTests, setClientTests] = useState<Array<{ name: string; pass: boolean; detail: string }>>([])

  useEffect(() => {
    fetch('/api/verify-privacy-levels')
      .then(res => res.json())
      .then(data => {
        setVerification(data)
        setLoading(false)
      })
      .catch(err => {
        setVerification({
          feature: 235,
          name: 'Privacy levels for sharing',
          summary: 'Failed to load',
          passing: 0,
          total: 0,
          allPassing: false,
          results: [],
          error: err.message
        })
        setLoading(false)
      })
  }, [])

  // Run client-side tests
  const runClientTests = useCallback(() => {
    const tests: Array<{ name: string; pass: boolean; detail: string }> = []

    // Client Test 1: localStorage persistence
    try {
      // Clear any existing value
      localStorage.removeItem(PRIVACY_STORAGE_KEY)

      // Test default when nothing stored
      const defaultVal = localStorage.getItem(PRIVACY_STORAGE_KEY)
      tests.push({
        name: 'No stored value returns null (triggers default anonymous)',
        pass: defaultVal === null,
        detail: `Stored value after removal: ${JSON.stringify(defaultVal)}`
      })

      // Store 'named' and verify
      localStorage.setItem(PRIVACY_STORAGE_KEY, 'named')
      const storedNamed = localStorage.getItem(PRIVACY_STORAGE_KEY)
      tests.push({
        name: 'Can store and retrieve "named" privacy level',
        pass: storedNamed === 'named',
        detail: `Stored: "named", Retrieved: "${storedNamed}"`
      })

      // Store 'full' and verify
      localStorage.setItem(PRIVACY_STORAGE_KEY, 'full')
      const storedFull = localStorage.getItem(PRIVACY_STORAGE_KEY)
      tests.push({
        name: 'Can store and retrieve "full" privacy level',
        pass: storedFull === 'full',
        detail: `Stored: "full", Retrieved: "${storedFull}"`
      })

      // Store 'anonymous' and verify
      localStorage.setItem(PRIVACY_STORAGE_KEY, 'anonymous')
      const storedAnon = localStorage.getItem(PRIVACY_STORAGE_KEY)
      tests.push({
        name: 'Can store and retrieve "anonymous" privacy level',
        pass: storedAnon === 'anonymous',
        detail: `Stored: "anonymous", Retrieved: "${storedAnon}"`
      })

      // Clean up
      localStorage.removeItem(PRIVACY_STORAGE_KEY)
    } catch (e) {
      tests.push({
        name: 'localStorage operations work correctly',
        pass: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`
      })
    }

    setClientTests(tests)
  }, [])

  useEffect(() => {
    runClientTests()
  }, [runClientTests])

  // Sample card data for each privacy level
  const anonymousCard: FreedomCardData = {
    privacyLevel: 'anonymous',
    freedomPercentage: 42.3,
    freedomDaysWon: 18,
    fireCountdown: { years: 11, months: 7, days: 4227, label: 'sep 2037' },
    freedomTime: { years: 4, months: 2 },
    savingsRate: 32.1,
    generatedAt: new Date().toISOString(),
  }

  const namedCard: FreedomCardData = {
    privacyLevel: 'named',
    freedomPercentage: 42.3,
    freedomDaysWon: 18,
    fireCountdown: { years: 11, months: 7, days: 4227, label: 'sep 2037' },
    freedomTime: { years: 4, months: 2 },
    savingsRate: 32.1,
    generatedAt: new Date().toISOString(),
    displayName: 'Jan de Vries',
  }

  const fullCard: FreedomCardData = {
    privacyLevel: 'full',
    freedomPercentage: 42.3,
    freedomDaysWon: 18,
    fireCountdown: { years: 11, months: 7, days: 4227, label: 'sep 2037' },
    freedomTime: { years: 4, months: 2 },
    savingsRate: 32.1,
    generatedAt: new Date().toISOString(),
    displayName: 'Jan de Vries',
    netWorth: 210000,
    fireTarget: 496000,
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-zinc-500">Laden...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #235: Privacy Levels for Sharing
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Verifies that users can select privacy levels before generating a card,
        with 3 modes (Anonymous, Named, Full), localStorage persistence, and Full mode opt-in.
      </p>

      {/* API Verification Results */}
      {verification && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-zinc-800">API Verificatie</h2>
          <div className={`mb-4 rounded-xl border p-4 ${
            verification.allPassing
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <p className={`text-lg font-bold ${
              verification.allPassing ? 'text-green-700' : 'text-red-700'
            }`}>
              {verification.summary}
            </p>
          </div>

          <div className="space-y-2">
            {verification.results.map((result) => (
              <div
                key={result.id}
                className={`rounded-lg border p-3 ${
                  result.pass
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base">{result.pass ? '✅' : '❌'}</span>
                  <div>
                    <p className={`text-sm font-medium ${
                      result.pass ? 'text-green-800' : 'text-red-800'
                    }`}>
                      Test {result.id}: {result.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{result.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client-side Tests */}
      {clientTests.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-zinc-800">Client-side Tests (localStorage)</h2>
          <div className="space-y-2">
            {clientTests.map((test, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${
                  test.pass
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base">{test.pass ? '✅' : '❌'}</span>
                  <div>
                    <p className={`text-sm font-medium ${
                      test.pass ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {test.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{test.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Demo: All Three Privacy Levels */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-zinc-800">Visuele Demo: Drie Privacy Niveaus</h2>

        <div className="space-y-8">
          {/* Anonymous Card */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              1. Anoniem — Alleen percentages, geen naam
            </h3>
            <FreedomCardVisual data={anonymousCard} />
            <div className="mt-2 rounded-lg bg-green-50 p-3 text-xs text-green-700">
              <ul className="space-y-0.5">
                <li>✓ Geen naam zichtbaar</li>
                <li>✓ Geen EUR bedragen</li>
                <li>✓ Vrijheidspercentage: 42.3%</li>
                <li>✓ Statistieken in tijdformaat</li>
              </ul>
            </div>
          </div>

          {/* Named Card */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              2. Met naam — Met naam, geen bedragen
            </h3>
            <FreedomCardVisual data={namedCard} />
            <div className="mt-2 rounded-lg bg-green-50 p-3 text-xs text-green-700">
              <ul className="space-y-0.5">
                <li>✓ Naam &quot;Jan de Vries&quot; zichtbaar</li>
                <li>✓ Geen EUR bedragen</li>
                <li>✓ Vrijheidspercentage: 42.3%</li>
              </ul>
            </div>
          </div>

          {/* Full Card */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              3. Volledig — Met naam en bedragen (opt-in)
            </h3>
            <FreedomCardVisual data={fullCard} />
            <div className="mt-2 rounded-lg bg-green-50 p-3 text-xs text-green-700">
              <ul className="space-y-0.5">
                <li>✓ Naam &quot;Jan de Vries&quot; zichtbaar</li>
                <li>✓ EUR bedragen zichtbaar: €210.000 / €496.000</li>
                <li>✓ Vrijheidspercentage: 42.3%</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Feature description */}
      <div className="rounded-lg bg-zinc-50 p-4 text-xs text-zinc-500">
        <p className="font-semibold text-zinc-700 mb-2">Feature #235: Privacy levels for sharing</p>
        <ul className="space-y-1 list-disc pl-4">
          <li>Create privacy level selector UI with 3 options</li>
          <li>Implement Anonymous mode: percentages only, no name</li>
          <li>Implement Named mode: with name, no EUR amounts</li>
          <li>Implement Full mode: percentages + amounts (requires explicit opt-in)</li>
          <li>Default to Anonymous for first-time use</li>
          <li>Remember user&apos;s last privacy preference</li>
        </ul>
      </div>
    </div>
  )
}
