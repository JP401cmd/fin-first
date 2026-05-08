import { describe, it, expect } from 'vitest'
import {
  LIFE_EVENT_STORIES,
  hasStory,
  defaultStoryAnswers,
  NIBUD_CHILDREN_MONTHLY_COST,
} from './life-event-stories'

describe('LIFE_EVENT_STORIES — basis', () => {
  it('heeft minstens 5 stories voor populaire types', () => {
    const types = Object.keys(LIFE_EVENT_STORIES)
    expect(types).toContain('children')
    expect(types).toContain('sabbatical')
    expect(types).toContain('inheritance')
    expect(types).toContain('pension')
    expect(types).toContain('house_purchase')
    expect(types.length).toBeGreaterThanOrEqual(5)
  })

  it('hasStory matcht met de catalog', () => {
    expect(hasStory('children')).toBe(true)
    expect(hasStory('inheritance')).toBe(true)
    expect(hasStory('custom')).toBe(false)
    expect(hasStory('move')).toBe(false)
  })

  it('defaultStoryAnswers vult elke vraag-key met de default-waarde', () => {
    const answers = defaultStoryAnswers('children')
    const story = LIFE_EVENT_STORIES['children']!
    for (const q of story.questions) {
      expect(answers).toHaveProperty(q.key, q.default)
    }
  })

  it('defaultStoryAnswers retourneert leeg object voor onbekend type', () => {
    expect(defaultStoryAnswers('niet-bestaand')).toEqual({})
  })
})

describe('children story — NIBUD-mapping', () => {
  it('één kind, geen opvang, met kinderbijslag → NIBUD-cijfer min bijslag', () => {
    const impact = LIFE_EVENT_STORIES['children']!.computeImpact(
      {
        aantal: 1,
        startAge: 32,
        thuisTotJaren: 23,
        opvangDagen: 0,
        kinderbijslag: true,
      },
      32,
    )
    // NIBUD 1 kind = €500/mnd; kinderbijslag ~€113/mnd
    // → ~€387/mnd uitgave-stijging
    expect(impact.tempEnabled).toBe(true)
    expect(impact.tempDirection).toBe('expense')
    expect(impact.tempAmount).toBeGreaterThan(300)
    expect(impact.tempAmount).toBeLessThan(500)
    expect(impact.tempDurationYears).toBe(23)
    expect(impact.oneTimeAmount).toBe(3000) // 1 kind × €3k uitzet
    expect(impact.suggestedAge).toBe(32)
  })

  it('twee kinderen + 3 dagen opvang → significant hogere maandlast', () => {
    const impactBase = LIFE_EVENT_STORIES['children']!.computeImpact(
      { aantal: 2, startAge: 32, thuisTotJaren: 23, opvangDagen: 0, kinderbijslag: true },
      30,
    )
    const impactWithCare = LIFE_EVENT_STORIES['children']!.computeImpact(
      { aantal: 2, startAge: 32, thuisTotJaren: 23, opvangDagen: 3, kinderbijslag: true },
      30,
    )
    expect(impactWithCare.tempAmount!).toBeGreaterThan(impactBase.tempAmount!)
    expect(impactWithCare.oneTimeAmount).toBe(6000) // 2 × €3k
  })

  it('NIBUD baseline schaalt niet-lineair met aantal kinderen', () => {
    expect(NIBUD_CHILDREN_MONTHLY_COST[2]).toBeLessThan(NIBUD_CHILDREN_MONTHLY_COST[1] * 2)
  })
})

