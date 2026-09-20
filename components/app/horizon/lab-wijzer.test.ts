import { describe, expect, it } from 'vitest'
import { fractieUitPunt, hoekVanFractie, snapNaarStap, standUitVinger } from './lab-wijzer'

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

/**
 * De greep is 44 px en de boog op een telefoon ~200 px lang: je pakt 'm routineus een tiende
 * van het bereik naast het hart. `standUitVinger` houdt dat pakpunt vast zonder dat een
 * uiteinde onbereikbaar wordt — vandaar een afbeelding per helft in plaats van één offset.
 */
describe('standUitVinger', () => {
  it('laat de stand staan waar je hem vastpakte', () => {
    expect(standUitVinger(0.54, 0.54, 0.5)).toBeCloseTo(0.5, 6)
    expect(standUitVinger(0.2, 0.2, 0.9)).toBeCloseTo(0.9, 6)
  })

  it('houdt beide uiteinden bereikbaar, ook bij een scheef pakpunt', () => {
    expect(standUitVinger(1, 0.54, 0.5)).toBe(1)
    expect(standUitVinger(0, 0.54, 0.5)).toBe(0)
  })

  /**
   * De greep steekt bij een stand vlak bij een uiteinde ónder de boog uit, en daar leest
   * `fractieUitPunt` verzadigd 0 of 1. Zónder `PAK_MARGE` viel de afbeelding dan terug op
   * `(f / pak) * stand` met plafond `stand`: de gebruiker kon vanaf 95 jaar alleen nog omlaag
   * draaien, nooit naar 100. Deze twee regels beten niet op de oude code en dekten precies de
   * hoek waarvoor de functie geschreven is.
   */
  it('houdt het uiteinde bereikbaar als het pakpunt zelf op dat uiteinde leest', () => {
    expect(standUitVinger(1, 1, 0.92), 'het maximum mag nooit onbereikbaar worden').toBe(1)
    expect(standUitVinger(0, 0, 0.08), 'het minimum evenmin').toBe(0)
  })

  it('loopt ook in die hoek monotoon op, zonder sprong onderweg', () => {
    const stappen = [0.9, 0.95, 0.98, 0.99, 1].map((f) => standUitVinger(f, 1, 0.92))
    for (let i = 1; i < stappen.length; i++) expect(stappen[i]).toBeGreaterThan(stappen[i - 1])
    expect(stappen[stappen.length - 1]).toBe(1)
  })

  it('beweegt dezelfde kant op als de vinger, zonder sprong', () => {
    const stappen = [0, 0.2, 0.4, 0.54, 0.7, 0.9, 1].map((f) => standUitVinger(f, 0.54, 0.5))
    for (let i = 1; i < stappen.length; i++) expect(stappen[i]).toBeGreaterThan(stappen[i - 1])
  })

  it('klemt een vinger buiten de boog op het uiteinde', () => {
    expect(standUitVinger(1.4, 0.54, 0.5)).toBe(1)
    expect(standUitVinger(-0.3, 0.54, 0.5)).toBe(0)
  })

  it('volgt de vinger vrijwel één-op-één wanneer stand en pakpunt samen op een uiteinde liggen', () => {
    // Pakpunt én stand op 0: er valt niets bij te trekken, dus de knop volgt de vinger. De
    // marge maakt dat niet exact 1-op-1, maar het verschil blijft onder een procent bereik.
    expect(standUitVinger(0.5, 0, 0)).toBeCloseTo(0.5, 1)
    expect(standUitVinger(0, 0, 0)).toBe(0)
    expect(standUitVinger(1, 0, 0)).toBe(1)
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
