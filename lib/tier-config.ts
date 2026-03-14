// ── Commercial Tier Configuration ─────────────────────────────────────────────
// Defines the three commercial tiers: Gratis, Connected, AI.
// TIER_FEATURES and DEFAULT_TIER_MATRIX are now generated from the unified feature registry.

import { UNIFIED_FEATURES, isTierSufficient, type CommercialTier } from '@/lib/feature-registry'

export type { CommercialTier } from '@/lib/feature-registry'

export interface TierFeatureDef {
  id: string
  label: string
  description: string
  /** Which tier this feature is first introduced in */
  tier: CommercialTier
  /** API route or component reference */
  ref?: string
}

export type TierFeatureMatrix = Record<string, Record<CommercialTier, boolean>>

export const TIERS: { id: CommercialTier; label: string; description: string }[] = [
  {
    id: 'gratis',
    label: 'Gratis',
    description: 'Basisgebruik, handmatige invoer, core metrics',
  },
  {
    id: 'connected',
    label: 'Connected',
    description: 'Bankverbindingen, automatische import, realtime saldo',
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'Alle AI-functies: chat, aanbevelingen, categorisatie, rapporten',
  },
]

// ── Generate TIER_FEATURES from unified registry (backward compat) ───────────

export const TIER_FEATURES: TierFeatureDef[] = UNIFIED_FEATURES.map(f => ({
  id: f.id,
  label: f.label,
  description: f.description,
  tier: f.requiredTier,
}))

// ── Generate DEFAULT_TIER_MATRIX from unified registry ───────────────────────

function buildDefaultMatrix(): TierFeatureMatrix {
  const tierOrder: CommercialTier[] = ['gratis', 'connected', 'ai']
  const matrix: TierFeatureMatrix = {}
  for (const feat of UNIFIED_FEATURES) {
    matrix[feat.id] = {
      gratis: isTierSufficient('gratis', feat.requiredTier),
      connected: isTierSufficient('connected', feat.requiredTier),
      ai: isTierSufficient('ai', feat.requiredTier),
    }
  }
  return matrix
}

export const DEFAULT_TIER_MATRIX: TierFeatureMatrix = buildDefaultMatrix()
