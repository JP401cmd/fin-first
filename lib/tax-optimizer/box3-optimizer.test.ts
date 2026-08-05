import { describe, expect, it } from 'vitest'
import { BOX3_PARAMS, calculateBox3, estimateBox3TaxDrag } from '@/lib/box3-data'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import { DEFAULT_RETURN, EXPECTED_SAVINGS_RETURN } from '@/lib/constants'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  buildBox3Optimizer,
  buildCurrentStanding,
  generateBox3Strategies,
  rankStrategies,
  pickBest,
  pickTopChoice,
  synthBox3Input,
  GOAL_BY_ID,
  OPTIMIZER_DISCLAIMER,
  SHIFT_CURVE_STEPS,
  type Box3OptimizerInput,
  type GoalSection,
  type OptimizerStrategy,
  type ShiftCurvePoint,
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

/** Household ZONDER beleggingen (alleen spaargeld) — er is dus geen shift-hefboom mogelijk. */
function partnerOnlyHouseholdInput(
  goalId: Box3OptimizerInput['goalId'] = 'box3-minimaal',
): Box3OptimizerInput {
  const combined = calculateBox3({
    assets: [asset({ id: 'a1', asset_type: 'savings', current_value: 300_000 })],
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
    optimalAllocation: { totalTax: 4_000, savingsVsEqual: 650 },
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

  it('zonder beleggingen: alléén de partnerverdeling bestaat, shiftCurve is null door de hele keten', () => {
    const input = partnerOnlyHouseholdInput()
    // Meet vóór je assert: bevestig dat de fixture geen beleggingen draagt, dus
    // de shift-drempel (MIN_BELEGGINGEN_FOR_SHIFT) per definitie niet haalt.
    expect(input.current.totaalBeleggingen).toBe(0)

    const { strategies, shiftCurve } = generateBox3Strategies(input)
    expect(strategies).toHaveLength(1)
    expect(strategies[0].kind).toBe('partnerverdeling')
    expect(strategies[0].savings).toBe(650)
    // Geen shift-scenario → de curve (die de shift uitvergroot) bestaat niet.
    expect(shiftCurve).toBeNull()

    // Door de hele keten: buildBox3Optimizer draagt dezelfde null door.
    const result = buildBox3Optimizer(input)
    expect(result.shiftCurve).toBeNull()
    expect(result.strategies.map((s) => s.kind)).toEqual(['partnerverdeling'])
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

// ── Netto effect (besparing − misgelopen rendement) ──────────────
//
// De kernfix: `hasReturnCost` was alleen een boolean, waardoor een shift met een
// kleine belastingbesparing én een groot rendementsverlies als "kans" kon
// bovenkomen. Elk scenario draagt nu het BEDRAG (returnCostEur) en het saldo.

/** Het verwachte rendementsgat — afgeleid uit de canonieke aannames, geen literal. */
const RETURN_GAP = DEFAULT_RETURN - EXPECTED_SAVINGS_RETURN

describe('tax-optimizer — netto effect', () => {
  it('shift: returnCostEur = verschoven bedrag × (beleggingsrendement − spaarrente), afgerond', () => {
    const input = soloOptimizerInput()
    const { strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    // Solo-fixture: €70.000 beleggingen verschuiven naar spaargeld.
    expect(input.current.totaalBeleggingen).toBe(70_000)
    expect(shift.returnCostEur).toBe(Math.round(70_000 * RETURN_GAP))
    expect(shift.returnCostEur).toBe(3_990) // 70.000 × 5,7%
    expect(shift.returnCostEur).toBeGreaterThanOrEqual(0)
  })

  it('shift: netEffect = savings − returnCostEur en is hier NEGATIEF', () => {
    const { strategies } = generateBox3Strategies(soloOptimizerInput())
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    expect(shift.netEffect).toBeCloseTo(shift.savings - shift.returnCostEur, 9)
    // De belastingbesparing (enkele honderden euro's) weegt niet op tegen
    // €3.990 misgelopen rendement.
    expect(shift.savings).toBeGreaterThan(0)
    expect(shift.netEffect).toBeLessThan(0)
    // netFreedomDays valt terug op 0 zodra het netto effect ≤ 0 is.
    expect(shift.netFreedomDays).toBe(0)
  })

  it('partnerverdeling: geen rendementsverlies → netEffect POSITIEF en gelijk aan savings', () => {
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')!
    expect(partner.returnCostEur).toBe(0)
    expect(partner.netEffect).toBe(partner.savings)
    expect(partner.netEffect).toBe(800)
    expect(partner.netFreedomDays).toBe(8) // 800 / 100
    expect(partner.netFreedomDays).toBe(partner.freedomDays)
  })

  it('baseline draagt geen rendementskosten en geen netto effect', () => {
    const { baseline } = generateBox3Strategies(soloOptimizerInput())
    expect(baseline.returnCostEur).toBe(0)
    expect(baseline.netEffect).toBe(0)
    expect(baseline.netFreedomDays).toBe(0)
  })

  it('netFreedomDays = 0 bij dag-uitgaven ≤ 0 (geen deling door nul)', () => {
    const input = householdInput('box3-minimaal')
    input.dailyExpenses = 0
    const { strategies } = generateBox3Strategies(input)
    for (const s of strategies) {
      expect(s.netFreedomDays).toBe(0)
      expect(s.freedomDays).toBe(0)
    }
  })

  it('legt de rendementsaanname uit in detail + caveat (uitlegbaarheid)', () => {
    const { strategies } = generateBox3Strategies(soloOptimizerInput())
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    expect(shift.detail.some((d) => d.includes('7,0%') && d.includes('1,3%'))).toBe(true)
    expect(shift.detail.some((d) => d.startsWith('Netto effect'))).toBe(true)
    expect(shift.caveat).toContain('7,0%')
    expect(shift.caveat).toContain('1,3%')
  })
})

// ── Huidige stand (referentiepaneel) ─────────────────────────────

describe('tax-optimizer — buildCurrentStanding', () => {
  it('spiegelt het Box3Result zonder iets te herberekenen', () => {
    const current = calculateBox3(realSoloInput())
    const standing = buildCurrentStanding(current, 100)

    expect(standing.tax).toBe(current.tax)
    expect(standing.totaalSpaargeld).toBe(80_000)
    expect(standing.totaalBeleggingen).toBe(70_000)
    expect(standing.totaalBox3Schulden).toBe(10_000)
    expect(standing.heffingsvrijVermogen).toBe(current.heffingsvrijVermogen)
    expect(standing.hasPartner).toBe(false)
    // Vrijheidsdagen op de MEEGEGEVEN dag-uitgaven, niet op een tweede grondslag.
    expect(standing.taxFreedomDays).toBe(Math.round(current.tax / 100))
    // Effectieve druk komt uit de canonieke helper (tax / Box 3-vermogen).
    expect(standing.effectieveDrukPct).toBeCloseTo(estimateBox3TaxDrag(current) * 100, 9)
  })

  it('vrijstellingBenutPct is 100 zodra de grondslag boven de vrijstelling ligt', () => {
    const current = calculateBox3(realSoloInput())
    // €150.000 bezittingen − €6.200 aftrekbare schuld ≫ €59.357 vrijstelling.
    expect(current.rendementsgrondslag).toBeGreaterThan(current.heffingsvrijVermogen)
    expect(buildCurrentStanding(current, 100).vrijstellingBenutPct).toBe(100)
  })

  it('vrijstellingBenutPct is een deel-percentage onder de vrijstelling', () => {
    const small = calculateBox3({
      assets: [asset({ id: 'a1', asset_type: 'savings', current_value: 30_000 })],
      debts: [],
      hasPartner: false,
      dailyExpenses: 100,
      year: 2026,
    })
    const standing = buildCurrentStanding(small, 100)
    expect(small.tax).toBe(0)
    expect(standing.vrijstellingBenutPct).toBeCloseTo(
      (30_000 / small.heffingsvrijVermogen) * 100,
      9,
    )
    expect(standing.vrijstellingBenutPct).toBeLessThan(100)
    expect(standing.taxFreedomDays).toBe(0)
  })

  it('degeneraties: leeg vermogen en dag-uitgaven ≤ 0 leveren nullen, geen NaN', () => {
    const empty = calculateBox3({ assets: [], debts: [], hasPartner: false, dailyExpenses: 0, year: 2026 })
    const standing = buildCurrentStanding(empty, 0)
    expect(standing.tax).toBe(0)
    expect(standing.taxFreedomDays).toBe(0)
    expect(standing.effectieveDrukPct).toBe(0)
    expect(standing.vrijstellingBenutPct).toBe(0)
    expect(Number.isNaN(standing.effectieveDrukPct)).toBe(false)
  })

  it('partner-stand toont de dubbele vrijstelling, geen per-partner-splitsing (ADR 0036)', () => {
    const standing = buildCurrentStanding(householdInput('box3-minimaal').current, 100)
    expect(standing.hasPartner).toBe(true)
    expect(standing.heffingsvrijVermogen).toBe(118_714) // 2026, partners
    // Het contract kent geen per-partner-velden — alleen geaggregeerde totalen.
    expect(Object.keys(standing).sort()).toEqual([
      'effectieveDrukPct',
      'hasPartner',
      'heffingsvrijVermogen',
      'tax',
      'taxFreedomDays',
      'totaalBeleggingen',
      'totaalBox3Schulden',
      'totaalSpaargeld',
      'vrijstellingBenutPct',
    ])
  })
})

// ── Leidende kans (pickTopChoice) ────────────────────────────────

function box3Section(
  goalId: 'box3-minimaal' | 'box3-geen-rendementsverlies',
  baseline: OptimizerStrategy,
  strategies: OptimizerStrategy[],
  shiftCurve: ShiftCurvePoint[] | null = null,
): Extract<GoalSection, { kind: 'box3' }> {
  const ranked = rankStrategies(strategies, goalId)
  return {
    kind: 'box3',
    goalId,
    goal: GOAL_BY_ID[goalId],
    baseline,
    ranked,
    shiftCurve,
    best: pickBest(ranked, goalId),
  }
}

/**
 * De jaarruimte-sectie zoals de page 'm vult: geen rendementsverlies, dus
 * netEffect = besparing en netFreedomDays = freedomDays. `opts.netEffect`
 * bestaat alleen om te BEWIJZEN dat pickTopChoice de sectie-velden consumeert
 * i.p.v. ze zelf af te leiden.
 */
function jaarruimteSection(
  besparing: number,
  opts?: { hasData?: boolean; netEffect?: number },
): Extract<GoalSection, { kind: 'jaarruimte' }> {
  const dailyExpenses = 100
  const netEffect = opts?.netEffect ?? besparing
  return {
    kind: 'jaarruimte',
    goalId: 'jaarruimte-maximaal',
    goal: GOAL_BY_ID['jaarruimte-maximaal'],
    grossYearlyIncome: 70_000,
    pensionFactorA: 1_500,
    dailyExpenses,
    hasData: opts?.hasData ?? true,
    besparing,
    freedomDays: Math.round(besparing / dailyExpenses),
    netEffect,
    netFreedomDays: netEffect > 0 ? Math.round(netEffect / dailyExpenses) : 0,
  }
}

/**
 * Het "€ 47"-scenario uit de bugmelding: €100.000 spaargeld + €6.300
 * beleggingen. De shift bespaart ≈ €47 heffing, maar kost ≈ €359 verwacht
 * rendement per jaar — bruto een kans, netto een verlies.
 */
function tinySavingSoloInput(): Box3OptimizerInput {
  const current = calculateBox3({
    assets: [
      asset({ id: 'a1', asset_type: 'savings', current_value: 100_000 }),
      asset({ id: 'a2', asset_type: 'investment', current_value: 6_300 }),
    ],
    debts: [],
    hasPartner: false,
    dailyExpenses: 100,
    year: 2026,
  })
  return { goalId: 'box3-minimaal', year: 2026, dailyExpenses: 100, hasPartner: false, current }
}

describe('tax-optimizer — pickTopChoice (leidende kans op NETTO effect)', () => {
  it('het € 47-scenario met groot rendementsverlies wordt GEEN topkans', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!

    // Bruto oogt dit als een kans…
    expect(Math.round(shift.savings)).toBe(47)
    expect(shift.freedomDays).toBe(0) // €47 / €100 per dag, afgerond
    // …maar het verwachte rendementsverlies is een veelvoud daarvan.
    expect(shift.returnCostEur).toBe(Math.round(6_300 * RETURN_GAP))
    expect(shift.returnCostEur).toBe(359)
    expect(shift.netEffect).toBeLessThan(0)

    // Bruto-ranking wijst 'm nog steeds aan als beste voor "grootste besparing"…
    const section = box3Section('box3-minimaal', baseline, strategies)
    expect(section.best?.kind).toBe('samenstelling-shift')
    // …maar de leidende kans valt weg: er is niets dat per saldo iets oplevert.
    expect(pickTopChoice([section])).toBeNull()
  })

  it('kiest jaarruimte boven een netto-negatieve shift', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies } = generateBox3Strategies(input)
    const sections = [box3Section('box3-minimaal', baseline, strategies), jaarruimteSection(1_200)]

    const top = pickTopChoice(sections)
    expect(top).not.toBeNull()
    expect(top!.kind).toBe('jaarruimte')
    expect(top!.goalId).toBe('jaarruimte-maximaal')
    expect(top!.savings).toBe(1_200)
    expect(top!.netEffect).toBe(1_200) // geen rendementsverlies op de inleg
    expect(top!.freedomDays).toBe(12)
    expect(top!.opportunityId).toBe('jaarruimte-maximaal')
    expect(top!.caveat).toContain('vast tot je pensioen')
  })

  it('kiest de netto-positieve partnerverdeling, niet de bruto-grootste shift', () => {
    // Household: shift bespaart bruto MEER (≈ €1.540) dan de partnerverdeling
    // (€800), maar kost €8.550 rendement → netto fors negatief.
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')!
    expect(shift.savings).toBeGreaterThan(partner.savings)
    expect(shift.netEffect).toBeLessThan(0)

    const section = box3Section('box3-minimaal', baseline, strategies)
    expect(section.best?.kind).toBe('samenstelling-shift') // bruto-winnaar, ongewijzigd

    const top = pickTopChoice([section])
    expect(top).not.toBeNull()
    expect(top!.kind).toBe('box3')
    expect(top!.title).toBe(partner.title)
    expect(top!.netEffect).toBe(800)
    expect(top!.savings).toBe(800)
    expect(top!.opportunityId).toBe(partner.id)
  })

  it('rankt op netto vrijheidsdagen, met netEffect als tiebreak', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)

    // Jaarruimte €900 (9 netto vrijheidsdagen) verslaat partner €800 (8 dagen).
    expect(pickTopChoice([section, jaarruimteSection(900)])!.kind).toBe('jaarruimte')
    // Jaarruimte €700 (7 dagen) verliest van partner €800 (8 dagen).
    expect(pickTopChoice([section, jaarruimteSection(700)])!.kind).toBe('box3')
    // Gelijke netto vrijheidsdagen (8) → hoogste netEffect wint (€840 > €800).
    expect(pickTopChoice([section, jaarruimteSection(840)])!.kind).toBe('jaarruimte')
  })

  it('slaat de jaarruimte-kandidaat over zonder data of zonder besparing', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)
    expect(pickTopChoice([section, jaarruimteSection(1_200, { hasData: false })])).toBeNull()
    expect(pickTopChoice([section, jaarruimteSection(0)])).toBeNull()
  })

  it('geen secties / geen scenario’s → null (neutrale variant)', () => {
    expect(pickTopChoice([])).toBeNull()
    const empty = calculateBox3({ assets: [], debts: [], hasPartner: false, dailyExpenses: 100, year: 2026 })
    const { baseline, strategies } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: empty,
    })
    expect(pickTopChoice([box3Section('box3-minimaal', baseline, strategies)])).toBeNull()
  })

  it('is puur en deterministisch (zelfde secties → zelfde uitkomst)', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const sections = [box3Section('box3-minimaal', baseline, strategies), jaarruimteSection(900)]
    const snapshot = JSON.parse(JSON.stringify(sections))
    expect(pickTopChoice(sections)).toEqual(pickTopChoice(sections))
    // Geen mutatie van de invoer (de sort werkt op een eigen kandidatenlijst).
    expect(JSON.parse(JSON.stringify(sections))).toEqual(snapshot)
  })
})

