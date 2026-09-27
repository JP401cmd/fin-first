/**
 * De catalogus-tip "Huis kopen" volgt de kosten-koper-motor (FX-D punt 7).
 *
 * Given de motor `computeKostenKoper` (sinds `eef65045f`: vaste posten + indicatie
 *       advies/bemiddeling, optioneel een aankoopmakelaar),
 * When de catalogus bij `house_purchase` een bandbreedte en tip noemt,
 * Then komen die bedragen overeen met wat de motor rekent voor gangbare koopsommen
 *       (€250k–€600k, starter aan en uit, met en zonder NHG en aankoopmakelaar), en
 *       met de constanten die de motor leest. De oude tip ("ca. 5–6%", "€15K–€40K")
 *       dreef weg zodra de motor veranderde; deze test maakt die drift rood.
 *
 * De tekst zelf is statisch en zegt "ca.": hij rekent niets, de test pint hem.
 */
import { describe, it, expect } from 'vitest'
import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { computeKostenKoper } from '@/lib/kosten-koper'
import {
  KOSTEN_KOPER_AANKOOPMAKELAAR,
  KOSTEN_KOPER_ADVIES_BEMIDDELING,
  OVB_TARIEF_EIGEN_WONING,
  STARTERSVRIJSTELLING_MAX,
} from '@/lib/constants'

const KOOPSOM_MIN = 250_000
const KOOPSOM_MAX = 600_000
const STAP = 5_000

/** Alle motoruitkomsten over het raster van gangbare koopsommen en keuzes. */
function motorTotalen(): number[] {
  const totalen: number[] = []
  for (let prijs = KOOPSOM_MIN; prijs <= KOOPSOM_MAX; prijs += STAP) {
    for (const isStarter of [true, false]) {
      for (const hasNHG of [true, false]) {
        for (const metAankoopmakelaar of [true, false]) {
          totalen.push(computeKostenKoper({ aankoopprijs: prijs, isStarter, hasNHG, metAankoopmakelaar }).totaal)
        }
      }
    }
  }
  return totalen
}

/** "€5K–€21K" → [5000, 21000]. */
function bandInK(tekst: string): [number, number] {
  const m = tekst.match(/€(\d+)K–€(\d+)K/)
  expect(m, `geen bandbreedte in "${tekst}"`).not.toBeNull()
  return [Number(m![1]) * 1000, Number(m![2]) * 1000]
}

/** 2750 → "€2.750" (de schrijfwijze van de tip). */
const euro = (n: number) => `€${n.toLocaleString('nl-NL')}`

const entry = LIFE_EVENT_CATALOG.house_purchase
const tip = entry.tip ?? ''
const impactRange = entry.impactRange ?? ''

describe('catalogus Huis kopen — kosten koper volgt de motor', () => {
  const totalen = motorTotalen()
  const [laag, hoog] = [Math.min(...totalen), Math.max(...totalen)]
  const verwacht: [number, number] = [Math.round(laag / 1000) * 1000, Math.round(hoog / 1000) * 1000]

  it('de bandbreedte (impactRange) is het afgeronde min–max van de motor', () => {
    expect(impactRange).toContain('kosten koper')
    expect(bandInK(impactRange)).toEqual(verwacht)
  })

  it('de tip noemt dezelfde bandbreedte bij dezelfde koopsommen', () => {
    expect(bandInK(tip)).toEqual(verwacht)
    expect(tip).toContain(`${euro(KOOPSOM_MIN)}–${euro(KOOPSOM_MAX)}`)
    expect(tip).toMatch(/ca\. €\d+K–€\d+K/)
  })

  it('de tip noemt de posten met de bedragen die de motor leest', () => {
    expect(tip).toContain(`ca. ${euro(KOSTEN_KOPER_ADVIES_BEMIDDELING)} voor hypotheekadvies en bemiddeling`)
    expect(tip).toContain(`ca. ${euro(KOSTEN_KOPER_AANKOOPMAKELAAR)} als je een aankoopmakelaar neemt`)
    expect(tip).toContain(`overdrachtsbelasting (${OVB_TARIEF_EIGEN_WONING * 100}%`)
    expect(tip).toContain(`starters tot ${euro(STARTERSVRIJSTELLING_MAX)} vrijgesteld`)
    for (const post of ['notaris', 'taxatie', 'bankgarantie', 'NHG']) expect(tip).toContain(post)
  })

  it('de oude vuistregel is weg', () => {
    expect(tip).not.toMatch(/5–6%/)
    expect(impactRange).not.toBe('€15K–€40K kosten koper')
  })
})

describe('catalogus Huis kopen — het startbedrag volgt de motor', () => {
  /** De standaardwaarde van een catalogusveld van Huis kopen. */
  const veld = (key: string) => entry.fields?.find((f) => f.key === key)?.default

  it('given de velddefaults van Huis kopen, when een nieuwe gebeurtenis start, then is defaultCost wat computeKostenKoper daarmee rekent', () => {
    // Het startbedrag van een nieuwe gebeurtenis (EventPane, prefill, lokale extractie)
    // is defaultCost. Het verhaal rekent met dezelfde velddefaults via de motor; een los
    // bedrag ernaast spreekt de motor tegen zodra die verandert.
    const verwachtTotaal = computeKostenKoper({
      aankoopprijs: Number(veld('aankoopprijs')),
      isStarter: veld('eersteWoning') === true,
      hasNHG: veld('nhg') === true,
    }).totaal
    expect(entry.defaultCost).toBe(verwachtTotaal)
  })

  it('valt binnen de bandbreedte die de catalogus noemt', () => {
    const [laag, hoog] = bandInK(impactRange)
    expect(entry.defaultCost).toBeGreaterThanOrEqual(laag - 500)
    expect(entry.defaultCost).toBeLessThanOrEqual(hoog + 500)
  })
})

describe('Huis kopen — één set standaardantwoorden (eindreview 27 sep)', () => {
  it('catalogusvelden, het verhaal en het startbedrag gebruiken HUIS_KOPEN_STANDAARD_INVOER', async () => {
    const { HUIS_KOPEN_STANDAARD_INVOER } = await import('@/lib/kosten-koper')
    const { defaultStoryAnswers } = await import('@/lib/life-event-stories')
    const veldDefault = (key: string) => entry.fields?.find((f) => f.key === key)?.default
    expect(veldDefault('aankoopprijs')).toBe(HUIS_KOPEN_STANDAARD_INVOER.aankoopprijs)
    expect(veldDefault('eersteWoning')).toBe(HUIS_KOPEN_STANDAARD_INVOER.isStarter)
    expect(veldDefault('nhg')).toBe(HUIS_KOPEN_STANDAARD_INVOER.hasNHG)
    const verhaal = defaultStoryAnswers('house_purchase')
    expect(verhaal.koopprijs).toBe(HUIS_KOPEN_STANDAARD_INVOER.aankoopprijs)
    expect(verhaal.starter).toBe(HUIS_KOPEN_STANDAARD_INVOER.isStarter)
    expect(verhaal.nhg).toBe(HUIS_KOPEN_STANDAARD_INVOER.hasNHG)
    expect(entry.defaultCost).toBe(computeKostenKoper(HUIS_KOPEN_STANDAARD_INVOER).totaal)
  })
})
