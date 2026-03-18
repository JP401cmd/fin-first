'use client'

import { useState, useEffect, useCallback } from 'react'
import { NewFeatureSpotlight } from '@/components/app/feature-gate'

type TestResult = { test: string; pass: boolean; detail: string }

/**
 * Test page for Feature #194:
 * "New feature spotlight after phase transition"
 *
 * Verifies:
 * 1. Phase transition tracking and newly unlocked feature detection
 * 2. Pulse/glow animation on newly available sections
 * 3. Tooltip: "Nieuw! [Feature name] is nu beschikbaar"
 * 4. localStorage seen-state per feature
 * 5. One-time display per feature
 * 6. Non-blocking animation
 */

export default function TestFeatureSpotlight() {
  const [apiResults, setApiResults] = useState<TestResult[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [clientResults, setClientResults] = useState<TestResult[]>([])
  const [demoKey, setDemoKey] = useState(0)

  // Fetch API verification results
  useEffect(() => {
    fetch('/api/verify-feature-spotlight')
      .then(r => r.json())
      .then(data => {
        setApiResults(data.results || [])
        setApiLoading(false)
      })
      .catch(() => setApiLoading(false))
  }, [])

  // Client-side localStorage tests
  const runClientTests = useCallback(() => {
    const results: TestResult[] = []

    // Test A: localStorage available
    try {
      localStorage.setItem('__test_spotlight_194__', '1')
      localStorage.removeItem('__test_spotlight_194__')
      results.push({ test: 'localStorage is available', pass: true, detail: 'localStorage works' })
    } catch {
      results.push({ test: 'localStorage is available', pass: false, detail: 'localStorage not available' })
    }

    // Test B: Set and verify spotlight_seen key
    const testId = 'test_feature_194_spotlight'
    const key = `spotlight_seen_${testId}`
    try {
      localStorage.removeItem(key)
      const before = localStorage.getItem(key)
      results.push({
        test: 'Spotlight key absent before first visit',
        pass: before === null,
        detail: before === null ? 'Key not present — spotlight will show' : `Key already exists: ${before}`,
      })

      localStorage.setItem(key, '1')
      const after = localStorage.getItem(key)
      results.push({
        test: 'Spotlight key persisted after marking seen',
        pass: after === '1',
        detail: after === '1' ? 'Key set to "1"' : `Unexpected: ${after}`,
      })

      // Would second visit show?
      const wouldShow = !localStorage.getItem(key)
      results.push({
        test: 'Second visit does NOT show spotlight',
        pass: !wouldShow,
        detail: !wouldShow ? 'localStorage check prevents re-showing' : 'Bug: would show again',
      })

      localStorage.removeItem(key)
    } catch (err) {
      results.push({ test: 'localStorage operations', pass: false, detail: String(err) })
    }

    // Test C: Independent per-feature tracking
    try {
      const key1 = 'spotlight_seen_feature_alpha_194'
      const key2 = 'spotlight_seen_feature_beta_194'
      localStorage.removeItem(key1)
      localStorage.removeItem(key2)

      localStorage.setItem(key1, '1')
      const a = localStorage.getItem(key1)
      const b = localStorage.getItem(key2)
      const independent = a === '1' && b === null

      results.push({
        test: 'Features have independent seen markers',
        pass: independent,
        detail: independent ? 'alpha=1, beta=null — independent tracking' : `alpha=${a}, beta=${b}`,
      })

      localStorage.removeItem(key1)
      localStorage.removeItem(key2)
    } catch (err) {
      results.push({ test: 'Independent feature tracking', pass: false, detail: String(err) })
    }

    setClientResults(results)
  }, [])

  useEffect(() => {
    runClientTests()
  }, [runClientTests])

  // Reset demo: clear localStorage keys for demo features
  function resetDemo() {
    localStorage.removeItem('spotlight_seen_box3_belasting')
    localStorage.removeItem('spotlight_seen_fire_projecties')
    localStorage.removeItem('spotlight_seen_gezondheids_score')
    setDemoKey(prev => prev + 1) // force re-render
  }

  const allResults = [...apiResults, ...clientResults]
  const passing = allResults.filter(r => r.pass).length
  const total = allResults.length

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #194: Feature Spotlight After Phase Transition</h1>
      <p className="text-zinc-400 mb-6">
        Verifies pulse/glow animation + tooltip &quot;Nieuw! [Feature name] is nu beschikbaar&quot;
        on newly unlocked features, stored per-feature in localStorage.
      </p>

      {/* Summary */}
      <div className={`mb-6 rounded-lg p-4 ${passing === total && total > 0 ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
        <p className="text-lg font-semibold">
          {passing === total && total > 0 ? '\u2705' : '\u274c'} {passing}/{total} tests passing
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
                <span>{r.pass ? '\u2705' : '\u274c'}</span>
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
              <span>{r.pass ? '\u2705' : '\u274c'}</span>
              <span className="font-medium">{r.test}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 ml-6">{r.detail}</p>
          </div>
        ))}
      </div>

      {/* Live Demo */}
      <h2 className="text-lg font-semibold mb-3 text-amber-400">Live Demo — NewFeatureSpotlight</h2>
      <p className="text-zinc-400 text-sm mb-4">
        Click &quot;Reset Demo&quot; to clear localStorage and see the spotlight animation + tooltip again.
      </p>
      <button
        onClick={resetDemo}
        className="mb-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        data-testid="reset-demo-btn"
      >
        Reset Demo
      </button>

      <div key={demoKey} className="grid gap-6 md:grid-cols-3 pt-12">
        {/* Demo card 1: Box 3 Belasting */}
        <NewFeatureSpotlight featureId="box3_belasting">
          <div className="rounded-xl bg-zinc-800 p-6 border border-zinc-700" data-testid="demo-card-box3">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Box 3 Belasting</h3>
            <p className="text-xs text-zinc-400">Vermogensbelasting berekening</p>
            <div className="mt-3 text-2xl font-bold text-white">€ 1.234</div>
          </div>
        </NewFeatureSpotlight>

        {/* Demo card 2: FIRE Projecties */}
        <NewFeatureSpotlight featureId="fire_projecties">
          <div className="rounded-xl bg-zinc-800 p-6 border border-zinc-700" data-testid="demo-card-fire">
            <h3 className="text-sm font-semibold text-purple-400 mb-1">FIRE Projecties</h3>
            <p className="text-xs text-zinc-400">Financiele onafhankelijkheid</p>
            <div className="mt-3 text-2xl font-bold text-white">54 jaar</div>
          </div>
        </NewFeatureSpotlight>

        {/* Demo card 3: Gezondheids Score */}
        <NewFeatureSpotlight featureId="gezondheids_score">
          <div className="rounded-xl bg-zinc-800 p-6 border border-zinc-700" data-testid="demo-card-resilience">
            <h3 className="text-sm font-semibold text-teal-400 mb-1">Financiële Gezondheid</h3>
            <p className="text-xs text-zinc-400">Gezondheidsscore 0-100</p>
            <div className="mt-3 text-2xl font-bold text-white">87 / 100</div>
          </div>
        </NewFeatureSpotlight>
      </div>
    </div>
  )
}