// ── Shift-curve (fase 2b) ────────────────────────────────────────
//
// TOLERANTIEKEUZE. Waar de curve tegen het shift-SCENARIO wordt gelegd is de eis
// EXACT (`toBe`, nul tolerantie): beide paden roepen dezelfde engine met
// letterlijk dezelfde argumenten aan, dus elk verschil is een divergerend
// codepad, geen afrondingsruis. Waar de curve tegen een algebraïsche
// herleiding wordt gelegd (marginale stap) is de tolerantie ABSOLUUT en
// sub-cent (toBeCloseTo(…, 6) ≈ € 0,0000005): de vergeleken grootheden zijn
// euro-bedragen per stap van orde € 10–170, waar float-herordening ~1e-10 ruis
// geeft. Een RELATIEVE tolerantie zou hier juist blind zijn voor de foutklasse
// die ertoe doet — een stap met besparing ≈ 0 (volledig benutte vrijstelling
// ontbreekt) haalt elke procentuele marge.

describe('tax-optimizer — shift-curve', () => {
  it('eindpunt is EXACT het samenstelling-shift-scenario', () => {
    const input = soloOptimizerInput()
    const { strategies, shiftCurve } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!

    expect(shiftCurve).not.toBeNull()
    const end = shiftCurve![shiftCurve!.length - 1]
    expect(end.shifted).toBe(input.current.totaalBeleggingen)
    expect(end.tax).toBe(shift.optimizedTax)
    expect(end.savings).toBe(shift.savings)
    expect(end.returnCostEur).toBe(shift.returnCostEur)
    expect(end.netEffect).toBe(shift.netEffect)
  })

  it('startpunt is de huidige situatie: niets verschoven, niets bespaard', () => {
    const input = soloOptimizerInput()
    const { shiftCurve } = generateBox3Strategies(input)
    const start = shiftCurve![0]
    expect(start.shifted).toBe(0)
    expect(start.tax).toBe(input.current.tax)
    expect(start.savings).toBe(0)
    expect(start.returnCostEur).toBe(0)
    expect(start.netEffect).toBe(0)
  })

  it('vaste stapindeling: 21 punten van 0% t/m 100% van de beleggingen', () => {
    const input = soloOptimizerInput()
    const { shiftCurve } = generateBox3Strategies(input)
    expect(SHIFT_CURVE_STEPS).toBe(20)
    expect(shiftCurve).toHaveLength(SHIFT_CURVE_STEPS + 1)
    // Relatieve stappen van 5% — het bereik spant altijd exact de eigen beleggingen.
    shiftCurve!.forEach((p, i) => {
      expect(p.shifted).toBeCloseTo((input.current.totaalBeleggingen * i) / SHIFT_CURVE_STEPS, 6)
    })
  })

  it('`shifted` loopt strikt op en `savings` blijft niet-negatief en niet-dalend', () => {
    const { shiftCurve } = generateBox3Strategies(soloOptimizerInput())
    for (let i = 1; i < shiftCurve!.length; i++) {
      expect(shiftCurve![i].shifted).toBeGreaterThan(shiftCurve![i - 1].shifted)
      expect(shiftCurve![i].savings).toBeGreaterThanOrEqual(shiftCurve![i - 1].savings)
      // Meer verschuiven = meer misgelopen rendement, dus een dalend netto effect.
      expect(shiftCurve![i].netEffect).toBeLessThanOrEqual(shiftCurve![i - 1].netEffect)
    }
    for (const p of shiftCurve!) {
      expect(p.savings).toBeGreaterThanOrEqual(0)
      expect(p.returnCostEur).toBeGreaterThanOrEqual(0)
      expect(p.netEffect).toBeCloseTo(p.savings - p.returnCostEur, 9)
    }
  })

  it('elk punt = savings − returnCostEur, met returnCostEur in hele euro’s', () => {
    const { shiftCurve } = generateBox3Strategies(soloOptimizerInput())
    const gap = DEFAULT_RETURN - EXPECTED_SAVINGS_RETURN
    for (const p of shiftCurve!) {
      expect(p.returnCostEur).toBe(Math.round(p.shifted * gap))
      expect(Number.isInteger(p.returnCostEur)).toBe(true)
    }
  })

  it('curve-consistentie-invariant: elk punt sluit op zowel het startpunt als zichzelf', () => {
    // netEffect === savings − returnCostEur (het saldo van dit punt) ÉN
    // savings === curve[0].tax − punt.tax (de besparing is per definitie de
    // heffing van het startpunt minus de heffing van dit punt) — voor ELK punt,
    // niet alleen start/eind. Absolute, sub-cent tolerantie (zelfde som, andere
    // float-volgorde) — zie de tolerantie-toelichting boven dit describe-blok.
    const { shiftCurve } = generateBox3Strategies(soloOptimizerInput())
    const start = shiftCurve![0]
    for (const p of shiftCurve!) {
      expect(p.netEffect).toBeCloseTo(p.savings - p.returnCostEur, 6)
      expect(p.savings).toBeCloseTo(start.tax - p.tax, 6)
    }
  })

  it('geen shift-scenario → geen curve (null)', () => {
    const noInvest = calculateBox3({
      assets: [asset({ id: 'a1', asset_type: 'savings', current_value: 200_000 })],
      debts: [],
      hasPartner: false,
      dailyExpenses: 100,
      year: 2026,
    })
    const { strategies, shiftCurve } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: noInvest,
    })
    expect(strategies.find((s) => s.kind === 'samenstelling-shift')).toBeUndefined()
    expect(shiftCurve).toBeNull()
  })

  it('is deterministisch (zelfde invoer → identieke reeks)', () => {
    const a = generateBox3Strategies(soloOptimizerInput()).shiftCurve
    const b = generateBox3Strategies(soloOptimizerInput()).shiftCurve
    expect(a).toEqual(b)
  })
})

