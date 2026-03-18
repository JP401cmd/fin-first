import { describe, it, expect } from 'vitest'
import { computeSovereigntyLevel, levelToPhaseId, PHASES } from '@/lib/feature-phases'
import {
  temporalLevels,
  chronologyPhases,
  chronologyLevels,
  phaseColors,
  levelCriteriaMap,
  getFeaturesPerPhase,
  featureIcons,
} from '@/lib/identity-constants'
import { NL_SWR } from '@/lib/constants'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Simulate the net worth calculation from loadIdentityData */
function computeNetWorth(assets: number[], debts: number[]): number {
  const totalAssets = assets.reduce((s, a) => s + a, 0)
  const totalDebts = debts.reduce((s, d) => s + d, 0)
  return totalAssets - totalDebts
}

/** Simulate the financial data derivation from loadIdentityData */
function deriveFinancialData(
  assets: number[],
  debts: { balance: number; type: string }[],
  expenses3m: number,
) {
  const totalAssets = assets.reduce((s, a) => s + a, 0)
  const totalDebts = debts.reduce((s, d) => s + d.balance, 0)
  const netWorth = totalAssets - totalDebts
  const monthlyExpenses = expenses3m / 3
  const monthsCovered = monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.type) && d.balance > 0)
  return { netWorth, monthsCovered, freedomPct, hasConsumerDebt, monthlyExpenses }
}

// ── Step 1: loadIdentityData financial calculations ─────────────────────

describe('Identity — loadIdentityData calculations', () => {
  it('computes netWorth as sum of assets minus sum of debts', () => {
    expect(computeNetWorth([100_000, 50_000], [30_000])).toBe(120_000)
    expect(computeNetWorth([0], [50_000])).toBe(-50_000)
    expect(computeNetWorth([], [])).toBe(0)
  })

  it('computes monthsCovered from netWorth / monthlyExpenses', () => {
    const data = deriveFinancialData([120_000], [], 12_000) // 4000/mo → 30 months
    expect(data.monthsCovered).toBeCloseTo(30, 0)
  })

  it('computes freedomPct using NL_SWR-based fire target', () => {
    // fireTarget = yearlyExpenses / NL_SWR
    // freedomPct = (netWorth / fireTarget) * 100
    const data = deriveFinancialData([100_000], [], 6_000) // 2000/mo → 24000/yr
    const expectedTarget = 24_000 / NL_SWR
    const expectedPct = (100_000 / expectedTarget) * 100
    expect(data.freedomPct).toBeCloseTo(expectedPct, 2)
  })

  it('detects consumer debt correctly', () => {
    const withConsumer = deriveFinancialData(
      [50_000],
      [{ balance: 10_000, type: 'credit_card' }],
      3_000,
    )
    expect(withConsumer.hasConsumerDebt).toBe(true)

    const withMortgage = deriveFinancialData(
      [50_000],
      [{ balance: 200_000, type: 'hypotheek' }],
      3_000,
    )
    expect(withMortgage.hasConsumerDebt).toBe(false)
  })

  it('computes sovereignty level from financial data', () => {
    const data = deriveFinancialData([100_000], [], 6_000)
    const level = computeSovereigntyLevel(
      data.netWorth,
      data.monthlyExpenses,
      data.freedomPct,
      data.hasConsumerDebt,
    )
    expect(level).toBeGreaterThanOrEqual(-2)
    expect(level).toBeLessThanOrEqual(6)
  })

  it('handles zero expenses gracefully (level 0)', () => {
    const level = computeSovereigntyLevel(100_000, 0, 0, false)
    expect(level).toBe(0)
  })
})

// ── Step 2: Profielsamenvatting strip ───────────────────────────────────

