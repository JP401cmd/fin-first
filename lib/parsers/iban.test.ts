import { describe, it, expect } from 'vitest'
import { extractIbanFromText, isValidIban } from './iban'

// UR3-02: de afgeleide tegenrekening bepaalt of een transactie als
// eigen-rekening-verschuiving landt, en dus of hij uit de uitgaven en de
// spaarquote verdwijnt. Een verkeerd geraden IBAN is daarmee net zo schadelijk
// als een gemiste — deze suite pint beide remmen vast.

describe('isValidIban', () => {
  it('accepteert een geldig controlegetal', () => {
    expect(isValidIban('NL91ABNA0417164300')).toBe(true)
    expect(isValidIban('NL20INGB0001234567')).toBe(true)
  })

  it('normaliseert spaties en kleine letters', () => {
    expect(isValidIban('nl91 abna 0417 1643 00')).toBe(true)
  })

  it('wijst een gemanipuleerd controlegetal af', () => {
    expect(isValidIban('NL92ABNA0417164300')).toBe(false)
  })

  it('wijst iets af dat de IBAN-vorm niet heeft', () => {
    expect(isValidIban('FACTUUR2026001')).toBe(false)
    expect(isValidIban('NL91')).toBe(false)
    expect(isValidIban('')).toBe(false)
  })
})

describe('extractIbanFromText', () => {
  it('haalt de tegenrekening uit een omschrijving met één IBAN', () => {
    expect(
      extractIbanFromText('NL20INGB0001234567 J. Smit Spaarrekening'),
    ).toBe('NL20INGB0001234567')
  })

  it('normaliseert naar hoofdletters zonder spaties', () => {
    expect(extractIbanFromText('overboeking naar nl20ingb0001234567')).toBe('NL20INGB0001234567')
  })

  it('sluit de eigen rekening uit — die kan de tegenpartij niet zijn', () => {
    // Alleen de dragende rekening staat in de tekst: dan is er geen tegenpartij
    // om af te leiden, en mag er zeker geen "eigen overboeking" van gemaakt worden.
    expect(
      extractIbanFromText('NL44RABO0123456789 eigen rekening', ['NL44 RABO 0123456789']),
    ).toBeNull()
  })

  it('vindt de tegenrekening ook als de eigen rekening ernaast staat', () => {
    expect(
      extractIbanFromText('Van NL44RABO0123456789 naar NL20INGB0001234567', ['NL44RABO0123456789']),
    ).toBe('NL20INGB0001234567')
  })

  it('geeft niets terug bij twee kandidaten — raden is hier gevaarlijker dan missen', () => {
    expect(
      extractIbanFromText('NL20INGB0001234567 en NL02SNSB0900123456'),
    ).toBeNull()
  })

  it('laat de gespatieerde schrijfwijze bewust liggen — liever missen dan plakken', () => {
    // Vastgepind gedrag, geen wens: witruimte weggooien over de hele tekst
    // plakt net zo makkelijk het volgende woord aan de IBAN vast. Zie de noot
    // in extractIbanFromText.
    expect(extractIbanFromText('Overboeking NL20 INGB 0001 2345 67 spaarrekening')).toBeNull()
  })

  it('telt dezelfde IBAN die twee keer voorkomt als één kandidaat', () => {
    expect(
      extractIbanFromText('NL20INGB0001234567 ref NL20INGB0001234567'),
    ).toBe('NL20INGB0001234567')
  })

  it('negeert ruis met een ongeldig controlegetal', () => {
    expect(extractIbanFromText('Referentie NL99XXXX1234567890 factuur')).toBeNull()
  })

  it('geeft niets terug bij lege of ontbrekende tekst', () => {
    expect(extractIbanFromText('')).toBeNull()
    expect(extractIbanFromText(null)).toBeNull()
    expect(extractIbanFromText(undefined)).toBeNull()
  })
})
