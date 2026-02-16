'use client'

import { useState, useEffect } from 'react'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'
import { FeatureGate, LockedFeatureCard } from '@/components/app/feature-gate'
import { FeatureAccessProvider, useFeatureAccess } from '@/components/app/feature-access-provider'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

// ── Recovery persona financial data (Roos — deep in debt)
const RECOVERY_DATA = {
  assets: [{ current_value: 3500 }],
  debts: [
    { current_balance: 4800, debt_type: 'credit_card' },
    { current_balance: 12500, debt_type: 'personal_loan' },
    { current_balance: 1200, debt_type: 'payment_plan' },
  ],
  transactions: [
    { amount: -950, is_income: false },
    { amount: -220, is_income: false },
    { amount: -175, is_income: false },
    { amount: -530, is_income: false },
    { amount: -390, is_income: false },
    { amount: -555, is_income: false },
    { amount: -325, is_income: false },
    { amount: 2800, is_income: true },
    { amount: -950, is_income: false },
    { amount: -220, is_income: false },
    { amount: -175, is_income: false },
    { amount: -530, is_income: false },
    { amount: -390, is_income: false },
    { amount: -555, is_income: false },
    { amount: -325, is_income: false },
    { amount: 2800, is_income: true },
    { amount: -950, is_income: false },
    { amount: -220, is_income: false },
    { amount: -175, is_income: false },
    { amount: -530, is_income: false },
    { amount: -390, is_income: false },
    { amount: -555, is_income: false },
    { amount: -325, is_income: false },
    { amount: 2800, is_income: true },
  ],
  matrixJson: null,
}

// ── Stability persona financial data (improved finances)
const STABILITY_DATA = {
  assets: [{ current_value: 8000 }],
  debts: [
    { current_balance: 5000, debt_type: 'student_loan' }, // Not consumer debt
  ],
  transactions: [
    { amount: -600, is_income: false },
    { amount: -400, is_income: false },
    { amount: -400, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: 3400, is_income: true },
    { amount: -600, is_income: false },
    { amount: -400, is_income: false },
    { amount: -400, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: 3400, is_income: true },
    { amount: -600, is_income: false },
    { amount: -400, is_income: false },
    { amount: -400, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: -200, is_income: false },
    { amount: 3400, is_income: true },
  ],
  matrixJson: null,
}

const PHASE_COLORS: Record<string, string> = {
  recovery: 'bg-rose-100 text-rose-700 border-rose-200',
  stability: 'bg-blue-100 text-blue-700 border-blue-200',
  momentum: 'bg-teal-100 text-teal-700 border-teal-200',
  mastery: 'bg-amber-100 text-amber-700 border-amber-200',
}

