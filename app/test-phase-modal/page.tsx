'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { FfinAvatar } from '@/components/app/avatars'

// Map feature IDs to the most relevant app page for navigation
const FEATURE_PAGE_MAP: Record<string, string> = {
  nibud_benchmark: '/core/budgets',
  box3_belasting: '/core/belasting',
  budget_optimalisatie: '/core/budgets',
  schulden_aflosplan: '/core/debts',
  asset_allocatie: '/core/assets',
  vermogensverloop: '/core',
  snapshot_vergelijking: '/core',
  cashflow_sankey: '/core',
  data_export: '/core',
  doelen_systeem: '/will',
  beslissingspatronen: '/will',
  fire_projecties: '/horizon',
  monte_carlo: '/horizon',
  levensgebeurtenissen: '/horizon',
  withdrawal_strategie: '/horizon',
  gezondheids_score: '/horizon',
  vermogensprojectie_chart: '/horizon',
  fire_scenario_analyse: '/horizon',
  fire_geavanceerde_params: '/horizon',
}

function getBestNavigationTarget(featureIds: string[]): string {
  if (featureIds.length === 0) return '/dashboard'

  const pageCounts: Record<string, number> = {}
  for (const id of featureIds) {
    const page = FEATURE_PAGE_MAP[id] ?? '/dashboard'
    const module = page.startsWith('/core') ? '/core'
      : page.startsWith('/will') ? '/will'
      : page.startsWith('/horizon') ? '/horizon'
      : '/dashboard'
    pageCounts[module] = (pageCounts[module] ?? 0) + 1
  }

  let bestPage = '/dashboard'
  let bestCount = 0
  for (const [page, count] of Object.entries(pageCounts)) {
    if (count > bestCount) {
      bestCount = count
      bestPage = page
    }
  }

  return bestPage
}

