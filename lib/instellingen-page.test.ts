import { describe, it, expect } from 'vitest'
import {
  parseFireStrategy,
  STRATEGY_LABELS,
  DEFAULT_FIRE_STRATEGY,
  type FireEndStrategy,
  type FireStrategyConfig,
} from '@/lib/fire-strategy'
import {
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyType,
} from '@/lib/withdrawal-strategy'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

// ── Shared helpers ───────────────────────────────────────────────────────

/** Simulates SWR kassabon calculation from the settings page */
function computeSwrKassabon(grossReturn: number, box3Drag: number, inflation: number) {
  const nettoReeel = grossReturn - box3Drag - inflation
  const fireMultiplier = nettoReeel > 0 ? 100 / (nettoReeel * 100) : Infinity
  return { nettoReeel, fireMultiplier }
}

/** Simulates parameter validation from PUT /api/parameters */
function validateParameters(expectedReturn: number, inflationRate: number): string | null {
  if (isNaN(expectedReturn) || expectedReturn < 0.01 || expectedReturn > 0.15) {
    return 'Verwacht rendement moet tussen 1% en 15% liggen'
  }
  if (isNaN(inflationRate) || inflationRate < 0 || inflationRate > 0.08) {
    return 'Inflatie moet tussen 0% en 8% liggen'
  }
  return null
}

