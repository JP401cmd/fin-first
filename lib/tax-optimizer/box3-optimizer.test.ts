import { describe, expect, it } from 'vitest'
import { calculateBox3 } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  buildBox3Optimizer,
  generateBox3Strategies,
  rankStrategies,
  pickBest,
  synthBox3Input,
  OPTIMIZER_DISCLAIMER,
  type Box3OptimizerInput,
} from './index'

// ── Fixtures ─────────────────────────────────────────────────────

function asset(partial: Partial<Asset> & { asset_type: string; current_value: number }): Asset {
  return { is_active: true, ...partial } as unknown as Asset
}
function debt(partial: Partial<Debt> & { debt_type: string; current_balance: number }): Debt {
  return { is_active: true, linked_asset_id: null, is_tax_deductible: false, ...partial } as unknown as Debt
}

/**
 * Een ECHTE (niet-synthetische) Box 3-invoer: spaargeld + beleggingen + crypto,
 * plus een eigen woning met aftrekbare hypotheek (uitgesloten) en een
 * consumptief krediet (Box 3-schuld). Totalen:
 *   spaargeld €80.000 · beleggingen €70.000 · Box 3-schuld €10.000
 */
function realSoloInput(year: 2025 | 2026 = 2026) {
  const assets: Asset[] = [
    asset({ id: 'a1', asset_type: 'savings', current_value: 80_000 }),
    asset({ id: 'a2', asset_type: 'investment', current_value: 60_000 }),
    asset({ id: 'a3', asset_type: 'crypto', current_value: 10_000 }),
    asset({ id: 'a4', asset_type: 'eigen_huis', current_value: 400_000 }),
  ]
  const debts: Debt[] = [
    debt({ id: 'd1', debt_type: 'mortgage', current_balance: 300_000, linked_asset_id: 'a4', is_tax_deductible: true }),
    debt({ id: 'd2', debt_type: 'personal_loan', current_balance: 10_000 }),
  ]
  return { assets, debts, hasPartner: false, dailyExpenses: 100, year }
}

function soloOptimizerInput(): Box3OptimizerInput {
  const current = calculateBox3(realSoloInput())
  return {
    goalId: 'box3-minimaal',
    year: 2026,
    dailyExpenses: 100,
    hasPartner: false,
    current,
  }
}

// ── Parity: synthetische compositie == echte engine ──────────────

describe('tax-optimizer — synthBox3Input parity', () => {
  it('reproduceert de heffing van een echte samenstelling exact', () => {
    const real = calculateBox3(realSoloInput())
    const synth = calculateBox3(
      synthBox3Input(
        real.totaalSpaargeld,
        real.totaalBeleggingen,
        real.totaalBox3Schulden,
        real.hasPartner,
        100,
        2026,
      ),
    )
    // Byte-identiek: de synthetische compositie voedt calculateBox3 dezelfde
    // categorie-totalen, dus dezelfde heffing — geen derde getal.
    expect(synth.tax).toBe(real.tax)
    expect(synth.totaalSpaargeld).toBe(real.totaalSpaargeld)
    expect(synth.totaalBeleggingen).toBe(real.totaalBeleggingen)
    expect(synth.totaalBox3Schulden).toBe(real.totaalBox3Schulden)
  })

  it('sluit de eigen woning + aftrekbare hypotheek correct uit', () => {
    const real = calculateBox3(realSoloInput())
    // €400k huis is uitgesloten; €300k hypotheek is Box 1 → alleen €10k Box 3-schuld.
    expect(real.totaalUitgesloten).toBe(400_000)
    expect(real.totaalBox3Schulden).toBe(10_000)
  })
})

// ── Baseline ─────────────────────────────────────────────────────

describe('tax-optimizer — baseline', () => {
  it('baseline draagt de huidige heffing en 0 besparing', () => {
    const input = soloOptimizerInput()
    const { baseline } = generateBox3Strategies(input)
    expect(baseline.isBaseline).toBe(true)
    expect(baseline.savings).toBe(0)
    expect(baseline.currentTax).toBe(input.current.tax)
    expect(baseline.optimizedTax).toBe(input.current.tax)
  })
})

// ── Samenstelling-shift ──────────────────────────────────────────

describe('tax-optimizer — samenstelling-shift', () => {
  it('verlaagt de heffing (beleggingen → spaargeld) en berekent vrijheidsdagen', () => {
    const input = soloOptimizerInput()
    const { strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
    expect(shift).toBeDefined()
    expect(shift!.savings).toBeGreaterThan(0)
    expect(shift!.optimizedTax).toBeLessThan(shift!.currentTax)
    expect(shift!.hasReturnCost).toBe(true)
    expect(shift!.caveat).not.toBeNull()
    // Vrijheidsdagen == round(savings / dagUitgaven).
    expect(shift!.freedomDays).toBe(Math.round(shift!.savings / 100))
    // savings === currentTax − optimizedTax (getallen sluiten).
    expect(shift!.savings).toBeCloseTo(shift!.currentTax - shift!.optimizedTax, 6)
  })

  it('genereert geen shift-scenario zonder beleggingen', () => {
    const noInvest = calculateBox3({
      assets: [asset({ id: 'a1', asset_type: 'savings', current_value: 200_000 })],
      debts: [],
      hasPartner: false,
      dailyExpenses: 100,
      year: 2026,
    })
    const { strategies } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: noInvest,
    })
    expect(strategies.find((s) => s.kind === 'samenstelling-shift')).toBeUndefined()
  })

  it('genereert geen shift-scenario onder de heffingsvrije grens (tax = 0)', () => {
    const belowThreshold = calculateBox3({
      assets: [asset({ id: 'a1', asset_type: 'investment', current_value: 20_000 })],
      debts: [],
      hasPartner: false,
      dailyExpenses: 100,
      year: 2026,
    })
    expect(belowThreshold.tax).toBe(0)
    const { strategies } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: belowThreshold,
    })
    expect(strategies).toHaveLength(0)
  })
})

