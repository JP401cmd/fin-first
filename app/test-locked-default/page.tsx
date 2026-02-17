'use client'

import { useState, useEffect } from 'react'
import { FeatureGate, LockedFeatureCard } from '@/components/app/feature-gate'

/**
 * Test page for Feature #192: FeatureGate default switch from hidden to locked
 *
 * Shows:
 * 1. Verification test results from API
 * 2. Live demo of LockedFeatureCard components
 * 3. Comparison of hidden vs locked fallback behavior
 * 4. Click test to verify locked cards are non-clickable
 */
export default function TestLockedDefault() {
  const [tests, setTests] = useState<{ name: string; pass: boolean; detail: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [clickCount, setClickCount] = useState(0)

  useEffect(() => {
    fetch('/api/verify-locked-default')
      .then(r => r.json())
      .then(data => {
        setTests(data.tests?.results ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const passing = tests?.filter(t => t.pass).length ?? 0
  const total = tests?.length ?? 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="rounded-xl bg-gradient-to-r from-zinc-800 to-zinc-900 p-6 text-white">
          <h1 className="text-xl font-bold">Feature #192: FeatureGate Default → Locked</h1>
          <p className="mt-1 text-sm text-white/80">
            Verifieer dat FeatureGate standaard &quot;locked&quot; fallback gebruikt in plaats van &quot;hidden&quot;
          </p>
        </div>

        {/* Test Results */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="test-results">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800">Verificatie Tests</h2>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${passing === total ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  data-testid="test-score">
              {loading ? '...' : `${passing}/${total}`}
            </span>
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Tests laden...</p>
          ) : (
            <div className="space-y-2">
              {tests?.map((t, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                  <span className={`mt-0.5 text-sm ${t.pass ? 'text-green-600' : 'text-red-600'}`}>
                    {t.pass ? '✅' : '❌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-700">{t.name}</p>
                    <p className="text-xs text-zinc-400 break-all">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live LockedFeatureCard Demos */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-800 mb-4">Live LockedFeatureCard Demo</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Hieronder zie je LockedFeatureCard componenten. Ze moeten: feature naam, beschrijving, unlock fase badge, mini progress bar, dashed border, muted kleuren, en lock icoon tonen.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Direct LockedFeatureCard rendering */}
            <div data-testid="locked-card-demo-1">
              <LockedFeatureCard featureId="withdrawal_strategie" currentPhase="recovery" />
            </div>
            <div data-testid="locked-card-demo-2">
              <LockedFeatureCard featureId="monte_carlo" currentPhase="stability" />
            </div>
            <div data-testid="locked-card-demo-3">
              <LockedFeatureCard featureId="asset_allocatie" currentPhase="recovery" />
            </div>
            <div data-testid="locked-card-demo-4">
              <LockedFeatureCard featureId="fire_projecties" currentPhase="recovery" />
            </div>
          </div>
        </div>

        {/* FeatureGate Default Behavior Demo */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-800 mb-4">FeatureGate Default Fallback Gedrag</h2>
          <p className="text-sm text-zinc-500 mb-4">
            FeatureGate zonder expliciet fallback-attribuut moet nu standaard &quot;locked&quot; tonen (niet hidden).
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* FeatureGate WITHOUT explicit fallback — should show locked card */}
            <div>
              <p className="text-xs font-semibold text-zinc-600 mb-2">Zonder fallback (standaard = locked):</p>
              <div data-testid="default-fallback-gate">
                <FeatureGate featureId="withdrawal_strategie">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 text-sm">
                    Withdrawal Strategie: Ontgrendeld!
                  </div>
                </FeatureGate>
              </div>
            </div>

            {/* FeatureGate WITH explicit locked fallback */}
            <div>
              <p className="text-xs font-semibold text-zinc-600 mb-2">Met fallback=&quot;locked&quot;:</p>
              <div data-testid="explicit-locked-gate">
                <FeatureGate featureId="monte_carlo" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 text-sm">
                    Monte Carlo: Ontgrendeld!
                  </div>
                </FeatureGate>
              </div>
            </div>

            {/* FeatureGate WITH explicit hidden fallback */}
            <div>
              <p className="text-xs font-semibold text-zinc-600 mb-2">Met fallback=&quot;hidden&quot; (leeg):</p>
              <div data-testid="explicit-hidden-gate" className="min-h-[60px] rounded-lg border-2 border-dashed border-zinc-200 flex items-center justify-center">
                <FeatureGate featureId="withdrawal_strategie" fallback="hidden">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 text-sm">
                    Withdrawal Strategie: Ontgrendeld!
                  </div>
                </FeatureGate>
                <span className="text-xs text-zinc-300">(niets hier = hidden werkt correct)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Click Test */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-800 mb-4">Klik Test: Locked Card is NIET klikbaar</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Klik op de locked card hieronder. De teller mag NIET verhogen — de card is een div, niet een link.
          </p>
          <div data-testid="click-test-area" onClick={() => setClickCount(c => c + 1)}>
            <LockedFeatureCard featureId="withdrawal_strategie" currentPhase="recovery" />
          </div>
          <p className="mt-3 text-sm text-zinc-600" data-testid="click-count">
            Klikken op container: <strong>{clickCount}</strong>
            <span className="text-xs text-zinc-400 ml-2">(div click bubbelt, maar locked card zelf navigeert niet)</span>
          </p>
        </div>
      </div>
    </div>
  )
}
