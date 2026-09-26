import { describe, it, expect } from 'vitest'
import { computeKostenKoper } from './kosten-koper'
import {
  STARTERSVRIJSTELLING_MAX,
  NHG_KOSTENGRENS,
  KOSTEN_KOPER_NOTARIS,
  KOSTEN_KOPER_TAXATIE,
  KOSTEN_KOPER_ADVIES_BEMIDDELING,
  KOSTEN_KOPER_AANKOOPMAKELAAR,
} from './constants'
import { LIFE_EVENT_CATALOG } from './horizon-data'

const VAST = KOSTEN_KOPER_NOTARIS + KOSTEN_KOPER_TAXATIE // notaris + taxatie = 1700
const ADVIES = KOSTEN_KOPER_ADVIES_BEMIDDELING // altijd meegeteld = 2750

describe('computeKostenKoper — overdrachtsbelasting & startersvrijstelling (2026)', () => {
  it('starter onder de grens (€520.000): OVB €0', () => {
    const r = computeKostenKoper({ aankoopprijs: 520000, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(0)
    // bankgarantie 0,1% = €520; totaal = 0 + 1200 + 500 + 520 + 0
    expect(r.bankgarantie).toBe(520)
    expect(r.vastePosten).toBe(VAST + 520)
    expect(r.totaal).toBe(VAST + 520 + ADVIES)
  })

  it('starter net BOVEN de grens (€560.000): OVB 2% = €11.200 (grens is €555.000, niet €510.000)', () => {
    const r = computeKostenKoper({ aankoopprijs: 560000, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(11200)
    expect(r.vastePosten).toBe(11200 + VAST + 560)
    expect(r.totaal).toBe(11200 + VAST + 560 + ADVIES)
  })

  it('starter exact op de grens (€555.000): nog vrijgesteld (≤)', () => {
    const r = computeKostenKoper({ aankoopprijs: STARTERSVRIJSTELLING_MAX, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(0)
  })

  it('niet-starter: altijd 2% overdrachtsbelasting', () => {
    const r = computeKostenKoper({ aankoopprijs: 400000, isStarter: false, hasNHG: false })
    expect(r.overdracht).toBe(8000)
    expect(r.vastePosten).toBe(8000 + VAST + 400)
    expect(r.totaal).toBe(8000 + VAST + 400 + ADVIES)
  })
})

describe('computeKostenKoper — NHG borgtochtprovisie 0,4% (2026)', () => {
  it('NHG onder de grens (€450.000): wél provisie 0,4% = €1.800', () => {
    const r = computeKostenKoper({ aankoopprijs: 450000, isStarter: true, hasNHG: true })
    expect(r.nhgKosten).toBe(1800)
    // starter dus overdracht 0; totaal = 1200 + 500 + 450 (bankgarantie) + 1800
    expect(r.vastePosten).toBe(VAST + 450 + 1800)
    expect(r.totaal).toBe(VAST + 450 + 1800 + ADVIES)
  })

  it('NHG exact op de grens (€470.000): provisie = €1.880', () => {
    const r = computeKostenKoper({ aankoopprijs: NHG_KOSTENGRENS, isStarter: true, hasNHG: true })
    expect(r.nhgKosten).toBe(1880)
  })

  it('NHG boven de grens (€480.000): geen provisie', () => {
    const r = computeKostenKoper({ aankoopprijs: 480000, isStarter: false, hasNHG: true })
    expect(r.nhgKosten).toBe(0)
  })

  it('zonder NHG: geen provisie ongeacht prijs', () => {
    const r = computeKostenKoper({ aankoopprijs: 300000, isStarter: true, hasNHG: false })
    expect(r.nhgKosten).toBe(0)
  })
})

describe('computeKostenKoper — degeneratie & robuustheid', () => {
  it('prijs 0: alleen vaste kosten (notaris + taxatie) + adviesindicatie', () => {
    const r = computeKostenKoper({ aankoopprijs: 0, isStarter: true, hasNHG: true })
    expect(r.vastePosten).toBe(VAST)
    expect(r.totaal).toBe(VAST + ADVIES)
    expect(r.overdracht).toBe(0)
    expect(r.bankgarantie).toBe(0)
    expect(r.nhgKosten).toBe(0)
  })

  it('negatieve / niet-eindige prijs wordt geklemd op 0', () => {
    expect(computeKostenKoper({ aankoopprijs: -100000, isStarter: false, hasNHG: false }).totaal).toBe(VAST + ADVIES)
    expect(computeKostenKoper({ aankoopprijs: NaN, isStarter: false, hasNHG: true, metAankoopmakelaar: true }).totaal).toBe(
      VAST + ADVIES + KOSTEN_KOPER_AANKOOPMAKELAAR,
    )
  })

  it('totaal is altijd de som van de posten', () => {
    const r = computeKostenKoper({ aankoopprijs: 600000, isStarter: false, hasNHG: true })
    expect(r.vastePosten).toBe(r.overdracht + r.notaris + r.taxatie + r.bankgarantie + r.nhgKosten)
    expect(r.indicatieOverig).toBe(r.adviesBemiddeling + r.aankoopmakelaar)
    expect(r.totaal).toBe(r.vastePosten + r.indicatieOverig)
  })
})

describe('computeKostenKoper — indicatie overig: advies & aankoopmakelaar (2026)', () => {
  // Eigenaarsbesluit 26 sep 2026: "vaste posten + indicatie overig". Voorbeeld
  // uit de aanleiding: €400.000 zonder starter, zonder NHG — oud €10.100.
  it('€400.000, geen starter, geen NHG, geen makelaar: €10.100 vast + €2.750 advies = €12.850', () => {
    const r = computeKostenKoper({ aankoopprijs: 400000, isStarter: false, hasNHG: false })
    expect(r.vastePosten).toBe(10100)
    expect(r.adviesBemiddeling).toBe(2750)
    expect(r.aankoopmakelaar).toBe(0)
    expect(r.indicatieOverig).toBe(2750)
    expect(r.totaal).toBe(12850)
  })

  it('zelfde koop mét aankoopmakelaar: + €3.500 = €16.350', () => {
    const r = computeKostenKoper({ aankoopprijs: 400000, isStarter: false, hasNHG: false, metAankoopmakelaar: true })
    expect(r.vastePosten).toBe(10100)
    expect(r.aankoopmakelaar).toBe(3500)
    expect(r.indicatieOverig).toBe(6250)
    expect(r.totaal).toBe(16350)
  })

  it('metAankoopmakelaar weggelaten ≡ false (bestaande aanroepers blijven gelijk)', () => {
    const zonder = computeKostenKoper({ aankoopprijs: 500000, isStarter: true, hasNHG: true })
    const expliciet = computeKostenKoper({ aankoopprijs: 500000, isStarter: true, hasNHG: true, metAankoopmakelaar: false })
    expect(zonder).toEqual(expliciet)
  })

  // Elke tak aan beide uiteinden: starter aan/uit × NHG aan/uit × makelaar aan/uit.
  // Vaste posten mogen NIET bewegen door de makelaar-schakelaar; de indicatie
  // overig mag NIET bewegen door starter/NHG.
  const prijzen = [0, 300000, NHG_KOSTENGRENS, STARTERSVRIJSTELLING_MAX, 600000]
  for (const aankoopprijs of prijzen) {
    for (const isStarter of [false, true]) {
      for (const hasNHG of [false, true]) {
        it(`prijs ${aankoopprijs}, starter ${isStarter}, NHG ${hasNHG}: makelaar telt precies €3.500 op`, () => {
          const uit = computeKostenKoper({ aankoopprijs, isStarter, hasNHG, metAankoopmakelaar: false })
          const aan = computeKostenKoper({ aankoopprijs, isStarter, hasNHG, metAankoopmakelaar: true })
          expect(aan.vastePosten).toBe(uit.vastePosten)
          expect(aan.overdracht).toBe(uit.overdracht)
          expect(aan.nhgKosten).toBe(uit.nhgKosten)
          expect(uit.adviesBemiddeling).toBe(KOSTEN_KOPER_ADVIES_BEMIDDELING)
          expect(aan.adviesBemiddeling).toBe(KOSTEN_KOPER_ADVIES_BEMIDDELING)
          expect(uit.aankoopmakelaar).toBe(0)
          expect(aan.aankoopmakelaar).toBe(KOSTEN_KOPER_AANKOOPMAKELAAR)
          expect(aan.totaal - uit.totaal).toBe(KOSTEN_KOPER_AANKOOPMAKELAAR)
          expect(uit.totaal).toBe(uit.vastePosten + KOSTEN_KOPER_ADVIES_BEMIDDELING)
        })
      }
    }
  }
})

describe('Woontip-teksten 2026 (lib/horizon-data.ts)', () => {
  it('belegger/tweede-woning-tip noemt 8% overdrachtsbelasting (niet 10,4%)', () => {
    const tip = LIFE_EVENT_CATALOG.holiday_home_purchase.tip
    expect(tip).toContain('8%')
    expect(tip).not.toContain('10,4%')
  })

  it('starter-tip noemt de €555.000-grens', () => {
    const starterVeld = LIFE_EVENT_CATALOG.house_purchase.fields?.find(f => f.key === 'eersteWoning')
    expect(starterVeld?.tip).toContain('€555.000')
    expect(starterVeld?.tip).not.toContain('€510.000')
  })

  it('NHG-tip noemt €470.000 en 0,4% (niet €435.000 / 0,6%)', () => {
    const nhgVeld = LIFE_EVENT_CATALOG.house_purchase.fields?.find(f => f.key === 'nhg')
    expect(nhgVeld?.tip).toContain('€470.000')
    expect(nhgVeld?.tip).toContain('0,4%')
    expect(nhgVeld?.tip).not.toContain('€435.000')
    expect(nhgVeld?.tip).not.toContain('0,6%')
  })

  it('RVU-tip noemt €2.357 (drempelvrijstelling) en €2.657 (knelsituatie)', () => {
    const tip = LIFE_EVENT_CATALOG.early_retirement.tip
    expect(tip).toContain('€2.357')
    expect(tip).toContain('€2.657')
    expect(tip).not.toContain('€2.182')
  })
})
