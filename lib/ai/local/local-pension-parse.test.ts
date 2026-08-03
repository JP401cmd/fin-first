import { describe, it, expect } from 'vitest'
import {
  parseDutchAmount,
  toMaandbedrag,
  parseLocalPensionBlock,
  normalizeLocalRegeling,
  isAowRegeling,
  BRUTO_MAAND_MAX,
  INGANG_LEEFTIJD_MIN,
  INGANG_LEEFTIJD_MAX,
  type RawLocalRegeling,
} from './local-pension-parse'
import { NL_AOW_AGE } from '@/lib/constants'

/** Basis-regeling met alles ingevuld; per test overschrijf je één veld. */
function raw(overrides: Partial<RawLocalRegeling> = {}): RawLocalRegeling {
  return {
    leeg: false,
    fondsNaam: 'Pensioenfonds Zorg en Welzijn',
    bedrag: '1.234,56',
    periode: 'maand',
    ingangLeeftijd: '67',
    geindexeerd: true,
    type: 'ouderdomspensioen',
    ...overrides,
  }
}

describe('parseDutchAmount — NL-notatie deterministisch in TS, niet in het model', () => {
  it('leest Nederlandse notatie met duizendtalpunt en decimaalkomma', () => {
    expect(parseDutchAmount('1.234,56')).toBe(1234.56)
    expect(parseDutchAmount('€ 1.234,56')).toBe(1234.56)
    expect(parseDutchAmount('€1.234,56 bruto per maand')).toBe(1234.56)
  })

  it('leest een punt met drie cijfers erachter als duizendtal, niet als decimaal', () => {
    expect(parseDutchAmount('1.234')).toBe(1234)
    expect(parseDutchAmount('1.234.567')).toBe(1234567)
  })

  it('leest Engelse notatie via de "laatste separator is decimaal"-regel', () => {
    expect(parseDutchAmount('1,234.56')).toBe(1234.56)
    expect(parseDutchAmount('1234.56')).toBe(1234.56)
  })

  it('leest losse decimalen en hele getallen', () => {
    expect(parseDutchAmount('12,5')).toBe(12.5)
    expect(parseDutchAmount('850')).toBe(850)
    expect(parseDutchAmount(850)).toBe(850)
  })

  it('neemt het minteken over en geeft null zonder cijfers', () => {
    expect(parseDutchAmount('-1.234,56')).toBe(-1234.56)
    expect(parseDutchAmount('onbekend')).toBeNull()
    expect(parseDutchAmount('')).toBeNull()
    expect(parseDutchAmount(null)).toBeNull()
  })
})

describe('toMaandbedrag — jaar→maand hoort in de code, niet in de prompt', () => {
  it('deelt een jaarbedrag deterministisch door twaalf', () => {
    expect(toMaandbedrag(12000, 'jaar')).toEqual({ maandbedrag: 1000, periodeOnbekend: false })
    expect(toMaandbedrag(12000, 'per jaar')).toEqual({ maandbedrag: 1000, periodeOnbekend: false })
  })

  it('laat een maandbedrag ongemoeid', () => {
    expect(toMaandbedrag(1000, 'maand')).toEqual({ maandbedrag: 1000, periodeOnbekend: false })
    expect(toMaandbedrag(1000, 'per mnd')).toEqual({ maandbedrag: 1000, periodeOnbekend: false })
  })

  it('gokt NIET bij een onbekende periode maar markeert het als onzeker', () => {
    expect(toMaandbedrag(1000, null)).toEqual({ maandbedrag: 1000, periodeOnbekend: true })
    expect(toMaandbedrag(1000, 'onduidelijk')).toEqual({ maandbedrag: 1000, periodeOnbekend: true })
  })
})

describe('parseLocalPensionBlock — modeltekst → ruwe velden', () => {
  it('leest een kaal JSON-object', () => {
    const out = parseLocalPensionBlock(
      '{"fondsNaam":"ABP","bedrag":"€ 850,00","periode":"maand","ingangLeeftijd":68,"geindexeerd":false,"type":"ouderdomspensioen"}',
    )
    // `bedrag` blijft BEWUST de ruwe tekst inclusief euroteken: de notatie is
    // informatie die parseDutchAmount hierna interpreteert, niet het model.
    expect(out).toMatchObject({
      fondsNaam: 'ABP',
      bedrag: '€ 850,00',
      periode: 'maand',
      ingangLeeftijd: '68',
    })
  })

  it('overleeft markdown-fences en een <think>-preamble (gedeelde faalmodi)', () => {
    const out = parseLocalPensionBlock(
      '<think>even kijken</think>\n```json\n{"fondsNaam":"ABP","bedrag":"850","periode":"maand"}\n```',
    )
    expect(out?.fondsNaam).toBe('ABP')
  })

  it('herkent het expliciete lege antwoord', () => {
    expect(parseLocalPensionBlock('{"leeg": true}')?.leeg).toBe(true)
  })

  it('geeft null bij onbruikbare uitvoer (fail-closed)', () => {
    expect(parseLocalPensionBlock('ik weet het niet')).toBeNull()
    expect(parseLocalPensionBlock('')).toBeNull()
  })
})

