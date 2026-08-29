import { describe, it, expect } from 'vitest'
import {
  ANW_NETTO_BENADERING_FACTOR,
  SOCIALE_ZEKERHEID_PARAMS,
  UWV_WERKDAGEN_PER_JAAR,
  UWV_WERKDAGEN_PER_MAAND,
  anwNabestaandenBruto,
  berekenAnwNetto,
  berekenDagloon,
  berekenWwUitkering,
  formatAnwOptieLabel,
  formatAnwTipTekst,
  formatWwTipTekst,
  resolveSocialeZekerheidParams,
} from './sociale-zekerheid'

const JAAR = 2026
const P = SOCIALE_ZEKERHEID_PARAMS[JAAR]

/**
 * Toleranties zijn hier bewust ABSOLUUT (exacte gelijkheid op hele euro's voor
 * maandbedragen, en `toBeCloseTo(…, 2)` = centen voor het dagloon): het gaat om
 * bedragen die de gebruiker als heel getal ziet en die de projectie voedt. Een
 * relatieve tolerantie zou een cent-fout op een groot bedrag verbergen en juist
 * een rondingsfout rond nul opblazen.
 */

describe('resolveSocialeZekerheidParams', () => {
  it('geeft de exacte jaarlaag als die bestaat', () => {
    expect(resolveSocialeZekerheidParams(2026)).toBe(P)
  })

  it('valt voor een toekomstig jaar terug op het dichtstbijzijnde bekende jaar ≤ gevraagd', () => {
    expect(resolveSocialeZekerheidParams(2030)).toBe(P)
  })

  it('valt voor een jaar vóór alle lagen terug op het vroegst bekende jaar', () => {
    expect(resolveSocialeZekerheidParams(2019)).toBe(P)
  })
})

describe('berekenDagloon', () => {
  it('rekent bruto maandsalaris × 12 / 261 onder het maximum', () => {
    // 3000 × 12 / 261 = 137,93… — ruim onder het maximumdagloon
    expect(berekenDagloon(3000, JAAR)).toBeCloseTo((3000 * 12) / UWV_WERKDAGEN_PER_JAAR, 6)
  })

  it('kapt af op het maximumdagloon van de jaarlaag', () => {
    // 20.000/mnd geeft een dagloon ver boven het maximum
    expect(berekenDagloon(20_000, JAAR)).toBe(P.maxDagloon)
  })

  it('geeft 0 bij nul, negatief of niet-numeriek inkomen', () => {
    expect(berekenDagloon(0, JAAR)).toBe(0)
    expect(berekenDagloon(-1000, JAAR)).toBe(0)
    expect(berekenDagloon(Number.NaN, JAAR)).toBe(0)
  })
})

