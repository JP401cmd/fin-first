// ── Feature-Phase Matrix ─────────────────────────────────────
// Defines phases and sovereignty computation.
// DEFAULT_MATRIX and FEATURES are now generated from the unified feature registry.

import { UNIFIED_FEATURES, LEGACY_FEATURE_MAP, isPhaseSufficient, type PhaseId } from '@/lib/feature-registry'

export interface Phase {
  id: string
  label: string
  color: string       // Tailwind color name (legacy, kept for backward compat)
  cssName: string     // CSS variable key, e.g. 'phase_recovery'
  levels: number[]
}

export interface FeatureDef {
  id: string
  label: string
  description: string
}

export type FeaturePhaseMatrix = Record<string, Record<string, boolean>>

export const PHASES: Phase[] = [
  { id: 'recovery',  label: 'Recovery',  color: 'rose',  cssName: 'phase_recovery',  levels: [-2, -1, 0] },
  { id: 'stability', label: 'Stability', color: 'blue',  cssName: 'phase_stability', levels: [1, 2] },
  { id: 'momentum',  label: 'Momentum',  color: 'teal',  cssName: 'phase_momentum',  levels: [3, 4] },
  { id: 'mastery',   label: 'Mastery',   color: 'amber', cssName: 'phase_mastery',   levels: [5, 6] },
]

// ── Generate FEATURES from unified registry (backward compat) ────────────────
// Includes both unified feature IDs and legacy IDs so that existing code
// that references FEATURES.find(f => f.id === 'widget_assets') still works.

function buildFeatures(): FeatureDef[] {
  const result: FeatureDef[] = []
  const seen = new Set<string>()
  for (const feat of UNIFIED_FEATURES) {
    // Add the unified feature itself
    result.push({ id: feat.id, label: feat.label, description: feat.description })
    seen.add(feat.id)
    // Add legacy feature IDs that map to it (skip duplicates)
    for (const legacyId of feat.legacyIds) {
      if (!seen.has(legacyId)) {
        result.push({ id: legacyId, label: feat.label, description: feat.description })
        seen.add(legacyId)
      }
    }
  }
  return result
}

export const FEATURES: FeatureDef[] = buildFeatures()

// ── Generate DEFAULT_MATRIX from unified registry (backward compat) ──────────
// For each feature (unified + legacy), derive which phases it's enabled in
// based on the unified feature's defaultPhase.

function buildDefaultMatrix(): FeaturePhaseMatrix {
  const phaseIds = PHASES.map(p => p.id)
  const matrix: FeaturePhaseMatrix = {}

  for (const feat of UNIFIED_FEATURES) {
    // Build phase row for this feature
    const row: Record<string, boolean> = {}
    for (const pid of phaseIds) {
      row[pid] = isPhaseSufficient(pid as PhaseId, feat.defaultPhase)
    }
    // Set for unified ID
    matrix[feat.id] = row
    // Set for all legacy IDs
    for (const legacyId of feat.legacyIds) {
      matrix[legacyId] = row
    }
  }

  return matrix
}

export const DEFAULT_MATRIX: FeaturePhaseMatrix = buildDefaultMatrix()

/**
 * Compute sovereignty level from financial data.
 * Levels range from -2 (Time Deficit) to 6 (Timeless).
 */
export function computeSovereigntyLevel(
  netWorth: number,
  monthlyExpenses: number,
  freedomPercentage: number,
  hasConsumerDebt: boolean,
): number {
  if (monthlyExpenses <= 0) return 0

  const monthsCovered = netWorth / monthlyExpenses

  // Negative net worth
  if (netWorth < 0) {
    return hasConsumerDebt ? -2 : -1
  }

  // Around zero (less than 1 month covered)
  if (monthsCovered < 1) return 0

  // Positive but less than 3 months (no emergency fund yet)
  if (monthsCovered < 3) return 1

  // Emergency fund built (3-6 months)
  if (monthsCovered < 6 || freedomPercentage < 10) return 2

  // Investments growing, freedom 10-25%
  if (freedomPercentage < 25) return 3

  // Coast FIRE territory, freedom 25-75%
  if (freedomPercentage < 75) return 4

  // Near independence, freedom 75-100%
  if (freedomPercentage < 100) return 5

  // Full financial independence
  return 6
}

/**
 * Map a sovereignty level (-2..6) to a phase id (recovery/stability/momentum/mastery).
 */
export function levelToPhaseId(level: number): string {
  for (const phase of PHASES) {
    if (phase.levels.includes(level)) return phase.id
  }
  return PHASES[0].id
}

// ── Re-exports for backward compat ───────────────────────────────────────────
export { LEGACY_FEATURE_MAP } from '@/lib/feature-registry'
