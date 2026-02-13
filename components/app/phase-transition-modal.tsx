'use client'

import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { FfinAvatar } from '@/components/app/avatars'

type Props = {
  oldPhase: string
  newPhase: string
  onClose: () => void
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

export function PhaseTransitionModal({ oldPhase, newPhase, onClose }: Props) {
  const colors = PHASE_COLORS[newPhase] ?? PHASE_COLORS.stability
  const oldColors = PHASE_COLORS[oldPhase] ?? PHASE_COLORS.recovery

  // Compute newly unlocked features
  const newFeatures = FEATURES.filter(f =>
    DEFAULT_MATRIX[f.id]?.[newPhase] && !DEFAULT_MATRIX[f.id]?.[oldPhase]
  )

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

        {/* Footer */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <button
            onClick={onClose}
            className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90`}
          >
            Ontdek je nieuwe mogelijkheden
          </button>
        </div>
      </div>
    </div>
  )
}