describe('sabbatical story — inkomensverlies', () => {
  it('6 maanden zonder doorbetaling → tempAmount = volledig netto', () => {
    const impact = LIFE_EVENT_STORIES['sabbatical']!.computeImpact(
      {
        duurMnd: 6,
        startAge: 40,
        nettoMaand: 3000,
        doorbetaling: 0,
        bestemming: 'europa',
      },
      40,
    )
    expect(impact.tempEnabled).toBe(true)
    expect(impact.tempDirection).toBe('expense')
    expect(impact.tempAmount).toBe(3000)
    expect(impact.tempDurationYears).toBe(1) // 6 mnd → 1 jaar afgerond
    expect(impact.oneTimeAmount).toBe(2000) // europa setup
  })

  it('50% doorbetaling halveert het inkomensverlies', () => {
    const impact = LIFE_EVENT_STORIES['sabbatical']!.computeImpact(
      {
        duurMnd: 12,
        startAge: 40,
        nettoMaand: 4000,
        doorbetaling: 50,
        bestemming: 'wereld',
      },
      40,
    )
    expect(impact.tempAmount).toBe(2000)
    expect(impact.oneTimeAmount).toBe(6000) // wereld setup
  })

  it('100% doorbetaling: geen tempEnabled', () => {
    const impact = LIFE_EVENT_STORIES['sabbatical']!.computeImpact(
      {
        duurMnd: 6,
        startAge: 40,
        nettoMaand: 3000,
        doorbetaling: 100,
        bestemming: 'thuis',
      },
      40,
    )
    expect(impact.tempEnabled).toBe(false)
    expect(impact.oneTimeAmount).toBe(0) // thuis = geen extra
  })
})

describe('inheritance story', () => {
  it('alleen eenmalig: continu blijft uit', () => {
    const impact = LIFE_EVENT_STORIES['inheritance']!.computeImpact(
      { verwachtAge: 65, nettoBedrag: 75000, dividendOok: false, dividendMaand: 0 },
      45,
    )
    expect(impact.oneTimeDirection).toBe('income')
    expect(impact.oneTimeAmount).toBe(75000)
    expect(impact.contEnabled).toBe(false)
    expect(impact.suggestedAge).toBe(65)
  })

  it('met dividend: continu inkomst aan', () => {
    const impact = LIFE_EVENT_STORIES['inheritance']!.computeImpact(
      { verwachtAge: 65, nettoBedrag: 200000, dividendOok: true, dividendMaand: 400 },
      45,
    )
    expect(impact.contEnabled).toBe(true)
    expect(impact.contDirection).toBe('income')
    expect(impact.contAmount).toBe(400)
  })

  it('dividendOok=false negeert dividendMaand', () => {
    const impact = LIFE_EVENT_STORIES['inheritance']!.computeImpact(
      { verwachtAge: 70, nettoBedrag: 50000, dividendOok: false, dividendMaand: 999 },
      45,
    )
    expect(impact.contEnabled).toBe(false)
  })
})

describe('pension story — bruto naar netto', () => {
  it('bruto €2000 met 20% belasting = €1600 netto', () => {
    const impact = LIFE_EVENT_STORIES['pension']!.computeImpact(
      { startAge: 67, brutoMaand: 2000, belastingPct: 20, indexatie: true },
      55,
    )
    expect(impact.contEnabled).toBe(true)
    expect(impact.contDirection).toBe('income')
    expect(impact.contAmount).toBe(1600)
    expect(impact.contIndexed).toBe(true)
    expect(impact.suggestedAge).toBe(67)
  })

  it('0% belasting = bruto = netto', () => {
    const impact = LIFE_EVENT_STORIES['pension']!.computeImpact(
      { startAge: 67, brutoMaand: 1500, belastingPct: 0, indexatie: false },
      55,
    )
    expect(impact.contAmount).toBe(1500)
    expect(impact.contIndexed).toBe(false)
  })
})

describe('house_purchase story', () => {
  it('koopprijs €400k met 6% kosten koper = €24k eenmalig', () => {
    const impact = LIFE_EVENT_STORIES['house_purchase']!.computeImpact(
      { startAge: 35, koopprijs: 400000, kostenKoperPct: 6, maandlastVerschil: 300 },
      30,
    )
    expect(impact.oneTimeAmount).toBe(24000)
    expect(impact.oneTimeDirection).toBe('expense')
    expect(impact.contEnabled).toBe(true)
    expect(impact.contAmount).toBe(300)
    expect(impact.contDirection).toBe('expense')
  })

  it('negatief maandlast-verschil → continu inkomst (besparing)', () => {
    const impact = LIFE_EVENT_STORIES['house_purchase']!.computeImpact(
      { startAge: 35, koopprijs: 300000, kostenKoperPct: 4, maandlastVerschil: -200 },
      30,
    )
    expect(impact.contDirection).toBe('income')
    expect(impact.contAmount).toBe(200)
  })
})

