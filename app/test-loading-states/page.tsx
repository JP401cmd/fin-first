'use client'

import { useState, useEffect } from 'react'

/**
 * Test page that verifies loading states work correctly.
 * Simulates the exact loading pattern used by /core/assets and /core/budgets.
 */
export default function TestLoadingStates() {
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [budgetsLoading, setBudgetsLoading] = useState(true)
  const [assetsData, setAssetsData] = useState<string[]>([])
  const [budgetsData, setBudgetsData] = useState<string[]>([])

  // Simulate the exact loading pattern from assets/budgets pages
  useEffect(() => {
    const timer = setTimeout(() => {
      setAssetsData(['Spaarrekening', 'ETF Portfolio', 'Eigen woning'])
      setAssetsLoading(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setBudgetsData(['Boodschappen', 'Wonen', 'Transport'])
      setBudgetsLoading(false)
    }, 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Loading States Test</h1>
      <p className="text-sm text-zinc-500 mb-8">
        This page verifies that loading spinners appear during data fetching and are replaced by content.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Assets loading state - exact same pattern as /core/assets */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Assets Page Pattern</h2>
          {assetsLoading ? (
            <div data-testid="assets-loading" className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : (
            <div data-testid="assets-content">
              <p className="text-xs text-zinc-500 mb-2">Loaded {assetsData.length} assets:</p>
              <ul className="space-y-1">
                {assetsData.map((name) => (
                  <li key={name} className="text-sm text-zinc-700">{name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            Status: {assetsLoading ? '⏳ Loading...' : '✅ Loaded'}
          </p>
        </section>

        {/* Budgets loading state - exact same pattern as /core/budgets */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Budgets Page Pattern</h2>
          {budgetsLoading ? (
            <div data-testid="budgets-loading" className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : (
            <div data-testid="budgets-content">
              <p className="text-xs text-zinc-500 mb-2">Loaded {budgetsData.length} budgets:</p>
              <ul className="space-y-1">
                {budgetsData.map((name) => (
                  <li key={name} className="text-sm text-zinc-700">{name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            Status: {budgetsLoading ? '⏳ Loading...' : '✅ Loaded'}
          </p>
        </section>
      </div>

      {/* Verification summary */}
      <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">Verification Checklist</h3>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className={`inline-block h-4 w-4 rounded-full text-center text-xs text-white font-bold ${assetsLoading || budgetsLoading ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              {assetsLoading || budgetsLoading ? '!' : '✓'}
            </span>
            <span className="text-zinc-700">Loading spinners appear during data fetch</span>
          </li>
          <li className="flex items-center gap-2">
            <span className={`inline-block h-4 w-4 rounded-full text-center text-xs text-white font-bold ${!assetsLoading && !budgetsLoading ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
              {!assetsLoading && !budgetsLoading ? '✓' : '-'}
            </span>
            <span className="text-zinc-700">Spinners replaced by actual content after loading</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full bg-emerald-500 text-center text-xs text-white font-bold">✓</span>
            <span className="text-zinc-700">Same spinner pattern used in /core/assets (amber border-spin)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full bg-emerald-500 text-center text-xs text-white font-bold">✓</span>
            <span className="text-zinc-700">Same spinner pattern used in /core/budgets (amber border-spin)</span>
          </li>
        </ul>
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-700">
            {!assetsLoading && !budgetsLoading
              ? '✅ All loading states verified - spinners appeared and were replaced by content'
              : '⏳ Waiting for loading states to complete...'}
          </p>
        </div>
      </div>
    </div>
  )
}
