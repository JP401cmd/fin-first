import { describe, expect, it } from 'vitest'
import { toekomstAnkerregel, type AnkerregelInput } from './ankerregel'
import { katernAnkerregel } from '@/lib/horizon/katern-copy'
import { ankerVrijZin } from '@/lib/horizon/anker-copy'

/**
 * De ankerregel in de /toekomst-kop (ADR 0179 D2, spec §4.2 regel 1): welke regel, bij
 * welke stand. De tekst wordt vastgepind tegen de canonieke kopij (`katernAnkerregel`,
 * `ankerVrijZin`), niet opnieuw geformuleerd.
 */

const BASIS: AnkerregelInput = {
  isFixedAnchorMode: false,
  ankerStop: null,
  heroFireAge: { status: 'definitief', age: 52.3 },
  currentAge: 41,
  heeftGeboortedatum: true,
  perspectief: false,
}

describe('toekomstAnkerregel — solved ("zo vroeg mogelijk")', () => {
  it('"Vrij mogelijk vanaf je 52e." uit dezelfde leeftijd als KPI 1', () => {
    const stand = toekomstAnkerregel(BASIS)
    expect(stand).toEqual({ kind: 'tekst', tekst: 'Vrij mogelijk vanaf je 52e.' })
    expect(stand).toEqual({
      kind: 'tekst',
      tekst: katernAnkerregel({ kind: 'solved', solvedFireAge: 52.3, currentAge: 41 }),
    })
  })

  it('een voorlopig getal telt ook (zelfde getal als KPI 1)', () => {
    expect(toekomstAnkerregel({ ...BASIS, heroFireAge: { status: 'voorlopig', age: 52.3 } })).toEqual({
      kind: 'tekst',
      tekst: 'Vrij mogelijk vanaf je 52e.',
    })
  })

  it('onbereikbaar = de canonieke nul-tak', () => {
    expect(toekomstAnkerregel({ ...BASIS, heroFireAge: { status: 'onbekend', age: null } })).toEqual({
      kind: 'tekst',
      tekst: ankerVrijZin({ solvedFireAge: null, currentAge: 41, stop: { kind: 'now' } }),
    })
  })

  it('zonder geboortedatum geen regel — dezelfde poort als de server-oordeelzin', () => {
    expect(toekomstAnkerregel({ ...BASIS, heeftGeboortedatum: false })).toEqual({ kind: 'geen' })
    expect(
      toekomstAnkerregel({ ...BASIS, heeftGeboortedatum: false, heroFireAge: { status: 'onbekend', age: null } }),
    ).toEqual({ kind: 'geen' })
  })

  it('rekent de kernel nog, dan ruimte vasthouden; een gegevensprobleem zegt de kop niet', () => {
    expect(toekomstAnkerregel({ ...BASIS, heroFireAge: { status: 'berekenen', age: null } })).toEqual({ kind: 'wacht' })
    expect(toekomstAnkerregel({ ...BASIS, heroFireAge: { status: 'ongeldig', age: 100 } })).toEqual({ kind: 'geen' })
  })
})

describe('toekomstAnkerregel — vast anker', () => {
  const VAST: AnkerregelInput = {
    ...BASIS,
    isFixedAnchorMode: true,
    ankerStop: { kind: 'age', stopAge: 60 },
    heroFireAge: { status: 'definitief', age: 88 },
  }

  it('"Je rekent met stoppen op 60." — nooit het bereik of het dekkingspercentage', () => {
    const stand = toekomstAnkerregel(VAST)
    expect(stand).toEqual({ kind: 'tekst', tekst: 'Je rekent met stoppen op 60.' })
    expect(stand).toEqual({ kind: 'tekst', tekst: katernAnkerregel({ kind: 'vast', stop: { kind: 'age', stopAge: 60 } }) })
  })

  it('nu-anker: "Je rekent alsof je nu stopt."', () => {
    expect(toekomstAnkerregel({ ...VAST, ankerStop: { kind: 'now' } })).toEqual({
      kind: 'tekst',
      tekst: 'Je rekent alsof je nu stopt.',
    })
  })

  it('een vast anker is een instelling: ook zonder geboortedatum', () => {
    expect(toekomstAnkerregel({ ...VAST, heeftGeboortedatum: false })).toEqual({
      kind: 'tekst',
      tekst: 'Je rekent met stoppen op 60.',
    })
  })

  it('zonder stopmoment uit de run: wachten zolang de kernel rekent, anders geen regel', () => {
    expect(
      toekomstAnkerregel({ ...VAST, ankerStop: null, heroFireAge: { status: 'berekenen', age: null } }),
    ).toEqual({ kind: 'wacht' })
    expect(toekomstAnkerregel({ ...VAST, ankerStop: null })).toEqual({ kind: 'geen' })
  })
})

describe('toekomstAnkerregel — perspectief (C1 punt 3)', () => {
  it('in de huishouden- of partnerweergave geen regel: KPI 1 toont daar het perspectief-cijfer', () => {
    expect(toekomstAnkerregel({ ...BASIS, perspectief: true })).toEqual({ kind: 'geen' })
    expect(
      toekomstAnkerregel({
        ...BASIS,
        perspectief: true,
        isFixedAnchorMode: true,
        ankerStop: { kind: 'age', stopAge: 60 },
      }),
    ).toEqual({ kind: 'geen' })
    // Ook niet "wachten": er komt in dit perspectief geen eigen regel.
    expect(
      toekomstAnkerregel({ ...BASIS, perspectief: true, heroFireAge: { status: 'berekenen', age: null } }),
    ).toEqual({ kind: 'geen' })
  })
})
