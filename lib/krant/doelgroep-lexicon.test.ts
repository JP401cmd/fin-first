import { describe, it, expect } from 'vitest'
import {
  DOELGROEP_LEXICON,
  KWALIFICATIE_WOORDEN,
  dektEenWoord,
  dektWaarde,
  heeftWaardeLexicon,
  normaliseerVoorLexicon,
} from './doelgroep-lexicon'
import { DOELGROEP_SLEUTELS, DOELGROEP_SLEUTEL_LIJST, doelgroepWaarden } from './profiel-velden'

describe('doelgroep-lexicon — volledige dekking (de test die rood wordt bij een nieuwe sleutel)', () => {
  it('heeft voor elke doelgroepsleutel een ingang met domeinwoorden', () => {
    expect(Object.keys(DOELGROEP_LEXICON).sort()).toEqual([...DOELGROEP_SLEUTEL_LIJST].sort())
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      expect(DOELGROEP_LEXICON[sleutel].sleutel.length, sleutel).toBeGreaterThan(0)
      for (const woord of DOELGROEP_LEXICON[sleutel].sleutel) expect(woord.trim(), sleutel).not.toBe('')
    }
  })

  it('heeft voor elke waarde van een keuze-/meerkeuzeveld kwalificerende woorden', () => {
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      if (!heeftWaardeLexicon(sleutel)) continue
      const verwacht = [...doelgroepWaarden(sleutel)].sort()
      expect(Object.keys(DOELGROEP_LEXICON[sleutel].waarden).sort(), sleutel).toEqual(verwacht)
      for (const waarde of verwacht) {
        const woorden = DOELGROEP_LEXICON[sleutel].waarden[waarde]
        expect(woorden.length, `${sleutel}/${waarde}`).toBeGreaterThan(0)
        // Elk woord moet ook ECHT een woord zijn. Een lege string zou hier
        // fail-OPEN gaan: `dektEenWoord` doet `tekst.includes('')` → altijd
        // true, dus G6 staat voor die waarde stil uit, en in `g6Fout` is
        // `!grondslag.includes('')` altijd false. Onzichtbaar en de verkeerde
        // kant op (eindreview 1F fase 2, L1). Zelfde toets als op sleutelniveau.
        for (const woord of woorden) expect(woord.trim(), `${sleutel}/${waarde}`).not.toBe('')
      }
    }
  })

  it('geeft jaartal- en bandvelden bewust géén waardelijst (het getal valt onder G1)', () => {
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      if (heeftWaardeLexicon(sleutel)) continue
      expect(DOELGROEP_LEXICON[sleutel].waarden, sleutel).toEqual({})
      expect(DOELGROEP_SLEUTELS[sleutel].soort === 'jaartal' || DOELGROEP_SLEUTELS[sleutel].soort === 'band').toBe(true)
    }
  })
})

describe('matchen', () => {
  it('normaliseert aan beide kanten en matcht op deelstring', () => {
    const tekst = normaliseerVoorLexicon('Woninghuur   stijgt gemiddeld met 4,4 procent')
    expect(dektEenWoord(tekst, DOELGROEP_LEXICON.wonen.sleutel)).toBe(true)
    expect(dektEenWoord(tekst, DOELGROEP_LEXICON.wonen.waarden['huur-sociaal'])).toBe(false)
    expect(dektEenWoord(tekst, DOELGROEP_LEXICON.wonen.waarden['huur-vrije-sector'])).toBe(false)
  })

  it('KWALIFICATIE_WOORDEN is de ontdubbelde verzameling van alle waardeniveaus', () => {
    expect(KWALIFICATIE_WOORDEN).toContain('vrije sector')
    expect(KWALIFICATIE_WOORDEN).toContain('zzp')
    // Brede domeinwoorden horen hier NIET in: die zouden elke samenvatting degraderen.
    expect(KWALIFICATIE_WOORDEN).not.toContain('huishouden')
    expect(KWALIFICATIE_WOORDEN).not.toContain('inkomen')
    expect(new Set(KWALIFICATIE_WOORDEN).size).toBe(KWALIFICATIE_WOORDEN.length)
  })
})

describe('dektWaarde — het tegendeel van een andere waarde is geen dekking', () => {
  // Generieke eigenschap over het hele lexicon, zodat een nieuwe waarde of
  // woord het vanzelf meekrijgt: staat een woord van waarde A als deelstring in
  // een woord van waarde B ("hypotheek" ⊂ "zonder hypotheek"), dan dekt een
  // tekst die alléén dat B-woord bevat waarde A niet.
  it('geen waarde wordt gedekt door alleen een woord van een andere waarde dat het hare bevat', () => {
    let gevallen = 0
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      const waarden = DOELGROEP_LEXICON[sleutel].waarden
      for (const [a, woordenA] of Object.entries(waarden)) {
        for (const [b, woordenB] of Object.entries(waarden)) {
          if (a === b) continue
          for (const y of woordenB) {
            const ny = normaliseerVoorLexicon(y)
            const bevatA = woordenA.some((x) => normaliseerVoorLexicon(x) !== ny && ny.includes(normaliseerVoorLexicon(x)))
            if (!bevatA) continue
            gevallen++
            expect(dektWaarde(`dit gaat over ${ny} en verder niets`, sleutel, a), `${sleutel}: ${a} via '${y}' (${b})`).toBe(false)
          }
        }
      }
    }
    // Zes paren bij het schrijven (28 sep 2026) plus de minderjarigen-vormen
    // met "18 jaar"; valt dit naar 0, dan test deze eigenschap niets meer.
    expect(gevallen).toBeGreaterThan(6)
  })

  it('"kinderen tot 18 jaar" dekt de jongste-waarden en niet alleen-18-plus', () => {
    const tekst = normaliseerVoorLexicon('Voor kinderen tot 18 jaar betaalt u geen eigen risico.')
    for (const w of ['jongste-0-3', 'jongste-4-11', 'jongste-12-17']) expect(dektWaarde(tekst, 'kinderen', w), w).toBe(true)
    expect(dektWaarde(tekst, 'kinderen', 'alleen-18-plus')).toBe(false)
    expect(dektWaarde(normaliseerVoorLexicon('Kinderen van 18 jaar en ouder betalen wel.'), 'kinderen', 'alleen-18-plus')).toBe(true)
  })

  it('een echte vermelding naast het tegendeel blijft tellen', () => {
    const tekst = normaliseerVoorLexicon('Met een hypotheek verandert de aftrek; zonder hypotheek niet.')
    expect(dektWaarde(tekst, 'wonen', 'koop-met-hypotheek')).toBe(true)
    expect(dektWaarde(tekst, 'wonen', 'koop-zonder-hypotheek')).toBe(true)
  })
})
