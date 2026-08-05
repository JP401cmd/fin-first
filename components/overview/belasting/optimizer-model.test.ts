import { describe, it, expect } from 'vitest'
import { calculateBox3 } from '@/lib/box3-data'
import {
  GOAL_BY_ID,
  generateBox3Strategies,
  rankStrategies,
  pickBest,
  pickTopChoice,
} from '@/lib/tax-optimizer'
import type {
  Box3OptimizerInput,
  GoalSection,
  OptimizerStrategy,
  OptimizerTopChoice,
  ShiftCurvePoint,
} from '@/lib/tax-optimizer/types'
import type { Asset } from '@/lib/asset-data'
import {
  buildOpportunities,
  findWinner,
  shortCaveat,
  sortOpportunities,
  JAARRUIMTE_CAVEAT,
  type Opportunity,
} from './optimizer-model'

// ── Fixtures ─────────────────────────────────────────────────────
//
// Zelfde idioom als lib/tax-optimizer/box3-optimizer.test.ts: echte
// engine-fixtures voor alles wat met GoalSection/OptimizerStrategy werkt (de
// integratie-invariant met pickTopChoice moet tegen de echte motor draaien,
// niet tegen handgeschreven objecten die toevallig aan het type voldoen).

function asset(partial: Partial<Asset> & { asset_type: string; current_value: number }): Asset {
  return { is_active: true, ...partial } as unknown as Asset
}