// ── Het vrijstellings-effect op de curve ─────────────────────────
//
// BEVINDING (bewust vastgelegd, wijkt af van de oorspronkelijke verwachting van
// een KNIK in de curve): een samenstelling-shift laat het TOTAAL aan bezittingen
// ongemoeid, dus `rendementsgrondslag` en daarmee `grondslagSparen =
// max(0, rendementsgrondslag − heffingsvrijVermogen)` veranderen NIET over de
// curve. In calculateBox3 is de heffing dan
//
//   tax = grondslagSparen × (voordeelUitSparen / rendementsgrondslag) × tarief
//
// waarin alleen `voordeelUitSparen` lineair meebeweegt met het verschoven bedrag.
// De curve is dus AFFIEN en de marginale besparing per stap CONSTANT — een knik
// op deze as bestaat in deze motor niet, bij geen enkele fixture.
//
// De vrijstelling is wél zichtbaar, als SCHAALFACTOR: de marginale besparing is
// (grondslagSparen / rendementsgrondslag) × het bedrag dat je zonder vrijstelling
// zou besparen. Zit je net boven de vrijstelling, dan levert verschuiven maar een
// fractie op van wat het forfaitverschil suggereert. Dat is de eigenschap die we
// hier vergrendelen — zodat niemand later een niet-bestaande knik "terugbouwt".

