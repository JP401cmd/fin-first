import { describe, it, expect } from 'vitest'
import type { SimResult } from '@/lib/fire-simulation'
import { computeRunwayCoveragePct } from '@/lib/core-metrics'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import { dekkingVanRun, resolveLabUitkomst, type LabStopPad, type LabUitkomstInput } from './lab-uitkomst'

/**
 * ADR 0145 — de ene uitkomst-switch van het lab. Getoetst:
 *  - `solved`: passthrough van de vrijheidsleeftijd-delta + de bestaande gate
 *    (`hasScenario || hasStopKeuze`);
 *  - `aow`/`age`: dekking als uitkomst, `basisPct` ≡ `computeRunwayCoveragePct` op
 *    exact de loader-invoer (identiteit — geen tweede formule);
 *  - de gate per anker (nu-anker · eindvermogen · geen-verkenning · geen-run);
 *  - het EINDVERMOGEN als derde component (ADR 0145 D12, 15 sep 2026): basis/scenario/
 *    verkend uit `pickEndBalanceAtEndAge` op de rijen van díé run, en de nieuwe gate-tak
 *    "gedekt + verkenning → promotie eindvermogen" (die `geen/gedekt` vervangt);
 *  - de maandHint-prioriteit (stop-pad ▸ kernel ▸ null), nooit een eigen som.
 */

/** Rijen met een oplopende leeftijd-as; alleen `age`/`endPortfolio` doen ertoe voor D12. */
function rows(entries: readonly (readonly [age: number, endPortfolio: number])[]): SimResult['rows'] {
  return entries.map(([age, endPortfolio]) => ({
    age,
    phase: 'retirement' as const,
    startPortfolio: 0,
    growth: 0,
    savings: 0,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }))
}

function sim(over: Partial<SimResult> = {}): SimResult {
  return {
    rows: [],
    fireAge: 58,
    fireAgeFractional: 58,
    firePortfolioAtFire: 0,
    requiredFirePortfolio: 0,
    fireReachable: true,
    implicitWithdrawalRate: 0.04,
    classic25xTarget: 0,
    strategy: 'deplete',
    targetEndPortfolio: 0,
    displayEndAge: 90,
    ...over,
  }
}

/** Een aow-run: stop op 67 (maand 300 vanaf 42), uitputting op 82 (maand 480), plan tot 90. */
const AOW_TEKORT = sim({
  fireAge: 67,
  fireAgeFractional: 67,
  stopAnker: { soort: 'aow' },
  vastStopLeeftijd: 67,
  ankerMaand: 300,
  kernelDepletionMonth: 480,
  requiredFireIsAnchorPortfolio: true,
})

function input(over: Partial<LabUitkomstInput> = {}): LabUitkomstInput {
  return {
    planAnchor: { kind: 'aow' },
    currentAge: 42,
    basis: AOW_TEKORT,
    scenario: null,
    stopPad: null,
    kernelMaandHint: null,
    hasScenario: false,
    hasStopKeuze: false,
    ...over,
  }
}

function stopPad(over: Partial<LabStopPad> & { result: SimResult }): LabStopPad {
  return { maandHint: 0, stopAge: over.result.vastStopLeeftijd ?? 0, ...over }
}

