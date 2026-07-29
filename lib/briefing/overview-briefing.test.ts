import { describe, it, expect } from 'vitest'
import {
  buildOverviewBriefingInput,
  computeFreedomTotal,
  computeFreedomDelta,
  isImplausibleFreedomDelta,
  buildFreedomSparkline,
  buildFreedomHeroProps,
  buildBriefingHeadline,
  sanitizeAiHeadline,
} from './overview-briefing'

/**
 * Tests voor de pure transform die de page-loaders omzet in de engine-input
 * (incl. de finance-context). De engine-logica zelf wordt in engine.test.ts
 * gedekt; hier verifiëren we de veld-mapping zodat een hernoemd veld of een
 * geregresseerde fallback niet stil de finance-briefjes leegtrekt.
 */

type Args = Parameters<typeof buildOverviewBriefingInput>

function makeDashboard(over: Record<string, unknown> = {}): Args[0] {
  return {
    netWorthHistory: [
      { month: '2026-04', value: 100 },
      { month: '2026-05', value: 200 },
    ],
    monthlyExpenses: 3000,
    monthlyIncome: 4000,
    budgetTotals: { expense: { spent: 100, limit: 1000 } },
    openActions: 2,
    totalFreedomDaysOpen: 10,
    fireAgeFractional: 57.6,
    freedomPct: 33,
    ...over,
  } as unknown as Args[0]
}

function makeWill(over: Record<string, unknown> = {}): Args[1] {
  return {
    recommendations: [],
    goals: [{ name: 'Doel A' }],
    goalProgresses: [{ current: 1, target: 10, pct: 10, onTrack: false, eta: null }],
    ...over,
  } as unknown as Args[1]
}

function makeHorizon(over: Record<string, unknown> = {}): Args[2] {
  return {
    healthScore: null,
    healthScoreInput: { freedomPct: 42 },
    effectiveInput: { dateOfBirth: '1990-01-01' },
    events: [],
    assets: [],
    unlinkedCash: 0,
    ...over,
  } as unknown as Args[2]
}

describe('buildOverviewBriefingInput — finance-mapping', () => {
  it('zet finance-velden 1:1 door uit dashboardData', () => {
    const input = buildOverviewBriefingInput(makeDashboard(), makeWill(), makeHorizon())
    expect(input.finance?.netWorthHistory).toHaveLength(2)
    expect(input.finance?.monthlyExpenses).toBe(3000)
    expect(input.finance?.monthlyIncome).toBe(4000)
    expect(input.finance?.budgetExpense).toEqual({ spent: 100, limit: 1000 })
    expect(input.finance?.openActions).toBe(2)
    expect(input.finance?.totalFreedomDaysOpen).toBe(10)
  })

  it('rondt fireAge af uit fireAgeFractional en levert null zonder waarde', () => {
    expect(buildOverviewBriefingInput(makeDashboard(), makeWill(), makeHorizon()).finance?.fireAge).toBe(58)
    expect(
      buildOverviewBriefingInput(makeDashboard({ fireAgeFractional: null }), makeWill(), makeHorizon())
        .finance?.fireAge,
    ).toBeNull()
  })

  it('freedomPct: horizon eerst, dan dashboard, dan undefined', () => {
    // horizon aanwezig → horizon-waarde
    expect(
      buildOverviewBriefingInput(
        makeDashboard({ freedomPct: 33 }),
        makeWill(),
        makeHorizon({ healthScoreInput: { freedomPct: 42 } }),
      ).finance?.freedomPct,
    ).toBe(42)
    // geen horizon → dashboard-waarde
    expect(
      buildOverviewBriefingInput(makeDashboard({ freedomPct: 33 }), makeWill(), null).finance?.freedomPct,
    ).toBe(33)
    // beide afwezig → undefined
    expect(
      buildOverviewBriefingInput(
        makeDashboard({ freedomPct: undefined }),
        makeWill(),
        makeHorizon({ healthScoreInput: {} }),
      ).finance?.freedomPct,
    ).toBeUndefined()
  })

  it('currentAge: getal met DOB, null zonder DOB', () => {
    expect(
      typeof buildOverviewBriefingInput(
        makeDashboard(),
        makeWill(),
        makeHorizon({ effectiveInput: { dateOfBirth: '1990-01-01' } }),
      ).finance?.currentAge,
    ).toBe('number')
    expect(
      buildOverviewBriefingInput(
        makeDashboard(),
        makeWill(),
        makeHorizon({ effectiveInput: { dateOfBirth: null } }),
      ).finance?.currentAge,
    ).toBeNull()
  })

  it('liquide cash = unlinkedCash + alleen cash/savings/checking-assets', () => {
    const horizon = makeHorizon({
      unlinkedCash: 1000,
      assets: [
        { asset_type: 'cash', current_value: 500 },
        { asset_type: 'investment', current_value: 9999 }, // uitgesloten
        { asset_type: 'savings', current_value: 200 },
        { asset_type: 'checking', current_value: 300 },
      ],
    })
    expect(
      buildOverviewBriefingInput(makeDashboard(), makeWill(), horizon).finance?.liquidCash,
    ).toBe(2000)
  })

  it('mapt goalNames uit finData.goals', () => {
    const input = buildOverviewBriefingInput(
      makeDashboard(),
      makeWill({ goals: [{ name: 'X' }, { name: 'Y' }] }),
      makeHorizon(),
    )
    expect(input.goalNames).toEqual(['X', 'Y'])
  })
})