/** Household-fixture: shift bespaart bruto meer, maar kost rendement; partnerverdeling is netto-winnaar. */
function householdInput(goalId: Box3OptimizerInput['goalId']): Box3OptimizerInput {
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

/** Household ZONDER beleggingen — geen shift-hefboom mogelijk, alleen partnerverdeling. */
function partnerOnlyHouseholdInput(): Box3OptimizerInput {
  const current = calculateBox3({
    assets: [asset({ id: 'a1', asset_type: 'savings', current_value: 300_000 })],
    debts: [],
    hasPartner: true,
    dailyExpenses: 100,
    year: 2026,
  })
  return {
    goalId: 'box3-minimaal',
    year: 2026,
    dailyExpenses: 100,
    hasPartner: true,
    current,
    optimalAllocation: { totalTax: 4_000, savingsVsEqual: 650 },
  }
}

/** Solo-fixture: shift bespaart bruto ~€47 maar kost ~€359 rendement (netto negatief, geen kosteloos alternatief). */
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

function jaarruimteSection(besparing: number, opts?: { hasData?: boolean }): GoalSection {
  const dailyExpenses = 100
  const freedomDays = Math.round(besparing / dailyExpenses)
  return {
    kind: 'jaarruimte',
    goalId: 'jaarruimte-maximaal',
    goal: GOAL_BY_ID['jaarruimte-maximaal'],
    grossYearlyIncome: 70_000,
    pensionFactorA: 1_500,
    dailyExpenses,
    hasData: opts?.hasData ?? true,
    besparing,
    freedomDays,
    netEffect: besparing,
    netFreedomDays: freedomDays,
  }
}

/** Minimale, geldige Opportunity-fixture voor de pure sort/findWinner-tests. */
function opp(
  partial: Partial<Opportunity> & { id: string; savings: number; netEffect: number },
): Opportunity {
  return {
    kind: 'box3',
    boxLabel: 'Box 3',
    title: partial.id,
    description: '',
    returnCostEur: 0,
    netFreedomDays: 0,
    hasReturnCost: false,
    optimizedTax: null,
    detail: [],
    caveat: null,
    freedomDots: 3,
    freedomNote: null,
    effortDots: 1,
    effortNote: null,
    trajectory: null,
    shiftCurve: null,
    strategy: null,
    ...partial,
  }
}

// ── sortOpportunities ────────────────────────────────────────────

describe('optimizer-model — sortOpportunities', () => {
  it('stand "geen-verlies" filtert rendement-kostende kansen weg', () => {
    const cheap = opp({ id: 'partnerverdeling', savings: 100, netEffect: 100, hasReturnCost: false })
    const costly = opp({ id: 'samenstelling-shift', savings: 500, netEffect: -200, hasReturnCost: true })
    const result = sortOpportunities([cheap, costly], 'geen-verlies')
    expect(result).toEqual([cheap])
  })

  it('stand "geen-verlies" op een lijst zonder rendementskosten laat alles staan', () => {
    const a = opp({ id: 'a', savings: 100, netEffect: 100, hasReturnCost: false })
    const b = opp({ id: 'b', savings: 200, netEffect: 200, hasReturnCost: false })
    expect(sortOpportunities([a, b], 'geen-verlies')).toHaveLength(2)
  })

  it('is stabiel bij gelijk netEffect in de netto-modus (behoudt invoervolgorde)', () => {
    const first = opp({ id: 'a', savings: 100, netEffect: 100 })
    const second = opp({ id: 'b', savings: 100, netEffect: 100 })
    const third = opp({ id: 'c', savings: 100, netEffect: 100 })
    const result = sortOpportunities([first, second, third], 'netto')
    expect(result.map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('is stabiel bij gelijke besparing én netEffect in de besparing-modus', () => {
    const first = opp({ id: 'a', savings: 100, netEffect: 50 })
    const second = opp({ id: 'b', savings: 100, netEffect: 50 })
    const result = sortOpportunities([first, second], 'besparing')
    expect(result.map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('netto-modus rankt op netEffect aflopend, ongeacht de bruto besparing', () => {
    const bigGross = opp({ id: 'gross', savings: 1_000, netEffect: -500 })
    const smallGross = opp({ id: 'net', savings: 200, netEffect: 150 })
    const result = sortOpportunities([bigGross, smallGross], 'netto')
    expect(result.map((o) => o.id)).toEqual(['net', 'gross'])
  })

  it('besparing-modus rankt op bruto besparing aflopend, ongeacht netEffect', () => {
    const bigGross = opp({ id: 'gross', savings: 1_000, netEffect: -500 })
    const smallGross = opp({ id: 'net', savings: 200, netEffect: 150 })
    const result = sortOpportunities([bigGross, smallGross], 'besparing')
    expect(result.map((o) => o.id)).toEqual(['gross', 'net'])
  })

  it('muteert de invoerlijst niet (geeft een nieuwe array)', () => {
    const list = [opp({ id: 'a', savings: 100, netEffect: 50 }), opp({ id: 'b', savings: 200, netEffect: 150 })]
    const snapshot = [...list]
    sortOpportunities(list, 'netto')
    expect(list).toEqual(snapshot)
  })
})

// ── findWinner ───────────────────────────────────────────────────

describe('optimizer-model — findWinner', () => {
  const opportunities = [
    opp({ id: 'samenstelling-shift', savings: 100, netEffect: -50, kind: 'box3' }),
    opp({ id: 'jaarruimte-maximaal', savings: 900, netEffect: 900, kind: 'jaarruimte' }),
  ]

  it('koppelt op topChoice.opportunityId aan een box3-strategie-id', () => {
    const topChoice: OptimizerTopChoice = {
      goalId: 'box3-minimaal',
      title: 'x',
      savings: 100,
      freedomDays: 1,
      netEffect: -50,
      caveat: null,
      kind: 'box3',
      opportunityId: 'samenstelling-shift',
    }
    expect(findWinner(opportunities, topChoice)?.id).toBe('samenstelling-shift')
  })

  it('koppelt op topChoice.opportunityId aan "jaarruimte-maximaal"', () => {
    const topChoice: OptimizerTopChoice = {
      goalId: 'jaarruimte-maximaal',
      title: 'x',
      savings: 900,
      freedomDays: 9,
      netEffect: 900,
      caveat: null,
      kind: 'jaarruimte',
      opportunityId: 'jaarruimte-maximaal',
    }
    expect(findWinner(opportunities, topChoice)?.id).toBe('jaarruimte-maximaal')
  })

  it('retourneert null wanneer topChoice null is', () => {
    expect(findWinner(opportunities, null)).toBeNull()
  })

  it('retourneert null bij een onbekend opportunityId', () => {
    const topChoice: OptimizerTopChoice = {
      goalId: 'box3-minimaal',
      title: 'x',
      savings: 100,
      freedomDays: 1,
      netEffect: 100,
      caveat: null,
      kind: 'box3',
      opportunityId: 'niet-bestaand-id',
    }
    expect(findWinner(opportunities, topChoice)).toBeNull()
  })
})

// ── buildOpportunities ───────────────────────────────────────────

describe('optimizer-model — buildOpportunities', () => {
  it('ontdubbelt strategieën over de twee box3-secties (zelfde id komt één keer voor)', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    // Zelfde onderliggende strategieën, twee keer anders gerankt (per doel) —
    // exact de "twee box3-secties" situatie die de server bouwt.
    const sectionMinimaal = box3Section('box3-minimaal', baseline, strategies)
    const sectionGeenVerlies = box3Section('box3-geen-rendementsverlies', baseline, strategies)

    const { opportunities } = buildOpportunities([sectionMinimaal, sectionGeenVerlies])

    // Twee onderliggende strategieën (shift + partnerverdeling), niet 2×2.
    expect(strategies).toHaveLength(2)
    expect(opportunities).toHaveLength(2)
    expect(new Set(opportunities.map((o) => o.id)).size).toBe(2)
    expect(opportunities.map((o) => o.id).sort()).toEqual(
      ['partnerverdeling', 'samenstelling-shift'].sort(),
    )
  })

  it('neemt de baseline van de eerste box3-sectie, null zonder box3-sectie', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)

    expect(buildOpportunities([section]).baseline).toBe(baseline)
    expect(buildOpportunities([]).baseline).toBeNull()
    expect(buildOpportunities([jaarruimteSection(900)]).baseline).toBeNull()
  })

  it('jaarruimte-kans alleen bij hasData && besparing > 0', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)

    const zonderData = buildOpportunities([section, jaarruimteSection(1_200, { hasData: false })])
    expect(zonderData.opportunities.some((o) => o.kind === 'jaarruimte')).toBe(false)

    const zonderBesparing = buildOpportunities([section, jaarruimteSection(0)])
    expect(zonderBesparing.opportunities.some((o) => o.kind === 'jaarruimte')).toBe(false)

    const negatieveBesparing = buildOpportunities([section, jaarruimteSection(-100)])
    expect(negatieveBesparing.opportunities.some((o) => o.kind === 'jaarruimte')).toBe(false)

    const metKans = buildOpportunities([section, jaarruimteSection(900)])
    expect(metKans.opportunities.some((o) => o.kind === 'jaarruimte')).toBe(true)
    expect(metKans.opportunities.find((o) => o.kind === 'jaarruimte')?.id).toBe('jaarruimte-maximaal')
  })

  it('hangt de geleverde shift-curve alléén aan de samenstelling-shift-kans', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    // Meet vóór je assert: de motor levert hier écht een curve.
    expect(shiftCurve).not.toBeNull()
    expect(shiftCurve!.length).toBeGreaterThan(1)

    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)
    const { opportunities } = buildOpportunities([section])

    const shift = opportunities.find((o) => o.id === 'samenstelling-shift')
    const partner = opportunities.find((o) => o.id === 'partnerverdeling')
    expect(shift?.shiftCurve).toBe(shiftCurve)
    expect(partner?.shiftCurve).toBeNull()
  })

  it('geeft het geleverde trajectory één-op-één door (jaarruimte-kans heeft er geen)', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)
    const { opportunities } = buildOpportunities([section, jaarruimteSection(900)])

    for (const strategy of strategies) {
      const match = opportunities.find((o) => o.id === strategy.id)
      expect(match?.trajectory).toBe(strategy.trajectory)
    }
    expect(opportunities.find((o) => o.kind === 'jaarruimte')?.trajectory).toBeNull()
  })

  it('neemt netEffect en netFreedomDays van de jaarruimte-sectie over (geen eigen afleiding)', () => {
    // Sectie-velden bewust ONGELIJK aan `besparing`/`freedomDays`, zodat de test
    // faalt zodra de client de netto-waarden weer zelf zou afleiden.
    const section: GoalSection = {
      ...(jaarruimteSection(900) as Extract<GoalSection, { kind: 'jaarruimte' }>),
      netEffect: 742,
      netFreedomDays: 7,
    }
    const { opportunities } = buildOpportunities([section])
    const jaarruimte = opportunities.find((o) => o.kind === 'jaarruimte')
    expect(jaarruimte?.netEffect).toBe(742)
    expect(jaarruimte?.netFreedomDays).toBe(7)
  })

  it('zonder shift-scenario (alleen partnerverdeling): shiftCurve is null door de hele keten', () => {
    const input = partnerOnlyHouseholdInput()
    const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
    // Meet vóór je assert: bevestig dat de motor hier écht geen shift/curve levert.
    expect(strategies.map((s) => s.kind)).toEqual(['partnerverdeling'])
    expect(shiftCurve).toBeNull()

    const section = box3Section('box3-minimaal', baseline, strategies, shiftCurve)
    const { opportunities } = buildOpportunities([section])

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0].id).toBe('partnerverdeling')
    expect(opportunities[0].shiftCurve).toBeNull()
  })

  it('slaat preview-secties over (geen crash, geen opportunity)', () => {
    const preview: GoalSection = {
      kind: 'preview',
      goalId: 'levenslang-minimaal',
      goal: GOAL_BY_ID['levenslang-minimaal'],
      previewNote: 'Straks.',
    }
    expect(buildOpportunities([preview])).toEqual({ baseline: null, opportunities: [] })
  })
})