/** Solo 2026: € 10.000 spaargeld + € 55.000 beleggingen — net boven de vrijstelling. */
function nearExemptionSoloInput(): Box3OptimizerInput {
  const current = calculateBox3({
    assets: [
      asset({ id: 'a1', asset_type: 'savings', current_value: 10_000 }),
      asset({ id: 'a2', asset_type: 'investment', current_value: 55_000 }),
    ],
    debts: [],
    hasPartner: false,
    dailyExpenses: 100,
    year: 2026,
  })
  return { goalId: 'box3-minimaal', year: 2026, dailyExpenses: 100, hasPartner: false, current }
}

/** Solo 2026: € 1 mln + € 1 mln — de vrijstelling is verwaarloosbaar klein. */
function farAboveExemptionSoloInput(): Box3OptimizerInput {
  const current = calculateBox3({
    assets: [
      asset({ id: 'a1', asset_type: 'savings', current_value: 1_000_000 }),
      asset({ id: 'a2', asset_type: 'investment', current_value: 1_000_000 }),
    ],
    debts: [],
    hasPartner: false,
    dailyExpenses: 100,
    year: 2026,
  })
  return { goalId: 'box3-minimaal', year: 2026, dailyExpenses: 100, hasPartner: false, current }
}

/** Marginale besparing per curve-stap. */
function marginalSteps(curve: ShiftCurvePoint[]): number[] {
  return curve.slice(1).map((p, i) => p.savings - curve[i].savings)
}

describe('tax-optimizer — vrijstellings-effect op de shift-curve', () => {
  it('de marginale besparing per stap is constant (de curve is affien)', () => {
    const { shiftCurve } = generateBox3Strategies(nearExemptionSoloInput())
    const steps = marginalSteps(shiftCurve!)
    for (const s of steps) {
      // Absolute, sub-cent tolerantie: zelfde som, andere float-volgorde.
      expect(s).toBeCloseTo(steps[0], 6)
    }
  })

  it('de vrijstelling schaalt de besparing: net boven de vrijstelling levert verschuiven maar een fractie op', () => {
    const input = nearExemptionSoloInput()
    const { shiftCurve } = generateBox3Strategies(input)
    const c = input.current
    const params = BOX3_PARAMS[2026]
    const stepBedrag = c.totaalBeleggingen / SHIFT_CURVE_STEPS

    // Zonder vrijstellings-effect zou elke stap dit opleveren…
    const zonderVrijstellingsEffect =
      stepBedrag * (params.forfaitBeleggingen - params.forfaitSpaargeld) * params.tarief
    // …maar de heffing schaalt met grondslagSparen / rendementsgrondslag.
    const benuttingsFactor = c.grondslagSparen / c.rendementsgrondslag
    expect(benuttingsFactor).toBeLessThan(0.15) // vrijstelling nog nauwelijks "op"

    const steps = marginalSteps(shiftCurve!)
    expect(steps[0]).toBeCloseTo(zonderVrijstellingsEffect * benuttingsFactor, 6)
    // Concreet: een fractie van het bedrag dat het forfaitverschil suggereert.
    expect(steps[0]).toBeLessThan(zonderVrijstellingsEffect * 0.15)
  })

  it('ver boven de vrijstelling nadert de besparing per stap het volle forfaitverschil', () => {
    const input = farAboveExemptionSoloInput()
    const { shiftCurve } = generateBox3Strategies(input)
    const c = input.current
    const params = BOX3_PARAMS[2026]
    const stepBedrag = c.totaalBeleggingen / SHIFT_CURVE_STEPS
    const zonderVrijstellingsEffect =
      stepBedrag * (params.forfaitBeleggingen - params.forfaitSpaargeld) * params.tarief
    const benuttingsFactor = c.grondslagSparen / c.rendementsgrondslag
    expect(benuttingsFactor).toBeGreaterThan(0.97)

    const steps = marginalSteps(shiftCurve!)
    expect(steps[0]).toBeCloseTo(zonderVrijstellingsEffect * benuttingsFactor, 6)
    expect(steps[0]).toBeGreaterThan(zonderVrijstellingsEffect * 0.97)
  })

  it('de curve blijft ook bij de kleine fixture op het scenario aansluiten', () => {
    const { strategies, shiftCurve } = generateBox3Strategies(nearExemptionSoloInput())
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const end = shiftCurve![shiftCurve!.length - 1]
    expect(end.tax).toBe(shift.optimizedTax)
    expect(end.savings).toBe(shift.savings)
  })
})