describe('vrijheidstijd-hero helpers', () => {
  it('computeFreedomTotal: €100k bij €3000/mnd ≈ 1014 vrijheidsdagen', () => {
    // Canonieke dagbasis = €3000×12/365 = €98,63/dag → €100k ≈ 1013,9 dagen
    // (de oude maand/30-basis gaf exact 1000; ~1,4% hoger nu — gelijkgetrokken
    // met calculateFreedomTime/core-metrics).
    const t = computeFreedomTotal(100000, 3000)
    expect(t.totalFreedomDays).toBeCloseTo(1013.9, 1)
    expect(t.breakdown.isInfinite).toBe(false)
  })

  it('computeFreedomTotal: zonder uitgaven = oneindig (isInfinite)', () => {
    const t = computeFreedomTotal(100000, 0)
    expect(t.breakdown.isInfinite).toBe(true)
    expect(t.totalFreedomDays).toBe(0)
  })

  it('computeFreedomTotal: tekort levert een NEGATIEF totaal (getekend)', () => {
    // Canonieke dagbasis €98,63/dag → €30k schuld ≈ 304,2 dagen.
    const t = computeFreedomTotal(-30000, 3000)
    expect(t.breakdown.isDeficit).toBe(true)
    expect(t.totalFreedomDays).toBeCloseTo(-304.2, 1)
  })

  it('computeFreedomDelta: null-basis = eerste week', () => {
    expect(computeFreedomDelta({ totalFreedomDays: 1000 }, null)).toEqual({
      deltaDays: null,
      isFirstWeek: true,
      isImplausibleDelta: false,
    })
  })

  it('computeFreedomDelta: positieve week-over-week winst', () => {
    expect(
      computeFreedomDelta({ totalFreedomDays: 1000 }, { totalFreedomDays: 940 }),
    ).toEqual({ deltaDays: 60, isFirstWeek: false, isImplausibleDelta: false })
  })
})