describe('berekenWwUitkering — de wettelijke 75/70-trap', () => {
  it('levert een 75%- én een 70%-maandbedrag (de trap zat vroeger alleen in de tooltip)', () => {
    const ww = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: 12, jaar: JAAR })
    const dagloon = berekenDagloon(4000, JAAR)
    expect(ww.maandEerstePeriode).toBe(Math.round(dagloon * UWV_WERKDAGEN_PER_MAAND * 0.75))
    expect(ww.maandDaarna).toBe(Math.round(dagloon * UWV_WERKDAGEN_PER_MAAND * 0.70))
    expect(ww.maandEerstePeriode).toBeGreaterThan(ww.maandDaarna)
  })

  it('reproduceert de oude tooltip-formule exact wanneer het venster de WW-duur is', () => {
    // Regressie-anker: `gemWW = wwDuur <= 2 ? m75 : round((m75*2 + m70*(wwDuur-2)) / wwDuur)`
    for (const wwDuur of [1, 2, 3, 6, 12, 18, 24]) {
      const ww = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: wwDuur, jaar: JAAR })
      const oud = wwDuur <= 2
        ? ww.maandEerstePeriode
        : Math.round((ww.maandEerstePeriode * 2 + ww.maandDaarna * (wwDuur - 2)) / wwDuur)
      expect(ww.gemiddeldPerMaand).toBe(oud)
    }
  })

  it('is bij een WW-duur ≤ de eerste periode volledig het 75%-bedrag', () => {
    const ww = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: 2, jaar: JAAR })
    expect(ww.eerstePeriodeMaanden).toBe(2)
    expect(ww.gemiddeldPerMaand).toBe(ww.maandEerstePeriode)
  })

  it('telt maanden ZONDER WW als 0 mee zodra het venster langer is dan de WW-duur', () => {
    const wwDuur = 3
    const totaal = 12
    const ww = berekenWwUitkering({
      brutoMaandsalaris: 4000,
      wwDuurMaanden: wwDuur,
      overDuurMaanden: totaal,
      jaar: JAAR,
    })
    expect(ww.gemiddeldPerMaand).toBe(Math.round(ww.totaalOverWwDuur / totaal))
    // …en dat is strikt minder dan het gemiddelde over alleen de WW-duur:
    const alleenWw = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: wwDuur, jaar: JAAR })
    expect(ww.gemiddeldPerMaand).toBeLessThan(alleenWw.gemiddeldPerMaand)
  })

  it('is NIET gelijk aan kaal 70% over de hele duur (de oude event-berekening)', () => {
    const ww = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: 12, jaar: JAAR })
    expect(ww.gemiddeldPerMaand).not.toBe(ww.maandDaarna)
  })

  it('geeft 0 bij een WW-duur van 0 en bij een leeg venster', () => {
    const geen = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: 0, jaar: JAAR })
    expect(geen.totaalOverWwDuur).toBe(0)
    expect(geen.gemiddeldPerMaand).toBe(0)
    const leegVenster = berekenWwUitkering({
      brutoMaandsalaris: 4000, wwDuurMaanden: 12, overDuurMaanden: 0, jaar: JAAR,
    })
    expect(leegVenster.gemiddeldPerMaand).toBe(0)
  })

  it('kapt het dagloon af op het maximum, ook bij een zeer hoog salaris', () => {
    const ww = berekenWwUitkering({ brutoMaandsalaris: 25_000, wwDuurMaanden: 24, jaar: JAAR })
    expect(ww.dagloon).toBe(P.maxDagloon)
    expect(ww.maandEerstePeriode).toBe(Math.round(P.maxDagloon * UWV_WERKDAGEN_PER_MAAND * 0.75))
  })

  it('draagt de percentages en de wettelijke eerste periode mee voor labels', () => {
    const ww = berekenWwUitkering({ brutoMaandsalaris: 4000, wwDuurMaanden: 1, jaar: JAAR })
    expect(ww.pctEerstePeriode).toBe(P.ww.pctEerstePeriode)
    expect(ww.pctDaarna).toBe(P.ww.pctDaarna)
    // eerstePeriodeMaanden is begrensd door de WW-duur, de wettelijke waarde niet
    expect(ww.eerstePeriodeMaanden).toBe(1)
    expect(ww.wettelijkeEerstePeriodeMaanden).toBe(P.ww.eerstePeriodeMaanden)
  })
})

describe('Anw', () => {
  it('leest het bruto maandbedrag uit de jaarlaag', () => {
    expect(anwNabestaandenBruto(JAAR)).toBe(P.anw.nabestaandenBrutoPerMaand)
  })

  it('rekent bruto → netto met de gedocumenteerde benaderingsfactor', () => {
    expect(berekenAnwNetto(1000)).toBe(Math.round(1000 * ANW_NETTO_BENADERING_FACTOR))
  })

  it('geeft 0 bij nul, negatief of niet-numeriek bruto', () => {
    expect(berekenAnwNetto(0)).toBe(0)
    expect(berekenAnwNetto(-500)).toBe(0)
    expect(berekenAnwNetto(Number.NaN)).toBe(0)
  })
})

describe('UI-teksten komen uit de jaartabel, niet uit losse literals', () => {
  it('de WW-tip noemt het maximumdagloon en de percentages van de jaarlaag', () => {
    const tip = formatWwTipTekst(JAAR)
    expect(tip).toContain('75%')
    expect(tip).toContain('70%')
    expect(tip).toContain(String(P.ww.maxDuurMaanden))
    expect(tip).toContain(P.maxDagloon.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    // het verouderde bedrag dat vroeger hardgecodeerd in de tip stond
    expect(tip).not.toContain('274')
  })

  it('de Anw-teksten noemen het bedrag van de jaarlaag, niet het oude €1.380', () => {
    const bedrag = P.anw.nabestaandenBrutoPerMaand.toLocaleString('nl-NL', { maximumFractionDigits: 0 })
    expect(formatAnwTipTekst(JAAR)).toContain(bedrag)
    expect(formatAnwOptieLabel(JAAR)).toContain(bedrag)
    expect(formatAnwTipTekst(JAAR)).not.toContain('1.380')
    expect(formatAnwOptieLabel(JAAR)).not.toContain('1.380')
  })
})
