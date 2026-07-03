import { describe, it, expect } from 'vitest'
import { computeKostenKoper } from './kosten-koper'
import {
  STARTERSVRIJSTELLING_MAX,
  NHG_KOSTENGRENS,
  KOSTEN_KOPER_NOTARIS,
  KOSTEN_KOPER_TAXATIE,
} from './constants'
import { LIFE_EVENT_CATALOG } from './horizon-data'

const VAST = KOSTEN_KOPER_NOTARIS + KOSTEN_KOPER_TAXATIE // notaris + taxatie = 1700

describe('computeKostenKoper — overdrachtsbelasting & startersvrijstelling (2026)', () => {
  it('starter onder de grens (€520.000): OVB €0', () => {
    const r = computeKostenKoper({ aankoopprijs: 520000, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(0)
    // bankgarantie 0,1% = €520; totaal = 0 + 1200 + 500 + 520 + 0
    expect(r.bankgarantie).toBe(520)
    expect(r.totaal).toBe(VAST + 520)
  })

  it('starter net BOVEN de grens (€560.000): OVB 2% = €11.200 (grens is €555.000, niet €510.000)', () => {
    const r = computeKostenKoper({ aankoopprijs: 560000, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(11200)
    expect(r.totaal).toBe(11200 + VAST + 560)
  })

  it('starter exact op de grens (€555.000): nog vrijgesteld (≤)', () => {
    const r = computeKostenKoper({ aankoopprijs: STARTERSVRIJSTELLING_MAX, isStarter: true, hasNHG: false })
    expect(r.overdracht).toBe(0)
  })

  it('niet-starter: altijd 2% overdrachtsbelasting', () => {
    const r = computeKostenKoper({ aankoopprijs: 400000, isStarter: false, hasNHG: false })
    expect(r.overdracht).toBe(8000)
    expect(r.totaal).toBe(8000 + VAST + 400)
  })
})

describe('computeKostenKoper — NHG borgtochtprovisie 0,4% (2026)', () => {
  it('NHG onder de grens (€450.000): wél provisie 0,4% = €1.800', () => {
    const r = computeKostenKoper({ aankoopprijs: 450000, isStarter: true, hasNHG: true })
    expect(r.nhgKosten).toBe(1800)
    // starter dus overdracht 0; totaal = 1200 + 500 + 450 (bankgarantie) + 1800
    expect(r.totaal).toBe(VAST + 450 + 1800)
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
  it('prijs 0: alleen vaste kosten (notaris + taxatie)', () => {
    const r = computeKostenKoper({ aankoopprijs: 0, isStarter: true, hasNHG: true })
    expect(r.totaal).toBe(VAST)
    expect(r.overdracht).toBe(0)
    expect(r.bankgarantie).toBe(0)
    expect(r.nhgKosten).toBe(0)
  })

  it('negatieve / niet-eindige prijs wordt geklemd op 0', () => {
    expect(computeKostenKoper({ aankoopprijs: -100000, isStarter: false, hasNHG: false }).totaal).toBe(VAST)
    expect(computeKostenKoper({ aankoopprijs: NaN, isStarter: false, hasNHG: true }).totaal).toBe(VAST)
  })

  it('totaal is altijd de som van de posten', () => {
    const r = computeKostenKoper({ aankoopprijs: 600000, isStarter: false, hasNHG: true })
    expect(r.totaal).toBe(r.overdracht + r.notaris + r.taxatie + r.bankgarantie + r.nhgKosten)
  })
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
