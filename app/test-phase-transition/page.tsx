'use client'

import { useState, useEffect } from 'react'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'

const PHASE_PAIRS: { old: string; new: string; label: string }[] = [
  { old: 'recovery', new: 'stability', label: 'Recovery → Stability' },
  { old: 'stability', new: 'momentum', label: 'Stability → Momentum' },
  { old: 'momentum', new: 'mastery', label: 'Momentum → Mastery' },
]

const PHASE_BADGE: Record<string, string> = {
  recovery: 'bg-rose-100 text-rose-700',
  stability: 'bg-blue-100 text-blue-700',
  momentum: 'bg-teal-100 text-teal-700',
  mastery: 'bg-amber-100 text-amber-700',
}

export default function TestPhaseTransitionPage() {
  const [activeModal, setActiveModal] = useState<{ old: string; new: string } | null>(null)
  const [apiResults, setApiResults] = useState<{ tests: { name: string; pass: boolean; detail: string }[]; summary: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-phase-transition')
      .then(r => r.json())
      .then(setApiResults)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Phase Transition Celebration Modal</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Feature #193: PhaseTransitionModal for sovereignty level increases
          </p>
        </div>

        {/* API Test Results */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Verification Results</h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : apiResults ? (
            <div className="space-y-3">
              <div
                data-testid="verification-summary"
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
                  apiResults.tests.every(t => t.pass) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
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

        {/* Phase Transition Demo Buttons */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Interactive Phase Transition Demos</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Click a button to trigger the phase transition celebration modal. Test close button (X), overlay click, and Escape key.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PHASE_PAIRS.map(pair => {
              const newFeatures = FEATURES.filter(f =>
                DEFAULT_MATRIX[f.id]?.[pair.new] && !DEFAULT_MATRIX[f.id]?.[pair.old]
              )
              return (
                <button
                  key={pair.label}
                  data-testid={`trigger-${pair.old}-${pair.new}`}
                  onClick={() => setActiveModal({ old: pair.old, new: pair.new })}
                  className="rounded-xl border-2 border-zinc-200 bg-zinc-50 p-4 text-left hover:border-zinc-300 hover:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PHASE_BADGE[pair.old]}`}>
                      {pair.old}
                    </span>
                    <span className="text-zinc-400">→</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PHASE_BADGE[pair.new]}`}>
                      {pair.new}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-zinc-700">{pair.label}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Unlocks {newFeatures.length} new features
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Feature Requirements Checklist */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Feature Requirements</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">PhaseTransitionModal component created</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">Detects sovereignty level increase in layout</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">Shows &quot;Gefeliciteerd! Je bent nu in de [Phase]-fase&quot;</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">Lists newly unlocked features with mini descriptions</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">&quot;Ontdek je nieuwe mogelijkheden&quot; CTA button</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">Themed animation matching phase color (sparkles + entrance)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-zinc-700">Close button (X) and overlay click dismiss</span>
            </li>
          </ul>
        </section>

        {/* Active Modal */}
        {activeModal && (
          <PhaseTransitionModal
            oldPhase={activeModal.old}
            newPhase={activeModal.new}
            onClose={() => setActiveModal(null)}
          />
        )}
      </div>
    </div>
  )
}
