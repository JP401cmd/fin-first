// ── Sovereignty Phases ───────────────────────────────────────
// Defines phases and sovereignty computation — puur voor motivatie-weergave
// (Jouw Pad, fase-overgang-viering). Fases sturen geen feature-toegang meer;
// toegang loopt via abonnement + user-toggles (zie compute-feature-access.ts).

import { UNIFIED_FEATURES, LEGACY_FEATURE_MAP } from '@/lib/feature-registry'

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

/**
 * Compute sovereignty level from financial data.
 * Levels range from -2 (Time Deficit) to 6 (Timeless).
 *
 * `runwayNetWorth` is de grondslag voor de buffer/noodfonds-tiers (1/3/6
 * maanden gedekt). Geef hier de inclusion-gewogen LIQUIDE pot (spaar/betaal/
 * cash) door: een huis is geen opeetbare buffer, dus telt niet mee in de
 * runway (CLAUDE.md — nettoVermogen ≠ liquide vermogen). Het teken van
 * `netWorth` blijft bepalend voor de herstel-niveaus (negatief vermogen →
 * recovery). Blijft `runwayNetWorth` weg, dan valt hij terug op `netWorth`
 * (gedrag van vóór de liquide-pot-grondslag — "alles is liquide"-aanname),
 * zodat bestaande callers zonder liquide-pot ongewijzigd blijven.
 */
export function computeSovereigntyLevel(
  netWorth: number,
  monthlyExpenses: number,
  freedomPercentage: number,
  hasConsumerDebt: boolean,
  runwayNetWorth: number = netWorth,
): number {
  if (monthlyExpenses <= 0) return 0

  const monthsCovered = runwayNetWorth / monthlyExpenses

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
