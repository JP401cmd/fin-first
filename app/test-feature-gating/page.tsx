'use client'

import { useState, useMemo } from 'react'
import { Lock, Unlock, Shield, ChevronDown } from 'lucide-react'
import { computeFeatureAccess, isFeatureAccessible, type FeatureAccessData } from '@/lib/compute-feature-access'
import { PHASES, FEATURES, DEFAULT_MATRIX, computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { FeatureGate, LockedFeatureCard } from '@/components/app/feature-gate'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'

/** Predefined scenarios for each phase */
const PHASE_SCENARIOS: Record<string, { assets: number; debts: number; debtType: string; expenses: number; label: string }> = {
  'recovery-neg': { assets: 0, debts: 15000, debtType: 'credit_card', expenses: 2000, label: 'Recovery (Level -2): Schulden + consumentenkredieten' },
  'recovery-zero': { assets: 500, debts: 0, debtType: 'none', expenses: 2000, label: 'Recovery (Level 0): Net bijna nul' },
  'stability-1': { assets: 5000, debts: 0, debtType: 'none', expenses: 2000, label: 'Stability (Level 1): 2.5 maanden buffer' },
  'stability-2': { assets: 10000, debts: 0, debtType: 'none', expenses: 2000, label: 'Stability (Level 2): 5 maanden buffer' },
  'momentum-3': { assets: 80000, debts: 0, debtType: 'none', expenses: 2000, label: 'Momentum (Level 3): 15% vrijheid' },
  'momentum-4': { assets: 300000, debts: 0, debtType: 'none', expenses: 2000, label: 'Momentum (Level 4): 50% vrijheid' },
  'mastery-5': { assets: 500000, debts: 0, debtType: 'none', expenses: 2000, label: 'Mastery (Level 5): 83% vrijheid' },
  'mastery-6': { assets: 700000, debts: 0, debtType: 'none', expenses: 2000, label: 'Mastery (Level 6): 117% - volledig vrij' },
}

const PHASE_COLORS: Record<string, string> = {
  recovery: 'bg-rose-100 text-rose-800 border-rose-200',
  stability: 'bg-blue-100 text-blue-800 border-blue-200',
  momentum: 'bg-teal-100 text-teal-800 border-teal-200',
  mastery: 'bg-amber-100 text-amber-800 border-amber-200',
}

const PHASE_BG: Record<string, string> = {
  recovery: 'from-rose-600 to-rose-800',
  stability: 'from-blue-600 to-blue-800',
  momentum: 'from-teal-600 to-teal-800',
  mastery: 'from-amber-600 to-amber-800',
}

export default function TestFeatureGatingPage() {
  const [scenario, setScenario] = useState('recovery-zero')

  const sc = PHASE_SCENARIOS[scenario]

  const featureAccess: FeatureAccessData = useMemo(() => {
    const debts = sc.debtType !== 'none'
      ? [{ current_balance: sc.debts, debt_type: sc.debtType }]
      : []
    const assets = [{ current_value: sc.assets }]
    // Spread expenses over 3 months (the computation divides by 3)
    const transactions = [
      { amount: -sc.expenses, is_income: false },
      { amount: -sc.expenses, is_income: false },
      { amount: -sc.expenses, is_income: false },
    ]
    return computeFeatureAccess({ assets, debts, transactions, activeSubscriptions: [], userFeaturePrefs: null, matrixJson: null })
  }, [sc])

  const accessibleCount = Object.values(featureAccess.features).filter(v => v.accessible).length
  const lockedCount = Object.values(featureAccess.features).filter(v => !v.accessible).length

  return (
    <FeatureAccessProvider data={featureAccess}>
      <div className="min-h-screen bg-zinc-50">
        {/* Hero */}
        <div className={`bg-gradient-to-br ${PHASE_BG[featureAccess.phase]} px-6 py-10 text-white`}>
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-bold">Feature Gating Test</h1>
            <p className="mt-1 text-sm text-white/80">Verifieer dat FeatureGate correct werkt per soevereiniteitsniveau</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Fase: {PHASES.find(p => p.id === featureAccess.phase)?.label}
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Level: {featureAccess.level}
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Vrijheid: {featureAccess.freedomPct.toFixed(1)}%
              </div>
              <div className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium">
                Vermogen: EUR {featureAccess.netWorth.toLocaleString('nl-NL')}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-6 py-8">
          {/* Scenario selector */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-zinc-700 mb-2">Kies scenario:</label>
            <div className="relative">
              <select
                value={scenario}
                onChange={e => setScenario(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-zinc-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                data-testid="scenario-select"
              >
                {Object.entries(PHASE_SCENARIOS).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          {/* Summary stats */}
          <div className="mb-8 grid grid-cols-2 gap-4" data-testid="access-summary">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
              <Unlock className="mx-auto h-6 w-6 text-green-600" />
              <p className="mt-1 text-2xl font-bold text-green-700" data-testid="accessible-count">{accessibleCount}</p>
              <p className="text-sm text-green-600">Toegankelijk</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <Lock className="mx-auto h-6 w-6 text-red-600" />
              <p className="mt-1 text-2xl font-bold text-red-700" data-testid="locked-count">{lockedCount}</p>
              <p className="text-sm text-red-600">Vergrendeld</p>
            </div>
          </div>

          {/* Feature matrix table */}
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden mb-8" data-testid="feature-matrix">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
              <h2 className="font-semibold text-zinc-800">Feature-Fase Matrix</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Welke features beschikbaar zijn per fase</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-600">
                    <th className="px-4 py-2 text-left font-medium">Feature</th>
                    {PHASES.map(p => (
                      <th key={p.id} className={`px-4 py-2 text-center font-medium ${featureAccess.phase === p.id ? 'bg-zinc-200/60' : ''}`}>
                        {p.label}
                        {featureAccess.phase === p.id && <span className="ml-1 text-xs">(huidig)</span>}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map(feat => {
                    const isAccessible = isFeatureAccessible(featureAccess.features, feat.id)
                    const matrixRow = DEFAULT_MATRIX[feat.id] || {}
                    return (
                      <tr key={feat.id} className="border-t border-zinc-100 hover:bg-zinc-50/50" data-testid={`feature-row-${feat.id}`}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-zinc-800">{feat.label}</span>
                          <span className="block text-xs text-zinc-400">{feat.description}</span>
                        </td>
                        {PHASES.map(p => (
                          <td key={p.id} className={`px-4 py-2.5 text-center ${featureAccess.phase === p.id ? 'bg-zinc-100/60' : ''}`}>
                            {matrixRow[p.id] ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">&#10003;</span>
                            ) : (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-400 text-xs">&#10005;</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isAccessible
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                            data-testid={`status-${feat.id}`}
                          >
                            {isAccessible ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {isAccessible ? 'Beschikbaar' : 'Vergrendeld'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live FeatureGate demo */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-8" data-testid="live-demo">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">Live FeatureGate Demo</h2>
            <p className="text-sm text-zinc-500 mb-6">Hieronder zie je features achter een FeatureGate met <code className="bg-zinc-100 px-1 rounded">fallback=&quot;locked&quot;</code></p>

            <div className="space-y-4">
              {/* Recovery features */}
              <h3 className="font-medium text-zinc-700 text-sm mt-4">Recovery Features (beschikbaar in Recovery):</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <FeatureGate featureId="budget_optimalisatie" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-budget_optimalisatie">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Budget Optimalisatie</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
                <FeatureGate featureId="schulden_aflosplan" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-schulden_aflosplan">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Schulden Aflosplan</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
              </div>

              {/* Stability features */}
              <h3 className="font-medium text-zinc-700 text-sm mt-6">Stability Features (beschikbaar vanaf Stability):</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <FeatureGate featureId="box3_belasting" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-box3_belasting">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Box 3 Belasting</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
                <FeatureGate featureId="fire_projecties" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-fire_projecties">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">FIRE Projecties</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
              </div>

              {/* Momentum features */}
              <h3 className="font-medium text-zinc-700 text-sm mt-6">Momentum Features (beschikbaar vanaf Momentum):</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <FeatureGate featureId="monte_carlo" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-monte_carlo">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Monte Carlo Simulaties</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
                <FeatureGate featureId="asset_allocatie" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-asset_allocatie">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Asset Allocatie</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
              </div>

              {/* Mastery features */}
              <h3 className="font-medium text-zinc-700 text-sm mt-6">Mastery Features (beschikbaar vanaf Mastery):</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <FeatureGate featureId="withdrawal_strategie" fallback="locked">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-testid="gate-withdrawal_strategie">
                    <Shield className="h-5 w-5 text-green-600 mb-1" />
                    <p className="font-medium text-green-800">Withdrawal Strategieen</p>
                    <p className="text-xs text-green-600">Beschikbaar - je kunt deze feature gebruiken!</p>
                  </div>
                </FeatureGate>
              </div>

              {/* FeatureGate with hidden fallback (default) */}
              <h3 className="font-medium text-zinc-700 text-sm mt-6">Hidden Fallback Demo:</h3>
              <p className="text-xs text-zinc-400 mb-2">Features met <code className="bg-zinc-100 px-1 rounded">fallback=&quot;hidden&quot;</code> worden onzichtbaar wanneer vergrendeld:</p>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2" data-testid="hidden-demo">
                <FeatureGate featureId="withdrawal_strategie">
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4" data-testid="hidden-withdrawal">
                    <p className="font-medium text-purple-800">Withdrawal (hidden fallback)</p>
                    <p className="text-xs text-purple-600">Alleen zichtbaar als Mastery fase bereikt</p>
                  </div>
                </FeatureGate>
                <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-center">
                  <p className="text-xs text-zinc-400">Als je deze tekst ziet maar niet het paarse blok links, dan werkt hidden fallback correct.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Phase legend */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-3">Fase Niveaus</h2>
            <div className="grid gap-2">
              {PHASES.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2 ${
                    featureAccess.phase === p.id ? PHASE_COLORS[p.id] + ' ring-2 ring-offset-1' : 'border-zinc-200'
                  }`}
                  data-testid={`phase-${p.id}`}
                >
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PHASE_COLORS[p.id]}`}>
                    {p.label}
                  </span>
                  <span className="text-sm text-zinc-600">
                    Niveaus: {p.levels.join(', ')}
                  </span>
                  {featureAccess.phase === p.id && (
                    <span className="ml-auto text-xs font-semibold text-zinc-700">&#8592; Huidige fase</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FeatureAccessProvider>
  )
}
