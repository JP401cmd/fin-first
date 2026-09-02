import { describe, it, expect } from 'vitest'
import {
  buildOverviewBriefingInput,
  summarizeRunway,
  runwayYearsMonths,
  runwayDurationLabel,
  runwaySentence,
  computeRunwayWeekDelta,
  hasRunwayMoved,
  isImplausibleFreedomDelta,
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

describe('runway-duiding: van kernel-uitkomst naar meetpunt', () => {
  const basis = { yearly: 36_000, method: 'essential_budgets' as const }
  const opeten = {
    strategy: 'Vermogen opeten' as const,
    expenseBasis: basis,
    startAge: 45,
    solverStatus: 'reached_now' as const,
  }

  it('kind months: de maanden en de uitputtingsleeftijd komen ONGEWIJZIGD uit de run', () => {
    const point = summarizeRunway({ ...opeten, kind: 'months', months: 100, depletionAge: 53.33, endAge: 90 })
    expect(point).toEqual({ kind: 'months', months: 100, reachesAge: 53.33 })
    // 100 maanden = 8 jaar en 4 maanden - een deling van `months`, geen eigen
    // tijdrekening.
    expect(runwayYearsMonths(point!)).toEqual({ years: 8, months: 4 })
    expect(runwayDurationLabel(point!)).toBe('8 jaar en 4 maanden')
  })

  it('reaches-end-age: de duur is een ONDERGRENS tot de eigen eindleeftijd, en dat staat er ook', () => {
    const point = summarizeRunway({ ...opeten, kind: 'reaches-end-age', endAge: 90 })
    // 90 - 45 = 45 jaar = 540 maanden.
    expect(point).toEqual({ kind: 'reaches-end-age', months: 540, reachesAge: 90 })
    expect(runwayDurationLabel(point!)).toBe('minstens 45 jaar')
  })

  it('beyond-horizon: de ondergrens loopt tot het horizonplafond, nooit "oneindig"', () => {
    const point = summarizeRunway({ ...opeten, kind: 'beyond-horizon' })
    // 100 - 45 = 55 jaar = 660 maanden.
    expect(point).toEqual({ kind: 'beyond-horizon', months: 660, reachesAge: 100 })
    expect(runwayDurationLabel(point!)).not.toMatch(/oneindig/i)
  })

  it('deficit en unavailable leveren GEEN meetpunt (geen claim)', () => {
    expect(summarizeRunway({ ...opeten, kind: 'deficit' })).toBeNull()
    expect(summarizeRunway({ kind: 'unavailable', reason: 'kern-fout' })).toBeNull()
  })

  it('D7: een intern strijdige deplete-run levert geen meetpunt - dezelfde poort voor elk oppervlak', () => {
    // Voor PR C deed alleen de kop-zin deze toets; de deelkaart en de e-mail
    // lazen een andere motor en konden dus wel een claim doen.
    const strijdig = {
      ...opeten,
      solverStatus: 'unreachable_within_horizon' as const,
      kind: 'reaches-end-age' as const,
      endAge: 90,
    }
    expect(summarizeRunway(strijdig)).toBeNull()
    expect(buildBriefingHeadline(strijdig)).toBeNull()
  })

  it('runwaySentence en buildBriefingHeadline geven dezelfde zin (een duiding-laag)', () => {
    const runway = { ...opeten, kind: 'months' as const, months: 231, depletionAge: 61.25, endAge: 90 }
    expect(buildBriefingHeadline(runway)).toBe(runwaySentence(summarizeRunway(runway)!))
  })
})

// ── Plausibiliteitsgrens op de week-delta (bug: "−3788 dagen minder") ─────
//
// Regressie op de gemelde bevinding: een eerste weeksnapshot die met een
// half-geïmporteerde transactiehistorie is bevroren (kunstmatig lage
// maanduitgave → torenhoog vrijheidstotaal) gaf de week erna een absurde
// negatieve delta op /overzicht. De guard onderdrukt die.
describe('plausibiliteitsgrens op de week-delta', () => {
  it('isImplausibleFreedomDelta: onder de absolute ondergrens nooit implausibel', () => {
    // 300 dagen erbij op een klein totaal: relatief enorm, maar absoluut
    // onder de 365-dagen-ondergrens -> gewoon tonen.
    expect(isImplausibleFreedomDelta(300, 400)).toBe(false)
    expect(isImplausibleFreedomDelta(-364, 400)).toBe(false)
  })

  it('isImplausibleFreedomDelta: grote absolute beweging op een groot totaal blijft plausibel', () => {
    // Portefeuille van 1,6 mln ~ 32.000 vrijheidsdagen; een marktweek van ~5%
    // (1.500 dagen) is geen datafout maar echte volatiliteit.
    expect(isImplausibleFreedomDelta(1500, 32000)).toBe(false)
    expect(isImplausibleFreedomDelta(-1500, 32000)).toBe(false)
  })

  it('isImplausibleFreedomDelta: de gemelde -3788 dagen op ~5 jaar en 8 maanden is implausibel', () => {
    // Screenshot uit de melding: "-3788 dagen minder" naast "5 jaar en 8
    // maanden" (~ 2.070 dagen) -> verschil is bijna 2x het hele totaal.
    expect(isImplausibleFreedomDelta(-3788, 2070)).toBe(true)
  })
})

describe('computeRunwayWeekDelta - week-over-week op de bevroren runway', () => {
  const point = (months: number) =>
    ({ kind: 'months', months, reachesAge: 40 + months / 12 }) as const

  it('geen basis = eerste meting op deze basis (ook na een oude, niet-vergelijkbare snapshot)', () => {
    expect(computeRunwayWeekDelta(point(120), null)).toEqual({
      deltaMonths: null,
      isFirstWeek: true,
      isImplausibleDelta: false,
    })
  })

  it('een normale week: het verschil in hele maanden, met teken', () => {
    expect(computeRunwayWeekDelta(point(120), { months: 118 })).toEqual({
      deltaMonths: 2,
      isFirstWeek: false,
      isImplausibleDelta: false,
    })
    expect(computeRunwayWeekDelta(point(118), { months: 120 }).deltaMonths).toBe(-2)
  })

  it('een beweging onder een hele maand levert 0 op (de runway is maandnauwkeurig)', () => {
    expect(computeRunwayWeekDelta(point(120), { months: 120 }).deltaMonths).toBe(0)
  })

  it('de plausibiliteitsguard blijft gelden - nu op maanden i.p.v. dagen', () => {
    // 100 maanden verschil op een runway van 24 maanden: >= 1 jaar absoluut EN
    // > 25% van het totaal => onderdrukt, precies zoals de "-3788 dagen"-guard.
    const gesprongen = computeRunwayWeekDelta(point(24), { months: 124 })
    expect(gesprongen.deltaMonths).toBeNull()
    expect(gesprongen.isImplausibleDelta).toBe(true)
    expect(gesprongen.isFirstWeek).toBe(false)
  })

  it('een grote absolute beweging op een grote runway blijft zichtbaar', () => {
    // 40 maanden op een runway van 600: absoluut fors, relatief < 25% => tonen.
    expect(computeRunwayWeekDelta(point(600), { months: 560 }).deltaMonths).toBe(40)
  })
})

describe('hasRunwayMoved - versheidssignaal meet dezelfde grootheid als de kop', () => {
  const p = (kind: 'months' | 'reaches-end-age' | 'beyond-horizon', months: number) =>
    ({ kind, months, reachesAge: 90 }) as const

  it('minder dan een hele maand verschil is geen beweging', () => {
    expect(hasRunwayMoved(p('months', 120), { kind: 'months', months: 120 })).toBe(false)
    expect(hasRunwayMoved(p('months', 120.4), { kind: 'months', months: 120 })).toBe(false)
  })

  it('een hele maand of meer is beweging', () => {
    expect(hasRunwayMoved(p('months', 121), { kind: 'months', months: 120 })).toBe(true)
    expect(hasRunwayMoved(p('months', 119), { kind: 'months', months: 120 })).toBe(true)
  })

  it('een soort-wissel telt altijd als beweging', () => {
    expect(hasRunwayMoved(p('reaches-end-age', 600), { kind: 'months', months: 600 })).toBe(true)
  })

  it('een verschijnende of verdwijnende claim telt als beweging; twee keer niets niet', () => {
    expect(hasRunwayMoved(null, { kind: 'months', months: 120 })).toBe(true)
    expect(hasRunwayMoved(p('months', 120), null)).toBe(true)
    expect(hasRunwayMoved(null, null)).toBe(false)
  })
})

// ── De kop-zin naast de masthead (UR2-09 → ADR 0126 PR B) ────────────
//
// De zin is sinds ADR 0126 een echte onttrekkingsprojectie: hij consumeert het
// `RunwayResult` van de LIVE "stop nu"-run van het request (computeHorizonRunway),
// niet de bevroren week-snapshot en niet meer de platte deling. Kopij per
// uitkomst is beschrijvend (nooit "je kunt nu stoppen"); deficit/unavailable
// geven géén kop — geen claim is beter dan een verkeerde. D7: bij 'Vermogen
// opeten' hoort "reikt tot (voorbij) de eindleeftijd" samen te vallen met
// solver `reached_now`; anders zwijgt de kop.
const BASIS = { yearly: 36_000, method: 'essential_budgets' as const }
const deplete = { strategy: 'Vermogen opeten' as const, expenseBasis: BASIS, startAge: 42 }

describe('buildBriefingHeadline — runway-kopij', () => {
  it('months ≥ 12: "tot je Xe" op de hele leeftijd van de uitputtingsmaand', () => {
    const h = buildBriefingHeadline({
      ...deplete,
      kind: 'months',
      months: 231,
      depletionAge: 61.25,
      endAge: 90,
      solverStatus: 'unreachable_within_horizon',
    })
    expect(h).toBe('Als je nu zou stoppen, reikt je vermogen tot je 61e.')
    expect(h).not.toMatch(/kunt|kan je|oneindig|deze week/i)
  })

  it('months < 12: in maanden, met enkelvoud bij 1', () => {
    expect(
      buildBriefingHeadline({ ...deplete, kind: 'months', months: 7, depletionAge: 42.58, endAge: 90, solverStatus: 'unreachable_within_horizon' }),
    ).toBe('Als je nu zou stoppen, reikt je vermogen nog 7 maanden.')
    expect(
      buildBriefingHeadline({ ...deplete, kind: 'months', months: 1, depletionAge: 42.08, endAge: 90, solverStatus: 'unreachable_within_horizon' }),
    ).toBe('Als je nu zou stoppen, reikt je vermogen nog 1 maand.')
  })

  it('reaches-end-age: "tot voorbij je Ee" — eerlijk, zonder "oneindig"', () => {
    const h = buildBriefingHeadline({ ...deplete, kind: 'reaches-end-age', endAge: 90, solverStatus: 'reached_now' })
    expect(h).toBe('Als je nu zou stoppen, reikt je vermogen tot voorbij je 90e.')
    expect(h).not.toMatch(/oneindig/i)
  })

  it('beyond-horizon: benoemt de modelgrens (HORIZON_PLAFOND_LEEFTIJD), claimt niets daarvoorbij', () => {
    const h = buildBriefingHeadline({ ...deplete, kind: 'beyond-horizon', solverStatus: 'reached_now' })
    expect(h).toBe('Als je nu zou stoppen, reikt je vermogen zover het model rekent: tot je 100e.')
    expect(h).not.toMatch(/oneindig|voorbij je 100e/i)
  })

  it('deficit en unavailable → geen kop (geen claim is beter dan een verkeerde)', () => {
    expect(buildBriefingHeadline({ ...deplete, kind: 'deficit', solverStatus: 'unreachable_within_horizon' })).toBeNull()
    expect(buildBriefingHeadline({ kind: 'unavailable', reason: 'geen-uitgavenbasis' })).toBeNull()
    expect(buildBriefingHeadline({ kind: 'unavailable', reason: 'geen-geboortedatum' })).toBeNull()
    expect(buildBriefingHeadline({ kind: 'unavailable', reason: 'kern-fout' })).toBeNull()
    expect(buildBriefingHeadline({ kind: 'unavailable', reason: 'geen-basisrun' })).toBeNull()
  })

  it('D7 (deplete): reikt-tot-eindleeftijd zonder reached_now is inconsistent → geen kop', () => {
    expect(
      buildBriefingHeadline({ ...deplete, kind: 'reaches-end-age', endAge: 90, solverStatus: 'unreachable_within_horizon' }),
    ).toBeNull()
    expect(
      buildBriefingHeadline({ ...deplete, kind: 'beyond-horizon', solverStatus: 'reached_at' }),
    ).toBeNull()
  })

  it('legacy/perpetual: de zin blijft een liquiditeitsuitspraak, geen doel-claim, en vraagt geen reached_now', () => {
    const legacy = buildBriefingHeadline({
      strategy: 'Nalatenschap' as const, expenseBasis: BASIS, startAge: 42, kind: 'reaches-end-age', endAge: 90, solverStatus: 'reached_at',
    })
    expect(legacy).toBe('Als je nu zou stoppen, reikt je vermogen tot voorbij je 90e.')
    expect(legacy).not.toMatch(/nalatenschap|doel|bereikt/i)
    const perpetual = buildBriefingHeadline({
      strategy: 'Eeuwigdurend' as const, expenseBasis: BASIS, startAge: 42, kind: 'beyond-horizon', solverStatus: 'unreachable_within_horizon',
    })
    expect(perpetual).toBe('Als je nu zou stoppen, reikt je vermogen zover het model rekent: tot je 100e.')
  })

  it('de gemelde stale zin kan niet meer ontstaan: de kop kent geen vrijheidsdagen-deling meer', () => {
    // "Je vermogen staat voor 113 jaar en 4 maanden aan vrijheid" kwam uit
    // netWorth ÷ (€1/mnd). De kop consumeert nu uitsluitend een RunwayResult.
    const h = buildBriefingHeadline({ ...deplete, kind: 'months', months: 14, depletionAge: 43.17, endAge: 90, solverStatus: 'unreachable_within_horizon' })
    expect(h).not.toMatch(/jaar en \d+ maanden aan vrijheid/)
  })
})

// -- Geen geloofwaardige uitgavenbasis => geen claim (UR2-03 -> ADR 0126) ---
//
// HERPIND BIJ PR C. Deze regressie ging over "Je vermogen staat voor 113 jaar en
// 4 maanden aan vrijheid" op een account met alleen naam + geboortedatum: een
// losse transactie van EUR 1 gaf EUR 0,03/dag, en elke guard toetste de noemer op
// `> 0`. De vloer die dat afving zat in `computeFreedomTotal` - een functie die
// PR C verwijderd heeft. Hij is niet vervallen maar VERHUISD, in twee stappen:
//  - ADR 0126 D2b zet de vloer bij de PRODUCENT van het dagtarief
//    (`recentDailyExpenseRateFromRows`), zodat elke marginale consument hem erft;
//  - de TOTALE grootheid loopt sinds PR B/C door de kernel, die zijn eigen
//    `guardRetirementExpense` toepast en `unavailable/geen-uitgavenbasis` levert.
// De assertie hieronder is daarom herpind op dat nieuwe gedrag: zonder
// geloofwaardige uitgavenbasis doet geen enkel oppervlak nog een uitspraak.
describe('vrijheidstijd - zonder geloofwaardige uitgavenbasis geen claim', () => {
  it('unavailable/geen-uitgavenbasis levert geen meetpunt en geen kop', () => {
    const runway = { kind: 'unavailable', reason: 'geen-uitgavenbasis' } as const
    expect(summarizeRunway(runway)).toBeNull()
    expect(buildBriefingHeadline(runway)).toBeNull()
  })

  it('een tekort levert evenmin een meetpunt (geen "gekochte vrijheid" bij schuld)', () => {
    const runway = { ...deplete, kind: 'deficit', solverStatus: 'unreachable_within_horizon' } as const
    expect(summarizeRunway(runway)).toBeNull()
    expect(buildBriefingHeadline(runway)).toBeNull()
  })

  it('een eeuw vrijheid kan niet meer uit een minuscule uitgavenbasis ontstaan', () => {
    // De platte deling maakte van EUR 1.361 bij EUR 1/mnd ~ 41.365 dagen ("113 jaar
    // en 4 maanden"). Die motor bestaat niet meer: de duur komt uit de kernel-run
    // en is per constructie begrensd door HORIZON_PLAFOND_LEEFTIJD.
    const point = summarizeRunway({ ...deplete, kind: 'beyond-horizon', solverStatus: 'reached_now' })
    expect(point).not.toBeNull()
    expect(runwayYearsMonths(point!).years).toBeLessThanOrEqual(100)
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
