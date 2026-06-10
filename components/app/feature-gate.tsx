'use client'

import { type ReactNode } from 'react'
import { Lock, Settings } from 'lucide-react'
import { useFeatureAccess, useModuleAccess } from '@/components/app/feature-access-provider'
import { FEATURES } from '@/lib/feature-phases'
import { isFeatureAccessible, getFeatureAccess } from '@/lib/compute-feature-access'
import { UNIFIED_FEATURES } from '@/lib/feature-registry'
import { LEGACY_FEATURE_MAP } from '@/lib/feature-phases'
import { MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

type FeatureGateProps = {
  featureId: string
  fallback?: 'hidden' | 'locked' | ReactNode
  children: ReactNode
}

/**
 * ModuleGate — gates children by whether a module is active.
 * Replaces sovereignty-level gating with user-selectable module gating.
 * When the module is inactive, renders nothing (fallback='hidden') or the
 * provided fallback ReactNode.
 */
export function ModuleGate({ moduleId, children, fallback = 'hidden' }: {
  moduleId: ModuleId
  children: ReactNode
  fallback?: 'hidden' | ReactNode
}) {
  const { isModuleActive } = useModuleAccess()
  if (!isModuleActive(moduleId)) {
    return fallback === 'hidden' ? null : <>{fallback}</>
  }
  return <>{children}</>
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
  const { features } = useFeatureAccess()

  // Use isFeatureAccessible for backward compat (supports legacy IDs)
  const accessible = isFeatureAccessible(features, featureId)
  const accessResult = getFeatureAccess(features, featureId)

  if (accessible) {
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
 * LockedFeatureCard — shows a feature that requires a module to be activated.
 *
 * Updated from sovereignty-phase gating to module-based gating:
 * instead of "Beschikbaar vanaf [Phase]", shows "Schakel [Module] in via Instellingen".
 *
 * Keeps backward-compatible props (currentPhase still accepted but unused).
 * Dashed border, muted styling, non-clickable (div, not a link).
 */
export function LockedFeatureCard({ featureId, currentPhase: _currentPhase, moduleId }: {
  featureId: string
  /** @deprecated Phase-based gating is removed. Kept for backward compat. */
  currentPhase?: string
  /** The module that must be activated for this feature. */
  moduleId?: ModuleId
}) {
  const featureDef = FEATURES.find(f => f.id === featureId)
  const moduleDef = moduleId ? MODULE_CATALOG.find(m => m.id === moduleId) : null

  return (
    <div
      className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/80 p-6 opacity-75"
      data-testid="locked-feature-card"
      aria-disabled="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {/* Settings icon (module activation prompt) */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/60">
          <Settings className="h-5 w-5 text-[var(--ink-3)]" />
        </div>

        {/* Feature name */}
        <p className="text-sm font-medium text-[var(--ink-2)]">
          {featureDef?.label ?? featureId}
        </p>

        {/* Feature description */}
        <p className="text-xs text-[var(--ink-3)]">
          {featureDef?.description ?? 'Deze functie vereist een actieve module.'}
        </p>

        {/* Module activation badge */}
        {moduleDef && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)]">
            <Settings className="h-3 w-3" />
            Schakel {moduleDef.label} in via Instellingen
          </span>
        )}

        {/* Fallback when no module is specified */}
        {!moduleDef && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)]">
            <Settings className="h-3 w-3" />
            Activeer via Instellingen
          </span>
        )}
      </div>
    </div>
  )
}