describe('world_trip story', () => {
  it('6 maanden comfort met 2 personen = 6×30×120×2 = €43.200', () => {
    const impact = LIFE_EVENT_STORIES['world_trip']!.computeImpact(
      {
        duurMnd: 6,
        startAge: 35,
        reisstijl: 'comfort',
        aantalPersonen: 2,
        inkomensverlies: false,
        maandinkomen: 3000,
      },
      30,
    )
    expect(impact.oneTimeAmount).toBe(43200)
    expect(impact.tempEnabled).toBe(false)
  })

  it('met inkomensverlies → tijdelijk uit voor de duur van de reis', () => {
    const impact = LIFE_EVENT_STORIES['world_trip']!.computeImpact(
      {
        duurMnd: 12,
        startAge: 35,
        reisstijl: 'budget',
        aantalPersonen: 1,
        inkomensverlies: true,
        maandinkomen: 2500,
      },
      30,
    )
    expect(impact.tempEnabled).toBe(true)
    expect(impact.tempAmount).toBe(2500)
    expect(impact.tempDurationYears).toBe(1)
  })
})

describe('renovation + wedding stories — eenmalig dominant', () => {
  it('verbouwing middel = €40k tier-default', () => {
    const impact = LIFE_EVENT_STORIES['renovation']!.computeImpact(
      { omvang: 'middel', startAge: 45, eigenBedrag: 0, lagereLasten: false, besparing: 0 },
      40,
    )
    expect(impact.oneTimeAmount).toBe(40000)
  })

  it('verbouwing met eigen bedrag overruled tier', () => {
    const impact = LIFE_EVENT_STORIES['renovation']!.computeImpact(
      { omvang: 'klein', startAge: 45, eigenBedrag: 75000, lagereLasten: false, besparing: 0 },
      40,
    )
    expect(impact.oneTimeAmount).toBe(75000)
  })

  it('bruiloft groots + huwelijksreis = som van beide', () => {
    const impact = LIFE_EVENT_STORIES['wedding']!.computeImpact(
      {
        stijl: 'groots',
        startAge: 30,
        eigenBedrag: 0,
        huwelijksreis: true,
        reisbedrag: 8000,
      },
      28,
    )
    expect(impact.oneTimeAmount).toBe(45000 + 8000)
  })

  it('bruiloft zonder reis bevat geen reisbedrag', () => {
    const impact = LIFE_EVENT_STORIES['wedding']!.computeImpact(
      {
        stijl: 'intiem',
        startAge: 30,
        eigenBedrag: 0,
        huwelijksreis: false,
        reisbedrag: 999,
      },
      28,
    )
    expect(impact.oneTimeAmount).toBe(8000)
  })
})

describe('default-answers + roundtrip via computeImpact', () => {
  it('defaultStoryAnswers + computeImpact geeft een geldige impact terug voor elke story', () => {
    for (const [type, story] of Object.entries(LIFE_EVENT_STORIES)) {
      const answers = defaultStoryAnswers(type)
      const impact = story.computeImpact(answers, 35)
      // Minimum-eis: een suggestedName en (oneTime > 0 of tempEnabled of contEnabled)
      const hasImpact =
        (impact.oneTimeAmount ?? 0) > 0 ||
        impact.tempEnabled === true ||
        impact.contEnabled === true
      expect(hasImpact, `${type} default-impact heeft geen meetbare waarde`).toBe(true)
      expect(impact.suggestedName, `${type} mist suggestedName`).toBeTruthy()
    }
  })
})
