import { describe, it, expect } from 'vitest'
import {
  RISICO_EVENT_NA_FIRE,
  berekenOverlijdenPartnerImpact,
  berekenWerkloosheidImpact,
  werkloosheidNaFireWaarschuwing,
} from './risico-event-regels'
import {
  ANW_NETTO_BENADERING_FACTOR,
  anwNabestaandenBruto,
  berekenWwUitkering,
} from '../sociale-zekerheid'

const JAAR = 2026

/**
 * Tolerantie: exacte gelijkheid op hele euro's. De rekenregel rondt per
 * maandbedrag absoluut af (Math.round) omdat dit de bedragen zijn die de
 * gebruiker ziet én die als `monthly_income_change` in `life_events` landen.
 */

describe('berekenWerkloosheidImpact', () => {
  it('vertaalt de standaardinvoer naar de vier kasstroomvelden', () => {
    const impact = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 3000, transitievergoeding: 6667, wwDuur: 12, zoektijd: 6 },
      JAAR,
    )
    expect(impact.totaleDuurMaanden).toBe(12)
    expect(impact.durMonths).toBe(12)
    expect(impact.monthlyCostChange).toBe(0)
    // transitievergoeding = eenmalige INKOMST → negatieve kostenpost
    expect(impact.oneTimeCost).toBe(-6667)
    expect(impact.monthlyIncomeChange).toBe(-impact.inkomensgatPerMaand)
  })

  it('consumeert de canonieke WW-motor (geen tweede rekenpad)', () => {
    const metadata = { huidigBruto: 4000, huidigNetto: 3000, wwDuur: 12, zoektijd: 6 }
    const impact = berekenWerkloosheidImpact(metadata, JAAR)
    const ww = berekenWwUitkering({
      brutoMaandsalaris: 4000,
      wwDuurMaanden: 12,
      overDuurMaanden: 12,
      jaar: JAAR,
    })
    expect(impact.ww).toEqual(ww)
    expect(impact.inkomensgatPerMaand).toBe(3000 - ww.gemiddeldPerMaand)
  })

  it('past de 75%-trap toe: het gat is kleiner dan bij kaal 70% (de oude event-som)', () => {
    const impact = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 3000, wwDuur: 12, zoektijd: 6 },
      JAAR,
    )
    const oudGat = 3000 - impact.ww.maandDaarna // wat de oude berekening deed
    expect(impact.inkomensgatPerMaand).toBeLessThan(oudGat)
  })

  it('rekent het gat over de TOTALE werkloosheidsduur, dus telt de staart zonder WW mee', () => {
    const kort = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 3000, wwDuur: 3, zoektijd: 3 },
      JAAR,
    )
    const lang = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 3000, wwDuur: 3, zoektijd: 18 },
      JAAR,
    )
    expect(lang.totaleDuurMaanden).toBe(18)
    // dezelfde WW-duur, maar 15 maanden zonder uitkering → groter gemiddeld gat
    expect(lang.inkomensgatPerMaand).toBeGreaterThan(kort.inkomensgatPerMaand)
    expect(lang.totaalInkomensverlies).toBe(Math.round(lang.inkomensgatPerMaand * 18))
  })

  it('respecteert een expliciet ingevulde 0 (was: viel terug op de default)', () => {
    const impact = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 0, transitievergoeding: 0, wwDuur: 12, zoektijd: 6 },
      JAAR,
    )
    expect(impact.huidigNetto).toBe(0)
    expect(impact.inkomensgatPerMaand).toBe(0) // WW > 0, dus geen gat
    expect(impact.monthlyIncomeChange).toBe(0)
    expect(impact.oneTimeCost).toBe(0)
  })

  it('valt terug op de catalogus-defaults bij lege of ontbrekende velden', () => {
    const leeg = berekenWerkloosheidImpact({}, JAAR)
    const expliciet = berekenWerkloosheidImpact(
      { huidigBruto: 4000, huidigNetto: 3000, transitievergoeding: 0, wwDuur: 12, zoektijd: 6 },
      JAAR,
    )
    expect(leeg).toEqual(expliciet)
    expect(berekenWerkloosheidImpact({ huidigNetto: '' }, JAAR).huidigNetto).toBe(3000)
  })

  it('geeft nooit een negatief inkomensgat wanneer de WW hoger is dan het netto salaris', () => {
    const impact = berekenWerkloosheidImpact(
      { huidigBruto: 8000, huidigNetto: 1000, wwDuur: 24, zoektijd: 24 },
      JAAR,
    )
    expect(impact.inkomensgatPerMaand).toBe(0)
    expect(impact.monthlyIncomeChange).toBe(0)
  })
})