function FeatureGatingDemo({ phase }: { phase: string }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Feature Gating — Current Phase: <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${PHASE_COLORS[phase]}`}>{phase}</span>
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {FEATURES.map(feature => {
          const isAccessible = DEFAULT_MATRIX[feature.id]?.[phase] ?? false
          const unlockPhase = PHASES.find(p => DEFAULT_MATRIX[feature.id]?.[p.id] === true)

          return (
            <div key={feature.id} data-testid={`feature-${feature.id}`} data-accessible={isAccessible}>
              {isAccessible ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-600 text-sm">&#10003;</span>
                    <span className="text-sm font-medium text-green-800">{feature.label}</span>
                  </div>
                  <p className="text-xs text-green-600">{feature.description}</p>
                </div>
              ) : (
                <LockedFeatureCard featureId={feature.id} currentPhase={phase} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpotlightDemo({ newFeatures }: { newFeatures: typeof FEATURES }) {
  const [showSpotlight, setShowSpotlight] = useState(false)

  useEffect(() => {
    if (newFeatures.length > 0) {
      const timer = setTimeout(() => setShowSpotlight(true), 300)
      return () => clearTimeout(timer)
    }
  }, [newFeatures])

  if (newFeatures.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Newly Unlocked Features — Spotlight Animation
        </h4>
        <button
          onClick={() => setShowSpotlight(s => !s)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {showSpotlight ? 'Hide' : 'Show'} Spotlight
        </button>
      </div>

      {showSpotlight && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {newFeatures.map((feature, index) => (
            <div
              key={feature.id}
              data-testid={`spotlight-${feature.id}`}
              className="feature-spotlight rounded-xl border-2 border-blue-400 bg-blue-50 p-4 shadow-lg shadow-blue-100/50 relative overflow-hidden"
              style={{
                animationDelay: `${index * 150}ms`,
              }}
            >
              {/* Shimmer overlay */}
              <div className="absolute inset-0 feature-spotlight-shimmer pointer-events-none" />

              {/* NEW badge */}
              <div className="absolute -top-0.5 -right-0.5">
                <span className="inline-flex items-center rounded-bl-lg rounded-tr-xl bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Nieuw
                </span>
              </div>

              <div className="relative z-10">
                <p className="text-sm font-semibold text-blue-900 pr-10">{feature.label}</p>
                <p className="text-xs text-blue-700 mt-1">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TestPhaseTransitionPage() {
  const [currentPhase, setCurrentPhase] = useState<'recovery' | 'stability'>('recovery')
  const [showTransitionModal, setShowTransitionModal] = useState(false)
  const [apiResults, setApiResults] = useState<{ tests: { name: string; pass: boolean; detail: string }[]; summary: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Compute feature access based on current simulated phase
  const financialData = currentPhase === 'recovery' ? RECOVERY_DATA : STABILITY_DATA
  const featureAccess = computeFeatureAccess(financialData)

  // Compute newly unlocked features for spotlight
  const newFeatures = FEATURES.filter(f =>
    DEFAULT_MATRIX[f.id]?.stability === true && !DEFAULT_MATRIX[f.id]?.recovery
  )

  useEffect(() => {
    fetch('/api/verify-phase-transition')
      .then(r => r.json())
      .then(setApiResults)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function simulateTransition() {
    if (currentPhase === 'recovery') {
      setShowTransitionModal(true)
      setCurrentPhase('stability')
    } else {
      setCurrentPhase('recovery')
      setShowTransitionModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Phase Transition Test</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Feature #90: Phase transition unlocks new features (Recovery → Stability)
          </p>
        </div>

        {/* API Test Results */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">API Verification Results</h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : apiResults ? (
            <div className="space-y-3">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${apiResults.tests.every(t => t.pass) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {apiResults.summary}
              </div>
              <div className="space-y-1.5">
                {apiResults.tests.map((test, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm" data-testid={`api-test-${i}`}>
                    <span className={test.pass ? 'text-green-600' : 'text-red-600'}>
                      {test.pass ? '✓' : '✗'}
                    </span>
                    <div>
                      <span className="font-medium text-zinc-700">{test.name}</span>
                      <span className="text-zinc-400 ml-2 text-xs">{test.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-500">Failed to load API results</p>
          )}
        </section>

        {/* Interactive Simulation */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Interactive Phase Transition Simulation</h2>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">Current Phase:</span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${PHASE_COLORS[currentPhase]}`} data-testid="current-phase">
                {currentPhase}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">Sovereignty Level:</span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-bold text-zinc-700" data-testid="sovereignty-level">
                {featureAccess.level}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">Net Worth:</span>
              <span className={`text-sm font-bold ${featureAccess.netWorth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(featureAccess.netWorth)}
              </span>
            </div>

            <button
              onClick={simulateTransition}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              data-testid="transition-button"
            >
              {currentPhase === 'recovery' ? 'Simulate Recovery → Stability Transition' : 'Reset to Recovery'}
            </button>
          </div>

          {/* Feature gating visualization */}
          <FeatureGatingDemo phase={currentPhase} />
        </section>

        {/* Spotlight Animation Section */}
        {currentPhase === 'stability' && (
          <section className="rounded-xl border border-blue-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">
              Feature Spotlight — Newly Unlocked
            </h2>
            <SpotlightDemo newFeatures={newFeatures} />
          </section>
        )}

        {/* Phase Transition Modal — shown when transitioning */}
        {showTransitionModal && (
          <div>
            <PhaseTransitionModal
              oldPhase="recovery"
              newPhase="stability"
              onClose={() => setShowTransitionModal(false)}
            />
            {/* Overlay close button for test — since CTA navigates away */}
            <button
              data-testid="close-modal-test"
              onClick={() => setShowTransitionModal(false)}
              className="fixed top-4 right-4 z-[60] rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-lg hover:bg-white border border-zinc-200"
            >
              Close Modal (Test)
            </button>
          </div>
        )}
      </div>

      {/* CSS for spotlight animation */}
      <style>{`
        .feature-spotlight {
          animation: spotlightFadeIn 0.6s ease-out both;
        }

        @keyframes spotlightFadeIn {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .feature-spotlight-shimmer {
          background: linear-gradient(
            110deg,
            transparent 30%,
            rgba(59, 130, 246, 0.08) 50%,
            transparent 70%
          );
          animation: shimmer 2.5s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  )
}