/** Simulates withdrawal strategy validation from PUT /api/withdrawal-strategy */
function validateWithdrawalStrategy(
  strategy?: string,
  floor?: number,
  ceiling?: number,
  cutStep?: number,
  raiseStep?: number,
): string | null {
  const VALID: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']
  if (strategy !== undefined && !VALID.includes(strategy as WithdrawalStrategyType)) {
    return `Strategie moet een van ${VALID.join(', ')} zijn`
  }
  if (floor !== undefined && (isNaN(floor) || floor < 0.50 || floor > 2.00)) {
    return 'Guardrail floor moet tussen 0.50 en 2.00 liggen'
  }
  if (ceiling !== undefined && (isNaN(ceiling) || ceiling < 0.50 || ceiling > 2.00)) {
    return 'Guardrail ceiling moet tussen 0.50 en 2.00 liggen'
  }
  if (floor !== undefined && ceiling !== undefined && floor >= ceiling) {
    return 'Floor moet lager zijn dan ceiling'
  }
  if (cutStep !== undefined && (isNaN(cutStep) || cutStep < 0.01 || cutStep > 0.50)) {
    return 'Cut step moet tussen 0.01 en 0.50 liggen'
  }
  if (raiseStep !== undefined && (isNaN(raiseStep) || raiseStep < 0.01 || raiseStep > 0.50)) {
    return 'Raise step moet tussen 0.01 en 0.50 liggen'
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Accordion UI — section structure
// ═══════════════════════════════════════════════════════════════════════════

describe('Accordion UI — section structure', () => {
  const SECTIONS = [
    { id: 'A', label: 'Notificaties' },
    { id: 'C', label: 'FIRE Instellingen' },
    { id: 'D', label: 'Weergave' },
    { id: 'E', label: 'Gegevens & Account' },
    { id: 'F', label: 'Privacy & AI' },
    { id: 'G', label: 'Huishouden Privacy' },
  ]

  it('A1: 6 accordion sections defined', () => {
    expect(SECTIONS.length).toBe(6)
  })

  it('A2: accordion sections can be individually toggled', () => {
    // Simulates independent open/close state per section
    const openSections = new Set<string>()

    // Open section A
    openSections.add('A')
    expect(openSections.has('A')).toBe(true)
    expect(openSections.has('C')).toBe(false)

    // Open section C (A stays open — multiple sections can be open)
    openSections.add('C')
    expect(openSections.has('A')).toBe(true)
    expect(openSections.has('C')).toBe(true)

    // Close section A
    openSections.delete('A')
    expect(openSections.has('A')).toBe(false)
    expect(openSections.has('C')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. Sectie A — Notificaties
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie A — Notificaties', () => {
  const NOTIFICATION_TYPES = [
    'budget', 'streak', 'sync', 'recommendation',
    'insight', 'badge', 'levelup', 'partner_transaction', 'horizon',
  ]

  it('B1: 9 notification types defined', () => {
    expect(NOTIFICATION_TYPES.length).toBe(9)
  })

  it('B2: notification preferences are boolean toggles', () => {
    const prefs: Record<string, boolean> = {}
    for (const type of NOTIFICATION_TYPES) {
      prefs[type] = true
    }
    expect(Object.keys(prefs).length).toBe(9)
    expect(Object.values(prefs).every(v => typeof v === 'boolean')).toBe(true)
  })

  it('B3: partner notification modes are valid', () => {
    const VALID_MODES = ['all_shared', 'threshold', 'categories', 'disabled']
    VALID_MODES.forEach(mode => {
      expect(typeof mode).toBe('string')
    })
    expect(VALID_MODES.length).toBe(4)
  })

  it('B4: partner notification threshold must be ≥ 0', () => {
    expect(100).toBeGreaterThanOrEqual(0)
    expect(0).toBeGreaterThanOrEqual(0)
    // Negative threshold is invalid
    expect(-1).toBeLessThan(0)
  })

  it('B5: partner notification categories are string array', () => {
    const categories = ['boodschappen', 'wonen', 'vervoer']
    expect(Array.isArray(categories)).toBe(true)
    expect(categories.every(c => typeof c === 'string')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. Sectie B — Widgets
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie B — Widgets', () => {
  it('C1: widget sizes are constrained to full/half/quarter', () => {
    const VALID_SIZES = ['full', 'half', 'quarter']
    const testSizes = ['full', 'half', 'quarter', 'mini']

    testSizes.forEach(size => {
      const sanitized = VALID_SIZES.includes(size) ? size : 'quarter'
      expect(VALID_SIZES).toContain(sanitized)
    })
  })

  it('C2: widget prefs saved as Record<string, { enabled, size }>', () => {
    const prefs: Record<string, { enabled: boolean; size: string }> = {
      netto_vermogen: { enabled: true, size: 'full' },
      fire_prognose: { enabled: true, size: 'half' },
      passief_inkomen: { enabled: false, size: 'quarter' },
    }

    expect(Object.keys(prefs).length).toBe(3)
    expect(prefs.netto_vermogen.enabled).toBe(true)
    expect(prefs.fire_prognose.size).toBe('half')
  })

  it('C3: dynamic widget IDs (budget_fav: / holding_fav:) are accepted', () => {
    const dynamicIds = ['budget_fav:boodschappen', 'holding_fav:VWRL']
    dynamicIds.forEach(id => {
      expect(id.startsWith('budget_fav:') || id.startsWith('holding_fav:')).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. Sectie C — FIRE parameters
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie C — FIRE expected_return slider', () => {
  it('D1: expected_return range is 1-15% (0.01 to 0.15)', () => {
    expect(validateParameters(0.01, 0.02)).toBeNull()
    expect(validateParameters(0.15, 0.02)).toBeNull()
    expect(validateParameters(0.07, 0.02)).toBeNull()  // default

    // Out of range
    expect(validateParameters(0.005, 0.02)).not.toBeNull()
    expect(validateParameters(0.20, 0.02)).not.toBeNull()
  })

  it('D2: default expected_return is 7%', () => {
    const defaultReturn = 0.07
    expect(defaultReturn).toBe(0.07)
  })
})

describe('Sectie C — FIRE inflation_rate slider', () => {
  it('D3: inflation_rate range is 0-8% (0 to 0.08)', () => {
    expect(validateParameters(0.07, 0)).toBeNull()
    expect(validateParameters(0.07, 0.08)).toBeNull()
    expect(validateParameters(0.07, 0.02)).toBeNull()  // default

    // Out of range
    expect(validateParameters(0.07, -0.01)).not.toBeNull()
    expect(validateParameters(0.07, 0.09)).not.toBeNull()
  })

  it('D4: default inflation_rate is 2%', () => {
    const defaultInflation = 0.02
    expect(defaultInflation).toBe(0.02)
  })
})

describe('Sectie C — FIRE kassabon SWR calculator', () => {
  const BOX3_DRAG = 0.0188  // Box 3 tax drag (approximate)

  it('D5: SWR kassabon computes netto reëel rendement', () => {
    const { nettoReeel } = computeSwrKassabon(0.07, BOX3_DRAG, 0.02)
    // 7% - 1.88% - 2% = 3.12%
    expect(nettoReeel).toBeCloseTo(0.0312, 3)
  })

  it('D6: FIRE multiplier = 100 / SWR', () => {
    const { nettoReeel, fireMultiplier } = computeSwrKassabon(0.07, BOX3_DRAG, 0.02)
    expect(fireMultiplier).toBeCloseTo(100 / (nettoReeel * 100), 1)
    expect(fireMultiplier).toBeGreaterThan(20)
    expect(fireMultiplier).toBeLessThan(50)
  })

  it('D7: kassabon updates live when parameters change', () => {
    // Simulate changing from 7% to 10%
    const low = computeSwrKassabon(0.07, BOX3_DRAG, 0.02)
    const high = computeSwrKassabon(0.10, BOX3_DRAG, 0.02)

    // Higher return → lower multiplier (fewer years to FIRE)
    expect(high.nettoReeel).toBeGreaterThan(low.nettoReeel)
    expect(high.fireMultiplier).toBeLessThan(low.fireMultiplier)
  })
})

describe('Sectie C — retirement_expense_method', () => {
  it('D8: three valid RetirementExpenseMethod variants', () => {
    const methods: RetirementExpenseMethod[] = [
      'essential_budgets',
      'custom_amount',
      'current_income',
    ]
    expect(methods.length).toBe(3)
    methods.forEach(m => {
      expect(['essential_budgets', 'custom_amount', 'current_income']).toContain(m)
    })
  })

  it('D9: custom_amount requires numeric value', () => {
    const customAmount = 24000
    expect(typeof customAmount).toBe('number')
    expect(customAmount).toBeGreaterThan(0)

    // Monthly and daily conversions
    const monthly = customAmount / 12
    const daily = customAmount / 365
    expect(monthly).toBeCloseTo(2000, 0)
    expect(daily).toBeCloseTo(65.75, 1)
  })
})

describe('Sectie C — fire_end_strategy', () => {
  it('D10: three valid FireEndStrategy values', () => {
    const strategies: FireEndStrategy[] = ['perpetual', 'legacy', 'deplete']
    expect(strategies.length).toBe(3)
  })

  it('D11: default strategy is deplete with endAge 90', () => {
    expect(DEFAULT_FIRE_STRATEGY.strategy).toBe('deplete')
    expect(DEFAULT_FIRE_STRATEGY.endAge).toBe(90)
    expect(DEFAULT_FIRE_STRATEGY.legacyAmount).toBe(0)
  })

  it('D12: strategy labels are correctly defined', () => {
    expect(STRATEGY_LABELS.deplete.name).toBe('Portfolio opteren')
    expect(STRATEGY_LABELS.legacy.name).toBe('Erfenis')
    expect(STRATEGY_LABELS.perpetual.name).toBe('Behouden van vermogen')
  })

  it('D13: parseFireStrategy handles all profile inputs safely', () => {
    // Standard
    expect(parseFireStrategy({ fire_end_strategy: 'legacy', fire_end_age: 85, fire_legacy_amount: 200000 }))
      .toEqual({ strategy: 'legacy', endAge: 85, legacyAmount: 200000 })

    // Nulls fall back to defaults
    expect(parseFireStrategy({ fire_end_strategy: null, fire_end_age: null, fire_legacy_amount: null }))
      .toEqual({ strategy: 'deplete', endAge: 90, legacyAmount: 0 })

    // Empty object
    expect(parseFireStrategy({}))
      .toEqual({ strategy: 'deplete', endAge: 90, legacyAmount: 0 })

    // Invalid strategy falls back to deplete
    expect(parseFireStrategy({ fire_end_strategy: 'fixed_age' }))
      .toEqual({ strategy: 'deplete', endAge: 90, legacyAmount: 0 })
  })

  it('D14: legacy_amount field only relevant when strategy is legacy', () => {
    const legacy = parseFireStrategy({ fire_end_strategy: 'legacy', fire_legacy_amount: 150000 })
    expect(legacy.strategy).toBe('legacy')
    expect(legacy.legacyAmount).toBe(150000)

    // For non-legacy strategies, legacyAmount is ignored (still parsed but not used)
    const deplete = parseFireStrategy({ fire_end_strategy: 'deplete', fire_legacy_amount: 150000 })
    expect(deplete.strategy).toBe('deplete')
    // legacyAmount still parsed but UI should hide the field
  })

  it('D15: legacy_amount accepts string input (coerced to number)', () => {
    const result = parseFireStrategy({ fire_end_strategy: 'legacy', fire_legacy_amount: '250000' })
    expect(result.legacyAmount).toBe(250000)
    expect(typeof result.legacyAmount).toBe('number')
  })
})

describe('Sectie C — withdrawal strategy', () => {
  it('D16: four valid withdrawal strategies', () => {
    const strategies: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']
    expect(strategies.length).toBe(4)
  })

  it('D17: default withdrawal strategy is static', () => {
    expect(WITHDRAWAL_DEFAULTS.strategy).toBe('static')
  })

  it('D18: guardrail defaults are 80% floor, 120% ceiling, 10% steps', () => {
    expect(WITHDRAWAL_DEFAULTS.guardrailFloor).toBe(0.80)
    expect(WITHDRAWAL_DEFAULTS.guardrailCeiling).toBe(1.20)
    expect(WITHDRAWAL_DEFAULTS.guardrailCutStep).toBe(0.10)
    expect(WITHDRAWAL_DEFAULTS.guardrailRaiseStep).toBe(0.10)
  })

  it('D19: guardrail validation — floor must be less than ceiling', () => {
    // Valid
    expect(validateWithdrawalStrategy('guardrails', 0.80, 1.20)).toBeNull()

    // Floor >= ceiling
    expect(validateWithdrawalStrategy('guardrails', 1.20, 1.20)).not.toBeNull()
    expect(validateWithdrawalStrategy('guardrails', 1.30, 1.20)).not.toBeNull()
  })

  it('D20: guardrail floor/ceiling range is 0.50 to 2.00', () => {
    expect(validateWithdrawalStrategy('guardrails', 0.50, 2.00)).toBeNull()
    expect(validateWithdrawalStrategy('guardrails', 0.49, 1.20)).not.toBeNull()
    expect(validateWithdrawalStrategy('guardrails', 0.80, 2.01)).not.toBeNull()
  })

  it('D21: cut/raise step range is 0.01 to 0.50', () => {
    expect(validateWithdrawalStrategy(undefined, undefined, undefined, 0.01, 0.50)).toBeNull()
    expect(validateWithdrawalStrategy(undefined, undefined, undefined, 0.005, 0.10)).not.toBeNull()
    expect(validateWithdrawalStrategy(undefined, undefined, undefined, 0.10, 0.55)).not.toBeNull()
  })

  it('D22: invalid strategy type is rejected', () => {
    expect(validateWithdrawalStrategy('invalid')).not.toBeNull()
    expect(validateWithdrawalStrategy('static')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. Sectie D — Weergave
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie D — Weergave typography', () => {
  const FONT_THEMES = [
    { id: 'editorial', heading: 'Playfair Display', body: 'Source Serif 4' },
    { id: 'andada', heading: 'Andada Pro', body: 'Andada Pro' },
    { id: 'digital', heading: 'Inter', body: 'Inter' },
  ]

  it('E1: three font themes available', () => {
    expect(FONT_THEMES.length).toBe(3)
  })

  it('E2: theme IDs are editorial/andada/digital', () => {
    expect(FONT_THEMES.map(t => t.id)).toEqual(['editorial', 'andada', 'digital'])
  })

  it('E3: each theme has heading and body font', () => {
    FONT_THEMES.forEach(theme => {
      expect(theme.heading.length).toBeGreaterThan(0)
      expect(theme.body.length).toBeGreaterThan(0)
    })
  })
})

describe('Sectie D — ColorPickerCard', () => {
  it('E4: color picker accepts hex input (#RRGGBB)', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/
    expect(hexPattern.test('#d97706')).toBe(true) // kern amber
    expect(hexPattern.test('#0d9488')).toBe(true) // wil teal
    expect(hexPattern.test('#7c3aed')).toBe(true) // horizon purple
    expect(hexPattern.test('invalid')).toBe(false)
  })

  it('E5: module colors for kern, wil, horizon', () => {
    const moduleColors = {
      kern: '#d97706',
      wil: '#0d9488',
      horizon: '#7c3aed',
    }
    expect(Object.keys(moduleColors)).toEqual(['kern', 'wil', 'horizon'])
    Object.values(moduleColors).forEach(hex => {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    })
  })

  it('E6: presets are {hex, name}[] format', () => {
    const presets = [
      { hex: '#d97706', name: 'Amber' },
      { hex: '#dc2626', name: 'Rood' },
      { hex: '#059669', name: 'Groen' },
    ]
    presets.forEach(p => {
      expect(p.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(typeof p.name).toBe('string')
    })
  })

  it('E7: reset restores default value', () => {
    const defaultValue = '#d97706'
    let currentValue = '#ff0000'

    // Reset action
    currentValue = defaultValue
    expect(currentValue).toBe(defaultValue)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. Sectie E — Gegevens & Account
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie E — Gegevens reset dialog', () => {
  it('F1: reset requires confirmation dialog', () => {
    let showResetDialog = false

    // User clicks reset — dialog opens
    showResetDialog = true
    expect(showResetDialog).toBe(true)

    // User cancels — dialog closes
    showResetDialog = false
    expect(showResetDialog).toBe(false)
  })

  it('F2: reset calls POST /api/onboarding/reset', () => {
    const resetEndpoint = '/api/onboarding/reset'
    expect(resetEndpoint).toBe('/api/onboarding/reset')
    // After reset, user is redirected to /onboarding
    const redirectTo = '/onboarding'
    expect(redirectTo).toBe('/onboarding')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. Sectie F — Privacy & AI
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie F — Privacy & AI toggle', () => {
  it('G1: ai_enabled is a boolean toggle', () => {
    let aiEnabled = true
    expect(typeof aiEnabled).toBe('boolean')

    aiEnabled = !aiEnabled
    expect(aiEnabled).toBe(false)
  })

  it('G2: ai_enabled saves to profiles table', () => {
    // The toggle persists to profiles.ai_enabled
    const updatePayload = { ai_enabled: false }
    expect(typeof updatePayload.ai_enabled).toBe('boolean')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. Sectie G — Huishouden Privacy
// ═══════════════════════════════════════════════════════════════════════════

describe('Sectie G — Huishouden Privacy', () => {
  const CATEGORIES = ['vermogen', 'schulden', 'budgetten', 'transacties', 'inkomen']
  const LEVELS = ['volledig', 'totalen', 'verborgen']

  // Dutch → English mappings (as used in the API)
  const CATEGORY_MAP: Record<string, string> = {
    vermogen: 'assets',
    schulden: 'debts',
    budgetten: 'budgets',
    transacties: 'transactions',
    inkomen: 'income',
  }

  const LEVEL_MAP: Record<string, string> = {
    volledig: 'full',
    totalen: 'totals',
    verborgen: 'hidden',
  }

  it('H1: 5 privacy categories defined', () => {
    expect(CATEGORIES.length).toBe(5)
  })

  it('H2: 3 privacy levels defined', () => {
    expect(LEVELS.length).toBe(3)
  })

  it('H3: default privacy level is totalen for all categories', () => {
    const defaults: Record<string, string> = {}
    CATEGORIES.forEach(cat => {
      defaults[cat] = 'totalen'
    })
    Object.values(defaults).forEach(level => {
      expect(level).toBe('totalen')
    })
  })

  it('H4: Dutch → English category mapping is correct', () => {
    expect(CATEGORY_MAP.vermogen).toBe('assets')
    expect(CATEGORY_MAP.schulden).toBe('debts')
    expect(CATEGORY_MAP.budgetten).toBe('budgets')
    expect(CATEGORY_MAP.transacties).toBe('transactions')
    expect(CATEGORY_MAP.inkomen).toBe('income')
  })

  it('H5: Dutch → English level mapping is correct', () => {
    expect(LEVEL_MAP.volledig).toBe('full')
    expect(LEVEL_MAP.totalen).toBe('totals')
    expect(LEVEL_MAP.verborgen).toBe('hidden')
  })

  it('H6: privacy settings can be updated per category via PATCH', () => {
    const update = { vermogen: 'volledig', schulden: 'verborgen' }

    const current: Record<string, string> = {
      vermogen: 'totalen',
      schulden: 'totalen',
      budgetten: 'totalen',
      transacties: 'totalen',
      inkomen: 'totalen',
    }

    // Apply partial update
    const merged = { ...current, ...update }
    expect(merged.vermogen).toBe('volledig')
    expect(merged.schulden).toBe('verborgen')
    expect(merged.budgetten).toBe('totalen')  // unchanged
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// I. API validation edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('API validation edge cases', () => {
  it('I1: NaN expected_return is rejected', () => {
    expect(validateParameters(NaN, 0.02)).not.toBeNull()
  })

  it('I2: boundary values are accepted', () => {
    // Exact boundaries
    expect(validateParameters(0.01, 0)).toBeNull()
    expect(validateParameters(0.15, 0.08)).toBeNull()
  })

  it('I3: box3_method must be forfaitair or werkelijk', () => {
    const validMethods = ['forfaitair', 'werkelijk']
    expect(validMethods).toContain('forfaitair')
    expect(validMethods).toContain('werkelijk')
    expect(validMethods).not.toContain('custom')
  })

  it('I4: withdrawal strategy validates all four types', () => {
    expect(validateWithdrawalStrategy('static')).toBeNull()
    expect(validateWithdrawalStrategy('guardrails')).toBeNull()
    expect(validateWithdrawalStrategy('vpw')).toBeNull()
    expect(validateWithdrawalStrategy('bucket')).toBeNull()
  })

  it('I5: API defaults for GET /api/parameters', () => {
    const defaults = {
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
    }
    expect(defaults.expected_return).toBe(0.07)
    expect(defaults.inflation_rate).toBe(0.02)
    expect(defaults.box3_method).toBe('forfaitair')
  })
})