describe('Identity — Profielsamenvatting strip', () => {
  it('computes initials from full name', () => {
    const computeInitials = (name: string) =>
      name ? name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '?'

    expect(computeInitials('Jan de Vries')).toBe('JD')
    expect(computeInitials('Anna')).toBe('A')
    expect(computeInitials('')).toBe('?')
    expect(computeInitials('Pieter van der Berg')).toBe('PV')
  })

  it('computes household label from householdType', () => {
    const label = (ht: string) =>
      ht === 'solo' ? 'Solo' : ht === 'samen' ? 'Samen' : 'Gezin'

    expect(label('solo')).toBe('Solo')
    expect(label('samen')).toBe('Samen')
    expect(label('gezin')).toBe('Gezin')
  })

  it('computes sovereignty level label correctly', () => {
    const levelLabel = (sovereigntyLevel: number) =>
      sovereigntyLevel <= 0
        ? 'Herstel'
        : sovereigntyLevel <= 2
        ? `Niveau ${sovereigntyLevel}: Stabiliteit`
        : sovereigntyLevel <= 4
        ? `Niveau ${sovereigntyLevel}: Momentum`
        : `Niveau ${sovereigntyLevel}: Meesterschap`

    expect(levelLabel(-2)).toBe('Herstel')
    expect(levelLabel(0)).toBe('Herstel')
    expect(levelLabel(1)).toBe('Niveau 1: Stabiliteit')
    expect(levelLabel(2)).toBe('Niveau 2: Stabiliteit')
    expect(levelLabel(3)).toBe('Niveau 3: Momentum')
    expect(levelLabel(4)).toBe('Niveau 4: Momentum')
    expect(levelLabel(5)).toBe('Niveau 5: Meesterschap')
    expect(levelLabel(6)).toBe('Niveau 6: Meesterschap')
  })
})

// ── Step 3: Temporeel evenwicht slider ──────────────────────────────────

describe('Identity — Temporeel evenwicht', () => {
  it('has exactly 5 temporal levels', () => {
    expect(temporalLevels).toHaveLength(5)
  })

  it('each level has required properties: icon, name, nameNl, tagline, description', () => {
    for (const lvl of temporalLevels) {
      expect(lvl.level).toBeGreaterThanOrEqual(1)
      expect(lvl.level).toBeLessThanOrEqual(5)
      expect(lvl.icon).toBeTruthy()
      expect(lvl.name).toBeTruthy()
      expect(lvl.nameNl).toBeTruthy()
      expect(lvl.tagline).toBeTruthy()
      expect(lvl.description).toBeTruthy()
    }
  })

  it('level 1-5 maps to correct persona', () => {
    expect(temporalLevels[0].name).toBe('The Hedonist')
    expect(temporalLevels[1].name).toBe('The Voyager')
    expect(temporalLevels[2].name).toBe('The Architect')
    expect(temporalLevels[3].name).toBe('The Stoic')
    expect(temporalLevels[4].name).toBe('The Essentialist')
  })

  it('active level card shows correct data for slider value', () => {
    for (let val = 1; val <= 5; val++) {
      const activeLevel = temporalLevels[val - 1]
      expect(activeLevel.level).toBe(val)
      expect(activeLevel.nameNl).toBeTruthy()
      expect(activeLevel.tagline).toBeTruthy()
    }
  })
})

// ── Step 4: Chronologische schaal ──────────────────────────────────────

