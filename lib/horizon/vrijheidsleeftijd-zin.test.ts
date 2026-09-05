/**
 * Tests voor de gedeelde vrijheidsleeftijd-zin (bevinding S15).
 *
 * Twee dingen worden hier vastgepind, en het tweede is de eigenlijke winst:
 *
 * 1. **De nieuwe duidingsregel** op /toekomst — alle vier de toestanden
 *    (leeftijd · al vrij · onbekend/onhaalbaar · nog aan het rekenen), plus de
 *    pensioen- en perspectiefvariant.
 * 2. **De ontdubbeling.** De varianten `kaart` en `inline` moeten byte-voor-byte
 *    reproduceren wat vóór S15 hardgecodeerd in `toekomst-welcome.tsx` en
 *    `toekomst-overlay.tsx` stond. Die twee suites draaien ongewijzigd door en
 *    zijn het echte bewijs; deze tests pinnen de strings hier vast zodat een
 *    latere wijziging niet stilzwijgend één oppervlak laat weglopen.
 *
 * De afronding komt uit `heroFireAgeYear` — dezelfde functie als het kopgetal
 * van de hero-KPI. Dat is geen detail: zou de zin anders afronden, dan stond er
 * "rond je 53e" pal onder een KPI die 54 toont.
 */

import { describe, it, expect } from 'vitest'
import { buildVrijheidsleeftijdZin } from './vrijheidsleeftijd-zin'
import { heroFireAgeYear, formatHeroFireAge } from './hero-fire-age'

describe('buildVrijheidsleeftijdZin — de duidingsregel op /toekomst', () => {
  it('vertaalt het kerngetal naar een zin', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 53.4 })
    expect(zin.kind).toBe('leeftijd')
    expect(zin.text).toBe('Dit betekent: werken wordt voor jou een keuze rond je 53e.')
    expect(zin.ageLabel).toBe('53e')
  })

  it('spreekt in pensioenmodus over het pensioen, niet over een keuze', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 67.2, isPensioen: true })
    expect(zin.text).toBe('Dit betekent: je pensioen valt rond je 67e.')
  })

  it('zegt bij al-bereikte vrijheid dat het nú al geldt, zonder leeftijd', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 41, framing: 'free' })
    expect(zin.kind).toBe('nu-al')
    expect(zin.ageLabel).toBeNull()
    expect(zin.text).toBe('Werken is voor jou nu al een keuze.')
  })

  it('zegt bij een ingegaan pensioen dat het pensioen loopt', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 68, framing: 'free', anchor: { kind: 'aow' } })
    expect(zin.kind).toBe('nu-al')
    expect(zin.text).toBe('Je pensioen is ingegaan — werken is nu een keuze.')
  })

  it('valt terug op de opbouwzin zonder leeftijd — nooit "rond je undefined"', () => {
    for (const age of [null, Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      const zin = buildVrijheidsleeftijdZin({ freedomAge: age as number | null })
      expect(zin.kind, String(age)).toBe('onbekend')
      expect(zin.ageLabel, String(age)).toBeNull()
      expect(zin.text, String(age)).toBe(
        'Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.',
      )
    }
  })

  it('rendert niets zolang de kernel nog rekent', () => {
    // Een flits van "vrijheid nog niet in zicht" die een seconde later een
    // leeftijd wordt, leest als een fout.
    const zin = buildVrijheidsleeftijdZin({ freedomAge: null, pending: true })
    expect(zin.kind).toBe('berekenen')
    expect(zin.text).toBe('')
  })
})

describe('buildVrijheidsleeftijdZin — perspectiefweergave (D3)', () => {
  it('noemt het onderwerp bij naam en schakelt naar de derde persoon', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 55.6, subjectName: 'Huishouden' })
    expect(zin.text).toBe(
      'Dit betekent: voor Huishouden wordt werken een keuze rond het 56e jaar.',
    )
  })

  it('doet dat ook in pensioenmodus', () => {
    const zin = buildVrijheidsleeftijdZin({
      freedomAge: 67,
      isPensioen: true,
      subjectName: 'Anne',
    })
    expect(zin.text).toBe('Dit betekent: voor Anne valt het pensioen rond het 67e jaar.')
  })

  it('gebruikt de eigen framing niet wanneer de zin over iemand anders gaat', () => {
    // "Werken is voor jou nu al een keuze" mag niet onder een huishoud-KPI staan.
    const zin = buildVrijheidsleeftijdZin({
      freedomAge: 52,
      framing: 'free',
      subjectName: 'Huishouden',
    })
    expect(zin.kind).toBe('leeftijd')
    expect(zin.text).toContain('voor Huishouden')
  })

  it('negeert een lege naam', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 53, subjectName: '  ' })
    expect(zin.text).toBe('Dit betekent: werken wordt voor jou een keuze rond je 53e.')
  })
})

describe('afronding — één regel voor de zin én het kopgetal', () => {
  it('rondt met heroFireAgeYear, dus nooit een jaar naast de KPI', () => {
    for (const age of [53.4, 53.5, 53.6, 66.9]) {
      const jaar = heroFireAgeYear(age)
      const kpi = formatHeroFireAge({ status: 'definitief', age, bron: 'kernel' })
      expect(buildVrijheidsleeftijdZin({ freedomAge: age }).ageLabel, String(age)).toBe(`${jaar}e`)
      // Wat de KPI toont en wat de zin zegt is per constructie hetzelfde getal.
      expect(kpi, String(age)).toBe(String(jaar))
    }
  })
})

describe('ontdubbeling — de bestaande oppervlakken houden hun woorden', () => {
  it("variant 'kaart' reproduceert de belofte-zin van de welkomstkaart", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 65, variant: 'kaart' })
    expect(zin.lead).toBe('Werken wordt voor jou een keuze rond je ')
    expect(zin.ageLabel).toBe('65e')
    expect(zin.tail).toBe('.')
  })

  it("variant 'kaart' draagt de AOW-nuance in het label", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 65, isPensioen: true, variant: 'kaart' })
    expect(zin.lead).toBe('Werken wordt voor jou een keuze rond je ')
    expect(zin.ageLabel).toBe('65e (AOW-leeftijd)')
  })

  it("variant 'kaart' houdt dezelfde fallback-zin", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: null, variant: 'kaart' })
    expect(zin.text).toBe('Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.')
  })

  it("variant 'inline' reproduceert de overlay-samenvatting", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 65, variant: 'inline' })
    expect(zin.lead).toBe('werken wordt een keuze rond je ')
    expect(zin.ageLabel).toBe('65e')
    expect(zin.tail).toBe('')
  })

  it("variant 'inline' draagt de AOW-nuance in de lead", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 65, isPensioen: true, variant: 'inline' })
    expect(zin.lead).toBe('je pensioen valt rond je ')
    expect(zin.ageLabel).toBe('65e')
  })

  it("variant 'inline' houdt 'vrijheid nog niet in zicht'", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: null, variant: 'inline' })
    expect(zin.text).toBe('vrijheid nog niet in zicht')
  })
})
