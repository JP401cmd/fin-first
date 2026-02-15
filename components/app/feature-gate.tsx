'use client'

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { FEATURES, PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'

type FeatureGateProps = {
  featureId: string
  fallback?: 'hidden' | 'locked' | ReactNode
  children: ReactNode
}

/**
 * Find the earliest phase where a feature becomes available.
 */
function getUnlockPhase(featureId: string): { id: string; label: string; color: string; index: number } | null {
  const row = DEFAULT_MATRIX[featureId]
  if (!row) return null
  for (let i = 0; i < PHASES.length; i++) {
    if (row[PHASES[i].id] === true) {
      return { id: PHASES[i].id, label: PHASES[i].label, color: PHASES[i].color, index: i }
    }
  }
  return null
}

/** Phase badge color classes */
const PHASE_BADGE_COLORS: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-700',
  blue: 'bg-blue-100 text-blue-700',
  teal: 'bg-teal-100 text-teal-700',
  amber: 'bg-amber-100 text-amber-700',
}

/** Phase progress bar color classes */
const PHASE_BAR_COLORS: Record<string, string> = {
  rose: 'bg-rose-400',
  blue: 'bg-blue-400',
  teal: 'bg-teal-400',
  amber: 'bg-amber-400',
}

export function FeatureGate({ featureId, fallback = 'hidden', children }: FeatureGateProps) {
  const { features, phase: currentPhase } = useFeatureAccess()

  // Fail-open: features not in the map are shown
  if (features[featureId] !== false) {
    return <>{children}</>
  }

  if (fallback === 'hidden') {
    return null
  }

  if (fallback === 'locked') {
    return <LockedFeatureCard featureId={featureId} currentPhase={currentPhase} />
  }

  // Custom fallback
  return <>{fallback}</>
}

/**
 * LockedFeatureCard — shows a locked feature with:
 * - Feature name and description
 * - Unlock phase badge
 * - Mini progress bar toward unlock
 * - Dashed border and muted styling
 * - Non-clickable (div, not a link)
 */
export function LockedFeatureCard({ featureId, currentPhase }: { featureId: string; currentPhase: string }) {
  const featureDef = FEATURES.find(f => f.id === featureId)
  const unlockPhase = getUnlockPhase(featureId)

  // Compute progress toward unlock
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhase)
  const unlockPhaseIndex = unlockPhase?.index ?? PHASES.length
  // Progress: how far through the phases (0 = just started, 100 = at unlock phase)
  // If currentPhaseIndex === 0 and unlock is at 2, progress = 0/2 = 0%
  // If currentPhaseIndex === 1 and unlock is at 2, progress = 1/2 = 50%
  const progressPct = unlockPhaseIndex > 0
    ? Math.min(Math.round((currentPhaseIndex / unlockPhaseIndex) * 100), 100)
    : 0

  const badgeColorClass = unlockPhase ? (PHASE_BADGE_COLORS[unlockPhase.color] ?? 'bg-zinc-100 text-zinc-600') : 'bg-zinc-100 text-zinc-600'
  const barColorClass = unlockPhase ? (PHASE_BAR_COLORS[unlockPhase.color] ?? 'bg-zinc-400') : 'bg-zinc-400'

  return (
    <div
      className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-6 opacity-75"
      data-testid="locked-feature-card"
      aria-disabled="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {/* Lock icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/60">
          <Lock className="h-5 w-5 text-zinc-400" />
        </div>

        {/* Feature name */}
        <p className="text-sm font-medium text-zinc-600">
          {featureDef?.label ?? featureId}
        </p>

        {/* Feature description */}
        <p className="text-xs text-zinc-400">
          {featureDef?.description ?? 'Deze feature is nog niet beschikbaar in je huidige fase.'}
        </p>

        {/* Unlock phase badge */}
        {unlockPhase && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${badgeColorClass}`}>
            <Lock className="h-3 w-3" />
            Beschikbaar vanaf {unlockPhase.label}
          </span>
        )}

        {/* Mini progress bar toward unlock */}
        <div className="mt-1 w-full max-w-[200px]">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
            <span>{PHASES[currentPhaseIndex]?.label ?? 'Start'}</span>
            <span>{unlockPhase?.label ?? '?'}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className={`h-full rounded-full transition-all ${barColorClass}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
