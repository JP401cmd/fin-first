import { describe, it, expect } from 'vitest'
import { buildBelastingHubOpening } from './hub-opening-copy'
import { buildBelastingBoxCards } from './box-cards'
import { buildTaxOverview } from '@/lib/tax-overview'

/**
 * Bevinding H22 — de hub-opening beloofde "Drie boxen, één rekening" / "Drie
 * boxen, één som", terwijl het hero-totaal by design twee boxen optelt (Box 2
 * blijft buiten de hub-berekening, BEL-1). Voor een DGA viel daarmee de duurste
 * post buiten het getal dat "totale druk" heet.
 *
 * Eigenaarsbesluit 26-08-2026 = optie B: het ontwerp blijft, de tekst gaat
 * kloppen. Deze suite pint die belofte niet op zichzelf, maar TEGEN de
 * canonieke samenstelling: het telwoord in de kop moet gelijk zijn aan het
 * aantal kaarten dat `buildBelastingBoxCards` bouwt, en het aantal "rekeningen"
 * aan het aantal boxen dat `buildTaxOverview` daadwerkelijk optelt. Zo kan de
 * kop niet stilletjes wegdriften van wat de pagina toont of telt.
 */

const TELWOORD: Record<string, number> = { Twee: 2, Drie: 3 }

const CARD_INPUT = {
  box1Tax: 33_575,
  box1Status: 'good' as const,
  box1StatusText: 'Ruimte benut',
  box3Tax: 599,
  box3Status: 'good' as const,
  box3StatusText: 'Geen actie nodig',
}

/** Zoals de hub 'm bouwt: Box 2 gaat als `null` de aggregator in (BEL-1). */
function hubOverview() {
  return buildTaxOverview({
    box1Tax: CARD_INPUT.box1Tax,
    box2Tax: null,
    box3Tax: CARD_INPUT.box3Tax,
    effectiveRate: null,
    marginalRate: null,
    dailyExpenses: 100,
  })
}

/** Aantal boxen dat daadwerkelijk in `total` zit (niet-nul bijdragen). */
function opgeteldeBoxen() {
  const { box1Tax, box2Tax, box3Tax } = hubOverview()
  return [box1Tax, box2Tax, box3Tax].filter((v) => v > 0).length
}

describe.each([
  { hasAanmerkelijkBelang: false, label: 'zonder aanmerkelijk belang' },
  { hasAanmerkelijkBelang: true, label: 'met aanmerkelijk belang' },
])('belasting-hub-opening — $label', ({ hasAanmerkelijkBelang }) => {
  const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang, year: 2026 })
  const cards = buildBelastingBoxCards({ ...CARD_INPUT, hasAanmerkelijkBelang })

  it('het telwoord in de kop is het aantal box-kaarten op het scherm', () => {
    const match = opening.titleBefore.match(/^(\w+) boxen/)
    expect(match).not.toBeNull()
    expect(TELWOORD[match![1]]).toBe(cards.length)
  })

  it('het aantal rekeningen in de kop is niet groter dan wat het totaal optelt', () => {
    const telt = opgeteldeBoxen()
    if (cards.length === telt) {
      expect(opening.titleBefore).toContain('één rekening')
    } else {
      // Er staat een box op het scherm die het totaal niet meetelt: de kop mag
      // dan geen enkele som beloven.
      expect(opening.titleBefore).toContain('twee rekeningen')
      expect(opening.titleBefore).not.toContain('één rekening')
    }
  })

  it('de colophon onderaan draagt dezelfde belofte als de kop', () => {
    // `titleBefore` = "<Telwoord> boxen, <N> rekening(en) — betaald in ".
    expect(opening.titleBefore.startsWith(`${opening.colophon} —`)).toBe(true)
  })

  it('belooft nergens meer "drie boxen, één som"', () => {
    const tekst = `${opening.titleBefore}${opening.emphasis}${opening.titleAfter} ${opening.deck} ${opening.colophon}`
    expect(tekst.toLowerCase()).not.toContain('drie boxen, één som')
    expect(tekst.toLowerCase()).not.toContain('drie boxen, één rekening')
  })

  it('houdt de vrijheids-framing en de kicker overeind', () => {
    expect(opening.emphasis).toBe('vrijheid')
    expect(opening.kicker).toBe('De vierde hefboom · Belasting 2026')
    expect(opening.deck).toContain('vrijheidstijd')
  })
})

describe('belasting-hub-opening — Box 2 wordt benoemd waar hij speelt', () => {
  it('noemt Box 2 in de deck zodra er aanmerkelijk belang is', () => {
    const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang: true, year: 2026 })
    expect(opening.deck).toContain('Box 2')
  })

  it('noemt Box 2 niet wanneer die box niet in beeld is', () => {
    const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang: false, year: 2026 })
    expect(opening.deck).not.toContain('Box 2')
    expect(opening.titleBefore).not.toContain('Box 2')
  })
})
