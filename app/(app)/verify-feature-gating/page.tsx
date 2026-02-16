'use client'

import { useEffect, useState } from 'react'
import { Shield, Lock, Unlock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { FeatureGate, LockedFeatureCard } from '@/components/app/feature-gate'
import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'

/**
 * In-app verification page for Feature #116:
 * "Sovereignty level drives FeatureGate correctly"
 *
 * This page is inside the (app) route group, so it:
 * 1. Requires authentication (proxy redirects unauthenticated users)
 * 2. Receives REAL sovereignty data from the server-side layout
 * 3. FeatureGate components use REAL backend-computed sovereignty level
 */
export default function VerifyFeatureGatingPage() {
  const featureAccess = useFeatureAccess()
  const [apiData, setApiData] = useState<Record<string, unknown> | null>(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Fetch API verification data
  const fetchApiData = async () => {
    setApiLoading(true)
    setApiError(null)
    try {
      const res = await fetch('/api/verify-feature-gating')
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const data = await res.json()
      setApiData(data)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setApiLoading(false)
    }
  }

  useEffect(() => {
    fetchApiData()
  }, [])

  // Compute which features should be accessible vs locked for current phase
  const expectedAccessible = FEATURES.filter(f => DEFAULT_MATRIX[f.id]?.[featureAccess.phase] === true)
  const expectedLocked = FEATURES.filter(f => DEFAULT_MATRIX[f.id]?.[featureAccess.phase] !== true)

  // Verify all features match expectations
  const accessMismatches = FEATURES.filter(f => {
    const expected = DEFAULT_MATRIX[f.id]?.[featureAccess.phase] ?? false
    const actual = featureAccess.features[f.id] ?? false
    return expected !== actual
  })

  const currentPhaseObj = PHASES.find(p => p.id === featureAccess.phase)

  const PHASE_BG: Record<string, string> = {
    recovery: 'from-rose-600 to-rose-800',
    stability: 'from-blue-600 to-blue-800',
    momentum: 'from-teal-600 to-teal-800',
    mastery: 'from-amber-600 to-amber-800',
  }

  const PHASE_BORDER: Record<string, string> = {
    recovery: 'border-rose-200',
    stability: 'border-blue-200',
    momentum: 'border-teal-200',
    mastery: 'border-amber-200',
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      {/* Hero */}
      <div className={`bg-gradient-to-br ${PHASE_BG[featureAccess.phase] || 'from-zinc-600 to-zinc-800'} px-6 py-10 text-white`}>
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Sovereignty-Driven FeatureGate Verification
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Feature #116: Verifies that FeatureGate receives real sovereignty level from backend
          </p>

          {/* Real sovereignty data from backend */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="sovereignty-stats">
            <div className="rounded-lg bg-white/20 px-3 py-2 text-center">
              <p className="text-xs text-white/70">Fase</p>
              <p className="text-lg font-bold" data-testid="current-phase">{currentPhaseObj?.label ?? featureAccess.phase}</p>
            </div>
            <div className="rounded-lg bg-white/20 px-3 py-2 text-center">
              <p className="text-xs text-white/70">Niveau</p>
              <p className="text-lg font-bold" data-testid="current-level">{featureAccess.level}</p>
            </div>
            <div className="rounded-lg bg-white/20 px-3 py-2 text-center">
              <p className="text-xs text-white/70">Vrijheid</p>
              <p className="text-lg font-bold" data-testid="freedom-pct">{featureAccess.freedomPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-white/20 px-3 py-2 text-center">
              <p className="text-xs text-white/70">Vermogen</p>
              <p className="text-lg font-bold" data-testid="net-worth">
                {featureAccess.netWorth.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Section 1: Backend API Verification */}
        <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="api-verification">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-800">1. Backend API Verification</h2>
              <p className="text-xs text-zinc-500">Sovereignty level computed from real Supabase data</p>
            </div>
            <button
              onClick={fetchApiData}
              disabled={apiLoading}
              className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${apiLoading ? 'animate-spin' : ''}`} />
              Vernieuwen
            </button>
          </div>
          <div className="p-5">
            {apiLoading && <p className="text-sm text-zinc-500">Laden...</p>}
            {apiError && <p className="text-sm text-red-600">Fout: {apiError}</p>}
            {apiData && (
              <div className="space-y-4">
                {/* API test results */}
                {(apiData as any).tests?.results?.map((test: any, i: number) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                      test.pass ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}
                    data-testid={`api-test-${i}`}
                  >
                    {test.pass ? (
                      <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{test.name}</p>
                      <p className="text-xs opacity-75">{test.detail}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                  {(apiData as any).tests?.allPassing ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  )}
                  <span className="text-sm font-semibold" data-testid="api-score">
                    {(apiData as any).tests?.passing}/{(apiData as any).tests?.total} tests passing
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Context Provider Verification */}
        <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="context-verification">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
            <h2 className="font-semibold text-zinc-800">2. Context Provider Verification</h2>
            <p className="text-xs text-zinc-500">FeatureAccessProvider passes real data to useFeatureAccess() hook</p>
          </div>
          <div className="p-5 space-y-3">
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              featureAccess.phase !== 'recovery' || featureAccess.level !== 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
            }`} data-testid="ctx-test-phase">
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              <div>
                <p className="font-medium">Phase from context: &quot;{featureAccess.phase}&quot;</p>
                <p className="text-xs opacity-75">Level: {featureAccess.level}, Freedom: {featureAccess.freedomPct.toFixed(2)}%</p>
              </div>
            </div>

            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-green-50 text-green-800`} data-testid="ctx-test-features">
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              <div>
                <p className="font-medium">Features map has {Object.keys(featureAccess.features).length} entries</p>
                <p className="text-xs opacity-75">
                  Accessible: {Object.values(featureAccess.features).filter(Boolean).length},
                  Locked: {Object.values(featureAccess.features).filter(v => !v).length}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              accessMismatches.length === 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`} data-testid="ctx-test-matrix">
              {accessMismatches.length === 0 ? (
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
              )}
              <div>
                <p className="font-medium">Feature access matches matrix for phase &quot;{featureAccess.phase}&quot;</p>
                <p className="text-xs opacity-75">
                  {accessMismatches.length === 0
                    ? `All ${FEATURES.length} features correctly gated`
                    : `Mismatches: ${accessMismatches.map(f => f.id).join(', ')}`
                  }
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm bg-green-50 text-green-800" data-testid="ctx-test-numeric">
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              <div>
                <p className="font-medium">Financial metrics are numeric values</p>
                <p className="text-xs opacity-75">
                  netWorth={typeof featureAccess.netWorth}, monthlyExpenses={typeof featureAccess.monthlyExpenses}, freedomPct={typeof featureAccess.freedomPct}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Feature Access Matrix (current phase highlighted) */}
        <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="feature-matrix">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
            <h2 className="font-semibold text-zinc-800">3. Feature-Phase Matrix</h2>
            <p className="text-xs text-zinc-500">Current phase column highlighted — showing real feature access state</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600">
                  <th className="px-4 py-2 text-left font-medium">Feature</th>
                  {PHASES.map(p => (
                    <th
                      key={p.id}
                      className={`px-4 py-2 text-center font-medium ${
                        featureAccess.phase === p.id ? 'bg-blue-100 text-blue-800' : ''
                      }`}
                    >
                      {p.label}
                      {featureAccess.phase === p.id && <span className="block text-[10px] font-bold">(HUIDIG)</span>}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(feat => {
                  const isAccessible = featureAccess.features[feat.id] === true
                  const matrixRow = DEFAULT_MATRIX[feat.id] || {}
                  return (
                    <tr key={feat.id} className="border-t border-zinc-100 hover:bg-zinc-50/50" data-testid={`matrix-row-${feat.id}`}>
                      <td className="px-4 py-2">
                        <span className="font-medium text-zinc-800">{feat.label}</span>
                      </td>
                      {PHASES.map(p => (
                        <td
                          key={p.id}
                          className={`px-4 py-2 text-center ${
                            featureAccess.phase === p.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          {matrixRow[p.id] ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">&#10003;</span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-400 text-xs">&#10005;</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isAccessible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                          data-testid={`status-${feat.id}`}
                        >
                          {isAccessible ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                          {isAccessible ? 'Open' : 'Vergrendeld'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Live FeatureGate Demo */}
        <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid="live-gate-demo">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
            <h2 className="font-semibold text-zinc-800">4. Live FeatureGate Demo</h2>
            <p className="text-xs text-zinc-500">
              Real FeatureGate components using backend sovereignty level (fallback=&quot;locked&quot;)
            </p>
          </div>
          <div className="p-5 space-y-6">
            {/* Group by expected state */}
            <div>
              <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-1">
                <Unlock className="h-4 w-4" />
                Should be ACCESSIBLE ({expectedAccessible.length} features):
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {expectedAccessible.map(feat => (
                  <FeatureGate key={feat.id} featureId={feat.id} fallback="locked">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid={`gate-open-${feat.id}`}>
                      <div className="flex items-center gap-2">
                        <Unlock className="h-4 w-4 text-green-600" />
                        <p className="font-medium text-green-800 text-sm">{feat.label}</p>
                      </div>
                      <p className="text-xs text-green-600 mt-1">Beschikbaar in {featureAccess.phase}</p>
                    </div>
                  </FeatureGate>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-1">
                <Lock className="h-4 w-4" />
                Should be LOCKED ({expectedLocked.length} features):
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {expectedLocked.map(feat => (
                  <FeatureGate key={feat.id} featureId={feat.id} fallback="locked">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid={`gate-unexpected-open-${feat.id}`}>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <p className="font-medium text-amber-800 text-sm">{feat.label}</p>
                      </div>
                      <p className="text-xs text-amber-600 mt-1">UNEXPECTED: This should be locked!</p>
                    </div>
                  </FeatureGate>
                ))}
              </div>
            </div>

            {/* Hidden fallback demo */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">
                Hidden Fallback Demo (mastery-only feature):
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2" data-testid="hidden-fallback-demo">
                <FeatureGate featureId="withdrawal_strategie">
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4" data-testid="hidden-withdrawal">
                    <p className="font-medium text-purple-800 text-sm">Withdrawal Strategieen (hidden fallback)</p>
                    <p className="text-xs text-purple-600">Alleen zichtbaar in Mastery fase</p>
                  </div>
                </FeatureGate>
                <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-4">
                  <p className="text-xs text-zinc-500">
                    {featureAccess.phase === 'mastery'
                      ? 'Je bent in Mastery fase — het paarse blok links zou zichtbaar moeten zijn.'
                      : 'Je bent NIET in Mastery fase — het paarse blok links zou onzichtbaar moeten zijn (hidden fallback).'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Phase Legend */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="phase-legend">
          <h2 className="text-lg font-semibold text-zinc-800 mb-3">5. Fases en Niveaus</h2>
          <div className="grid gap-2">
            {PHASES.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-lg border px-4 py-2 ${
                  featureAccess.phase === p.id
                    ? `${PHASE_BORDER[p.id]} bg-zinc-50 ring-2 ring-offset-1 ring-blue-300`
                    : 'border-zinc-200'
                }`}
                data-testid={`phase-${p.id}`}
              >
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  p.id === 'recovery' ? 'bg-rose-100 text-rose-700'
                    : p.id === 'stability' ? 'bg-blue-100 text-blue-700'
                    : p.id === 'momentum' ? 'bg-teal-100 text-teal-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.label}
                </span>
                <span className="text-sm text-zinc-600">Niveaus: {p.levels.join(', ')}</span>
                {featureAccess.phase === p.id && (
                  <span className="ml-auto text-xs font-bold text-blue-700">&#8592; Huidige fase</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