// ── Verloop over de belastingjaren (fase 2c) ─────────────────────

describe('tax-optimizer — trajectory (2025 · 2026 · indicatie 2028)', () => {
  it('baseline: 2025 en 2026 komen uit de engine per jaar en verschillen', () => {
    const input = soloOptimizerInput()
    const { baseline } = generateBox3Strategies(input)
    const t = baseline.trajectory!
    expect(t).not.toBeNull()

    const jaar2025 = calculateBox3(realSoloInput(2025))
    const jaar2026 = calculateBox3(realSoloInput(2026))
    expect(t.tax2025).toBe(jaar2025.tax)
    expect(t.tax2026).toBe(jaar2026.tax)
    // Gewijzigde jaarparameters (forfait sparen 1,37%→1,28%, beleggen
    // 5,88%→6,00%, vrijstelling €57.684→€59.357) → een ander bedrag.
    expect(t.tax2025).not.toBe(t.tax2026)
    // Het actieve jaar sluit aan op de huidige heffing.
    expect(t.tax2026).toBe(input.current.tax)
  })

  it('2028-indicatie = gewogen rendement × tarief, exact via de tegenbewijs-tak', () => {
    const input = soloOptimizerInput()
    const { baseline } = generateBox3Strategies(input)
    const c = input.current

    const gewogen =
      (c.totaalSpaargeld * EXPECTED_SAVINGS_RETURN + c.totaalBeleggingen * DEFAULT_RETURN) /
      (c.totaalSpaargeld + c.totaalBeleggingen)

    // EXACT tegen de canonieke tak — zelfde functie, zelfde invoer.
    const viaTegenbewijs = compareForfaitairVsWerkelijk({
      box3Result: c,
      werkelijkRendementPct: gewogen * 100,
    }).werkelijkeHeffing
    expect(baseline.trajectory!.tax2028Indicatie).toBe(viaTegenbewijs)

    // …en algebraïsch: (spaargeld × 1,3% + beleggingen × 7,0%) × tarief.
    // Absolute tolerantie (1e-6 €) omdat dezelfde producten in een andere
    // volgorde worden opgeteld; een relatieve marge zou op dit bedrag (± €2.000)
    // een fout van tientallen centen door laten.
    const closedForm =
      (c.totaalSpaargeld * EXPECTED_SAVINGS_RETURN + c.totaalBeleggingen * DEFAULT_RETURN) *
      c.params.tarief
    expect(baseline.trajectory!.tax2028Indicatie).toBeCloseTo(closedForm, 6)
    expect(baseline.trajectory!.tax2028Indicatie).toBeCloseTo(2_138.4, 6) // 5.940 × 36%
  })

  it('shift-scenario: het verloop rekent op de UITKOMST-samenstelling (alles op spaargeld)', () => {
    const input = soloOptimizerInput()
    const { strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const t = shift.trajectory!
    const c = input.current
    const alles = c.totaalSpaargeld + c.totaalBeleggingen

    // 2026 van het verloop == de doorgerekende uitkomst van het scenario zelf.
    expect(t.tax2026).toBe(shift.optimizedTax)
    // 2025 op dezelfde (verschoven) samenstelling.
    expect(t.tax2025).toBe(
      calculateBox3(synthBox3Input(alles, 0, c.totaalBox3Schulden, false, 0, 2025)).tax,
    )
    // 2028-indicatie: alles staat op spaargeld → gewogen rendement = spaaraanname.
    expect(t.tax2028Indicatie).toBeCloseTo(alles * EXPECTED_SAVINGS_RETURN * c.params.tarief, 6)
    expect(t.tax2028Indicatie!).toBeLessThan(baselineTax2028(input))
  })

  it('partnerverdeling: geen verloop (null) — alleen het actieve jaar is doorgerekend', () => {
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')!
    expect(partner.trajectory).toBeNull()
    expect(partner.detail.some((d) => d.includes('verloop over andere jaren'))).toBe(true)
  })

  it('leeg vermogen → geen 2028-indicatie (geen deling door nul)', () => {
    const empty = calculateBox3({ assets: [], debts: [], hasPartner: false, dailyExpenses: 100, year: 2026 })
    const { baseline } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2026,
      dailyExpenses: 100,
      hasPartner: false,
      current: empty,
    })
    expect(baseline.trajectory!.tax2028Indicatie).toBeNull()
    expect(baseline.trajectory!.tax2026).toBe(0)
    expect(baseline.trajectory!.tax2025).toBe(0)
  })

  it('legt verloop én 2028-aanname uit in de detail-regels (uitlegbaarheid)', () => {
    const { baseline } = generateBox3Strategies(soloOptimizerInput())
    expect(baseline.detail.some((d) => d.startsWith('Zelfde samenstelling:'))).toBe(true)
    expect(baseline.detail.some((d) => d.startsWith('Indicatie 2028'))).toBe(true)
    const aanname = baseline.detail.find((d) => d.startsWith('Aanname 2028'))
    expect(aanname).toBeDefined()
    expect(aanname).toContain('1,3%')
    expect(aanname).toContain('7,0%')
    expect(aanname).toContain('zonder aftrek van werkelijke schuldrente')
    // Het dóminante conservatisme moet gebruiker-zichtbaar zijn: de
    // tegenbewijs-motor kent geen heffingsvrij vermogen, waardoor de indicatie
    // juist bij kleine vermogens fors te hoog kan uitvallen (review H1).
    expect(aanname).toContain('zonder heffingsvrij vermogen')
    expect(aanname).toContain('eerder te hoog dan te laag')
  })

  it('het verloop staat los van het geselecteerde jaar (2026 blijft 2026)', () => {
    // Zelfde samenstelling, maar de gebruiker kijkt naar belastingjaar 2025.
    const current2025 = calculateBox3(realSoloInput(2025))
    const { baseline } = generateBox3Strategies({
      goalId: 'box3-minimaal',
      year: 2025,
      dailyExpenses: 100,
      hasPartner: false,
      current: current2025,
    })
    const t = baseline.trajectory!
    expect(t.tax2025).toBe(current2025.tax)
    expect(t.tax2026).toBe(calculateBox3(realSoloInput(2026)).tax)
    expect(t.tax2026).not.toBe(t.tax2025)
  })
})