const PHASE_COLORS: Record<string, { gradient: string; bg: string; border: string; text: string; badge: string }> = {
  recovery:  { gradient: 'from-rose-500 to-rose-600',  bg: 'bg-rose-50',  border: 'border-rose-200',  text: 'text-rose-700',  badge: 'bg-rose-100 text-rose-700' },
  stability: { gradient: 'from-blue-500 to-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700' },
  momentum:  { gradient: 'from-teal-500 to-teal-600',  bg: 'bg-teal-50',  border: 'border-teal-200',  text: 'text-teal-700',  badge: 'bg-teal-100 text-teal-700' },
  mastery:   { gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
}

function phaseLabel(id: string): string {
  return PHASES.find(p => p.id === id)?.label ?? id
}

export default function TestPhaseModalPage() {
  const router = useRouter()
  const [selectedTransition, setSelectedTransition] = useState<{ old: string; new: string } | null>(null)
  const [lastNavigation, setLastNavigation] = useState<string | null>(null)
  const [modalClosed, setModalClosed] = useState(false)

  // All possible phase transitions
  const transitions = [
    { old: 'recovery', new: 'stability', label: 'Recovery → Stability' },
    { old: 'recovery', new: 'momentum', label: 'Recovery → Momentum' },
    { old: 'recovery', new: 'mastery', label: 'Recovery → Mastery' },
    { old: 'stability', new: 'momentum', label: 'Stability → Momentum' },
    { old: 'stability', new: 'mastery', label: 'Stability → Mastery' },
    { old: 'momentum', new: 'mastery', label: 'Momentum → Mastery' },
  ]

  function handleClose(targetPage: string) {
    setLastNavigation(targetPage)
    setModalClosed(true)
    // Don't actually navigate during test - just record where we'd go
  }

  function handleCtaWithNavigation(targetPage: string) {
    setLastNavigation(targetPage)
    setModalClosed(true)
    // Actually navigate to verify it works
    router.push(targetPage)
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Phase Transition Modal Test</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Test the PhaseTransitionModal component. Select a transition to see the celebration modal.
        </p>

        {/* Transition selector */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Select a Transition</h2>
          <div className="grid grid-cols-2 gap-3">
            {transitions.map(t => {
              const newColors = PHASE_COLORS[t.new]
              return (
                <button
                  key={`${t.old}-${t.new}`}
                  onClick={() => {
                    setSelectedTransition({ old: t.old, new: t.new })
                    setModalClosed(false)
                    setLastNavigation(null)
                  }}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all hover:shadow-md ${
                    selectedTransition?.old === t.old && selectedTransition?.new === t.new
                      ? `bg-gradient-to-r ${newColors.gradient} text-white border-transparent`
                      : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Show newly unlocked features for the selected transition */}
        {selectedTransition && (
          <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Debug Info</h2>
            {(() => {
              const newFeatures = FEATURES.filter(f =>
                DEFAULT_MATRIX[f.id]?.[selectedTransition.new] && !DEFAULT_MATRIX[f.id]?.[selectedTransition.old]
              )
              const targetPage = getBestNavigationTarget(newFeatures.map(f => f.id))
              return (
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Newly unlocked:</span> {newFeatures.length} features</p>
                  <p><span className="font-medium">CTA target:</span> <code className="bg-zinc-100 px-2 py-0.5 rounded">{targetPage}</code></p>
                  {lastNavigation && (
                    <p><span className="font-medium">Last navigation:</span> <code className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{lastNavigation}</code></p>
                  )}
                  {modalClosed && (
                    <p className="text-green-600 font-medium">Modal was closed successfully</p>
                  )}
                  <div className="mt-2">
                    <p className="font-medium mb-1">Features:</p>
                    <ul className="list-disc list-inside text-zinc-600">
                      {newFeatures.map(f => (
                        <li key={f.id}>{f.label} → {FEATURE_PAGE_MAP[f.id] ?? '/dashboard'}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Render the actual modal */}
        {selectedTransition && !modalClosed && (
          <TestModal
            oldPhase={selectedTransition.old}
            newPhase={selectedTransition.new}
            onClose={handleClose}
            onNavigate={handleCtaWithNavigation}
          />
        )}
      </div>
    </div>
  )
}

function TestModal({ oldPhase, newPhase, onClose, onNavigate }: {
  oldPhase: string
  newPhase: string
  onClose: (target: string) => void
  onNavigate: (target: string) => void
}) {
  const colors = PHASE_COLORS[newPhase] ?? PHASE_COLORS.stability
  const oldColors = PHASE_COLORS[oldPhase] ?? PHASE_COLORS.recovery

  const newFeatures = FEATURES.filter(f =>
    DEFAULT_MATRIX[f.id]?.[newPhase] && !DEFAULT_MATRIX[f.id]?.[oldPhase]
  )

  const targetPage = getBestNavigationTarget(newFeatures.map(f => f.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-r ${colors.gradient} px-6 py-8 text-center text-white`}>
          <div className="mx-auto mb-4 flex justify-center">
            <FfinAvatar size={72} />
          </div>
          <h2 className="text-xl font-bold">Gefeliciteerd!</h2>
          <p className="mt-1 text-sm text-white/90">Je hebt een nieuwe fase bereikt</p>

          {/* Phase transition visual */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${oldColors.badge}`}>
              {phaseLabel(oldPhase)}
            </span>
            <svg className="h-5 w-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${colors.badge} ring-2 ring-white/30`}>
              {phaseLabel(newPhase)}
            </span>
          </div>
        </div>

        {/* Body: newly unlocked features */}
        <div className="px-6 py-5">
          {newFeatures.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">
                Nieuw ontgrendeld ({newFeatures.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {newFeatures.map(f => (
                  <div
                    key={f.id}
                    className={`rounded-lg ${colors.bg} ${colors.border} border px-4 py-3`}
                  >
                    <p className={`text-sm font-medium ${colors.text}`}>{f.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{f.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {newFeatures.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-2">
              Je bent klaar voor de volgende stap in je financiele reis.
            </p>
          )}
        </div>

        {/* Footer with CTA */}
        <div className="border-t border-zinc-100 px-6 py-4 space-y-2">
          <button
            data-testid="cta-navigate"
            onClick={() => onNavigate(targetPage)}
            className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90`}
          >
            Ontdek je nieuwe mogelijkheden
          </button>
          <button
            data-testid="cta-close"
            onClick={() => onClose(targetPage)}
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
          >
            Sluiten (zonder navigatie)
          </button>
          <p className="text-xs text-center text-zinc-400 mt-1">
            Target: {targetPage}
          </p>
        </div>
      </div>
    </div>
  )
}
