// ── Help-Key utility ─────────────────────────────────────────────────────
// Cross-source identifier voor één stap uit de drie guide-bronnen
// (standard / goal / module). Gebruikt door:
// - guide-help opslag (key in app_settings.guide_help_content)
// - Supabase storage path (`{helpKey}/{filename}`)
// - URL-deeplink in beheer (`?helpKey=...`)
//
// Format:
//   standard:<stepKey>            → "standard:sg_assets"
//   goal:<goalSlug>:<stepKey>     → "goal:noodfonds:nf_calc"
//   module:<moduleId>:<stepKey>   → "module:budgetteren:bg_create_first_budget"

export type StepSource = 'standard' | 'goal' | 'module'

export interface ParsedHelpKey {
  source: StepSource
  /** Voor goal: GoalSlug. Voor module: ModuleId. Voor standard: undefined. */
  scope?: string
  stepKey: string
}

/**
 * Bouw een unified help-key. Voor `standard` wordt `scope` genegeerd.
 * Voor `goal` en `module` is scope verplicht — anders gooien we omdat
 * de resulterende key niet uniek terug-parseerbaar zou zijn.
 */
export function buildHelpKey(
  source: StepSource,
  stepKey: string,
  scope?: string,
): string {
  if (source === 'standard') return `standard:${stepKey}`
  if (!scope) {
    throw new Error(`buildHelpKey: scope is verplicht voor source="${source}"`)
  }
  return `${source}:${scope}:${stepKey}`
}

/**
 * Parse een help-key terug naar zijn onderdelen. Returnt null als de
 * input niet een geldige help-key is — callers kunnen dan een 400
 * teruggeven of de key negeren.
 */
export function parseHelpKey(helpKey: string): ParsedHelpKey | null {
  const parts = helpKey.split(':')
  if (parts.length === 2 && parts[0] === 'standard') {
    return { source: 'standard', stepKey: parts[1] }
  }
  if (parts.length === 3 && (parts[0] === 'goal' || parts[0] === 'module')) {
    return {
      source: parts[0] as StepSource,
      scope: parts[1],
      stepKey: parts[2],
    }
  }
  return null
}

/** Validatie-helper voor API-routes — strikter dan parseHelpKey. */
export function isValidHelpKey(helpKey: unknown): helpKey is string {
  if (typeof helpKey !== 'string') return false
  if (helpKey.length === 0 || helpKey.length > 200) return false
  return parseHelpKey(helpKey) !== null
}
