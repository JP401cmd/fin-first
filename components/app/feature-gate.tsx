'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { FEATURES, PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { isFeatureAccessible, getFeatureAccess } from '@/lib/compute-feature-access'
import { UNIFIED_FEATURES } from '@/lib/feature-registry'
import { LEGACY_FEATURE_MAP } from '@/lib/feature-phases'

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

/** Tier accent colors for TierLockedCard */
const TIER_ACCENT: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  connected: { border: 'border-kern-300', bg: 'bg-kern-50', text: 'text-kern-700', icon: 'text-kern-500' },
  ai:        { border: 'border-horizon-300', bg: 'bg-horizon-50', text: 'text-horizon-700', icon: 'text-horizon-500' },
}

const TIER_LABELS: Record<string, string> = {
  connected: 'Connected',
  ai: 'AI',
}

export function FeatureGate({ featureId, fallback = 'hidden', children }: FeatureGateProps) {
  const { features, phase: currentPhase, newlyUnlockedFeatures } = useFeatureAccess()

  // Use isFeatureAccessible for backward compat (supports legacy IDs)
  const accessible = isFeatureAccessible(features, featureId)
  const accessResult = getFeatureAccess(features, featureId)

  if (accessible) {
    // Wrap in spotlight animation if this feature was just unlocked by a phase transition
    // Resolve the canonical feature ID for spotlight tracking
    const canonicalId = LEGACY_FEATURE_MAP[featureId] ?? featureId
    const isNewlyUnlocked = newlyUnlockedFeatures.includes(canonicalId) || newlyUnlockedFeatures.includes(featureId)
    if (isNewlyUnlocked) {
      return <NewFeatureSpotlight featureId={featureId}>{children}</NewFeatureSpotlight>
    }
    return <>{children}</>
  }

  if (fallback === 'hidden') {
    return null
  }

  // Show TierLockedCard for tier-locked features with 'locked' fallback
  if (fallback === 'locked' && accessResult?.reason === 'tier_locked' && accessResult.requiredTier) {
    return <TierLockedCard featureId={featureId} requiredTier={accessResult.requiredTier} />
  }

  // User-disabled features are hidden (user chose to disable)
  if (accessResult?.reason === 'user_disabled') {
    return null
  }

  // Locked features without specific tier lock are hidden per design
  if (fallback === 'locked') {
    return null
  }

  // Custom fallback
  return <>{fallback}</>
}

/**
 * TierLockedCard — shows when a feature requires a higher commercial tier.
 * Lock icon + feature name + "Upgrade naar [Tier]" CTA.
 */
