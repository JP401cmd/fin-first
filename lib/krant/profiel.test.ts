import { describe, expect, it } from 'vitest'
import { DOELGROEP_SLEUTELS, DOELGROEP_SLEUTEL_LIJST, PROFIEL_VELD_AANTAL } from './profiel-velden'
import {
  BELEGGINGEN_BANDEN,
  HYPOTHEEK_RESTSCHULD_BANDEN,
  INKOMEN_BANDEN,
  LEEG_PROFIEL,
  SPAARGELD_BANDEN,
  STUDIESCHULD_BANDEN,
  nieuwsprofielV1Schema,
  profielType,
  profielWaarde,
  type Band,
} from './profiel'
import { PROFIEL_DAAN, PROFIEL_TESSA } from './editie.fixture'

function isAaneengesloten(banden: Record<string, Band>, volgorde: readonly string[]) {
  let vorige: number | null = 0
  for (const sleutel of volgorde) {
    const band = banden[sleutel]
    expect(band, `band ${sleutel} ontbreekt`).toBeDefined()
    if (band.hi != null) expect(band.hi).toBeGreaterThanOrEqual(band.lo)
    if (vorige != null) expect(band.lo).toBe(vorige)
    vorige = band.hi
  }
  expect(vorige, 'de bovenste band is open').toBeNull()
}

describe('profiel — banden', () => {
  it('elke bandwaarde van de bandvelden heeft een band en de banden sluiten aan (halfopen, bovenste open)', () => {
    isAaneengesloten(INKOMEN_BANDEN, DOELGROEP_SLEUTELS.inkomen.waarden)
    isAaneengesloten(HYPOTHEEK_RESTSCHULD_BANDEN, DOELGROEP_SLEUTELS.hypotheek_restschuld.waarden)
    isAaneengesloten(SPAARGELD_BANDEN, DOELGROEP_SLEUTELS.spaargeld.waarden)
    isAaneengesloten(BELEGGINGEN_BANDEN, DOELGROEP_SLEUTELS.beleggingen.waarden.filter((w) => w !== 'geen'))
    isAaneengesloten(STUDIESCHULD_BANDEN, DOELGROEP_SLEUTELS.schulden.waarden.filter((w) => w.startsWith('studieschuld')))
  })

  it('"geen" beleggingen is de lege band', () => {
    expect(BELEGGINGEN_BANDEN.geen).toEqual({ lo: 0, hi: 0 })
  })
})

describe('profiel — schema', () => {
  it('het lege profiel is geldig: "weet ik niet" is overal toegestaan', () => {
    expect(nieuwsprofielV1Schema.safeParse(LEEG_PROFIEL).success).toBe(true)
  })

  it('de persona-profielen zijn geldig', () => {
    expect(nieuwsprofielV1Schema.safeParse(PROFIEL_DAAN).success).toBe(true)
    expect(nieuwsprofielV1Schema.safeParse(PROFIEL_TESSA).success).toBe(true)
  })

  it('weigert een onbekende bandsleutel, een onbekend veld en een uitgavenband (B2)', () => {
    expect(nieuwsprofielV1Schema.safeParse({ ...LEEG_PROFIEL, spaargeld: 'tot-10k' }).success).toBe(false)
    expect(nieuwsprofielV1Schema.safeParse({ ...LEEG_PROFIEL, onbekend: 1 }).success).toBe(false)
    expect(nieuwsprofielV1Schema.safeParse({ ...LEEG_PROFIEL, uitgaven: 'tot-2000' }).success).toBe(false)
  })

  it('telt dertien velden naast de versie (B2)', () => {
    expect(Object.keys(LEEG_PROFIEL).length - 1).toBe(PROFIEL_VELD_AANTAL)
  })

  it('profielWaarde dekt elke doelgroepsleutel en geeft null op een leeg profiel', () => {
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) expect(profielWaarde(LEEG_PROFIEL, sleutel)).toBeNull()
    expect(profielWaarde(PROFIEL_TESSA, 'hypotheek_rentevast')).toBe('variabel')
    expect(profielWaarde(PROFIEL_TESSA, 'beleggingen_vorm')).toEqual(['fondsen', 'crypto', 'tweede-woning'])
  })
})

describe('profiel — profielType', () => {
  it('typeert zonder id en zonder bedrag, deterministisch op het peiljaar', () => {
    expect(profielType(PROFIEL_DAAN, 2026)).toBe('onder-35·wonen-onbekend·alleen')
    expect(profielType(PROFIEL_TESSA, 2026)).toBe('35-49·koop·partner')
    expect(profielType(LEEG_PROFIEL, 2026)).toBe('leeftijd-onbekend·wonen-onbekend·partner-onbekend')
    expect(profielType(PROFIEL_DAAN, 2036)).toBe('35-49·wonen-onbekend·alleen')
  })
})