describe('resolveLabUitkomst — solved: passthrough van vandaag', () => {
  const basis = sim({ fireAgeFractional: 58.25 })

  it('delta in maanden tussen basis en scenario; zonder scenario valt de scenario-leeftijd terug op de basis', () => {
    const met = resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis, scenario: sim({ fireAgeFractional: 55.75 }), hasScenario: true }))
    expect(met.kind).toBe('vrijheidsleeftijd')
    if (met.kind !== 'vrijheidsleeftijd') throw new Error('unreachable')
    expect(met.basisFireAge).toBe(58.25)
    expect(met.scenarioFireAge).toBe(55.75)
    expect(met.deltaMaanden).toBe(-30)
    expect(met.promotie).toEqual({ kind: 'vrijheidsleeftijd' })

    const zonder = resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis, scenario: sim({ fireAgeFractional: 55.75 }), hasScenario: false }))
    if (zonder.kind !== 'vrijheidsleeftijd') throw new Error('unreachable')
    // Een meegegeven scenario-run telt alleen wanneer `hasScenario` waar is.
    expect(zonder.scenarioFireAge).toBe(58.25)
    expect(zonder.deltaMaanden).toBe(0)
  })

  it('gate: geen run-eis onder solved (gedrag van vóór ADR 0145); niets verkend → geen-verkenning; alleen een stopkeuze volstaat', () => {
    expect(resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis: null })).promotie).toEqual({ kind: 'geen', reden: 'geen-verkenning' })
    expect(resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis: null, hasScenario: true })).promotie).toEqual({ kind: 'vrijheidsleeftijd' })
    expect(resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis })).promotie).toEqual({ kind: 'geen', reden: 'geen-verkenning' })
    expect(resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis, hasStopKeuze: true })).promotie).toEqual({ kind: 'vrijheidsleeftijd' })
  })

  it('een solved-run zonder kernel-antwoord levert geen leeftijd (null), geen NaN', () => {
    const u = resolveLabUitkomst(input({ planAnchor: { kind: 'solved' }, basis: sim({ fireAgeFractional: null }), hasScenario: true, scenario: sim({ fireAgeFractional: null }) }))
    if (u.kind !== 'vrijheidsleeftijd') throw new Error('unreachable')
    expect(u.basisFireAge).toBeNull()
    expect(u.deltaMaanden).toBeNull()
  })
})

