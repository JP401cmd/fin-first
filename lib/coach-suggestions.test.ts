import { describe, it, expect } from 'vitest'
import {
  getFirstUndismissedSuggestion,
  buildCoachCatalogForAdmin,
  parseCoachConfig,
  COACH_RULE_COUNT,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  PATH_SUGGESTIONS,
  DATA_GAP_SUGGESTIONS,
  isEstablishedAccount,
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
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/cashflow', none, [])?.key).toBe('path_core')
    // Gevuld account → de gevulde terugval, niet het first-use-welkom (H15).
    expect(getFirstUndismissedSuggestion(full(), '/random', none, [])?.key).toBe('default_gevuld')
  })

  it('specific path wins over broad path', () => {
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/schulden/x', none, [])?.key).toBe('path_debts')
    expect(getFirstUndismissedSuggestion(full(), '/overzicht/bezittingen', none, [])?.key).toBe('path_core')
  })

  // Bevinding C7: de budget-tip mag alleen vuren als er écht nog geen budget
  // is. De onvoorwaardelijke pad-regel `path_budgets` is verwijderd; wat
  // overblijft is `gap_budgets`, dat op `!hasBudgets` checkt. Een gebruiker met
  // bestaande budgetten krijgt dus nooit meer "Voeg je eerste budget toe".
  it('budget-tip vuurt alleen bij ontbrekende budgetten (geen onvoorwaardelijke pad-regel)', () => {
    const onlyBudgetsMissing: CoachDataGaps = { ...full(), hasBudgets: false }
    expect(
      getFirstUndismissedSuggestion(onlyBudgetsMissing, '/overzicht/cashflow/budget', none, [])?.key,
    ).toBe('gap_budgets')
    // Mét budgetten: geen budget-tip meer, maar de brede /overzicht-fallback.
    for (const path of ['/overzicht/cashflow', '/overzicht/cashflow/budget', '/core/budgets']) {
      const key = getFirstUndismissedSuggestion(full(), path, none, [])?.key
      expect(key).not.toBe('path_budgets')
      expect(key).not.toBe('gap_budgets')
    }
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
      // activeModules zonder de vereiste module → gap overgeslagen → terugval.
      // De basis is `full()` met één gap open, dus het account is gevuld: sinds
      // H15 wint dan de gevulde terugval, niet het first-use-welkom.
      const withoutModule = ALL_MODULES.filter((m) => m !== c.module)
      const s = getFirstUndismissedSuggestion(c.open(), '/random', none, [], undefined, withoutModule)
      expect(s?.key).toBe('default_gevuld')
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
    // Beide default-varianten uit (H15: de terugval is gesplitst, dus beheer
    // moet ze allebei kunnen uitzetten — één key volstaat niet meer).
    const ov: CoachOverrides = { default: { enabled: false }, default_gevuld: { enabled: false } }
    expect(getFirstUndismissedSuggestion(full(), '/random', none, [], ov)).toBeNull()
  })
})