// ── Plausibiliteitsgrens op de week-delta (bug: "−3788 dagen minder") ─────
//
// Regressie op de gemelde bevinding: een eerste weeksnapshot die met een
// half-geïmporteerde transactiehistorie is bevroren (kunstmatig lage
// maanduitgave → torenhoog vrijheidstotaal) gaf de week erna een absurde
// negatieve delta op /overzicht. De guard onderdrukt die.
describe('vrijheidstijd-hero — plausibiliteitsgrens op de week-delta', () => {
  it('isImplausibleFreedomDelta: onder de absolute ondergrens nooit implausibel', () => {
    // 300 dagen erbij op een klein totaal: relatief enorm, maar absoluut
    // onder de 365-dagen-ondergrens → gewoon tonen.
    expect(isImplausibleFreedomDelta(300, 400)).toBe(false)
    expect(isImplausibleFreedomDelta(-364, 400)).toBe(false)
  })

  it('isImplausibleFreedomDelta: grote absolute beweging op een groot totaal blijft plausibel', () => {
    // €1,6M-portefeuille ≈ 32.000 vrijheidsdagen; een marktweek van ~5%
    // (1.500 dagen) is geen datafout maar echte volatiliteit.
    expect(isImplausibleFreedomDelta(1500, 32000)).toBe(false)
    expect(isImplausibleFreedomDelta(-1500, 32000)).toBe(false)
  })

  it('isImplausibleFreedomDelta: de gemelde −3788 dagen op ~5 jaar en 8 maanden is implausibel', () => {
    // Screenshot uit de melding: "−3788 dagen minder" naast "5 jaar en 8
    // maanden" (≈ 2.070 dagen) → verschil is bijna 2× het hele totaal.
    expect(isImplausibleFreedomDelta(-3788, 2070)).toBe(true)
  })

  it('computeFreedomDelta: onderdrukt de sprong van een opgeblazen eerste-week-basis', () => {
    // Week 1 bevroren met onvolledige transactiedata: €120k netto vermogen bij
    // een kunstmatig lage €200/mnd → ~18.250 dagen. Week 2 met de realistische
    // €3.000/mnd → ~1.217 dagen. Zonder guard: −17.033 dagen op de hoofdpagina.
    const opgeblazenBasis = computeFreedomTotal(120000, 200)
    const realistisch = computeFreedomTotal(120000, 3000)
    expect(Math.round(realistisch.totalFreedomDays - opgeblazenBasis.totalFreedomDays)).toBeLessThan(-15000)

    const delta = computeFreedomDelta(realistisch, opgeblazenBasis)
    expect(delta.deltaDays).toBeNull()
    expect(delta.isImplausibleDelta).toBe(true)
    expect(delta.isFirstWeek).toBe(false)
  })

  it('computeFreedomDelta: een normale week (spaargeld erbij) blijft ongemoeid', () => {
    const vorige = computeFreedomTotal(120000, 3000)
    const nu = computeFreedomTotal(122500, 3000) // €2.500 gespaard → ~25 dagen
    const delta = computeFreedomDelta(nu, vorige)
    expect(delta.isImplausibleDelta).toBe(false)
    expect(delta.deltaDays).toBe(25)
  })

  it('buildFreedomHeroProps: implausibele delta → geen getal, wél de vlag + totaal', () => {
    const hero = buildFreedomHeroProps(
      { totalFreedomDays: 2070, netWorth: 120000, monthlyExpenses: 1750 },
      { totalFreedomDays: 5858 }, // opgeblazen basis → −3788
      [],
    )
    expect(hero.deltaDays).toBeNull()
    expect(hero.isImplausibleDelta).toBe(true)
    expect(hero.totalLabel.length).toBeGreaterThan(0)
  })

  it('buildBriefingHeadline: valt bij een onderdrukte delta terug op de totaal-zin', () => {
    // Geen "Deze week 3788 dagen minder" meer — de kop noemt alleen het totaal.
    const headline = buildBriefingHeadline({
      deltaDays: null,
      totalLabel: '5 jaar en 8 maanden',
      isInfinite: false,
      isDeficit: false,
    })
    expect(headline).toBe('Je vermogen staat voor 5 jaar en 8 maanden aan vrijheid.')
    expect(headline).not.toMatch(/dagen minder/)
  })
})