describe('resolveLabUitkomst — aow/age: dekking als uitkomst', () => {
  it('basisPct ≡ computeRunwayCoveragePct op exact de loader-invoer (identiteit, geen tweede formule)', () => {
    const u = resolveLabUitkomst(input())
    expect(u.kind).toBe('dekking')
    if (u.kind !== 'dekking') throw new Error('unreachable')
    const loader = computeRunwayCoveragePct({
      kernelDepletionMonth: AOW_TEKORT.kernelDepletionMonth ?? null,
      eindMaand: eindMaandVan(AOW_TEKORT.displayEndAge, 42),
      ankerMaand: AOW_TEKORT.ankerMaand ?? null,
    })
    expect(u.basisPct).toBe(loader)
    // Handmatig: (480 − 300) ÷ (576 − 300) × 100 — bewust ook als getal, zodat een
    // toekomstige wijziging in computeRunwayCoveragePct hier zichtbaar wordt.
    expect(u.basisPct).toBeCloseTo((180 / 276) * 100, 9)
    expect(u.tekort).toBe(true)
    expect(u.stop).toEqual({ kind: 'aow', stopAge: 67 })
    expect(u.eind).toBe(90)
    expect(u.basisReach).toEqual({ kind: 'reikt-tot', age: 82, endAge: 90 })
  })

  it('dekkingVanRun: undefined uitputtingsmaand (geen kernel-pad) → null, niet 100', () => {
    expect(dekkingVanRun({ displayEndAge: 90 }, 42)).toBeNull()
    expect(dekkingVanRun({ displayEndAge: 90, kernelDepletionMonth: null, ankerMaand: 300 }, 42)).toBe(100)
    expect(dekkingVanRun(AOW_TEKORT, null)).toBeNull()
  })

  it('tekort + hasScenario → promotie dekking; scenario-dekking en -bereik komen uit de scenario-run', () => {
    const scenario = sim({ ...AOW_TEKORT, kernelDepletionMonth: 552 }) // uitputting op 88
    const u = resolveLabUitkomst(input({ scenario, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.promotie).toEqual({ kind: 'dekking' })
    expect(u.scenarioPct).toBeCloseTo(((552 - 300) / 276) * 100, 9)
    expect(u.scenarioReach).toEqual({ kind: 'reikt-tot', age: 88, endAge: 90 })
  })

  it('tekort zonder verkenning → geen-verkenning (een stopkeuze alleen is geen doelstand, D4)', () => {
    expect(resolveLabUitkomst(input({ hasStopKeuze: true })).promotie).toEqual({ kind: 'geen', reden: 'geen-verkenning' })
  })

  it('age gedekt (geen uitputting binnen de horizon) → 100% en promotie eindvermogen (D12), óók met scenario', () => {
    const gedekt = sim({ ...AOW_TEKORT, stopAnker: { soort: 'leeftijd', leeftijd: 58 }, vastStopLeeftijd: 58, ankerMaand: 192, kernelDepletionMonth: null })
    const u = resolveLabUitkomst(input({ planAnchor: { kind: 'age', age: 58 }, basis: gedekt, scenario: gedekt, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisPct).toBe(100)
    expect(u.tekort).toBe(false)
    expect(u.basisReach).toEqual({ kind: 'gedekt', endAge: 90 })
    // ADR 0145 D12 — dit was `geen/gedekt` (E5); het eindvermogen is wat nog beweegt.
    expect(u.promotie).toEqual({ kind: 'eindvermogen' })
  })

  it('gedekt ZONDER verkenning → geen-verkenning (er is geen lab-stand om vast te leggen)', () => {
    const gedekt = sim({ ...AOW_TEKORT, kernelDepletionMonth: null })
    expect(resolveLabUitkomst(input({ basis: gedekt })).promotie).toEqual({ kind: 'geen', reden: 'geen-verkenning' })
    // Een kale stopkeuze is onder een vast anker géén doelstand (D4) — ook bij gedekt.
    expect(resolveLabUitkomst(input({ basis: gedekt, hasStopKeuze: true })).promotie).toEqual({ kind: 'geen', reden: 'geen-verkenning' })
  })

  it('now → dekking als uitkomst, maar nooit een doel (nu-anker)', () => {
    const nu = sim({ ...AOW_TEKORT, stopAnker: { soort: 'nu' }, vastStopLeeftijd: 42, ankerMaand: 0, kernelDepletionMonth: 240 })
    const u = resolveLabUitkomst(input({ planAnchor: { kind: 'now' }, basis: nu, hasScenario: true, scenario: nu }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.stop).toEqual({ kind: 'now' })
    expect(u.basisPct).toBeCloseTo((240 / 576) * 100, 9)
    expect(u.promotie).toEqual({ kind: 'geen', reden: 'nu-anker' })
  })

  it('geen run → geen-run, bereik onbekend, alles null; het stopmoment valt terug op het plan-anker', () => {
    const u = resolveLabUitkomst(input({ planAnchor: { kind: 'age', age: 58.5 }, basis: null, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.promotie).toEqual({ kind: 'geen', reden: 'geen-run' })
    expect(u.basisPct).toBeNull()
    expect(u.basisReach).toEqual({ kind: 'onbekend' })
    expect(u.stop).toEqual({ kind: 'age', stopAge: 58.5 })
    expect(u.eind).toBeNull()
  })

  it('een run zonder kernel-antwoord (stub) telt als geen run — geen 100% uit een gat', () => {
    const stub = sim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: 67 })
    const u = resolveLabUitkomst(input({ basis: stub, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisPct).toBeNull()
    expect(u.promotie).toEqual({ kind: 'geen', reden: 'geen-run' })
  })

  it('verkend stop-pad: dekking/bereik uit de stop-run zelf (ankerMaand van díe run), stopleeftijd uit de run', () => {
    const pad = stopPad({
      result: sim({ ...AOW_TEKORT, fireAgeFractional: 62, stopAnker: { soort: 'aow' }, vastStopLeeftijd: 62, ankerMaand: 240, kernelDepletionMonth: 420 }),
      maandHint: 0,
      stopAge: 62,
    })
    const u = resolveLabUitkomst(input({ stopPad: pad, hasStopKeuze: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.verkendStopAge).toBe(62)
    expect(u.verkendPct).toBeCloseTo(((420 - 240) / (576 - 240)) * 100, 9)
    expect(u.verkendReach).toEqual({ kind: 'reikt-tot', age: 77, endAge: 90 })
    // De basis blijft de plan-run: het stop-pad verandert niets aan basisPct.
    expect(u.basisPct).toBeCloseTo((180 / 276) * 100, 9)
  })
})

describe('resolveLabUitkomst — eindvermogen als derde component (ADR 0145 D12)', () => {
  // Rijen t/m de eindleeftijd 90; de laatste rij met `age <= 90` telt (`pickEndBalanceAtEndAge`).
  const basisRijen = rows([[88, 120_000], [89, 110_000], [90, 100_000], [91, 90_000]])
  const scenarioRijen = rows([[89, 200_000], [90, 180_000]])
  const verkendRijen = rows([[89, 160_000], [90, 150_000]])

  it('leest basis/scenario/verkend elk uit de rijen van díé run — nominaal, laatste rij ≤ eindleeftijd', () => {
    const basis = sim({ ...AOW_TEKORT, kernelDepletionMonth: null, rows: basisRijen })
    const u = resolveLabUitkomst(
      input({
        basis,
        scenario: sim({ ...basis, rows: scenarioRijen }),
        hasScenario: true,
        stopPad: stopPad({ result: sim({ ...basis, vastStopLeeftijd: 62, ankerMaand: 240, rows: verkendRijen }) }),
        hasStopKeuze: true,
      }),
    )
    if (u.kind !== 'dekking') throw new Error('unreachable')
    // 100.000 en niet 90.000: rij 91 ligt vóórbij de eindleeftijd.
    expect(u.basisEindvermogen).toEqual({ kind: 'bedrag', nominaal: 100_000 })
    expect(u.scenarioEindvermogen).toEqual({ kind: 'bedrag', nominaal: 180_000 })
    expect(u.verkendEindvermogen).toEqual({ kind: 'bedrag', nominaal: 150_000 })
    expect(u.promotie).toEqual({ kind: 'eindvermogen' })
  })

  it('zonder scenario/stop-pad blijven de bijbehorende eindvermogens null (geen terugval op de basis)', () => {
    const u = resolveLabUitkomst(input({ basis: sim({ ...AOW_TEKORT, kernelDepletionMonth: null, rows: basisRijen }) }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisEindvermogen).toEqual({ kind: 'bedrag', nominaal: 100_000 })
    expect(u.scenarioEindvermogen).toBeNull()
    expect(u.verkendEindvermogen).toBeNull()
  })

  it('een gedekte run zonder rijen (stub) levert null — nooit 0 uit een gat', () => {
    const gedektStub = sim({ ...AOW_TEKORT, kernelDepletionMonth: null })
    const u = resolveLabUitkomst(input({ basis: gedektStub, scenario: gedektStub, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisEindvermogen).toBeNull()
    expect(u.scenarioEindvermogen).toBeNull()
  })

  it('I1 · een run die vóór de eindleeftijd opraakt heeft GEEN eindvermogen: `op`, nooit het (negatieve) tekort-lening-bedrag', () => {
    // Rijen met een negatief netto vermogen op 90: de tekort-lening, geen vermogen.
    const tekortRijen = rows([[89, -30_000_000], [90, -34_388_335]])
    const basis = sim({ ...AOW_TEKORT, rows: tekortRijen })
    const u = resolveLabUitkomst(input({ basis, scenario: sim({ ...basis }), hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisEindvermogen).toEqual({ kind: 'op' })
    expect(u.scenarioEindvermogen).toEqual({ kind: 'op' })
    // Óók een positief bedrag (woning min tekort-lening) telt niet als eindvermogen bij een tekort.
    const woningRijen = rows([[90, 250_000]])
    const w = resolveLabUitkomst(input({ basis: sim({ ...AOW_TEKORT, rows: woningRijen }) }))
    if (w.kind !== 'dekking') throw new Error('unreachable')
    expect(w.basisEindvermogen).toEqual({ kind: 'op' })
  })

  it('I1 · een stub zonder kernel-antwoord (bereik onbekend) levert null, geen `op`', () => {
    const stub = sim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: 67, rows: basisRijen })
    const u = resolveLabUitkomst(input({ basis: stub }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.basisEindvermogen).toBeNull()
  })
})

describe('resolveLabUitkomst — de promotie volgt de SCENARIO-stand die je vastlegt (eindreview I1)', () => {
  const gedektRijen = rows([[90, 120_000]])
  const GEDEKT = sim({ ...AOW_TEKORT, kernelDepletionMonth: null, rows: gedektRijen })
  const KRAP = sim({ ...AOW_TEKORT, kernelDepletionMonth: 552, rows: rows([[90, -80_000]]) }) // op op 88

  it('gedekte basis + scenario met tekort (salaris −30 %) → `dekking`, nooit een negatief eindvermogen-doel', () => {
    const u = resolveLabUitkomst(input({ planAnchor: { kind: 'age', age: 60 }, basis: GEDEKT, scenario: KRAP, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.tekort).toBe(false)
    expect(u.scenarioEindvermogen).toEqual({ kind: 'op' })
    expect(u.promotie).toEqual({ kind: 'dekking' })
  })

  it('basis met tekort + scenario gedekt → `eindvermogen` (de vastgelegde stand reikt)', () => {
    const u = resolveLabUitkomst(input({ basis: AOW_TEKORT, scenario: GEDEKT, hasScenario: true }))
    if (u.kind !== 'dekking') throw new Error('unreachable')
    expect(u.tekort).toBe(true)
    expect(u.promotie).toEqual({ kind: 'eindvermogen' })
  })

  it('scenario gedekt maar met een negatief netto vermogen op de eindleeftijd → `dekking` (geen negatief doel)', () => {
    const negatief = sim({ ...GEDEKT, rows: rows([[90, -5_000]]) })
    expect(resolveLabUitkomst(input({ basis: GEDEKT, scenario: negatief, hasScenario: true })).promotie).toEqual({ kind: 'dekking' })
  })

  it('scenario-run nog onbekend (worker loopt) → terugval op de basis: gedekt → eindvermogen, tekort → dekking', () => {
    expect(resolveLabUitkomst(input({ basis: GEDEKT, scenario: null, hasScenario: true })).promotie).toEqual({ kind: 'eindvermogen' })
    expect(resolveLabUitkomst(input({ basis: AOW_TEKORT, scenario: null, hasScenario: true })).promotie).toEqual({ kind: 'dekking' })
  })
})

describe('resolveLabUitkomst — maandHint-prioriteit (stop-pad ▸ kernel ▸ null)', () => {
  const hint = (u: ReturnType<typeof resolveLabUitkomst>) => (u.kind === 'dekking' ? u.maandHint : undefined)

  it('stop-pad > 0 wint van de kernel-hint', () => {
    const pad = stopPad({ result: AOW_TEKORT, maandHint: 250 })
    expect(hint(resolveLabUitkomst(input({ stopPad: pad, kernelMaandHint: 400 })))).toBe(250)
  })

  it('stop-pad ≤ 0 (gedekt op de verkende stop) → de kernel-hint van de plan-run', () => {
    const pad = stopPad({ result: AOW_TEKORT, maandHint: -80 })
    expect(hint(resolveLabUitkomst(input({ stopPad: pad, kernelMaandHint: 400 })))).toBe(400)
  })

  it('geen stop-pad → de kernel-hint (plan-variant zonder slider-beweging); ≤ 0 → null', () => {
    expect(hint(resolveLabUitkomst(input({ kernelMaandHint: 315.5 })))).toBe(315.5)
    expect(hint(resolveLabUitkomst(input({ kernelMaandHint: 0 })))).toBeNull()
    expect(hint(resolveLabUitkomst(input({ kernelMaandHint: -12 })))).toBeNull()
    expect(hint(resolveLabUitkomst(input({ kernelMaandHint: null })))).toBeNull()
  })

  it('een niet-eindige hint telt niet', () => {
    expect(hint(resolveLabUitkomst(input({ kernelMaandHint: Number.NaN })))).toBeNull()
    const pad = stopPad({ result: AOW_TEKORT, maandHint: Number.POSITIVE_INFINITY })
    expect(hint(resolveLabUitkomst(input({ stopPad: pad, kernelMaandHint: 90 })))).toBe(90)
  })
})
