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
import type { ModuleId } from './module-registry'

const full = (): CoachDataGaps => ({
  hasBank: true,
  hasAssets: true,
  hasBudgets: true,
  hasGoals: true,
  hasDebts: true,
  hasTransactions: true,
  hasHoldings: true,
  hasHoldingsWithIsin: true,
  hasFireParams: true,
  hasLifeEvents: true,
})
const empty = (): CoachDataGaps => ({
  hasBank: false,
  hasAssets: false,
  hasBudgets: false,
  hasGoals: false,
  hasDebts: false,
  hasTransactions: false,
  hasHoldings: false,
  hasHoldingsWithIsin: false,
  hasFireParams: false,
  hasLifeEvents: false,
})
const none = new Set<string>()

/** Alle modules actief — alle module-gated gaps zijn in aanmerking. */
const ALL_MODULES: ModuleId[] = [
  'budgetteren',
  'vermogensregistratie',
  'aandelenregistratie',
  'inzicht_acties',
  'toekomstplannen',
  'nieuws',
]

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
    const s = getFirstUndismissedSuggestion(empty(), '/overzicht', none, ['assets'])
    expect(s?.key).toBe('deferred_assets')
  })

  it('falls through data gap -> path -> default', () => {
    expect(getFirstUndismissedSuggestion(empty(), '/overzicht/cashflow', none, [])?.key).toBe('gap_bank')
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/cashflow', none, [])?.key).toBe('path_budgets')
    expect(getFirstUndismissedSuggestion(full(), '/random', none, [])?.key).toBe('default')
  })

  it('specific path wins over broad path', () => {
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/cashflow/budget', none, [])?.key).toBe('path_budgets')
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/bezittingen', none, [])?.key).toBe('path_core')
  })

  it('suppresses fire-params/life-events gaps on /toekomst (overlay de-dup)', () => {
    // Op /toekomst wijzen de overlay-ballonnen al naar rendement/parameters en
    // levensgebeurtenissen — die twee gaps worden daar dus NIET via de coach
    // aangeboden; de selectie valt door naar de pad-suggestie.
    const fireGap: CoachDataGaps = { ...full(), hasFireParams: false }
    const lifeGap: CoachDataGaps = { ...full(), hasLifeEvents: false }
    expect(getFirstUndismissedSuggestion(fireGap, '/toekomst', none, [])?.key).toBe('path_horizon')
    expect(getFirstUndismissedSuggestion(lifeGap, '/toekomst/voorkeuren', none, [])?.key).toBe('path_horizon')
    // Buiten /toekomst vuren ze gewoon (geen overlay daar).
    expect(getFirstUndismissedSuggestion(fireGap, '/random', none, [])?.key).toBe('gap_fire_params')
  })
})

describe('module-gated data gaps (absorbed nudges)', () => {
  // Elke case: `full()` met precies één gap open, zodat die gap de eerste
  // open gap in de array is. Met de juiste module actief → die gap wint;
  // zonder die module → de gap wordt overgeslagen en de selectie valt door
  // naar de default (op een onbekend pad).
  const cases: {
    key: string
    module: ModuleId
    open: () => CoachDataGaps
  }[] = [
    { key: 'gap_debts', module: 'vermogensregistratie', open: () => ({ ...full(), hasDebts: false }) },
    { key: 'gap_transactions', module: 'budgetteren', open: () => ({ ...full(), hasTransactions: false }) },
    { key: 'gap_holdings', module: 'aandelenregistratie', open: () => ({ ...full(), hasHoldings: false, hasHoldingsWithIsin: false }) },
    // gap_isin: holdings aanwezig maar zonder ISIN.
    { key: 'gap_isin', module: 'aandelenregistratie', open: () => ({ ...full(), hasHoldingsWithIsin: false }) },
    { key: 'gap_fire_params', module: 'toekomstplannen', open: () => ({ ...full(), hasFireParams: false }) },
    { key: 'gap_life_events', module: 'toekomstplannen', open: () => ({ ...full(), hasLifeEvents: false }) },
  ]

  for (const c of cases) {
    it(`${c.key} fires when open and its module is active`, () => {
      const s = getFirstUndismissedSuggestion(c.open(), '/random', none, [], undefined, ALL_MODULES)
      expect(s?.key).toBe(c.key)
    })

    it(`${c.key} is skipped when its module is NOT active`, () => {
      // activeModules zonder de vereiste module → gap overgeslagen → default.
      const withoutModule = ALL_MODULES.filter((m) => m !== c.module)
      const s = getFirstUndismissedSuggestion(c.open(), '/random', none, [], undefined, withoutModule)
      expect(s?.key).toBe('default')
    })
  }

  it('does not gate when activeModules is undefined (backward-compat)', () => {
    // Zonder activeModules vuurt een module-gated gap gewoon.
    const gaps: CoachDataGaps = { ...full(), hasDebts: false }
    expect(getFirstUndismissedSuggestion(gaps, '/random', none, [])?.key).toBe('gap_debts')
  })

  it('first open gap wins across new + existing gaps', () => {
    // gap_bank (niet module-gated) staat vóór gap_debts → wint, ook met modules.
    const gaps: CoachDataGaps = { ...empty() }
    expect(getFirstUndismissedSuggestion(gaps, '/random', none, [], undefined, ALL_MODULES)?.key).toBe('gap_bank')
  })
})

describe('overrides + dismiss', () => {
  it('applies message/cta override', () => {
    const ov: CoachOverrides = { gap_bank: { message: 'X', cta: 'Y' } }
    const s = getFirstUndismissedSuggestion(empty(), '/overzicht', none, [], ov)
    expect(s?.message).toBe('X')
    expect(s?.cta).toBe('Y')
  })

  it('skips disabled rule', () => {
    const ov: CoachOverrides = { gap_bank: { enabled: false } }
    // Alleen bank + assets open; nieuwe gaps satisfied zodat gap_assets de
    // eerstvolgende open gap blijft.
    const gaps: CoachDataGaps = { ...full(), hasBank: false, hasAssets: false }
    expect(getFirstUndismissedSuggestion(gaps, '/overzicht', none, [], ov)?.key).toBe('gap_assets')
  })

  it('skips dismissed rule', () => {
    const gaps: CoachDataGaps = { ...full(), hasBank: false, hasAssets: false }
    expect(getFirstUndismissedSuggestion(gaps, '/overzicht', new Set(['gap_bank']), [])?.key).toBe('gap_assets')
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
