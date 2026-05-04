/**
 * Regression test: PhaseBar buildSegments logic + persona validation
 *
 * Verifies that buildSegments() produces correct segment arrays for all
 * edge cases and all 6 test personas.
 *
 * Feature #468
 */
import { describe, it, expect } from 'vitest'
import { buildSegments, type FaseId } from '@/components/app/horizon/phase-bar'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'
import { computeFireProjection, ageAtDate } from '@/lib/horizon-data'
import { NL_AOW_AGE } from '@/lib/constants'
import type { FinancialInput } from '@/lib/core-metrics'

// ── Helpers ────────────────────────────────────────────────────

function segmentIds(params: Parameters<typeof buildSegments>[0]): FaseId[] {
  return buildSegments(params).map(s => s.id)
}

// ── Tests: segment counts per scenario ─────────────────────────

describe('PhaseBar buildSegments — segment counts', () => {
  it('Normal case (FIRE < AOW): 3 segments', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments).toHaveLength(3)
    expect(segments.map(s => s.id)).toEqual(['opbouw', 'overgang', 'onttrekking'])
  })

  it('FIRE unreachable: 1 segment (Opbouw only)', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: null, aowAge: 67, endAge: 90,
      fireReachable: false, isPensioenMode: false,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('opbouw')
    expect(segments[0].startAge).toBe(35)
    expect(segments[0].endAge).toBe(90)
  })

  it('Pensioen mode: 2 segments (no Overgang)', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 50, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: true,
    })
    expect(segments).toHaveLength(2)
    expect(segments.map(s => s.id)).toEqual(['opbouw', 'onttrekking'])
    expect(segments[1].startAge).toBe(50) // starts at fireAge, not aowAge
  })

  it('FIRE = AOW: 2 segments (Overgang collapses)', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 67, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments).toHaveLength(2)
    expect(segments.map(s => s.id)).toEqual(['opbouw', 'onttrekking'])
  })

  it('FIRE > AOW: 2 segments (Overgang collapses)', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 70, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments).toHaveLength(2)
    expect(segments.map(s => s.id)).toEqual(['opbouw', 'onttrekking'])
  })

  it('Already FIRE\'d + past AOW: 1 segment (Onttrekking only)', () => {
    const segments = buildSegments({
      currentAge: 68, fireAge: 68, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('onttrekking')
  })

  it('Already FIRE\'d + before AOW: 2 segments (Overgang + Onttrekking)', () => {
    const segments = buildSegments({
      currentAge: 50, fireAge: 50, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments).toHaveLength(2)
    expect(segments.map(s => s.id)).toEqual(['overgang', 'onttrekking'])
  })

  it('Already FIRE\'d + pensioen mode: 1 segment (Onttrekking only)', () => {
    const segments = buildSegments({
      currentAge: 50, fireAge: 50, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: true,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('onttrekking')
  })
})

// ── Tests: proportional widths ─────────────────────────────────

describe('PhaseBar buildSegments — proportional age spans', () => {
  it('Segment spans sum to endAge - currentAge', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    const totalSpan = segments.reduce((sum, s) => sum + (s.endAge - s.startAge), 0)
    expect(totalSpan).toBe(55) // 90 - 35
  })

  it('Segments are contiguous (no gaps)', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startAge).toBe(segments[i - 1].endAge)
    }
  })

  it('All segments have positive age spans', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    for (const seg of segments) {
      expect(seg.endAge - seg.startAge).toBeGreaterThan(0)
    }
  })
})

// ── Tests: labels per strategy ─────────────────────────────────

describe('PhaseBar buildSegments — labels per fire_end_strategy', () => {
  const strategies = [
    { name: 'deplete', isPensioen: false },
    { name: 'perpetual', isPensioen: false },
    { name: 'legacy', isPensioen: false },
  ]

  for (const strat of strategies) {
    it(`${strat.name}: correct labels (Opbouw, Overgang, Onttrekking)`, () => {
      const segments = buildSegments({
        currentAge: 40, fireAge: 55, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: strat.isPensioen,
      })
      expect(segments[0].label).toBe('Opbouw')
      expect(segments[1].label).toBe('Overgang')
      expect(segments[2].label).toBe('Onttrekking')
    })
  }

  it('pensioen: correct labels (Opbouw, Onttrekking)', () => {
    const segments = buildSegments({
      currentAge: 40, fireAge: 55, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: true,
    })
    expect(segments[0].label).toBe('Opbouw')
    expect(segments[1].label).toBe('Onttrekking')
  })
})

// ── Tests: segment properties ──────────────────────────────────

describe('PhaseBar buildSegments — segment properties', () => {
  it('All segments have non-empty label and color', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    for (const seg of segments) {
      expect(seg.label.length).toBeGreaterThan(0)
      expect(seg.color.length).toBeGreaterThan(0)
      expect(seg.textColor.length).toBeGreaterThan(0)
      expect(seg.icon).toBeDefined()
    }
  })

  it('Opbouw uses horizon-600 color', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments[0].color).toBe('var(--color-horizon-600)')
  })

  it('Overgang uses horizon-200 color', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments[1].color).toBe('var(--color-horizon-200)')
  })

  it('Onttrekking uses kern-500 color', () => {
    const segments = buildSegments({
      currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
      fireReachable: true, isPensioenMode: false,
    })
    expect(segments[2].color).toBe('var(--color-kern-500)')
  })
})

