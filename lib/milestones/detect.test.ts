import { describe, it, expect } from 'vitest'
import { evaluateGoalCheckpoints, evaluateMilestones, isFarHorizonGoal } from './detect'
import {
  MILESTONE_FREEDOM_PERCENTS,
  MILESTONE_WEALTH_THRESHOLDS,
  type MilestoneObservation,
} from './types'

/**
 * De detectiemotor is puur: vijf getallen in, sleutels uit. Deze suite bewaakt
 * exact de grenzen waar een "bijna" een "wel" wordt — dat is de enige plek waar
 * een mijlpaal ten onrechte kan vuren (en door de unieke sleutel in de DB
 * daarna nooit meer te herstellen is zonder de rij te verwijderen).
 */

const NOTHING: MilestoneObservation = {
  netWorth: 0,
  freedomPct: null,
  totalDebts: 1,
  emergencyFundMonthsCovered: null,
  emergencyFundTargetMonths: null,
}

function keys(obs: Partial<MilestoneObservation>): string[] {
  return evaluateMilestones({ ...NOTHING, ...obs }).map((c) => c.key)
}

describe('evaluateMilestones — vermogensdrempels', () => {
  it('99.999,99 haalt de 100k-drempel niet', () => {
    const result = keys({ netWorth: 99_999.99 })
    expect(result).not.toContain('vermogen-100k')
    // ...maar de lagere drempels wel — de ladder is cumulatief.
    expect(result).toEqual([
      'vermogen-10k',
      'vermogen-25k',
      'vermogen-50k',
    ])
  })

  it('exact 100.000 haalt de drempel wél (>= , niet >)', () => {
    expect(keys({ netWorth: 100_000 })).toContain('vermogen-100k')
  })

  it('100.000,01 haalt de drempel', () => {
    expect(keys({ netWorth: 100_000.01 })).toContain('vermogen-100k')
  })

  it('een miljoen levert de volledige ladder op', () => {
    expect(keys({ netWorth: 1_000_000 })).toHaveLength(MILESTONE_WEALTH_THRESHOLDS.length)
  })

  it('negatief vermogen levert geen enkele vermogensmijlpaal', () => {
    expect(keys({ netWorth: -50_000 })).toEqual([])
  })

  it('NaN vermogen levert geen enkele vermogensmijlpaal', () => {
    expect(keys({ netWorth: Number.NaN })).toEqual([])
  })

  it('draagt drempel én waargenomen waarde mee', () => {
    const cand = evaluateMilestones({ ...NOTHING, netWorth: 12_500 })
    expect(cand).toEqual([
      {
        key: 'vermogen-10k',
        kind: 'vermogen',
        thresholdValue: 10_000,
        observedValue: 12_500,
      },
    ])
  })
})

describe('evaluateMilestones — vrijheidspercentage', () => {
  it('freedomPct null levert geen enkele vrijheidsmijlpaal', () => {
    expect(keys({ freedomPct: null })).toEqual([])
  })

  it('freedomPct 0 is iets anders dan null en levert nog steeds niets', () => {
    expect(keys({ freedomPct: 0 })).toEqual([])
  })

  it('24,9% haalt de 25%-mijlpaal niet, 25% wel', () => {
    expect(keys({ freedomPct: 24.9 })).not.toContain('vrijheid-25')
    expect(keys({ freedomPct: 25 })).toContain('vrijheid-25')
  })

  it('100% levert alle vier de vrijheidsmijlpalen', () => {
    expect(keys({ freedomPct: 100 })).toHaveLength(MILESTONE_FREEDOM_PERCENTS.length)
  })

  it('hergebruikt de percentages van lib/freedom-milestones.ts', () => {
    expect(MILESTONE_FREEDOM_PERCENTS).toEqual([25, 50, 75, 100])
  })
})

describe('evaluateMilestones — schuldenvrij', () => {
  it('totalDebts 0 levert de schuldenvrij-sleutel', () => {
    expect(keys({ totalDebts: 0 })).toContain('schuldenvrij')
  })

  it('totalDebts > 0 levert hem niet', () => {
    expect(keys({ totalDebts: 0.01 })).not.toContain('schuldenvrij')
    expect(keys({ totalDebts: 250_000 })).not.toContain('schuldenvrij')
  })

  it('een negatieve schuldsom is een anomalie, geen prestatie', () => {
    expect(keys({ totalDebts: -100 })).not.toContain('schuldenvrij')
  })
})