// ── Integratie-invariant: pickTopChoice ↔ buildOpportunities ─────
//
// De server kiest de topkans (pickTopChoice) en de client bouwt onafhankelijk
// daarvan de vlakke kansenlijst (buildOpportunities) uit dezelfde secties. De
// badge-koppeling (findWinner in optimizer-client.tsx) werkt alleen als de door
// pickTopChoice gekozen `opportunityId` ook echt als rij bestaat. Dit is de
// server/client-naad — geen synthetische fixture, drie realistische scenario's.

describe('optimizer-model — pickTopChoice ↔ buildOpportunities integratie-invariant', () => {
  it('scenario 1: box3-winnaar (partnerverdeling) bestaat als opportunity-rij', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)

    const top = pickTopChoice([section])
    expect(top).not.toBeNull()
    expect(top!.kind).toBe('box3')

    const { opportunities } = buildOpportunities([section])
    expect(opportunities.some((o) => o.id === top!.opportunityId)).toBe(true)
    expect(findWinner(opportunities, top)).not.toBeNull()
  })

  it('scenario 2: jaarruimte-winnaar bestaat als opportunity-rij', () => {
    const input = householdInput('box3-minimaal')
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)
    const jaarruimte = jaarruimteSection(900) // > partnerverdeling (800) netto

    const top = pickTopChoice([section, jaarruimte])
    expect(top).not.toBeNull()
    expect(top!.kind).toBe('jaarruimte')

    const { opportunities } = buildOpportunities([section, jaarruimte])
    expect(opportunities.some((o) => o.id === top!.opportunityId)).toBe(true)
    expect(findWinner(opportunities, top)).not.toBeNull()
  })

  it('scenario 3: geen netto-positieve kans → top is null, findWinner geeft dan null (geen crash)', () => {
    const input = tinySavingSoloInput()
    const { baseline, strategies } = generateBox3Strategies(input)
    const section = box3Section('box3-minimaal', baseline, strategies)

    const top = pickTopChoice([section])
    expect(top).toBeNull()

    const { opportunities } = buildOpportunities([section])
    // Er is best een opportunity-rij (de shift, bruto positief) — alleen geen
    // enkele daarvan is de "topkans" omdat er geen netto-positieve is.
    expect(opportunities.length).toBeGreaterThan(0)
    expect(findWinner(opportunities, top)).toBeNull()
  })
})

