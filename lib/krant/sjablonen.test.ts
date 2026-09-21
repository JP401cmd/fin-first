import { describe, expect, it } from 'vitest'
import {
  SJABLONEN,
  aantalVarianten,
  aowTekst,
  bandTekst,
  bereikTekst,
  datumTekst,
  eur,
  maandenTekst,
  renderSjabloon,
  slotsVan,
  stapTekst,
  variantVoor,
  veldenTekst,
  type SjabloonId,
} from './sjablonen'
import { vindWftOvertreding } from './wft-woordenlijst'

const IDS = Object.keys(SJABLONEN) as SjabloonId[]

/** Een gevuld slot per naam, zodat elk sjabloon te renderen is. */
const VOORBEELD_SLOTS: Record<string, string> = {
  spaargeld: bandTekst({ lo: 25_000, hi: 50_000 }),
  beleggingen: bandTekst({ lo: 0, hi: 25_000 }),
  partner: '',
  bedrag: bereikTekst({ lo: 38, hi: 100 }),
  richting: 'meer',
  jaar: '2027',
  inkomen: bandTekst({ lo: 2_500, hi: 3_250 }),
  geboortejaar: '1966',
  oud: aowTekst(67.25, 67.5),
  nieuw: aowTekst(67.5, 67.75),
  maanden: maandenTekst(3),
  schuld: bandTekst({ lo: 15_000, hi: 40_000 }),
  stap: stapTekst(0.25),
  velden: veldenTekst(['spaargeld', 'huishouden']),
  datum: datumTekst('2026-10-31'),
}

describe('sjablonen — catalogus', () => {
  it('elk sjabloon heeft minstens één formulering en elk slot is bekend', () => {
    for (const id of IDS) {
      expect(aantalVarianten(id), id).toBeGreaterThan(0)
      for (const slot of slotsVan(id)) expect(VOORBEELD_SLOTS[slot], `${id} gebruikt onbekend slot {${slot}}`).toBeDefined()
    }
  })

  it('elke formulering rendert met gevulde slots, zonder restant "{…}" en zonder € zonder bedrag', () => {
    for (const id of IDS) {
      for (let v = 0; v < aantalVarianten(id); v++) {
        const tekst = renderSjabloon(id, v, VOORBEELD_SLOTS)
        expect(tekst).not.toMatch(/\{[a-zA-Z]+\}/)
        // formatCurrency zet een NBSP tussen € en het bedrag; een € zonder bedrag erachter is een gat.
        expect(tekst).not.toMatch(/€(?![\s ]?\d)/)
      }
    }
  })

  it('geen formulering raakt de Wft-woordenlijst: geen gebiedende wijs, geen aanbieder, geen sparen-of-beleggen, alleen euro’s (B2)', () => {
    for (const id of IDS) {
      for (const tekst of SJABLONEN[id]) expect(vindWftOvertreding(tekst), `${id}: ${tekst}`).toBeNull()
    }
  })

  it('elke gevoeligheidsvorm zegt dat het geen voorspelling is (B5): de bank/rente is niet van de Krant', () => {
    for (const id of IDS.filter((i) => i.startsWith('gevoeligheid-'))) {
      for (const tekst of SJABLONEN[id]) expect(tekst, `${id}: ${tekst}`).toMatch(/staat hier niet|weet alleen jouw bank|opnieuw wordt vastgezet/i)
    }
  })

  it('een ontbrekend slot gooit in plaats van een gat te renderen', () => {
    expect(() => renderSjabloon('direct-box3', 0, {})).toThrow(/mist slot/)
    expect(() => renderSjabloon('relevant', 9)).toThrow(/geen variant/)
  })
})

describe('sjablonen — slot-helpers', () => {
  it('bedragen zijn hele euro’s via formatCurrency', () => {
    expect(eur(62.5)).toBe(eur(63))
    expect(eur(1234.4)).toMatch(/1\.234/)
    expect(eur(1234.4)).not.toMatch(/,/)
  })

  it('bandtekst: tot / van-tot / vanaf; bereiktekst: één bedrag, twee bedragen of minstens', () => {
    expect(bandTekst({ lo: 0, hi: 5_000 })).toMatch(/^minder dan /)
    expect(bandTekst({ lo: 25_000, hi: 50_000 })).toMatch(/ tot /)
    expect(bandTekst({ lo: 250_000, hi: null })).toMatch(/ of meer$/)
    expect(bandTekst({ lo: 0, hi: 0 })).toBe('geen')
    expect(bereikTekst({ lo: 0, hi: 107 })).toBe(`hoogstens ${eur(107)}`)
    expect(bereikTekst({ lo: 220, hi: 220 })).toBe(eur(220))
    expect(bereikTekst({ lo: 38, hi: 100 })).toBe(`${eur(38)} tot ${eur(100)}`)
    expect(bereikTekst({ lo: 3, hi: null })).toBe(`minstens ${eur(3)}`)
  })

  it('AOW-leeftijd via formatAowAge, maanden enkelvoud/meervoud, datum in het Nederlands', () => {
    expect(aowTekst(67.25, 67.25)).toBe('67 jaar en 3 maanden')
    expect(aowTekst(67.25, 67.5)).toBe('67 jaar en 3 maanden tot 67 jaar en 6 maanden')
    expect(maandenTekst(1)).toBe('1 maand')
    expect(maandenTekst(3)).toBe('3 maanden')
    expect(datumTekst('2026-10-31')).toBe('31 oktober 2026')
    expect(stapTekst(0.25)).toBe('0,25 procentpunt')
  })

  it('velden-tekst rijgt labels aaneen zonder dubbele', () => {
    expect(veldenTekst(['spaargeld'])).toBe('je spaargeld')
    expect(veldenTekst(['spaargeld', 'huishouden'])).toBe('je spaargeld en je huishouden')
    expect(veldenTekst(['spaargeld', 'beleggingen', 'huishouden', 'spaargeld'])).toBe('je spaargeld, je beleggingen en je huishouden')
  })

  it('de variant is deterministisch op het artikel-id en valt binnen het aantal formuleringen', () => {
    expect(variantVoor('direct-box3', 'a01')).toBe(variantVoor('direct-box3', 'a01'))
    const gezien = new Set<number>()
    for (let i = 0; i < 50; i++) gezien.add(variantVoor('direct-box3', `artikel-${i}`))
    expect([...gezien].every((v) => v >= 0 && v < aantalVarianten('direct-box3'))).toBe(true)
    expect(gezien.size).toBe(aantalVarianten('direct-box3'))
  })
})