/** De 2028-indicatie van de baseline — hulpje voor de vergelijking hierboven. */
function baselineTax2028(input: Box3OptimizerInput): number {
  return generateBox3Strategies(input).baseline.trajectory!.tax2028Indicatie!
}

// ── Jaarruimte-sectievelden (fase 2e) ────────────────────────────

describe('tax-optimizer — jaarruimte-sectievelden', () => {
  it('pickTopChoice CONSUMEERT netEffect/netFreedomDays uit de sectie', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)

    // Sectie met een netEffect dat BEWUST afwijkt van de bruto besparing: leidt
    // pickTopChoice het netto effect zelf af, dan zou hier 1.200 uitkomen.
    const top = pickTopChoice([section, jaarruimteSection(1_200, { netEffect: 300 })])!
    expect(top.kind).toBe('jaarruimte')
    expect(top.savings).toBe(1_200) // bruto blijft bruto
    expect(top.freedomDays).toBe(12) // bruto vrijheidsdagen
    expect(top.netEffect).toBe(300) // uit de sectie, niet afgeleid
  })

  it('rankt op de netto sectie-velden, niet op de bruto besparing', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)
    // Bruto € 5.000 oogt groter dan de partnerverdeling (€ 800), maar netto
    // € 100 (1 vrijheidsdag) verliest.
    const top = pickTopChoice([section, jaarruimteSection(5_000, { netEffect: 100 })])!
    expect(top.kind).toBe('box3')
    expect(top.netEffect).toBe(800)
  })

  it('netto ≤ 0 → de jaarruimte-kans valt af, ook bij een positieve bruto besparing', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)
    expect(pickTopChoice([section, jaarruimteSection(1_200, { netEffect: 0 })])).toBeNull()
  })

  it('zonder rendementsverlies vallen netto en bruto samen (de normale vulling)', () => {
    const section = jaarruimteSection(1_200)
    expect(section.netEffect).toBe(section.besparing)
    expect(section.netFreedomDays).toBe(section.freedomDays)
    const top = pickTopChoice([section])!
    expect(top.netEffect).toBe(1_200)
    expect(top.savings).toBe(1_200)
  })
})

// ── Regressie: bestaand gedrag ongewijzigd ───────────────────────
//
// Vergrendelt dat de netto-effect-uitbreiding puur ADDITIEF is: dezelfde
// besparingen, dezelfde ranking per doel, dezelfde pickBest-uitkomsten.

describe('tax-optimizer — regressie op bestaand gedrag', () => {
  it('savings en ranking van de twee Box 3-doelen zijn ongewijzigd', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const partner = strategies.find((s) => s.kind === 'partnerverdeling')!

    // Bruto besparingen: onaangeroerd door de netto-laag.
    expect(baseline.savings).toBe(0)
    expect(partner.savings).toBe(800)
    expect(partner.currentTax).toBe(5_800)
    expect(partner.optimizedTax).toBe(5_000)
    expect(shift.savings).toBeCloseTo(shift.currentTax - shift.optimizedTax, 9)

    // Doel 1 — grootste besparing: bruto-ranking, shift vooraan.
    const minimaal = rankStrategies(strategies, 'box3-minimaal')
    expect(minimaal.map((s) => s.kind)).toEqual(['samenstelling-shift', 'partnerverdeling'])
    expect(pickBest(minimaal, 'box3-minimaal')!.kind).toBe('samenstelling-shift')

    // Doel 2 — geen rendementsverlies: kosteloze hefboom vooraan.
    const kosteloos = rankStrategies(strategies, 'box3-geen-rendementsverlies')
    expect(kosteloos.map((s) => s.kind)).toEqual(['partnerverdeling', 'samenstelling-shift'])
    expect(pickBest(kosteloos, 'box3-geen-rendementsverlies')!.kind).toBe('partnerverdeling')
  })

  it('pickBest blijft BRUTO ranken, ook wanneer de netto-winnaar een andere is', () => {
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    const ranked = rankStrategies(strategies, 'box3-minimaal')
    const best = pickBest(ranked, 'box3-minimaal')!
    // Het doel heet "zo min mogelijk Box 3-belasting" → grootste bruto besparing.
    expect(best.savings).toBe(Math.max(...ranked.map((s) => s.savings)))
    // …terwijl zijn netto effect negatief is (dat is precies het onderscheid dat
    // pickTopChoice maakt).
    expect(best.netEffect).toBeLessThan(0)
  })

  it('hasReturnCost blijft de kwalitatieve vlag naast het bedrag', () => {
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    for (const s of strategies) {
      expect(s.hasReturnCost).toBe(s.returnCostEur > 0)
    }
  })

  // Fase 2 is ADDITIEF: curve + verloop komen erbij, de Fase 1-getallen niet aan.
  it('fase 2 laat de Fase 1-bedragen van de solo-fixture ongemoeid', () => {
    const input = soloOptimizerInput()
    const { baseline, strategies } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!

    expect(baseline.savings).toBe(0)
    expect(baseline.netEffect).toBe(0)
    expect(shift.returnCostEur).toBe(3_990) // € 70.000 × 5,7%
    expect(shift.netEffect).toBeCloseTo(shift.savings - 3_990, 9)
    expect(shift.netFreedomDays).toBe(0)
    expect(shift.freedomDays).toBe(Math.round(shift.savings / 100))
    // Het verloop verandert de uitkomst-heffing van het scenario niet.
    expect(shift.optimizedTax).toBe(shift.trajectory!.tax2026)
  })

  it('het € 47-scenario blijft geen topkans, mét curve op de sectie', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    expect(Math.round(shift.savings)).toBe(47)
    expect(shift.returnCostEur).toBe(359)

    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)
    expect(section.shiftCurve).not.toBeNull()
    expect(section.best?.kind).toBe('samenstelling-shift') // bruto-winnaar, ongewijzigd
    expect(pickTopChoice([section])).toBeNull()
  })

  it('buildBox3Optimizer draagt de curve mee en blijft deterministisch', () => {
    const input = householdInput('box3-minimaal')
    const a = buildBox3Optimizer(input)
    const b = buildBox3Optimizer(input)
    expect(a).toEqual(b)
    expect(a.shiftCurve).toHaveLength(SHIFT_CURVE_STEPS + 1)
    expect(a.shiftCurve![SHIFT_CURVE_STEPS].tax).toBe(
      a.strategies.find((s) => s.kind === 'samenstelling-shift')!.optimizedTax,
    )
  })
})

