import { describe, it, expect } from 'vitest'
import { buildBelastingHubOpening } from './hub-opening-copy'
import { buildBelastingBoxCards } from './box-cards'
import { buildTaxOverview } from '@/lib/tax-overview'
import { box3StatusVerdict } from '@/lib/box3-taxable-input'

/**
 * Bevinding H22 — de hub-opening beloofde "Drie boxen, één rekening" / "Drie
 * boxen, één som", terwijl het hero-totaal by design twee boxen optelt (Box 2
 * blijft buiten de hub-berekening, BEL-1). Voor een DGA viel daarmee de duurste
 * post buiten het getal dat "totale druk" heet.
 *
 * Eigenaarsbesluit 26-08-2026 = optie B: het ontwerp blijft, de tekst gaat
 * kloppen. Deze suite pint die belofte niet op zichzelf, maar TEGEN de
 * canonieke samenstelling: het telwoord moet gelijk zijn aan het aantal kaarten
 * dat `buildBelastingBoxCards` bouwt, en het aantal "rekeningen" aan het aantal
 * boxen dat `buildTaxOverview` daadwerkelijk optelt.
 *
 * HERSCHREVEN BIJ DE KOP-HERZIENING (sep 2026). De hub-aanhef is nu een
 * `PageVerdictOpening`: titel = "Belasting | <Box 3-oordeel>", dus de kop
 * draagt geen telwoord meer en er is geen `kicker`/`titleBefore`/`emphasis`
 * meer om op te pinnen. De H22-belofte is verplaatst naar de EERSTE ZIN VAN DE
 * DECK (en de colophon); dezelfde assertions draaien daarom nu op `deck`. Wat
 * deze suite bewaakt is onveranderd: de opening mag niet méér boxen beloven dan
 * de pagina optelt.
 */

const TELWOORD: Record<string, number> = { Twee: 2, Drie: 3 }

const CARD_INPUT = {
  box1Tax: 33_575,
  box1Status: 'good' as const,
  box1StatusText: 'Ruimte benut',
  box3Tax: 599,
  box3Status: 'good' as const,
  box3StatusText: box3StatusVerdict('good'),
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
  const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang })
  const cards = buildBelastingBoxCards({ ...CARD_INPUT, hasAanmerkelijkBelang })

  it('het telwoord in de deck is het aantal box-kaarten op het scherm', () => {
    const match = opening.deck.match(/^(\w+) boxen/)
    expect(match).not.toBeNull()
    expect(TELWOORD[match![1]!]).toBe(cards.length)
  })

  it('het aantal rekeningen in de deck is niet groter dan wat het totaal optelt', () => {
    const telt = opgeteldeBoxen()
    if (cards.length === telt) {
      expect(opening.deck).toContain('één rekening')
    } else {
      // Er staat een box op het scherm die het totaal niet meetelt: de opening
      // mag dan geen enkele som beloven.
      expect(opening.deck).toContain('twee rekeningen')
      expect(opening.deck).not.toContain('één rekening')
    }
  })

  it('de colophon onderaan draagt dezelfde belofte als de deck', () => {
    // De deck opent met "<Telwoord> boxen, <N> rekening(en): …".
    expect(opening.deck.startsWith(`${opening.colophon}:`)).toBe(true)
  })

  it('belooft nergens meer "drie boxen, één som"', () => {
    const tekst = `${opening.deck} ${opening.colophon}`.toLowerCase()
    expect(tekst).not.toContain('drie boxen, één som')
    expect(tekst).not.toContain('drie boxen, één rekening')
  })

  it('houdt de vrijheids-framing overeind', () => {
    expect(opening.deck).toContain('vrijheidstijd')
  })

  it('de deck blijft kort — twee zinnen, ~20 woorden', () => {
    expect(opening.deck.split(/\s+/).length).toBeLessThanOrEqual(24)
    // Twee zinnen: precies twee eindpunten.
    expect(opening.deck.match(/\./g)?.length).toBe(2)
  })

  it('legt uit waar de kop-zin op slaat', () => {
    // De kop-zin volgt de Box 3-stand; de tweede deck-zin legt uit wat die stand
    // bepaalt, zodat de lezer niet denkt dat het over alle boxen gaat.
    expect(opening.deck).toContain('Box 3-vermogen boven de vrijstelling')
  })

  it('gebruikt het woord "oordeel" niet (eenvoud-check B-071)', () => {
    expect(opening.deck.toLowerCase()).not.toMatch(/\boordeel/)
  })

  it('spoort nergens aan (Wft: beschrijven mag, aansporen niet)', () => {
    const tekst = opening.deck.toLowerCase()
    for (const aansporing of ['optimaliseer', 'benut je', 'zorg dat', 'verlaag je']) {
      expect(tekst).not.toContain(aansporing)
    }
  })

  it('gebruikt geen koop-/verkoopmetafoor voor vrijheid (ADR 0165)', () => {
    const tekst = `${opening.deck} ${opening.colophon}`.toLowerCase()
    for (const verboden of ['terugkopen', 'vrijgekocht', 'gekochte', 'verkochte']) {
      expect(tekst).not.toContain(verboden)
    }
  })
})

describe('belasting-hub-opening — Box 2 wordt benoemd waar hij speelt', () => {
  it('noemt Box 2 in de deck zodra er aanmerkelijk belang is', () => {
    const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang: true })
    expect(opening.deck).toContain('Box 2')
  })

  it('noemt Box 2 niet wanneer die box niet in beeld is', () => {
    const opening = buildBelastingHubOpening({ hasAanmerkelijkBelang: false })
    expect(opening.deck).not.toContain('Box 2')
  })
})