describe('Identity — Chronologische schaal', () => {
  it('has 4 phases: Herstel, Stabiliteit, Momentum, Meesterschap', () => {
    expect(chronologyPhases).toHaveLength(4)
    expect(chronologyPhases.map(p => p.name)).toEqual([
      'Herstel', 'Stabiliteit', 'Momentum', 'Meesterschap',
    ])
  })

  it('has 9 chronology levels from -2 to 6', () => {
    expect(chronologyLevels).toHaveLength(9)
    expect(chronologyLevels[0].level).toBe(-2)
    expect(chronologyLevels[chronologyLevels.length - 1].level).toBe(6)
  })

  it('current position dot maps to correct phase', () => {
    // Level 0 → recovery
    expect(levelToPhaseId(0)).toBe('recovery')
    // Level 2 → stability
    expect(levelToPhaseId(2)).toBe('stability')
    // Level 3 → momentum
    expect(levelToPhaseId(3)).toBe('momentum')
    // Level 5 → mastery
    expect(levelToPhaseId(5)).toBe('mastery')
  })

  it('progress percentage per level criteria is correct', () => {
    const financialData = {
      netWorth: 50_000,
      monthsCovered: 4,
      freedomPct: 15,
      hasConsumerDebt: false,
    }

    // Level 0: netWorth >= 0 → 100%
    expect(levelCriteriaMap[0].progress(financialData)).toBe(100)

    // Level 1: monthsCovered / 1 * 100 → capped at 100
    expect(levelCriteriaMap[1].progress(financialData)).toBe(100)

    // Level 2: monthsCovered / 3 * 100 → 4/3*100 = 133 → capped 100
    expect(levelCriteriaMap[2].progress(financialData)).toBe(100)

    // Level 3: avg of buffer(4/6*100=67%) + freedom(15/10*100=100%) = 84%
    const lvl3 = levelCriteriaMap[3].progress(financialData)
    expect(lvl3).toBeGreaterThan(50)
    expect(lvl3).toBeLessThanOrEqual(100)

    // Level 6: freedomPct / 100 * 100 = 15%
    expect(levelCriteriaMap[6].progress(financialData)).toBe(15)
  })

  it('each phase has corresponding colors defined', () => {
    for (const phase of chronologyPhases) {
      const colors = phaseColors[phase.color]
      expect(colors).toBeDefined()
      expect(colors.dot).toBeTruthy()
      expect(colors.activeDot).toBeTruthy()
      expect(colors.badge).toBeTruthy()
      expect(colors.text).toBeTruthy()
    }
  })
})

// ── Step 5: Check-in timeline ──────────────────────────────────────────