export function TierLockedCard({ featureId, requiredTier }: { featureId: string; requiredTier: string }) {
  // Resolve feature label from unified features or legacy
  const canonicalId = LEGACY_FEATURE_MAP[featureId] ?? featureId
  const featureDef = UNIFIED_FEATURES.find(f => f.id === canonicalId)
    ?? FEATURES.find(f => f.id === featureId)
  const accent = TIER_ACCENT[requiredTier] ?? TIER_ACCENT.ai
  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier

  return (
    <div
      className={`rounded-[var(--r-lg)] border border-dashed ${accent.border} ${accent.bg}/60 p-6 opacity-80`}
      data-testid="tier-locked-card"
      aria-disabled="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${accent.bg}`}>
          <Lock className={`h-5 w-5 ${accent.icon}`} />
        </div>
        <p className="text-sm font-medium text-[var(--ink-2)]">
          {featureDef?.label ?? featureId}
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          {featureDef?.description ?? 'Deze functie vereist een hoger abonnement.'}
        </p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${accent.text} ${accent.bg}`}>
          <Lock className="h-3 w-3" />
          Vereist {tierLabel} abonnement
        </span>
      </div>
    </div>
  )
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

  const badgeColorClass = unlockPhase ? (PHASE_BADGE_COLORS[unlockPhase.color] ?? 'bg-zinc-100 text-[var(--ink-2)]') : 'bg-zinc-100 text-[var(--ink-2)]'
  const barColorClass = unlockPhase ? (PHASE_BAR_COLORS[unlockPhase.color] ?? 'bg-zinc-400') : 'bg-zinc-400'

  return (
    <div
      className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/80 p-6 opacity-75"
      data-testid="locked-feature-card"
      aria-disabled="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {/* Lock icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/60">
          <Lock className="h-5 w-5 text-[var(--ink-3)]" />
        </div>

        {/* Feature name */}
        <p className="text-sm font-medium text-[var(--ink-2)]">
          {featureDef?.label ?? featureId}
        </p>

        {/* Feature description */}
        <p className="text-xs text-[var(--ink-3)]">
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
          <div className="flex items-center justify-between text-[10px] text-[var(--ink-3)] mb-1">
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

/**
 * NewFeatureSpotlight — wraps a newly unlocked feature with a
 * highlight animation on first visit after phase transition.
 *
 * Shows a subtle pulsing border + "Nieuw" badge + tooltip with feature name
 * that fades after 8 seconds, then the children render normally without the spotlight.
 *
 * Tooltip: "Nieuw! [Feature name] is nu beschikbaar"
 * Stored in localStorage per feature so it only shows once.
 */
export function NewFeatureSpotlight({ featureId, children }: { featureId: string; children: ReactNode }) {
  const [showSpotlight, setShowSpotlight] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  // Look up the human-readable feature label
  const featureDef = FEATURES.find(f => f.id === featureId)
  const featureLabel = featureDef?.label ?? featureId

  useEffect(() => {
    // Check if this feature spotlight was already "seen" (persisted in localStorage)
    try {
      const key = `spotlight_seen_${featureId}`
      if (localStorage.getItem(key)) {
        // Already seen — never show again
        return
      }
      // First time seeing this feature — show spotlight
      setShowSpotlight(true)
      // Immediately mark as seen in localStorage so it never shows again
      localStorage.setItem(key, '1')

      // Show tooltip after a brief delay (let animation start first)
      const tooltipTimer = setTimeout(() => setShowTooltip(true), 300)

      // Auto-dismiss the visual spotlight after 8 seconds
      const timer = setTimeout(() => {
        setShowSpotlight(false)
        setShowTooltip(false)
      }, 8000)
      return () => {
        clearTimeout(timer)
        clearTimeout(tooltipTimer)
      }
    } catch {
      // localStorage not available — show briefly then dismiss
      setShowSpotlight(true)
      const tooltipTimer = setTimeout(() => setShowTooltip(true), 300)
      const timer = setTimeout(() => {
        setShowSpotlight(false)
        setShowTooltip(false)
      }, 8000)
      return () => {
        clearTimeout(timer)
        clearTimeout(tooltipTimer)
      }
    }
  }, [featureId])

  if (!showSpotlight) {
    return <>{children}</>
  }

  return (
    <div
      className="relative"
      data-testid={`new-feature-spotlight-${featureId}`}
    >
      {/* Spotlight ring — animated subtle glow */}
      <div className="absolute -inset-0.5 rounded-[var(--r-lg)] bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 opacity-30 blur-sm animate-pulse pointer-events-none" />

      {/* "Nieuw" badge */}
      <div className="absolute -top-2 -right-2 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
          <Sparkles className="h-3 w-3" />
          Nieuw
        </span>
      </div>

      {/* Tooltip: "Nieuw! [Feature name] is nu beschikbaar" */}
      {showTooltip && (
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap pointer-events-none animate-fade-in"
          data-testid={`spotlight-tooltip-${featureId}`}
        >
          <div className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-[var(--s2)]">
            <span className="text-blue-300">Nieuw!</span>{' '}
            {featureLabel} is nu beschikbaar
          </div>
          {/* Arrow pointing down */}
          <div className="mx-auto h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-900" />
        </div>
      )}

      {/* The actual feature content, slightly elevated */}
      <div className="relative rounded-[var(--r-lg)] ring-2 ring-blue-300/50">
        {children}
      </div>
    </div>
  )
}
