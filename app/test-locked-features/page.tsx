'use client'

import { useState, createContext, useContext, type ReactNode } from 'react'
import { Lock, ChevronRight, Sparkles, X } from 'lucide-react'
import { FEATURES, PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'

/**
 * Test page for verifying the LockedFeaturesFooter component.
 * Renders a standalone version of the footer for each module with simulated feature access data.
 */

type AIDomain = 'kern' | 'wil' | 'horizon'

const MODULE_FEATURES: Record<string, string[]> = {
  kern: ['box3_belasting', 'vermogensverloop', 'snapshot_vergelijking', 'cashflow_sankey', 'data_export', 'budget_optimalisatie', 'asset_allocatie'],
  wil: ['nibud_benchmark', 'doelen_systeem', 'beslissingspatronen', 'schulden_aflosplan'],
  horizon: ['fire_projecties', 'fire_scenario_analyse', 'monte_carlo', 'levensgebeurtenissen', 'withdrawal_strategie', 'gezondheids_score', 'vermogensprojectie_chart', 'fire_geavanceerde_params'],
}

const MODULE_COLORS: Record<string, { gradient: string; text: string; border: string; bg: string }> = {
  kern: { gradient: 'from-amber-50 to-amber-100/50', text: 'text-amber-700', border: 'border-amber-200', bg: 'bg-amber-50' },
  wil: { gradient: 'from-teal-50 to-teal-100/50', text: 'text-teal-700', border: 'border-teal-200', bg: 'bg-teal-50' },
  horizon: { gradient: 'from-purple-50 to-purple-100/50', text: 'text-purple-700', border: 'border-purple-200', bg: 'bg-purple-50' },
}

function getUnlockPhase(featureId: string): string | null {
  const row = DEFAULT_MATRIX[featureId]
  if (!row) return null
  for (const phase of PHASES) {
    if (row[phase.id] === true) return phase.id
  }
  return null
}

function computeFeaturesForPhase(phaseId: string): Record<string, boolean> {
  const features: Record<string, boolean> = {}
  for (const feat of FEATURES) {
    features[feat.id] = DEFAULT_MATRIX[feat.id]?.[phaseId] ?? false
  }
  return features
}

function TestLockedFooter({ module, phase }: { module: AIDomain; phase: string }) {
  const [showPanel, setShowPanel] = useState(false)

  const features = computeFeaturesForPhase(phase)
  const currentPhase = phase
  const moduleFeatureIds = MODULE_FEATURES[module] ?? []
  const lockedFeatures = moduleFeatureIds
    .filter(id => features[id] === false)
    .map(id => {
      const def = FEATURES.find(f => f.id === id)
      const unlockPhase = getUnlockPhase(id)
      const unlockPhaseObj = PHASES.find(p => p.id === unlockPhase)
      return {
        id,
        label: def?.label ?? id,
        description: def?.description ?? '',
        unlockPhase: unlockPhase ?? 'unknown',
        unlockPhaseLabel: unlockPhaseObj?.label ?? 'Onbekend',
        unlockPhaseColor: unlockPhaseObj?.color ?? 'zinc',
      }
    })

  if (lockedFeatures.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-zinc-400">
        Geen vergrendelde functies (alle functies beschikbaar in fase {phase})
      </div>
    )
  }

  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase)
  const nextPhase = PHASES[currentPhaseIndex + 1]

  const groupedByPhase: Record<string, typeof lockedFeatures> = {}
  for (const feat of lockedFeatures) {
    if (!groupedByPhase[feat.unlockPhase]) {
      groupedByPhase[feat.unlockPhase] = []
    }
    groupedByPhase[feat.unlockPhase].push(feat)
  }

  const sortedPhaseGroups = PHASES
    .filter(p => groupedByPhase[p.id])
    .map(p => ({
      phase: p,
      features: groupedByPhase[p.id],
    }))

  const colors = MODULE_COLORS[module]

  return (
    <>
      {/* Footer bar */}
      <button
        onClick={() => setShowPanel(true)}
        data-testid={`locked-footer-${module}`}
        className={`w-full rounded-xl border ${colors.border} bg-gradient-to-r ${colors.gradient} px-5 py-4 transition-all hover:shadow-md`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-sm">
              <Lock className={`h-4 w-4 ${colors.text}`} />
            </div>
            <div className="text-left">
              <p className={`text-sm font-semibold ${colors.text}`}>
                {lockedFeatures.length} meer {lockedFeatures.length === 1 ? 'functie' : 'functies'} beschikbaar
                {nextPhase && (
                  <span className="font-normal text-zinc-500">
                    {' '}op niveau {nextPhase.label}
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                Klik om te zien welke functies je kunt ontgrendelen
              </p>
            </div>
          </div>
          <ChevronRight className={`h-5 w-5 ${colors.text} opacity-60`} />
        </div>
      </button>

      {/* Summary panel (simplified BottomSheet) */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={() => setShowPanel(false)}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-zinc-900">Vergrendelde functies</h2>
              <button onClick={() => setShowPanel(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pb-6 pt-4">
              {/* Current phase indicator */}
              <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-zinc-400" />
                  <p className="text-sm text-zinc-600">
                    Je bent nu in de <span className="font-semibold">{PHASES.find(p => p.id === currentPhase)?.label ?? currentPhase}</span> fase
                  </p>
                </div>
              </div>

              {/* Locked features grouped by unlock phase */}
              <div className="space-y-5">
                {sortedPhaseGroups.map(({ phase, features: phaseFeatures }) => {
                  const phaseColorMap: Record<string, string> = {
                    rose: 'bg-rose-100 text-rose-700 border-rose-200',
                    blue: 'bg-blue-100 text-blue-700 border-blue-200',
                    teal: 'bg-teal-100 text-teal-700 border-teal-200',
                    amber: 'bg-amber-100 text-amber-700 border-amber-200',
                  }
                  const badgeClass = phaseColorMap[phase.color] ?? 'bg-zinc-100 text-zinc-700 border-zinc-200'

                  return (
                    <div key={phase.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                          {phase.label}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {phaseFeatures.length} {phaseFeatures.length === 1 ? 'functie' : 'functies'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {phaseFeatures.map(feat => (
                          <div key={feat.id} className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-white p-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100">
                              <Lock className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-800">{feat.label}</p>
                              <p className="text-xs text-zinc-500">{feat.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Motivational message */}
              <div className="mt-5 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-3 text-center">
                <p className="text-xs text-zinc-500">
                  Verbeter je financiele positie om meer functies te ontgrendelen.
                  <br />
                  Elke stap brengt je dichter bij volledige vrijheid.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function TestLockedFeaturesPage() {
  const [selectedPhase, setSelectedPhase] = useState('recovery')

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Locked Features Footer Test</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that the &quot;Meer functies beschikbaar&quot; footer shows and opens a summary panel.
        </p>

        {/* Phase selector */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Simulate Phase</h2>
          <p className="text-xs text-zinc-500 mb-3">Select a sovereignty phase to see which features are locked:</p>
          <div className="flex gap-2">
            {PHASES.map(p => {
              const colorMap: Record<string, string> = {
                rose: 'bg-rose-100 text-rose-700 border-rose-300',
                blue: 'bg-blue-100 text-blue-700 border-blue-300',
                teal: 'bg-teal-100 text-teal-700 border-teal-300',
                amber: 'bg-amber-100 text-amber-700 border-amber-300',
              }
              const activeMap: Record<string, string> = {
                rose: 'bg-rose-600 text-white border-rose-600',
                blue: 'bg-blue-600 text-white border-blue-600',
                teal: 'bg-teal-600 text-white border-teal-600',
                amber: 'bg-amber-600 text-white border-amber-600',
              }
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPhase(p.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedPhase === p.id ? activeMap[p.color] : colorMap[p.color]
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer previews per module */}
        <div className="space-y-6">
          {(['kern', 'wil', 'horizon'] as const).map(module => {
            const moduleLabel = module === 'kern' ? 'De Kern' : module === 'wil' ? 'De Wil' : 'De Horizon'
            const headerBg = module === 'kern' ? 'bg-amber-600' : module === 'wil' ? 'bg-teal-600' : 'bg-purple-600'
            return (
              <div key={module} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className={`px-5 py-3 ${headerBg} text-white text-sm font-semibold`}>
                  {moduleLabel} — Locked Features Footer
                </div>
                <div className="p-5">
                  <TestLockedFooter module={module} phase={selectedPhase} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