describe('berekenOverlijdenPartnerImpact', () => {
  const ctx = { maandlastenHuishouden: 4000 }

  it('rekent de netto maandimpact als −partnerinkomen +nabestaanden +anw +kostendaling', () => {
    const impact = berekenOverlijdenPartnerImpact(
      {
        nettoInkomenPartner: 2500,
        nabestaandenpensioen: 400,
        anwUitkering: 'kinderen',
        anwBedrag: 1000,
        levensverzekering: 150_000,
        kostendalingPct: 30,
      },
      ctx,
      JAAR,
    )
    const anwNetto = Math.round(1000 * ANW_NETTO_BENADERING_FACTOR)
    const kostendaling = Math.round(4000 * 0.30)
    expect(impact.anwNetto).toBe(anwNetto)
    expect(impact.kostendaling).toBe(kostendaling)
    expect(impact.nettoMaandImpact).toBe(-2500 + 400 + anwNetto + kostendaling)
    expect(impact.monthlyIncomeChange).toBe(impact.nettoMaandImpact)
    expect(impact.monthlyCostChange).toBe(0)
    // levensverzekering = eenmalige INKOMST → negatieve kostenpost
    expect(impact.oneTimeCost).toBe(-150_000)
    // permanent verlies → doorlopend
    expect(impact.durMonths).toBe(0)
  })

  it('zet de Anw op 0 bij "geen Anw-recht"', () => {
    const impact = berekenOverlijdenPartnerImpact(
      { anwUitkering: 'geen', anwBedrag: 1500 },
      ctx,
      JAAR,
    )
    expect(impact.anwBruto).toBe(0)
    expect(impact.anwNetto).toBe(0)
  })

  it('gebruikt het Anw-bedrag uit de jaargelaagde bron als default (niet meer €1.380)', () => {
    const impact = berekenOverlijdenPartnerImpact({}, ctx, JAAR)
    expect(impact.anwBruto).toBe(anwNabestaandenBruto(JAAR))
    expect(impact.anwBruto).not.toBe(1380)
  })

  it('geeft geen kostendaling zonder bekende maandlasten', () => {
    const impact = berekenOverlijdenPartnerImpact({ kostendalingPct: 30 }, { maandlastenHuishouden: 0 }, JAAR)
    expect(impact.kostendaling).toBe(0)
  })

  it('laat een positieve netto-impact staan (dekking hoger dan het weggevallen inkomen)', () => {
    const impact = berekenOverlijdenPartnerImpact(
      { nettoInkomenPartner: 500, nabestaandenpensioen: 2000, anwUitkering: 'geen', kostendalingPct: 30 },
      ctx,
      JAAR,
    )
    expect(impact.nettoMaandImpact).toBeGreaterThan(0)
    expect(impact.monthlyIncomeChange).toBe(impact.nettoMaandImpact)
  })

  it('respecteert een expliciete 0 voor kostendalingPct (was: viel terug op 30%)', () => {
    const impact = berekenOverlijdenPartnerImpact({ kostendalingPct: 0 }, ctx, JAAR)
    expect(impact.kostendalingPct).toBe(0)
    expect(impact.kostendaling).toBe(0)
  })

  it('doet geen uitkering bij een levensverzekering van 0', () => {
    const impact = berekenOverlijdenPartnerImpact({ levensverzekering: 0 }, ctx, JAAR)
    expect(impact.oneTimeCost).toBe(0)
  })
})

describe('D3 — na-FIRE-gedrag is per scenario expliciet vastgelegd', () => {
  it('legt voor beide risicoscenario\'s een gemotiveerde keuze vast', () => {
    expect(RISICO_EVENT_NA_FIRE.werkloosheid.naFire).toBe('niet_van_toepassing_na_fire')
    expect(RISICO_EVENT_NA_FIRE.overlijden_partner.naFire).toBe('loopt_door_na_fire')
    for (const gedrag of Object.values(RISICO_EVENT_NA_FIRE)) {
      expect(gedrag.reden.length).toBeGreaterThan(20)
    }
  })

  it('waarschuwt zodra een werkloosheid-event op of ná de vrijheidsleeftijd valt', () => {
    expect(werkloosheidNaFireWaarschuwing(58, 55)).toContain('55')
    expect(werkloosheidNaFireWaarschuwing(55, 55)).not.toBeNull()
  })

  it('zwijgt vóór de vrijheidsleeftijd', () => {
    expect(werkloosheidNaFireWaarschuwing(40, 55)).toBeNull()
  })

  it('zwijgt zonder bruikbare leeftijden (geen oordeel op onvolledige gegevens)', () => {
    expect(werkloosheidNaFireWaarschuwing(null, 55)).toBeNull()
    expect(werkloosheidNaFireWaarschuwing(40, null)).toBeNull()
    expect(werkloosheidNaFireWaarschuwing(Number.NaN, 55)).toBeNull()
  })
})