describe('normalizeLocalRegeling — sanity-checks markeren buiten-bereik als onbekend', () => {
  it('levert een schone regeling zonder onzekere velden', () => {
    const out = normalizeLocalRegeling(raw())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.regeling).toEqual({
      fondsNaam: 'Pensioenfonds Zorg en Welzijn',
      brutoBedrag: 1234.56,
      ingangLeeftijd: 67,
      isGeindexeerd: true,
      type: 'ouderdomspensioen',
    })
    expect(out.onzeker).toEqual([])
  })

  it('rekent een jaarbedrag om naar een maandbedrag', () => {
    const out = normalizeLocalRegeling(raw({ bedrag: '12.000', periode: 'jaar' }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.regeling.brutoBedrag).toBe(1000)
  })

  it('wijst een bedrag boven de bovengrens af — dat is een leesfout, geen pensioen', () => {
    const out = normalizeLocalRegeling(raw({ bedrag: String(BRUTO_MAAND_MAX + 1), periode: 'maand' }))
    expect(out).toEqual({ ok: false, reden: 'bedrag-buiten-bereik' })
  })

  it('wijst nul en negatieve bedragen af', () => {
    expect(normalizeLocalRegeling(raw({ bedrag: '0' }))).toEqual({ ok: false, reden: 'bedrag-buiten-bereik' })
    expect(normalizeLocalRegeling(raw({ bedrag: '-100' }))).toEqual({ ok: false, reden: 'bedrag-buiten-bereik' })
  })

  it('geeft "geen-bedrag" wanneer er geen getal in zit', () => {
    expect(normalizeLocalRegeling(raw({ bedrag: 'onbekend' }))).toEqual({ ok: false, reden: 'geen-bedrag' })
  })

  it('markeert een ingangsleeftijd buiten [55,75] als onbekend en verzint niets', () => {
    for (const buiten of [String(INGANG_LEEFTIJD_MIN - 1), String(INGANG_LEEFTIJD_MAX + 1), '2024', null]) {
      const out = normalizeLocalRegeling(raw({ ingangLeeftijd: buiten }))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      // Terugval op de CANONIEKE constante, plus een zichtbaar 'minder zeker'.
      expect(out.regeling.ingangLeeftijd).toBe(NL_AOW_AGE)
      expect(out.onzeker).toContain('ingangLeeftijd')
    }
  })

  it('markeert een onbekende periode als onzeker bedrag i.p.v. te gokken', () => {
    const out = normalizeLocalRegeling(raw({ periode: null }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.onzeker).toContain('brutoBedrag')
  })

  it('markeert een ontbrekende fondsnaam en een onbekend type', () => {
    const out = normalizeLocalRegeling(raw({ fondsNaam: null, type: 'iets anders' }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.regeling.fondsNaam).toBe('Onbekende uitvoerder')
    expect(out.regeling.type).toBe('overig')
    expect(out.onzeker).toEqual(expect.arrayContaining(['fondsNaam', 'type']))
  })

  it('herkent typevarianten die het model schrijft', () => {
    const nabestaanden = normalizeLocalRegeling(raw({ type: 'partnerpensioen' }))
    expect(nabestaanden.ok && nabestaanden.regeling.type).toBe('nabestaandenpensioen')
    expect(nabestaanden.ok && nabestaanden.onzeker).not.toContain('type')
  })

  it('slaat een expliciet leeg blok over', () => {
    expect(normalizeLocalRegeling(raw({ leeg: true }))).toEqual({ ok: false, reden: 'leeg' })
  })
})

describe('isAowRegeling — AOW is een eigen veld, geen pensioenpot', () => {
  it('herkent de AOW-varianten', () => {
    expect(isAowRegeling('AOW')).toBe(true)
    expect(isAowRegeling('Sociale Verzekeringsbank')).toBe(true)
    expect(isAowRegeling('SVB')).toBe(true)
  })

  it('houdt gewone fondsen erbuiten', () => {
    expect(isAowRegeling('ABP')).toBe(false)
    expect(isAowRegeling('Pensioenfonds Zorg en Welzijn')).toBe(false)
    expect(isAowRegeling(null)).toBe(false)
  })
})
