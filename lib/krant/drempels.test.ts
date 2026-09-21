import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { DREMPELS, DREMPEL_EENHEID, DREMPEL_SLEUTELS, isDrempelSleutel } from './drempels'
import { MECHANISMEN } from './mechanismen'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { BOX1_PARAMS } from '@/lib/box1-tax'
import { NL_AOW_AGE, NHG_KOSTENGRENS, STARTERSVRIJSTELLING_MAX, OVB_TARIEF_EIGEN_WONING } from '@/lib/constants'

describe('drempels bij naam — consume, don\'t recompute', () => {
  it('elke sleutel levert de canonieke waarde voor het lopende belastingjaar', () => {
    const j = CURRENT_TAX_YEAR
    expect(DREMPELS['heffingsvrij-vermogen-single'](j)).toBe(BOX3_PARAMS[j].heffingsvrijSingle)
    expect(DREMPELS['heffingsvrij-vermogen-partner'](j)).toBe(BOX3_PARAMS[j].heffingsvrijPartner)
    expect(DREMPELS['schuldendrempel-single'](j)).toBe(BOX3_PARAMS[j].schuldendrempelSingle)
    expect(DREMPELS['schuldendrempel-partner'](j)).toBe(BOX3_PARAMS[j].schuldendrempelPartner)
    expect(DREMPELS['forfait-spaargeld'](j)).toBe(BOX3_PARAMS[j].forfaitSpaargeld)
    expect(DREMPELS['forfait-beleggingen'](j)).toBe(BOX3_PARAMS[j].forfaitBeleggingen)
    expect(DREMPELS['forfait-schulden'](j)).toBe(BOX3_PARAMS[j].forfaitSchulden)
    expect(DREMPELS['box3-tarief'](j)).toBe(BOX3_PARAMS[j].tarief)
    expect(DREMPELS['box1-schijf-1-grens'](j)).toBe(BOX1_PARAMS[j].schijven[0].tot)
    expect(DREMPELS['box1-schijf-2-grens'](j)).toBe(BOX1_PARAMS[j].schijven[1].tot)
    expect(DREMPELS['box1-schijf-1-tarief'](j)).toBe(BOX1_PARAMS[j].schijven[0].tarief)
    expect(DREMPELS['box1-schijf-2-tarief'](j)).toBe(BOX1_PARAMS[j].schijven[1].tarief)
    expect(DREMPELS['box1-schijf-3-tarief'](j)).toBe(BOX1_PARAMS[j].schijven[2].tarief)
    expect(DREMPELS['algemene-heffingskorting-max'](j)).toBe(BOX1_PARAMS[j].algemeneHeffingskorting.max)
    expect(DREMPELS['arbeidskorting-max'](j)).toBe(BOX1_PARAMS[j].arbeidskorting.max)
    expect(DREMPELS['nhg-kostengrens'](j)).toBe(NHG_KOSTENGRENS)
    expect(DREMPELS['startersvrijstelling-max'](j)).toBe(STARTERSVRIJSTELLING_MAX)
    expect(DREMPELS['overdrachtsbelasting-eigen-woning'](j)).toBe(OVB_TARIEF_EIGEN_WONING)
    expect(DREMPELS['aow-leeftijd-standaard'](j)).toBe(NL_AOW_AGE)
  })

  it('een jaar buiten de parametertabellen geeft null, geen gok', () => {
    for (const sleutel of DREMPEL_SLEUTELS) {
      const waarde = DREMPELS[sleutel](1999)
      const jaarOnafhankelijk = ['nhg-kostengrens', 'startersvrijstelling-max', 'overdrachtsbelasting-eigen-woning', 'aow-leeftijd-standaard']
      if (jaarOnafhankelijk.includes(sleutel)) expect(waarde).not.toBeNull()
      else expect(waarde).toBeNull()
    }
  })

  it('bevat geen lokale financiële getallen (alleen verwijzingen naar de canonieke bronnen)', () => {
    const src = readSourceLF('lib/krant/drempels.ts')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    // Elk getal ≥ 100 in de code zou een eigen drempelwaarde zijn.
    const getallen = src.match(/\b\d[\d_.]*\b/g) ?? []
    const groot = getallen.filter((g) => Number(g.replace(/_/g, '')) >= 100)
    expect(groot, `lokale getallen in drempels.ts: ${groot.join(', ')}`).toEqual([])
  })

  it('eenheid per drempel klopt met de bronwaarde: fracties < 1, bedragen in hele euro\'s', () => {
    const j = CURRENT_TAX_YEAR
    for (const sleutel of DREMPEL_SLEUTELS) {
      const waarde = DREMPELS[sleutel](j)!
      if (DREMPEL_EENHEID[sleutel] === 'fractie') expect(waarde, sleutel).toBeLessThan(1)
      if (DREMPEL_EENHEID[sleutel] === 'eur') expect(Number.isInteger(waarde), sleutel).toBe(true)
    }
  })

  it('de eenheidsval voor 1B staat vast: box3-tarief is een fractie, tarief_pct in de duiding een percentage', () => {
    expect(DREMPEL_EENHEID['box3-tarief']).toBe('fractie')
    expect(MECHANISMEN['box3-parameter'].numeriek.tarief_pct.eenheid).toBe('pct')
    expect(DREMPELS['box3-tarief'](CURRENT_TAX_YEAR)! * 100).toBe(36)
  })

  it('isDrempelSleutel herkent alleen catalogus-sleutels', () => {
    expect(isDrempelSleutel('heffingsvrij-vermogen-single')).toBe(true)
    expect(isDrempelSleutel('heffingsvrij')).toBe(false)
  })
})
