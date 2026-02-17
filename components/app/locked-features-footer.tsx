'use client'

import { useState } from 'react'
import { Lock, ChevronRight, Sparkles } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { FEATURES, PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { BottomSheet } from '@/components/app/bottom-sheet'

/** Map feature IDs to module pages where they're gated */
const MODULE_FEATURES: Record<string, string[]> = {
  kern: [
    'box3_belasting',
    'vermogensverloop',
    'snapshot_vergelijking',
    'cashflow_sankey',
    'data_export',
    'budget_optimalisatie',
    'asset_allocatie',
  ],
  wil: [
    'nibud_benchmark',
    'doelen_systeem',
    'beslissingspatronen',
    'schulden_aflosplan',
  ],
  horizon: [
    'fire_projecties',
    'fire_scenario_analyse',
    'monte_carlo',
    'levensgebeurtenissen',
    'withdrawal_strategie',
    'veerkracht_score',
    'vermogensprojectie_chart',
    'fire_geavanceerde_params',
  ],
}

const MODULE_COLORS: Record<string, { gradient: string; text: string; border: string; bg: string; dot: string }> = {
  kern:    { gradient: 'from-amber-50 to-amber-100/50', text: 'text-amber-700', border: 'border-amber-200', bg: 'bg-amber-50', dot: 'bg-amber-400' },
  wil:     { gradient: 'from-teal-50 to-teal-100/50',   text: 'text-teal-700',  border: 'border-teal-200',  bg: 'bg-teal-50',  dot: 'bg-teal-400' },
  horizon: { gradient: 'from-purple-50 to-purple-100/50', text: 'text-purple-700', border: 'border-purple-200', bg: 'bg-purple-50', dot: 'bg-purple-400' },
}

interface LockedFeaturesFooterProps {
  module: 'kern' | 'wil' | 'horizon'
  /** Optional: Override with specific feature IDs for sub-pages that only gate a subset of module features */
  featureIds?: string[]
}

/**
 * Find the earliest phase where a feature becomes available.
 */
function getUnlockPhase(featureId: string): string | null {
  const row = DEFAULT_MATRIX[featureId]
  if (!row) return null
  for (const phase of PHASES) {
    if (row[phase.id] === true) return phase.id
  }
  return null
}

export function LockedFeaturesFooter({ module, featureIds }: LockedFeaturesFooterProps) {
  const { features, phase: currentPhase } = useFeatureAccess()
  const [showPanel, setShowPanel] = useState(false)

  // Get locked features for this module (or use explicit featureIds for sub-pages)
  const moduleFeatureIds = featureIds ?? MODULE_FEATURES[module] ?? []
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

  // Don't show if no locked features
  if (lockedFeatures.length === 0) return null

  // Find the next phase the user needs to reach
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase)
  const nextPhase = PHASES[currentPhaseIndex + 1]

  // Group locked features by their unlock phase
  const groupedByPhase: Record<string, typeof lockedFeatures> = {}
  for (const feat of lockedFeatures) {
    if (!groupedByPhase[feat.unlockPhase]) {
      groupedByPhase[feat.unlockPhase] = []
    }
    groupedByPhase[feat.unlockPhase].push(feat)
  }

  // Sort groups by phase order
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
      <section className="mt-10 mb-2">
        <button
          onClick={() => setShowPanel(true)}
          className={`w-full rounded-xl border ${colors.border} bg-gradient-to-r ${colors.gradient} px-5 py-4 transition-all hover:shadow-md`}
          data-testid="locked-features-footer"
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
      </section>

      {/* Summary panel (BottomSheet) */}
      <BottomSheet
        open={showPanel}
        onClose={() => setShowPanel(false)}
        title="Vergrendelde functies"
      >
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
                      <div
                        key={feat.id}
                        className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-white p-3"
                      >
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
      </BottomSheet>
    </>
  )
}
