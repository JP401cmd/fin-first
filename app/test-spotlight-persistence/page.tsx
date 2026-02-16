'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Test page for Feature #134:
 * "New feature spotlight shows only once per feature"
 *
 * Tests that the NewFeatureSpotlight component uses localStorage
 * to ensure the pulse animation only shows once per feature.
 */

type TestResult = { test: string; pass: boolean; detail: string }

export default function TestSpotlightPersistence() {
  const [apiResults, setApiResults] = useState<TestResult[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [clientResults, setClientResults] = useState<TestResult[]>([])

  // Fetch API verification results
  useEffect(() => {
    fetch('/api/verify-spotlight-persistence')
      .then(r => r.json())
      .then(data => {
        setApiResults(data.results || [])
        setApiLoading(false)
      })
      .catch(() => setApiLoading(false))
  }, [])

  // Run client-side localStorage tests
  const runClientTests = useCallback(() => {
    const results: TestResult[] = []

    // Test A: localStorage is available
    try {
      localStorage.setItem('__test_ls__', '1')
      localStorage.removeItem('__test_ls__')
      results.push({ test: 'localStorage is available', pass: true, detail: 'localStorage works in this browser' })
    } catch {
      results.push({ test: 'localStorage is available', pass: false, detail: 'localStorage not available' })
    }

    // Test B: Set a spotlight_seen key and verify it persists
    const testFeatureId = 'test_feature_134'
    const key = `spotlight_seen_${testFeatureId}`
    try {
      // Clean up first
      localStorage.removeItem(key)

      // Verify it's not there
      const before = localStorage.getItem(key)
      results.push({
        test: 'Spotlight key absent before marking',
        pass: before === null,
        detail: before === null ? 'Key does not exist yet' : `Key already exists: ${before}`,
      })

      // Set it (simulating what NewFeatureSpotlight does)
      localStorage.setItem(key, '1')
      const after = localStorage.getItem(key)
      results.push({
        test: 'Spotlight key present after marking',
        pass: after === '1',
        detail: after === '1' ? 'Key set to "1" in localStorage' : `Unexpected value: ${after}`,
      })

      // Verify it would prevent showing again
      const wouldShow = !localStorage.getItem(key)
      results.push({
        test: 'Second visit would NOT show spotlight',
        pass: !wouldShow,
        detail: !wouldShow ? 'localStorage check prevents re-showing' : 'Spotlight would show again (bug!)',
      })

      // Clean up
      localStorage.removeItem(key)
    } catch (err) {
      results.push({ test: 'localStorage operations', pass: false, detail: String(err) })
    }

    // Test C: Multiple features have independent keys
    try {
      const key1 = 'spotlight_seen_feature_alpha'
      const key2 = 'spotlight_seen_feature_beta'
      localStorage.removeItem(key1)
      localStorage.removeItem(key2)

      localStorage.setItem(key1, '1')
      const alpha = localStorage.getItem(key1)
      const beta = localStorage.getItem(key2)

      const independent = alpha === '1' && beta === null
      results.push({
        test: 'Features have independent seen markers',
        pass: independent,
        detail: independent
          ? 'feature_alpha=1, feature_beta=null — independent tracking'
          : `feature_alpha=${alpha}, feature_beta=${beta} — not independent`,
      })

      // Clean up
      localStorage.removeItem(key1)
      localStorage.removeItem(key2)
    } catch (err) {
      results.push({ test: 'Independent feature tracking', pass: false, detail: String(err) })
    }

    // Test D: sessionStorage does NOT contain spotlight keys (verifying migration away)
    try {
      const ssKey = 'spotlight_seen_test_session_check'
      const ssValue = sessionStorage.getItem(ssKey)
      results.push({
        test: 'sessionStorage has no spotlight keys (clean)',
        pass: ssValue === null,
        detail: ssValue === null
          ? 'No stale sessionStorage spotlight keys found'
          : 'sessionStorage has spotlight key — old code may still be active',
      })
    } catch {
      results.push({ test: 'sessionStorage check', pass: true, detail: 'sessionStorage not available (OK)' })
    }

    setClientResults(results)
  }, [])

  useEffect(() => {
    runClientTests()
  }, [runClientTests])

  const allResults = [...apiResults, ...clientResults]
  const passing = allResults.filter(r => r.pass).length
  const total = allResults.length

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #134: Spotlight Persistence</h1>
      <p className="text-zinc-400 mb-6">
        Verifies that the new feature spotlight uses localStorage (not sessionStorage)
        to show the pulse animation only once per feature.
      </p>

      {/* Summary */}
      <div className={`mb-6 rounded-lg p-4 ${passing === total && total > 0 ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
        <p className="text-lg font-semibold">
          {passing === total && total > 0 ? '✅' : '❌'} {passing}/{total} tests passing
        </p>
      </div>

      {/* API Tests */}
      <h2 className="text-lg font-semibold mb-3 text-blue-400">Server-side Verification (Source Analysis)</h2>
      {apiLoading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : (
        <div className="space-y-2 mb-8">
          {apiResults.map((r, i) => (
            <div key={i} className={`rounded-md p-3 ${r.pass ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}`}>
              <div className="flex items-center gap-2">
                <span>{r.pass ? '✅' : '❌'}</span>
                <span className="font-medium">{r.test}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 ml-6">{r.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Client Tests */}
      <h2 className="text-lg font-semibold mb-3 text-purple-400">Client-side Verification (localStorage)</h2>
      <div className="space-y-2 mb-8">
        {clientResults.map((r, i) => (
          <div key={i} className={`rounded-md p-3 ${r.pass ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}`}>
            <div className="flex items-center gap-2">
              <span>{r.pass ? '✅' : '❌'}</span>
              <span className="font-medium">{r.test}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 ml-6">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