// ── Partnerverdeling ─────────────────────────────────────────────

function householdInput(goalId: Box3OptimizerInput['goalId']): Box3OptimizerInput {
  // Gecombineerd huishoud-resultaat met fiscaal partner (dubbele vrijstelling).
  const combined = calculateBox3({
    assets: [
      asset({ id: 'a1', asset_type: 'savings', current_value: 150_000 }),
      asset({ id: 'a2', asset_type: 'investment', current_value: 150_000 }),
    ],
    debts: [],
    hasPartner: true,
    dailyExpenses: 100,
    year: 2026,
  })
  return {
    goalId,
    year: 2026,
    dailyExpenses: 100,
    hasPartner: true,
    current: combined,
    optimalAllocation: { totalTax: 5_000, savingsVsEqual: 800 },
  }
}

describe('tax-optimizer — partnerverdeling', () => {
  it('consumeert de scalaire optimale verdeling zonder rendementskosten', () => {
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')
    expect(partner).toBeDefined()
    expect(partner!.savings).toBe(800)
    expect(partner!.optimizedTax).toBe(5_000)
    expect(partner!.currentTax).toBe(5_800) // totalTax + savingsVsEqual
    expect(partner!.hasReturnCost).toBe(false)
    expect(partner!.freedomDays).toBe(8) // 800 / 100
  })

  it('toont geen partnerverdeling zonder besparing', () => {
    const input = householdInput('box3-minimaal')
    input.optimalAllocation = { totalTax: 5_000, savingsVsEqual: 0 }
    const { strategies } = generateBox3Strategies(input)
    expect(strategies.find((s) => s.kind === 'partnerverdeling')).toBeUndefined()
  })
})

// ── Ranking per doel ─────────────────────────────────────────────

describe('tax-optimizer — ranking per doel', () => {
  it('box3-minimaal rankt op grootste besparing', () => {
    // Shift (kost rendement) bespaart méér dan partner (geen kosten).
    const input = householdInput('box3-minimaal')
    const { strategies } = generateBox3Strategies(input)
    const ranked = rankStrategies(strategies, 'box3-minimaal')
    // De grootste besparing staat vooraan.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].savings).toBeGreaterThanOrEqual(ranked[i].savings)
    }
    const best = pickBest(ranked, 'box3-minimaal')
    expect(best).not.toBeNull()
    expect(best!.savings).toBe(ranked[0].savings)
  })

  it('box3-geen-rendementsverlies zet kosteloze hefbomen eerst', () => {
    const input = householdInput('box3-geen-rendementsverlies')
    const { strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')!
    // Maak de shift-besparing GROTER dan de partner-besparing, zodat het doel
    // (geen rendementsverlies) de volgorde echt bepaalt, niet de euro's.
    expect(shift.savings).toBeGreaterThan(partner.savings)
    const ranked = rankStrategies(strategies, 'box3-geen-rendementsverlies')
    expect(ranked[0].kind).toBe('partnerverdeling')
    // Beste kosteloze scenario, ook al bespaart de shift méér.
    const best = pickBest(ranked, 'box3-geen-rendementsverlies')
    expect(best!.kind).toBe('partnerverdeling')
  })

  it('geen kosteloos scenario → geen beste voor geen-rendementsverlies (solo)', () => {
    const ranked = rankStrategies(
      generateBox3Strategies(soloOptimizerInput()).strategies,
      'box3-geen-rendementsverlies',
    )
    // Solo: alleen de shift (kost rendement) bestaat.
    expect(pickBest(ranked, 'box3-geen-rendementsverlies')).toBeNull()
  })
})

// ── buildBox3Optimizer (end-to-end) ──────────────────────────────

describe('tax-optimizer — buildBox3Optimizer', () => {
  it('levert een compleet, deterministisch CompareResult met disclaimer', () => {
    const input = householdInput('box3-minimaal')
    const a = buildBox3Optimizer(input)
    const b = buildBox3Optimizer(input)
    expect(a).toEqual(b) // deterministisch
    expect(a.disclaimer).toBe(OPTIMIZER_DISCLAIMER)
    expect(a.baseline.isBaseline).toBe(true)
    expect(a.strategies.length).toBeGreaterThanOrEqual(2) // acceptatie: ≥2 scenario's
    expect(a.goal.id).toBe('box3-minimaal')
    // Elk scenario draagt een € + vrijheidsdagen-impact.
    for (const s of a.strategies) {
      expect(typeof s.savings).toBe('number')
      expect(typeof s.freedomDays).toBe('number')
    }
  })

  it('leeg vermogen → geen scenario’s, geen beste', () => {
    const empty = calculateBox3({ assets: [], debts: [], hasPartner: false, dailyExpenses: 100, year: 2026 })
    const result = buildBox3Optimizer({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: empty,
    })
    expect(result.strategies).toHaveLength(0)
    expect(result.best).toBeNull()
  })
})