// ── H15: een gevuld account wordt niet als beginner aangesproken ───────────
//
// REGRESSIE-ANKER. De path- en default-laag worden per constructie pas bereikt
// als élke data-gap dicht is: ze ZIJN de "dit account is gevuld"-lagen. Stond
// daar first-use-copy, dan kreeg juist de gevulde gebruiker 'm te zien. Deze
// blok legt dat gedrag omgekeerd vast — zowel de uitkomst (geen
// beginnerstaal voor een gevuld account, op geen enkele route) als de
// catalogus-vorm (first-use-copy in de pad-laag vereist een predicaat).
describe('H15 — first-use-copy hoort bij first use', () => {
  /** Woordenschat die alleen bij een LEEG account klopt. */
  const FIRST_USE_PATRONEN = [
    /\beerste\b/i,
    /breng je .* in kaart/i,
    /^welkom\b/i,
    /\bstart met\b/i,
    /\bbegin met\b/i,
    /\bvoeg je .* toe\b/i,
    /\bstel je .* in\b/i,
  ]
  const isFirstUseCopy = (message: string) => FIRST_USE_PATRONEN.some((p) => p.test(message))

  /** Elke pad-prefix uit de catalogus + de routes zónder pad-regel. */
  const ALLE_ROUTES = [
    ...PATH_SUGGESTIONS.map((r) => r.pathPrefix),
    '/overzicht/cashflow',
    '/overzicht/cashflow/budget',
    '/overzicht/bezittingen',
    '/mijn',
    '/mijn/profiel',
    '/berichten',
    '/onbekende-route',
  ]

  it('geeft een gevuld account op géén enkele route beginnerstaal', () => {
    for (const path of ALLE_ROUTES) {
      const s = getFirstUndismissedSuggestion(full(), path, none, [], undefined, ALL_MODULES)
      expect(s, `geen suggestie op ${path}`).not.toBeNull()
      expect(
        isFirstUseCopy(s!.message),
        `first-use-copy op ${path} (${s!.key}): "${s!.message}"`,
      ).toBe(false)
    }
  })

  it('houdt de first-use-copy wél voor een leeg account', () => {
    // Leeg account: de data-gap-laag vuurt en die draagt de first-use-teksten.
    const s = getFirstUndismissedSuggestion(empty(), '/overzicht/cashflow', none, [], undefined, ALL_MODULES)
    expect(s?.key).toBe('gap_bank')
    // En de onvoorwaardelijke terugval blijft "Welkom." zolang het account
    // niet gevuld is — ook als alle gaps zijn weggeklikt (de val waarin de
    // laagvolgorde je niets meer vertelt).
    const alleGapsWeg = new Set(DATA_GAP_SUGGESTIONS.map((r) => r.key))
    const terugval = getFirstUndismissedSuggestion(empty(), '/onbekend', alleGapsWeg, [], undefined, ALL_MODULES)
    expect(terugval?.key).toBe('default')
    expect(isFirstUseCopy(terugval!.message)).toBe(true)
  })

  it('spreekt een gevuld account op /mijn en /berichten niet met "Welkom." aan', () => {
    for (const path of ['/mijn', '/berichten']) {
      const s = getFirstUndismissedSuggestion(full(), path, none, [], undefined, ALL_MODULES)
      expect(s?.key).toBe('default_gevuld')
      expect(s?.message).not.toMatch(/^Welkom/)
    }
  })

  it('toont de schulden-pad-tip alleen bij geregistreerde schulden', () => {
    // Mét schulden: de gevulde variant, zonder "breng je schulden in kaart".
    const metSchulden = getFirstUndismissedSuggestion(full(), '/overzicht/schulden', none, [], undefined, ALL_MODULES)
    expect(metSchulden?.key).toBe('path_debts')
    expect(isFirstUseCopy(metSchulden!.message)).toBe(false)

    // Zónder schulden én zonder de module die `gap_debts` draagt: de pad-regel
    // valt weg en de brede, datastand-onafhankelijke terugval wint.
    const zonderSchulden: CoachDataGaps = { ...full(), hasDebts: false }
    const zonderModule = ALL_MODULES.filter((m) => m !== 'vermogensregistratie')
    const s = getFirstUndismissedSuggestion(zonderSchulden, '/overzicht/schulden', none, [], undefined, zonderModule)
    expect(s?.key).toBe('path_core')
  })

  it('valt bij onbekende accountstatus terug op de onvoorwaardelijke regels', () => {
    // Geen dataGaps (nog niet geladen): een regel mét predicaat mag niet
    // gokken — de bredere, altijd-kloppende regel wint.
    expect(getFirstUndismissedSuggestion(undefined, '/overzicht/schulden', none, [])?.key).toBe('path_core')
    expect(getFirstUndismissedSuggestion(undefined, '/onbekend', none, [])?.key).toBe('default')
  })

  it('eist een predicaat bij elke pad-regel met first-use-copy', () => {
    for (const regel of PATH_SUGGESTIONS) {
      if (!isFirstUseCopy(regel.suggestion.message)) continue
      expect(
        typeof regel.check,
        `pad-regel "${regel.key}" draagt first-use-copy zonder check — die laag ziet alleen gevulde accounts`,
      ).toBe('function')
    }
  })

  it('geeft beheer beide default-varianten als losse regel', () => {
    const rows = buildCoachCatalogForAdmin()
    const defaults = rows.filter((r) => r.layer === 'default')
    expect(defaults.map((r) => r.key)).toEqual(['default_gevuld', 'default'])
    // Eén override mag nooit stilzwijgend beide teksten overschrijven.
    const ov: CoachOverrides = { default: { message: 'Alleen de first-use-tekst' } }
    const metOverride = buildCoachCatalogForAdmin(ov)
    expect(metOverride.find((r) => r.key === 'default')?.message).toBe('Alleen de first-use-tekst')
    expect(metOverride.find((r) => r.key === 'default_gevuld')?.hasOverride).toBe(false)
  })

  it('isEstablishedAccount vraagt bezit én boekhouding', () => {
    expect(isEstablishedAccount(full())).toBe(true)
    expect(isEstablishedAccount(empty())).toBe(false)
    // Alleen een bezitting is nog geen gevuld account.
    expect(isEstablishedAccount({ ...empty(), hasAssets: true })).toBe(false)
    // Bezit + transacties (of budgetten) wel.
    expect(isEstablishedAccount({ ...empty(), hasAssets: true, hasTransactions: true })).toBe(true)
    expect(isEstablishedAccount({ ...empty(), hasAssets: true, hasBudgets: true })).toBe(true)
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
