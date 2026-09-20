import { describe, expect, it } from 'vitest'
import { fractieUitPunt, hoekVanFractie, snapNaarStap } from './lab-wijzer'

/**
 * Het bolletje op de boog draait op HOEK t.o.v. het middelpunt. Die omgekeerde weg is waar
 * het mis kan gaan: onder de as bestaat de boog niet, en een stap als 0,5 jaar mag geen
 * float-ruis opleveren.
 */
describe('fractieUitPunt', () => {
  it('legt links, boven en rechts op 0, 0,5 en 1', () => {
    expect(fractieUitPunt(-80, 0)).toBeCloseTo(0, 5)
    expect(fractieUitPunt(0, 80)).toBeCloseTo(0.5, 5)
    expect(fractieUitPunt(80, 0)).toBeCloseTo(1, 5)
  })

  it('is de omgekeerde van hoekVanFractie', () => {
    for (const f of [0, 0.15, 0.4, 0.75, 1]) {
      const hoek = (hoekVanFractie(f) * Math.PI) / 180
      expect(fractieUitPunt(Math.cos(hoek) * 80, Math.sin(hoek) * 80)).toBeCloseTo(f, 5)
    }
  })

  it('valt onder de as naar het dichtstbijzijnde uiteinde, niet naar de overkant', () => {
    expect(fractieUitPunt(-40, -60)).toBe(0)
    expect(fractieUitPunt(40, -60)).toBe(1)
  })
})

describe('snapNaarStap', () => {
  const bereik = { min: 36, max: 100, stap: 0.5 }

  it('snapt op de stap zonder float-ruis', () => {
    expect(snapNaarStap(62.3, bereik)).toBe(62.5)
    expect(snapNaarStap(62.1, bereik)).toBe(62)
  })

  it('klemt op de grenzen van het bereik', () => {
    expect(snapNaarStap(12, bereik)).toBe(36)
    expect(snapNaarStap(180, bereik)).toBe(100)
  })

  it('werkt met een grove stap in euro, geteld vanaf het minimum zoals de browser', () => {
    expect(snapNaarStap(1_037, { min: -1_050, max: 1_050, stap: 50 })).toBe(1_050)
    expect(snapNaarStap(24, { min: -1_050, max: 1_050, stap: 50 })).toBe(0)
    expect(snapNaarStap(-274, { min: -1_050, max: 1_050, stap: 50 })).toBe(-250)
  })
})