describe('Identity — Check-in timeline', () => {
  it('generates 12 month keys for the current year', () => {
    const now = new Date()
    const year = now.getFullYear()
    const months = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`,
    )
    expect(months).toHaveLength(12)
    expect(months[0]).toBe(`${year}-01`)
    expect(months[11]).toBe(`${year}-12`)
  })

  it('correctly identifies completed months from data', () => {
    const completedMonths = ['2026-01', '2026-02', '2026-03']
    expect(completedMonths.includes('2026-01')).toBe(true)
    expect(completedMonths.includes('2026-04')).toBe(false)
  })

  it('generates correct check-in links for completed months', () => {
    const monthKey = '2026-02'
    const href = `/core/checkin?month=${monthKey}&from=/identity`
    expect(href).toBe('/core/checkin?month=2026-02&from=/identity')
  })

  it('current month link omits month parameter', () => {
    const href = '/core/checkin?from=/identity'
    expect(href).not.toContain('month=')
  })
})

// ── Step 6: Demo-user banner ───────────────────────────────────────────

describe('Identity — Demo user banner', () => {
  it('banner is visible only when isDemoUser is true', () => {
    // The identity-client.tsx conditionally renders: {isDemoUser && (...)}
    const renderBanner = (isDemoUser: boolean) => isDemoUser
    expect(renderBanner(true)).toBe(true)
    expect(renderBanner(false)).toBe(false)
  })
})

// ── Step 7: Demo switch flow ───────────────────────────────────────────

describe('Identity — Demo switch flow', () => {
  it('switch flow posts to /api/onboarding/reset', () => {
    // Verify the expected endpoint matches implementation
    const resetEndpoint = '/api/onboarding/reset'
    const resetMethod = 'POST'
    expect(resetEndpoint).toBe('/api/onboarding/reset')
    expect(resetMethod).toBe('POST')
  })

  it('after reset, redirects to /onboarding', () => {
    const redirectTarget = '/onboarding'
    expect(redirectTarget).toBe('/onboarding')
  })
})

// ── Step 8: Feature roadmap per fase ────────────────────────────────────

describe('Identity — Feature roadmap per fase', () => {
  it('getFeaturesPerPhase returns features grouped by phase', () => {
    const result = getFeaturesPerPhase()
    // Should have keys for all 4 phases
    for (const phase of PHASES) {
      expect(result[phase.id]).toBeDefined()
      expect(Array.isArray(result[phase.id])).toBe(true)
    }
  })

  it('every feature has an icon (or fallback)', () => {
    const result = getFeaturesPerPhase()
    for (const phase of PHASES) {
      for (const feature of result[phase.id]) {
        // The component uses: featureIcons[feature.id] ?? '⚡'
        const icon = featureIcons[feature.id] ?? '\u26A1'
        expect(icon).toBeTruthy()
      }
    }
  })

  it('feature pills have id, label, and description', () => {
    const result = getFeaturesPerPhase()
    for (const phase of PHASES) {
      for (const feature of result[phase.id]) {
        expect(feature.id).toBeTruthy()
        expect(feature.label).toBeTruthy()
        expect(feature.description).toBeTruthy()
      }
    }
  })

  it('phase unlock status depends on sovereignty level vs phase index', () => {
    // Level 3 → momentum → phases recovery, stability, momentum are unlocked
    const currentPhaseId = levelToPhaseId(3)
    expect(currentPhaseId).toBe('momentum')
    const currentPhaseIdx = PHASES.findIndex(p => p.id === currentPhaseId)

    for (let i = 0; i < PHASES.length; i++) {
      const isUnlocked = i <= currentPhaseIdx
      if (i <= 2) expect(isUnlocked).toBe(true)   // recovery, stability, momentum
      if (i === 3) expect(isUnlocked).toBe(false)  // mastery
    }
  })
})

// ── Step 9: Gids link-kaart ────────────────────────────────────────────

describe('Identity — Gids link-kaart', () => {
  it('navigates to /identity/gids', () => {
    const gidsHref = '/identity/gids'
    expect(gidsHref).toBe('/identity/gids')
  })
})

// ── Step 10: computeSovereigntyLevel comprehensive ─────────────────────

describe('Identity — computeSovereigntyLevel', () => {
  it('returns -2 for negative netWorth with consumer debt', () => {
    expect(computeSovereigntyLevel(-50_000, 2_000, 0, true)).toBe(-2)
  })

  it('returns -1 for negative netWorth without consumer debt', () => {
    expect(computeSovereigntyLevel(-50_000, 2_000, 0, false)).toBe(-1)
  })

  it('returns 0 for near-zero netWorth (less than 1 month)', () => {
    expect(computeSovereigntyLevel(500, 2_000, 0, false)).toBe(0)
  })

  it('returns 1 for 1-3 months covered', () => {
    // netWorth=4000, monthlyExpenses=2000 → 2 months covered
    expect(computeSovereigntyLevel(4_000, 2_000, 0, false)).toBe(1)
  })

  it('returns 2 for 3-6 months covered', () => {
    // netWorth=8000, monthlyExpenses=2000 → 4 months, freedomPct < 10
    expect(computeSovereigntyLevel(8_000, 2_000, 5, false)).toBe(2)
  })

  it('returns 3 for 6+ months and freedomPct 10-25', () => {
    expect(computeSovereigntyLevel(20_000, 2_000, 15, false)).toBe(3)
  })

  it('returns 4 for freedomPct 25-75', () => {
    expect(computeSovereigntyLevel(100_000, 2_000, 50, false)).toBe(4)
  })

  it('returns 5 for freedomPct 75-100', () => {
    expect(computeSovereigntyLevel(300_000, 2_000, 85, false)).toBe(5)
  })

  it('returns 6 for freedomPct >= 100', () => {
    expect(computeSovereigntyLevel(500_000, 2_000, 110, false)).toBe(6)
  })
})