describe('evaluateMilestones — noodfonds', () => {
  it('geen doel (null) levert geen kandidaat, ook niet bij volle dekking', () => {
    expect(
      keys({ emergencyFundMonthsCovered: 12, emergencyFundTargetMonths: null }),
    ).not.toContain('noodfonds-gevuld')
  })

  it('geen dekking (null) levert geen kandidaat', () => {
    expect(
      keys({ emergencyFundMonthsCovered: null, emergencyFundTargetMonths: 3 }),
    ).not.toContain('noodfonds-gevuld')
  })

  it('dekking onder het doel levert geen kandidaat', () => {
    expect(
      keys({ emergencyFundMonthsCovered: 2.9, emergencyFundTargetMonths: 3 }),
    ).not.toContain('noodfonds-gevuld')
  })

  it('dekking gelijk aan het doel levert de kandidaat', () => {
    expect(
      keys({ emergencyFundMonthsCovered: 3, emergencyFundTargetMonths: 3 }),
    ).toContain('noodfonds-gevuld')
  })

  it('doel van 0 maanden is de degeneratietak en levert niets', () => {
    // Zonder deze uitsluiting zou élke gebruiker met €0 buffer meteen
    // "noodfonds gevuld" krijgen (0 >= 0).
    expect(
      keys({ emergencyFundMonthsCovered: 0, emergencyFundTargetMonths: 0 }),
    ).not.toContain('noodfonds-gevuld')
  })

  it('draagt maanden mee als drempel — geen euro-bedrag', () => {
    const cand = evaluateMilestones({
      ...NOTHING,
      emergencyFundMonthsCovered: 4.5,
      emergencyFundTargetMonths: 3,
    })
    expect(cand).toEqual([
      {
        key: 'noodfonds-gevuld',
        kind: 'noodfonds',
        thresholdValue: 3,
        observedValue: 4.5,
      },
    ])
  })
})

describe('evaluateMilestones — samenstelling', () => {
  it('levert niets bij een lege observatie', () => {
    expect(evaluateMilestones(NOTHING)).toEqual([])
  })

  it('is puur: dezelfde invoer geeft dezelfde uitvoer', () => {
    const obs: MilestoneObservation = {
      netWorth: 260_000,
      freedomPct: 51,
      totalDebts: 0,
      emergencyFundMonthsCovered: 6,
      emergencyFundTargetMonths: 3,
    }
    expect(evaluateMilestones(obs)).toEqual(evaluateMilestones(obs))
  })

  it('combineert alle vier de soorten', () => {
    const result = keys({
      netWorth: 260_000,
      freedomPct: 51,
      totalDebts: 0,
      emergencyFundMonthsCovered: 6,
      emergencyFundTargetMonths: 3,
    })
    expect(result).toEqual([
      'vermogen-10k',
      'vermogen-25k',
      'vermogen-50k',
      'vermogen-100k',
      'vermogen-250k',
      'vrijheid-25',
      'vrijheid-50',
      'schuldenvrij',
      'noodfonds-gevuld',
    ])
  })

  it('produceert nooit een doel-mijlpaal (die komt uit goals, niet uit een stand)', () => {
    const result = keys({ netWorth: 1_000_000, freedomPct: 100, totalDebts: 0 })
    expect(result.some((k) => k.startsWith('doel-behaald:'))).toBe(false)
  })
})

describe('evaluateGoalCheckpoints — verre doelen (plan 3c)', () => {
  const goal = (progressPct: number, id = 'g1') => ({ id, name: 'Wereldreis', progressPct })

  it('geeft alle gepasseerde checkpoints, drempel zelf telt mee', () => {
    const keys = evaluateGoalCheckpoints([goal(50)]).map((c) => c.key)
    expect(keys).toEqual(['doel-checkpoint:g1:25', 'doel-checkpoint:g1:50'])
  })

  it('een voltooid doel (>=100%) levert niets — dat is doel-behaald, niet een checkpoint', () => {
    expect(evaluateGoalCheckpoints([goal(100)])).toEqual([])
    expect(evaluateGoalCheckpoints([goal(120)])).toEqual([])
  })

  it('negatieve of niet-bruikbare voortgang levert niets', () => {
    expect(evaluateGoalCheckpoints([goal(-5)])).toEqual([])
    expect(evaluateGoalCheckpoints([goal(Number.NaN)])).toEqual([])
  })

  it('draagt kind doel, de drempel als threshold en de voortgang als observed', () => {
    const [c] = evaluateGoalCheckpoints([goal(30)])
    expect(c).toEqual({
      key: 'doel-checkpoint:g1:25',
      kind: 'doel',
      thresholdValue: 25,
      observedValue: 30,
    })
  })
})

describe('isFarHorizonGoal — alleen lange looptijden krijgen checkpoints', () => {
  const now = new Date('2026-08-31T12:00:00Z')

  it('2+ jaar tussen aanmaak en streefdatum: ver', () => {
    expect(isFarHorizonGoal('2028-09-01', '2026-08-01', now)).toBe(true)
  })

  it('korte looptijd: niet ver', () => {
    expect(isFarHorizonGoal('2027-01-01', '2026-08-01', now)).toBe(false)
  })

  it('zonder streefdatum nooit ver — er is geen horizon om op te knippen', () => {
    expect(isFarHorizonGoal(null, '2020-01-01', now)).toBe(false)
  })

  it('zonder aanmaakdatum geldt de streefdatum t.o.v. nu', () => {
    expect(isFarHorizonGoal('2029-01-01', null, now)).toBe(true)
    expect(isFarHorizonGoal('2027-06-01', null, now)).toBe(false)
  })

  it('onparseerbare streefdatum: niet ver', () => {
    expect(isFarHorizonGoal('geen-datum', '2020-01-01', now)).toBe(false)
  })
})