// ── shortCaveat ──────────────────────────────────────────────────

describe('optimizer-model — shortCaveat', () => {
  it('pakt de eerste zin (splitst op punt) en verlaagt de beginletter', () => {
    expect(
      shortCaveat(
        'Spaargeld levert doorgaans minder rendement dan beleggingen. Doorgerekend met een verwacht rendement.',
      ),
    ).toBe('spaargeld levert doorgaans minder rendement dan beleggingen')
  })

  it('splitst ook op puntkomma (JAARRUIMTE_CAVEAT — echte productietekst)', () => {
    expect(
      shortCaveat(
        'Je zet dit bedrag vast tot je pensioen; de latere uitkering wordt belast, meestal tegen een lager tarief.',
      ),
    ).toBe('je zet dit bedrag vast tot je pensioen')
  })

  it('laat de beginletter ongewijzigd bij een all-caps-achtige afkorting (tweede teken is hoofdletter)', () => {
    expect(shortCaveat('AOW-leeftijd kan in de toekomst wijzigen.')).toBe(
      'AOW-leeftijd kan in de toekomst wijzigen',
    )
  })

  it('verlaagt een gewoon hoofdlettterwoord ook als het op een cijfer/koppelteken volgt (geen afkorting)', () => {
    expect(shortCaveat('Box 3-heffing kan door nieuwe wetgeving wijzigen.')).toBe(
      'box 3-heffing kan door nieuwe wetgeving wijzigen',
    )
  })

  it('retourneert een korte (<2 tekens) eerste zin ongewijzigd', () => {
    expect(shortCaveat('A. Rest van de tekst die niet meetelt.')).toBe('A')
  })

  it('retourneert een lege string bij een lege caveat', () => {
    expect(shortCaveat('')).toBe('')
  })

  it('is puur (geen mutatie, deterministisch)', () => {
    const input = 'Herhaalbare zin. Rest.'
    expect(shortCaveat(input)).toBe(shortCaveat(input))
  })

  it('bevat voor de échte productie-caveats nooit een bedrag (maskering-vangrail)', () => {
    // De winnaar-regel toont shortCaveat(caveat) ONGEMASKEERD naast de badge.
    // Zolang de strategie-teksten server-gebakken bedragen kunnen bevatten
    // (box3-strategies.ts bakt formatCurrency in detail/caveat), pint deze test
    // dat de EERSTE zin — het enige deel dat daar rendert — bedragvrij blijft.
    const { strategies } = generateBox3Strategies(householdInput('box3-minimaal'))
    const realCaveats = [
      ...strategies.flatMap((s) => (s.caveat ? [s.caveat] : [])),
      JAARRUIMTE_CAVEAT,
    ]
    expect(realCaveats.length).toBeGreaterThan(0)
    for (const caveat of realCaveats) {
      expect(shortCaveat(caveat)).not.toMatch(/€/)
    }
  })
})
