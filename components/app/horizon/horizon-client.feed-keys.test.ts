/**
 * De twee sleutelkeuzes in de euro-weergave-render-grens die ONZICHTBAAR fout
 * gaan (K2 en K4). Beide leveren bij een verkeerde sleutel een bedrag op dat er
 * volstrekt plausibel uitziet — een review vangt dat niet, een test wel.
 *
 * K4 — partner-/huishoudlijn: die rijen dragen de leeftijden van de PARTNER.
 *      Deflateer je ze op absolute leeftijd, dan pak je bij een partner van een
 *      andere leeftijd stelselmatig de jaarfactor van het verkeerde jaar.
 * K2 — de besteedbaar-lijn plot de waarde van rij `age` op `age + 1`. Zonder de
 *      expliciete `x - 1`-sleutel deflateert die lijn stil één jaar te ver.
 */
import { describe, it, expect } from 'vitest'
import { buildFactorByOffset, deflatePoints, deflateRowsByAge, buildFactorByAge } from '@/lib/euro-display'
import { factorMapByPosition } from './horizon-client'

/** Eigen kernelrijen: 40 t/m 44 jaar, 2% inflatie, jaar 0 = factor 1. */
const EIGEN_RIJEN = [0, 1, 2, 3, 4].map(k => ({
  age: 40 + k,
  inflationFactor: Math.pow(1.02, k),
}))

describe('K4 — partnerlijn deflateert op jaar-offset, niet op leeftijd', () => {
  it('geeft een partner van 8 jaar jonger de factor van HETZELFDE jaar', () => {
    const factorByOffset = buildFactorByOffset(EIGEN_RIJEN)
    // Partner is 32 wanneer de gebruiker 40 is: dezelfde vijf kalenderjaren.
    const partnerRijen = [0, 1, 2, 3, 4].map(k => ({ age: 32 + k, endPortfolio: 100_000 }))

    const map = factorMapByPosition(partnerRijen, factorByOffset)
    const gedeflateerd = deflateRowsByAge(partnerRijen, map, ['endPortfolio'], 'real')

    partnerRijen.forEach((_, k) => {
      expect(gedeflateerd[k].endPortfolio).toBeCloseTo(100_000 / Math.pow(1.02, k), 6)
    })
  })

  it('zou met een leeftijd-sleutel stil de verkeerde factor pakken', () => {
    // Dit is de fout die K4 beschrijft, hier expliciet zichtbaar gemaakt: geen
    // van de partnerleeftijden (32–36) komt voor in de eigen map (40–44), dus
    // valt élk bedrag terug op factor 1 — het lijkt te werken, maar er is
    // niets gedeflateerd.
    const opLeeftijd = buildFactorByAge(EIGEN_RIJEN)
    const partnerRijen = [0, 1, 2, 3, 4].map(k => ({ age: 32 + k, endPortfolio: 100_000 }))
    const fout = deflateRowsByAge(partnerRijen, opLeeftijd, ['endPortfolio'], 'real')
    expect(fout.every(r => r.endPortfolio === 100_000)).toBe(true)
  })

  it('slaat posities zonder factor over in plaats van er 1 te verzinnen', () => {
    // Een langere partnerreeks dan de eigen kernelrijen: de overtollige jaren
    // krijgen géén sleutel, zodat `deflateRowsByAge` ze ongemoeid laat (de
    // bestaande "geen factor → geen deflatie"-conventie) i.p.v. de laatste
    // bekende factor te hergebruiken.
    const factorByOffset = buildFactorByOffset(EIGEN_RIJEN)
    const langerePartnerReeks = [0, 1, 2, 3, 4, 5, 6].map(k => ({ age: 32 + k }))
    const map = factorMapByPosition(langerePartnerReeks, factorByOffset)
    expect(map.size).toBe(EIGEN_RIJEN.length)
    expect(map.has(38)).toBe(false)
  })
})

describe('K2 — de besteedbaar-lijn deflateert met de factor van het BRONJAAR', () => {
  it('gebruikt bij een op age+1 geplot punt de factor van age', () => {
    const factorByAge = buildFactorByAge(EIGEN_RIJEN)
    // `buildLiquidWealthPoints` plot de waarde van rij `age` op `age + 1`.
    const geplot: [number, number][] = EIGEN_RIJEN.map(r => [r.age + 1, 200_000])

    const metSleutel = deflatePoints(geplot, factorByAge, 'real', x => x - 1)
    const zonderSleutel = deflatePoints(geplot, factorByAge, 'real')

    EIGEN_RIJEN.forEach((rij, k) => {
      expect(metSleutel[k][1]).toBeCloseTo(200_000 / rij.inflationFactor, 6)
    })
    // Zonder de sleutel schuift alles één jaar op — en het laatste punt valt
    // buiten de map en blijft ongedeflateerd. Beide zijn onzichtbaar op het
    // scherm: de lijn ligt gewoon iets te hoog.
    expect(zonderSleutel[0][1]).not.toBeCloseTo(metSleutel[0][1], 6)
    expect(zonderSleutel[zonderSleutel.length - 1][1]).toBe(200_000)
  })
})