// ── Verwacht rendement = profiel-instelling (Fase 2 plak C) ──────
//
// DE BUG. Het misgelopen rendement werd berekend met de HARDCODED constante
// DEFAULT_RETURN (7%), terwijl `profiles.expected_return` al bestaat en via
// resolveFireParams de hele FIRE-/horizon-projectie voedt. Een gebruiker die 5%
// heeft ingesteld zag zijn Toekomst-pagina met 5% rekenen, terwijl de optimizer
// beweerde dat verschuiven hem 7% rendement kost. Omdat `returnCostEur` het
// NETTO effect bepaalt, kantelde die drift de rangschikking en de "grootste
// kans" — dat is wat het `rangschikking kantelt`-blok hieronder zichtbaar maakt.
//
// TOLERANTIEKEUZE. Waar twee engine-paden met dezelfde argumenten worden
// vergeleken (regressie-terugval, curve-eindpunt ≡ scenario) is de eis EXACT
// (`toBe`/`toEqual`, nul tolerantie): elk verschil is een divergerend codepad,
// geen afrondingsruis. Waar een engine-uitkomst tegen een algebraïsche
// herleiding wordt gelegd (returnCostEur, de 2028-indicatie) is de tolerantie
// ABSOLUUT en sub-cent (toBeCloseTo(…, 6)): dezelfde producten in een andere
// optelvolgorde geven ~1e-10 float-ruis. Een RELATIEVE marge is hier juist
// verkeerd — de rand die ertoe doet is `gat = 0` (bedragen exact 0), waar elke
// procentuele marge blind voor is.

/** Een bewust afwijkende profiel-instelling: 4,0% i.p.v. de standaard 7,0%. */
const EIGEN_RENDEMENT = 0.04

describe('tax-optimizer — verwacht rendement komt uit het profiel', () => {
  it('REGRESSIE: `expectedReturn` weglaten is byte-identiek aan expliciet DEFAULT_RETURN', () => {
    const input = householdInput('box3-minimaal')
    const zonder = generateBox3Strategies(input)
    const metDefault = generateBox3Strategies({ ...input, expectedReturn: DEFAULT_RETURN })
    // Alles: baseline (incl. 2028-indicatie), scenario's (incl. detail/caveat-
    // teksten) én de volledige curve. Geen enkele bestaande aanroeper verschuift.
    expect(zonder).toEqual(metDefault)
  })

  it('returnCostEur schaalt mee met de ingestelde waarde (gat = rendement − spaarrente)', () => {
    const base = soloOptimizerInput()
    expect(base.current.totaalBeleggingen).toBe(70_000)

    const eigen = generateBox3Strategies({ ...base, expectedReturn: EIGEN_RENDEMENT })
    const shift = eigen.strategies.find((s) => s.kind === 'samenstelling-shift')!

    // 70.000 × (4,0% − 1,3%) = 70.000 × 2,7% = 1.890 — niet de 3.990 van 7%.
    expect(shift.returnCostEur).toBe(Math.round(70_000 * (EIGEN_RENDEMENT - EXPECTED_SAVINGS_RETURN)))
    expect(shift.returnCostEur).toBe(1_890)
    expect(shift.returnCostEur).not.toBe(3_990)

    // De FISCALE kant staat er volledig los van: dezelfde besparing, dezelfde
    // heffing — alleen de economische aanname verschoof.
    const standaard = generateBox3Strategies(base).strategies.find(
      (s) => s.kind === 'samenstelling-shift',
    )!
    expect(shift.savings).toBe(standaard.savings)
    expect(shift.optimizedTax).toBe(standaard.optimizedTax)
    // …dus is het netto effect precies het verschil in rendementskosten.
    expect(shift.netEffect - standaard.netEffect).toBeCloseTo(
      standaard.returnCostEur - shift.returnCostEur,
      6,
    )
  })

  it('de detail-bullets en de caveat tonen het GEBRUIKTE percentage, niet 7,0%', () => {
    const { strategies } = generateBox3Strategies({
      ...soloOptimizerInput(),
      expectedReturn: EIGEN_RENDEMENT,
    })
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!

    expect(shift.detail.some((d) => d.includes('4,0%') && d.includes('1,3%'))).toBe(true)
    expect(shift.detail.some((d) => d.includes('7,0%'))).toBe(false)
    expect(shift.caveat).toContain('4,0%')
    expect(shift.caveat).not.toContain('7,0%')
    // …ook in de 2028-aanname-regel van het verloop.
    const aanname = shift.detail.find((d) => d.startsWith('Aanname 2028'))
    expect(aanname).toBeDefined()
    expect(aanname).not.toContain('7,0%')
  })

  it('de 2028-indicatie beweegt mee met de ingestelde waarde', () => {
    const base = soloOptimizerInput()
    const c = base.current
    const { baseline } = generateBox3Strategies({ ...base, expectedReturn: EIGEN_RENDEMENT })

    // Gesloten vorm: (spaargeld × 1,3% + beleggingen × 4,0%) × tarief.
    const closedForm =
      (c.totaalSpaargeld * EXPECTED_SAVINGS_RETURN + c.totaalBeleggingen * EIGEN_RENDEMENT) *
      c.params.tarief
    expect(baseline.trajectory!.tax2028Indicatie).toBeCloseTo(closedForm, 6)

    // …en exact via de canonieke tegenbewijs-tak (zelfde functie, zelfde invoer).
    const gewogen =
      (c.totaalSpaargeld * EXPECTED_SAVINGS_RETURN + c.totaalBeleggingen * EIGEN_RENDEMENT) /
      (c.totaalSpaargeld + c.totaalBeleggingen)
    expect(baseline.trajectory!.tax2028Indicatie).toBe(
      compareForfaitairVsWerkelijk({ box3Result: c, werkelijkRendementPct: gewogen * 100 })
        .werkelijkeHeffing,
    )

    // Lager verwacht rendement → lagere heffing over werkelijk rendement.
    const standaard = generateBox3Strategies(base).baseline.trajectory!.tax2028Indicatie!
    expect(baseline.trajectory!.tax2028Indicatie!).toBeLessThan(standaard)

    // De FISCALE jaren blijven onaangeroerd — die kennen geen rendementsaanname.
    expect(baseline.trajectory!.tax2025).toBe(
      generateBox3Strategies(base).baseline.trajectory!.tax2025,
    )
    expect(baseline.trajectory!.tax2026).toBe(c.tax)
  })

  it('de curve-eindpunt-identiteit blijft gelden onder een afwijkend rendement', () => {
    const { strategies, shiftCurve } = generateBox3Strategies({
      ...soloOptimizerInput(),
      expectedReturn: EIGEN_RENDEMENT,
    })
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    const end = shiftCurve![shiftCurve!.length - 1]

    // EXACT — beide paden roepen dezelfde engine met dezelfde argumenten aan.
    expect(end.returnCostEur).toBe(shift.returnCostEur)
    expect(end.netEffect).toBe(shift.netEffect)
    expect(end.tax).toBe(shift.optimizedTax)
    expect(end.savings).toBe(shift.savings)

    // Élk punt rekent met hetzelfde gat — geen enkel punt is achtergebleven op 7%.
    const gap = EIGEN_RENDEMENT - EXPECTED_SAVINGS_RETURN
    for (const p of shiftCurve!) {
      expect(p.returnCostEur).toBe(Math.round(p.shifted * gap))
    }
  })

  it('het gat klemt op 0 bij een rendement onder de spaarrente-aanname', () => {
    // Een uiterst voorzichtige gebruiker: 0,5% verwacht rendement, terwijl de
    // spaarrente-aanname op 1,3% staat. Verschuiven kost hem dan niets — géén
    // negatieve "winst" die de belastingbesparing kunstmatig opblaast.
    const { strategies, shiftCurve } = generateBox3Strategies({
      ...soloOptimizerInput(),
      expectedReturn: 0.005,
    })
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!

    expect(shift.returnCostEur).toBe(0)
    expect(shift.netEffect).toBe(shift.savings)
    expect(shift.netEffect).toBeGreaterThan(0)
    // De kwalitatieve vlag spiegelt het bedrag — ook aan deze rand.
    expect(shift.hasReturnCost).toBe(false)
    expect(shift.hasReturnCost).toBe(shift.returnCostEur > 0)
    // Geen enkel curvepunt draagt kosten, en niets wordt negatief.
    for (const p of shiftCurve!) {
      expect(p.returnCostEur).toBe(0)
      expect(p.netEffect).toBe(p.savings)
      expect(p.netEffect).toBeGreaterThanOrEqual(0)
    }
  })

  it('exact op de spaarrente-aanname is het gat 0 (grens, niet negatief)', () => {
    const { strategies } = generateBox3Strategies({
      ...soloOptimizerInput(),
      expectedReturn: EXPECTED_SAVINGS_RETURN,
    })
    const shift = strategies.find((s) => s.kind === 'samenstelling-shift')!
    expect(shift.returnCostEur).toBe(0)
    expect(shift.netEffect).toBe(shift.savings)
  })
})