describe('vrijheidstijd-hero helpers (vervolg)', () => {

  it('buildFreedomSparkline: vermogen → vrijheidsdagen per maand', () => {
    const series = buildFreedomSparkline(
      [
        { month: '2026-04', value: 36500 }, // €98,63/dag → 370 dagen
        { month: '2026-05', value: 73000 }, // €98,63/dag → 740 dagen
      ],
      3000,
    )
    expect(series).toHaveLength(2)
    // Canonieke dagbasis €3000×12/365 = €98,63/dag (was €100/dag bij /30).
    expect(series[0].spent).toBe(370)
    expect(series[1].spent).toBe(740)
    expect(series[0].label).toBe('apr')
  })

  it('buildFreedomSparkline: leeg zonder uitgaven', () => {
    expect(buildFreedomSparkline([{ month: '2026-05', value: 1000 }], 0)).toEqual([])
  })

  it('buildFreedomSparkline: klemt tekort-maanden op 0 (geen valse piek)', () => {
    const series = buildFreedomSparkline(
      [
        { month: '2026-04', value: -20000 }, // schuld → 0 dagen
        { month: '2026-05', value: 50000 }, // €98,63/dag → 507 dagen
      ],
      3000,
    )
    expect(series[0].spent).toBe(0)
    expect(series[1].spent).toBe(507)
  })

  it('buildFreedomHeroProps: delta + totaal-label uit meetpunt + basis', () => {
    const hero = buildFreedomHeroProps(
      { totalFreedomDays: 1000, netWorth: 100000, monthlyExpenses: 3000 },
      { totalFreedomDays: 940 },
      [],
    )
    expect(hero.deltaDays).toBe(60)
    expect(hero.isFirstWeek).toBe(false)
    expect(hero.isInfinite).toBe(false)
    expect(hero.totalLabel.length).toBeGreaterThan(0)
  })

  it('buildBriefingHeadline: positieve delta noemt dagen + totaal', () => {
    const h = buildBriefingHeadline({ deltaDays: 5, totalLabel: '2 jaar', isInfinite: false, isDeficit: false })
    expect(h).toMatch(/5 dagen vrijheid erbij/)
    expect(h).toMatch(/2 jaar/)
  })

  it('buildBriefingHeadline: negatieve delta blijft kalm', () => {
    const h = buildBriefingHeadline({ deltaDays: -3, totalLabel: '2 jaar', isInfinite: false, isDeficit: false })
    expect(h).toMatch(/3 dagen minder/)
  })

  it('buildBriefingHeadline: null bij isInfinite', () => {
    expect(buildBriefingHeadline({ deltaDays: 5, totalLabel: 'x', isInfinite: true, isDeficit: false })).toBeNull()
  })

  it('buildBriefingHeadline: null bij tekort (consistent met de hero)', () => {
    expect(
      buildBriefingHeadline({ deltaDays: 5, totalLabel: '8 maanden', isInfinite: false, isDeficit: true }),
    ).toBeNull()
  })

  it('buildBriefingHeadline: zonder delta toont het totaal', () => {
    const h = buildBriefingHeadline({ deltaDays: null, totalLabel: '8 jaar', isInfinite: false, isDeficit: false })
    expect(h).toMatch(/8 jaar/)
  })
})

describe('sanitizeAiHeadline', () => {
  it('strips omringende aanhalingstekens en witruimte', () => {
    expect(sanitizeAiHeadline('  "Mooie week voor je vrijheid"  ')).toBe(
      'Mooie week voor je vrijheid',
    )
  })

  it('vouwt regeleinden samen tot één regel', () => {
    expect(sanitizeAiHeadline('Regel een\n\nRegel twee')).toBe('Regel een Regel twee')
  })

  it('returnt null bij lege of whitespace-only output', () => {
    expect(sanitizeAiHeadline('   ')).toBeNull()
    expect(sanitizeAiHeadline(null)).toBeNull()
    expect(sanitizeAiHeadline(undefined)).toBeNull()
  })

  it('returnt null bij een te lange kop (>160 tekens)', () => {
    expect(sanitizeAiHeadline('x'.repeat(200))).toBeNull()
  })
})