// ── Tests: persona validation ──────────────────────────────────

describe('PhaseBar buildSegments — all 10 personas', () => {
  const personaConfigs: Record<PersonaKey, {
    totalAssets: number
    totalDebts: number
    description: string
  }> = {
    roos: { totalAssets: 0, totalDebts: 18500, description: 'schuld, FIRE onbereikbaar' },
    daan: { totalAssets: 9700, totalDebts: 13900, description: 'starter, perpetual' },
    lisa: { totalAssets: 462050, totalDebts: 350000, description: '100K milestone, legacy' },
    willem: { totalAssets: 1619700, totalDebts: 0, description: 'near-FI, deplete' },
    rashid: { totalAssets: 904000, totalDebts: 654000, description: 'no-budget, deplete' },
    marijke: { totalAssets: 820200, totalDebts: 0, description: 'retired, pensioen' },
    ronald: { totalAssets: 820200, totalDebts: 0, description: 'pensioenplanner, ALL_MODULES' },
    bas: { totalAssets: 462050, totalDebts: 350000, description: 'vermogensverdeler, ALL_MODULES' },
    leo: { totalAssets: 12215, totalDebts: 18500, description: 'budgetteerder, recovery' },
    jochen: { totalAssets: 1619700, totalDebts: 0, description: 'FIRE-strijder, ALL_MODULES' },
  }

  for (const key of PERSONA_KEYS) {
    const cfg = personaConfigs[key]

    it(`${key} (${cfg.description}): produces valid segments without errors`, () => {
      const p = PERSONAS[key]
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const input: FinancialInput = {
        totalAssets: cfg.totalAssets,
        totalDebts: cfg.totalDebts,
        monthlyIncome: p.profile.net_monthly_income ?? p.meta.income,
        monthlyExpenses: p.profile.estimated_monthly_expenses ?? p.meta.expenses,
        yearlyMustExpenses: 0,
        monthlyContributions: (p.profile.net_monthly_income ?? p.meta.income) - (p.profile.estimated_monthly_expenses ?? p.meta.expenses),
        dateOfBirth: p.profile.date_of_birth,
      }
      const proj = computeFireProjection(input)
      const fireReachable = proj.fireAge !== null && (proj.fireDate === 'Bereikt!' || proj.fireAge > currentAge)

      const segments = buildSegments({
        currentAge,
        fireAge: fireReachable ? proj.fireAge : null,
        aowAge: NL_AOW_AGE,
        endAge: p.profile.fire_end_age ?? 90,
        fireReachable,
        isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
      })

      // All personas should produce at least 1 segment and max 3
      expect(segments.length).toBeGreaterThanOrEqual(1)
      expect(segments.length).toBeLessThanOrEqual(3)

      // All segments have valid age ranges
      for (const seg of segments) {
        expect(seg.endAge - seg.startAge).toBeGreaterThan(0)
        expect(seg.startAge).toBeGreaterThanOrEqual(currentAge)
        expect(seg.endAge).toBeLessThanOrEqual(p.profile.fire_end_age ?? 90)
        expect(seg.label.length).toBeGreaterThan(0)
        expect(seg.color.length).toBeGreaterThan(0)
      }
    })
  }

  it('Roos (schuld): only Opbouw (FIRE unreachable)', () => {
    const p = PERSONAS.roos
    const currentAge = ageAtDate(p.profile.date_of_birth)
    const segments = buildSegments({
      currentAge,
      fireAge: null,
      aowAge: NL_AOW_AGE,
      endAge: p.profile.fire_end_age ?? 85,
      fireReachable: false,
      isPensioenMode: false,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('opbouw')
  })

  it('Marijke (retired + pensioen): only Onttrekking', () => {
    const p = PERSONAS.marijke
    const currentAge = ageAtDate(p.profile.date_of_birth)
    expect(currentAge).toBeGreaterThan(NL_AOW_AGE) // She's past AOW

    const segments = buildSegments({
      currentAge,
      fireAge: currentAge, // already FIRE'd
      aowAge: NL_AOW_AGE,
      endAge: 90,
      fireReachable: true,
      isPensioenMode: true,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('onttrekking')
  })

  it('Willem (near-FI, €1.46M): already FIRE\'d', () => {
    const p = PERSONAS.willem
    const currentAge = ageAtDate(p.profile.date_of_birth)
    const input: FinancialInput = {
      totalAssets: 1457000, totalDebts: 0, monthlyIncome: p.meta.income,
      monthlyExpenses: p.meta.expenses, yearlyMustExpenses: 0,
      monthlyContributions: p.meta.income - p.meta.expenses,
      dateOfBirth: p.profile.date_of_birth,
    }
    const proj = computeFireProjection(input)
    // With €1.46M and €3000/mo expenses, Willem should be FI
    expect(proj.fireDate).toBe('Bereikt!')
  })
})
