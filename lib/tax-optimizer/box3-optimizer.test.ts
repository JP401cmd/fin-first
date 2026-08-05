import { describe, expect, it } from 'vitest'
import { calculateBox3, estimateBox3TaxDrag } from '@/lib/box3-data'
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
  type Box3OptimizerInput,
  type GoalSection,
  type OptimizerStrategy,
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
): Extract<GoalSection, { kind: 'box3' }> {
  const ranked = rankStrategies(strategies, goalId)
  return { kind: 'box3', goalId, goal: GOAL_BY_ID[goalId], baseline, ranked, best: pickBest(ranked, goalId) }
}

function jaarruimteSection(besparing: number, opts?: { hasData?: boolean }): GoalSection {
  const dailyExpenses = 100
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
})