// ── De bug zichtbaar: de rangschikking kantelt ───────────────────
//
// Solo-fixture ver boven de vrijstelling (€1 mln spaargeld + €1 mln
// beleggingen), waar de besparing per verschoven euro ≈ (6,00% − 1,28%) × 36%
// ≈ 1,70 procentpunt is. Bij 7,0% verwacht rendement is het gat 5,7 pp → de
// shift is netto FORS negatief en valt als kans af. Bij 2,0% is het gat 0,7 pp
// → dezelfde shift is netto POSITIEF en wordt de grootste kans. Zonder deze fix
// zag de 2%-gebruiker "geen kans" waar er wél één was.

describe('tax-optimizer — de ingestelde waarde kantelt de rangschikking', () => {
  const LAAG_RENDEMENT = 0.02

  it('bij 7,0% is de shift netto-negatief en is er GEEN topkans; bij 2,0% wint diezelfde shift', () => {
    const base = farAboveExemptionSoloInput()

    // ── Standaardaanname (7,0%) ──
    const std = generateBox3Strategies(base)
    const stdShift = std.strategies.find((s) => s.kind === 'samenstelling-shift')!
    // Meet vóór je assert: bruto is dit een kans van formaat…
    expect(stdShift.savings).toBeGreaterThan(0)
    // …maar het misgelopen rendement is een veelvoud daarvan.
    expect(stdShift.returnCostEur).toBe(
      Math.round(base.current.totaalBeleggingen * (DEFAULT_RETURN - EXPECTED_SAVINGS_RETURN)),
    )
    expect(stdShift.netEffect).toBeLessThan(0)
    expect(stdShift.netFreedomDays).toBe(0)
    const stdSection = box3Section('box3-minimaal', std.baseline, std.strategies)
    expect(pickTopChoice([stdSection])).toBeNull()

    // ── Eigen instelling (2,0%) ──
    const laag = generateBox3Strategies({ ...base, expectedReturn: LAAG_RENDEMENT })
    const laagShift = laag.strategies.find((s) => s.kind === 'samenstelling-shift')!
    expect(laagShift.returnCostEur).toBe(
      Math.round(base.current.totaalBeleggingen * (LAAG_RENDEMENT - EXPECTED_SAVINGS_RETURN)),
    )
    // Zelfde fiscale besparing, ander netto oordeel — dát is de bug.
    expect(laagShift.savings).toBe(stdShift.savings)
    expect(laagShift.netEffect).toBeGreaterThan(0)
    expect(laagShift.netFreedomDays).toBeGreaterThan(0)

    const laagSection = box3Section('box3-minimaal', laag.baseline, laag.strategies)
    const top = pickTopChoice([laagSection])
    expect(top).not.toBeNull()
    expect(top!.kind).toBe('box3')
    expect(top!.opportunityId).toBe('samenstelling-shift')
    expect(top!.netEffect).toBe(laagShift.netEffect)
  })

  it('de winnaar tussen twee kansen kan omslaan met de ingestelde waarde', () => {
    // Dezelfde grote shift, nu met een partnerverdeling van € 800 ernaast. De
    // allocatie-scalars zijn representatief meegegeven (zelfde precedent als
    // WF-BELAST-24) — puur om twee kansen naast elkaar te zetten; `current`
    // blijft het solo-resultaat, en dat is ook wat de engine leest
    // (generateBox3Strategies gebruikt `current.hasPartner`, niet input.hasPartner).
    const base: Box3OptimizerInput = {
      ...farAboveExemptionSoloInput(),
      hasPartner: true,
      optimalAllocation: { totalTax: 5_000, savingsVsEqual: 800 },
    }

    // 7,0%: de shift is netto-negatief → de kosteloze partnerverdeling wint.
    const std = generateBox3Strategies(base)
    const stdTop = pickTopChoice([box3Section('box3-minimaal', std.baseline, std.strategies)])!
    expect(stdTop.opportunityId).toBe('partnerverdeling')
    expect(stdTop.netEffect).toBe(800)

    // 2,0%: dezelfde shift is netto-positief en overtreft de € 800 ruimschoots.
    const laag = generateBox3Strategies({ ...base, expectedReturn: LAAG_RENDEMENT })
    const laagTop = pickTopChoice([box3Section('box3-minimaal', laag.baseline, laag.strategies)])!
    expect(laagTop.opportunityId).toBe('samenstelling-shift')
    expect(laagTop.netEffect).toBeGreaterThan(800)
  })
})
