import { describe, it, expect } from 'vitest'
import {
  FIRE_END_STRATEGIES,
  STRATEGY_LABELS,
  isFireEndStrategy,
  isFinanciallyFree,
  parseFireStrategy,
  resolveFireStrategyWithOverride,
  resolveFreedomFraming,
} from './fire-strategy'

/**
 * ADR 0127 — 'nu-stoppen' als vijfde eindstrategie: de compiler-stille consumenten
 * in lib/fire-strategy.ts. D9: de allowlist is afgeleid uit STRATEGY_LABELS, zodat
 * `parseFireStrategy` een geldige waarde niet stil naar 'deplete' vouwt (de
 * gevaarlijkste consument: de DB zegt X en de hele app rekent deplete). D5:
 * `isFinanciallyFree` telt onder dit anker alléén de freedomPct ≥ 100-trigger.
 */

describe('canonieke allowlist (D9)', () => {
  it('is afgeleid uit STRATEGY_LABELS en telt vijf strategieën', () => {
    expect(FIRE_END_STRATEGIES).toEqual(Object.keys(STRATEGY_LABELS))
    expect(FIRE_END_STRATEGIES).toHaveLength(5)
    expect(FIRE_END_STRATEGIES).toContain('nu-stoppen')
  })

  it('label is beschrijvend, niet aansporend', () => {
    const label = STRATEGY_LABELS['nu-stoppen']
    expect(label.name).toBe('Nu stoppen')
    expect(label.subtitle).not.toMatch(/je kunt|kun je/i)
  })

  it("parseFireStrategy: 'nu-stoppen' → 'nu-stoppen' (niet stil naar deplete), 'nonsense' → 'deplete'", () => {
    expect(parseFireStrategy({ fire_end_strategy: 'nu-stoppen' }).strategy).toBe('nu-stoppen')
    expect(parseFireStrategy({ fire_end_strategy: 'nonsense' }).strategy).toBe('deplete')
    expect(parseFireStrategy({ fire_end_strategy: null }).strategy).toBe('deplete')
    for (const s of FIRE_END_STRATEGIES) {
      expect(parseFireStrategy({ fire_end_strategy: s }).strategy).toBe(s)
    }
  })

  it('isFireEndStrategy is de type-guard op dezelfde lijst', () => {
    expect(isFireEndStrategy('nu-stoppen')).toBe(true)
    expect(isFireEndStrategy('fixed_age')).toBe(false)
    expect(isFireEndStrategy(null)).toBe(false)
    expect(isFireEndStrategy(42)).toBe(false)
  })
})

describe('resolveFireStrategyWithOverride — generiek terugleespad (geen hardcoded pensioen)', () => {
  it("kolom 'deplete' + override 'pensioen' → pensioen (legacy-schaduwpad blijft werken)", () => {
    const cfg = resolveFireStrategyWithOverride({
      fire_end_strategy: 'deplete',
      feature_preferences: { fire_strategy_override: 'pensioen' },
    })
    expect(cfg.strategy).toBe('pensioen')
  })

  it("kolom 'deplete' + override 'nu-stoppen' → nu-stoppen (elke canonieke waarde, één kabel)", () => {
    const cfg = resolveFireStrategyWithOverride({
      fire_end_strategy: 'deplete',
      feature_preferences: { fire_strategy_override: 'nu-stoppen' },
    })
    expect(cfg.strategy).toBe('nu-stoppen')
  })

  it('de kolom wint zodra ze iets anders dan de parkeerwaarde draagt', () => {
    const cfg = resolveFireStrategyWithOverride({
      fire_end_strategy: 'perpetual',
      feature_preferences: { fire_strategy_override: 'pensioen' },
    })
    expect(cfg.strategy).toBe('perpetual')
  })

  it('een override buiten de allowlist wordt genegeerd', () => {
    const cfg = resolveFireStrategyWithOverride({
      fire_end_strategy: 'deplete',
      feature_preferences: { fire_strategy_override: 'fixed_age' },
    })
    expect(cfg.strategy).toBe('deplete')
  })
})

describe("isFinanciallyFree onder 'nu-stoppen' (D5)", () => {
  it('de leeftijd-trigger (currentAge ≥ fireAge) telt NIET — fireAge ís de startleeftijd', () => {
    expect(
      isFinanciallyFree({ freedomPct: 30, currentAge: 42, fireAge: 42, strategy: 'nu-stoppen' }),
    ).toBe(false)
    // Dezelfde invoer zonder het anker slaat wél om (het oude gedrag blijft voor de rest).
    expect(isFinanciallyFree({ freedomPct: 30, currentAge: 42, fireAge: 42, strategy: 'deplete' })).toBe(true)
  })

  it('alleen tijdsdekking ≥ 100 verklaart vrij', () => {
    expect(isFinanciallyFree({ freedomPct: 100, currentAge: 42, fireAge: 42, strategy: 'nu-stoppen' })).toBe(true)
    expect(isFinanciallyFree({ freedomPct: 99.9, currentAge: 42, fireAge: 42, strategy: 'nu-stoppen' })).toBe(false)
  })
})

describe("resolveFreedomFraming — 'nu-stoppen'", () => {
  it("nog niet gedekt → 'building'", () => {
    expect(resolveFreedomFraming({ freedomPct: 60, currentAge: 42, fireAge: 42, strategy: 'nu-stoppen' })).toBe('building')
  })

  it("gedekt → 'nu-stoppen' (eigen framing, geen 'free'/'pensioen'-claim)", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 42, fireAge: 42, strategy: 'nu-stoppen', aowAge: 67 }),
    ).toBe('nu-stoppen')
  })

  it('de bestaande framings zijn ongewijzigd', () => {
    expect(resolveFreedomFraming({ freedomPct: 100, currentAge: 50, fireAge: 50, strategy: 'deplete', aowAge: 67 })).toBe('free')
    expect(resolveFreedomFraming({ freedomPct: 100, currentAge: 68, fireAge: 67, strategy: 'pensioen', aowAge: 67 })).toBe('pensioen')
  })
})
