import { describe, it, expect } from 'vitest'
import {
  getFirstUndismissedSuggestion,
  buildCoachCatalogForAdmin,
  parseCoachConfig,
  COACH_RULE_COUNT,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  type CoachDataGaps,
  type CoachOverrides,
} from './coach-suggestions'

const full = (): CoachDataGaps => ({ hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true })
const empty = (): CoachDataGaps => ({ hasBank: false, hasAssets: false, hasBudgets: false, hasGoals: false })
const none = new Set<string>()

describe('coach catalog', () => {
  it('builds COACH_RULE_COUNT rows with defaults', () => {
    const rows = buildCoachCatalogForAdmin()
    expect(rows.length).toBe(COACH_RULE_COUNT)
    for (const r of rows) {
      expect(r.message).toBe(r.defaultMessage)
      expect(r.enabled).toBe(true)
      expect(r.hasOverride).toBe(false)
    }
  })
})

describe('getFirstUndismissedSuggestion priority', () => {
  it('deferred wins over data gap', () => {
    const s = getFirstUndismissedSuggestion(empty(), '/will', none, ['assets'])
    expect(s?.key).toBe('deferred_assets')
  })

  it('falls through data gap -> path -> default', () => {
    expect(getFirstUndismissedSuggestion(empty(), '/core/budgets', none, [])?.key).toBe('gap_bank')
    expect(getFirstUndismissedSuggestion(full(), '/core/budgets', none, [])?.key).toBe('path_budgets')
    expect(getFirstUndismissedSuggestion(full(), '/random', none, [])?.key).toBe('default')
  })

  it('specific path wins over broad path', () => {
    expect(getFirstUndismissedSuggestion(full(), '/core/budgets/123', none, [])?.key).toBe('path_budgets')
    expect(getFirstUndismissedSuggestion(full(), '/core/assets', none, [])?.key).toBe('path_core')
  })
})

describe('overrides + dismiss', () => {
  it('applies message/cta override', () => {
    const ov: CoachOverrides = { gap_bank: { message: 'X', cta: 'Y' } }
    const s = getFirstUndismissedSuggestion(empty(), '/will', none, [], ov)
    expect(s?.message).toBe('X')
    expect(s?.cta).toBe('Y')
  })

  it('skips disabled rule', () => {
    const ov: CoachOverrides = { gap_bank: { enabled: false } }
    const gaps: CoachDataGaps = { hasBank: false, hasAssets: false, hasBudgets: true, hasGoals: true }
    expect(getFirstUndismissedSuggestion(gaps, '/will', none, [], ov)?.key).toBe('gap_assets')
  })

  it('skips dismissed rule', () => {
    const gaps: CoachDataGaps = { hasBank: false, hasAssets: false, hasBudgets: true, hasGoals: true }
    expect(getFirstUndismissedSuggestion(gaps, '/will', new Set(['gap_bank']), [])?.key).toBe('gap_assets')
  })

  it('returns null when everything is exhausted', () => {
    const ov: CoachOverrides = { default: { enabled: false } }
    expect(getFirstUndismissedSuggestion(full(), '/random', none, [], ov)).toBeNull()
  })
})

describe('parseCoachConfig', () => {
  it('falls back to defaults on empty/corrupt input', () => {
    for (const input of [null, undefined, '', 'broken{', '[]']) {
      const cfg = parseCoachConfig(input as string | null | undefined)
      expect(cfg.timing.delayMs).toBe(DEFAULT_COACH_TIMING.delayMs)
      expect(cfg.timing.autoDismissMs).toBe(DEFAULT_COACH_TIMING.autoDismissMs)
      expect(cfg.headerLabel).toBe(DEFAULT_COACH_HEADER)
      expect(typeof cfg.rules).toBe('object')
    }
  })

  it('reads stored values', () => {
    const raw = JSON.stringify({
      rules: { gap_bank: { message: 'X', enabled: false } },
      timing: { delayMs: 2000, autoDismissMs: 30000 },
      headerLabel: 'Tip van de gids',
    })
    const cfg = parseCoachConfig(raw)
    expect(cfg.timing.delayMs).toBe(2000)
    expect(cfg.timing.autoDismissMs).toBe(30000)
    expect(cfg.headerLabel).toBe('Tip van de gids')
    expect(cfg.rules.gap_bank?.enabled).toBe(false)
  })
})
