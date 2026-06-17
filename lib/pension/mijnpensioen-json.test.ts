/**
 * Unit-tests voor de deterministische mijnpensioen.nl-JSON-mapper
 * (lib/pension/mijnpensioen-json.ts).
 *
 * De fixture is volledig SYNTHETISCH (verzonnen uitvoerders/nummers/bedragen)
 * en bootst alleen de STRUCTUUR van de echte export na — nooit echte data.
 *
 * Dekking:
 *  1. Pot-per-uitvoerder      — #regelingen = #unieke uitvoerders in levenslang blok; namen kloppen
 *  2. Gegarandeerd+indicatief — optellen → brutoBedrag (/12 afgerond) + " (deels indicatief)"-suffix
 *  3. ingangLeeftijd          — vroegste blok waar uitvoerder voorkomt (niet het levenslang-blok)
 *  4. AOW samenwonend≠alleen   — beide === Math.round(jaar/12) van het juiste veld
 *  5. Ontbrekende secties      — geen Details → lege regelingen + null AOW, geen throw
 *  6. parseMijnpensioenJson    — '999' → ok:false; ongeldige JSON → ok:false; '000' → ok:true; OntbrekendePuvs in melding
 *  7. 0-bedragen/lege uitvoerders worden overgeslagen
 *  8. Alle regeling-types === 'ouderdomspensioen'
 *  9. Nabestaandenpensioen best-effort — met/zonder partnerblok
 */

import { describe, it, expect } from 'vitest'
import {
  parseMijnpensioenJson,
  mijnpensioenJsonToParseResult,
} from '@/lib/pension/mijnpensioen-json'

// ── Synthetische fixture ─────────────────────────────────────────────────────
// Drie levenslange uitvoerders + een AOW-blok + een vroeg blok dat Fonds Alfa's
// ingangsleeftijd op 65 zet. Bedragen zijn deelbaar-genoeg om de /12-afronding
// scherp te kunnen asserten.
//
// Jaarbedragen (TeBereiken):
//   Fonds Alfa  — gegarandeerd 14400/jaar  → 1200/maand   (alleen gegarandeerd)
//   Fonds Beta  — indicatief    7200/jaar  →  600/maand   (alleen indicatief)
//   Fonds Gamma — gegarandeerd  9000 + indicatief 3000 = 12000/jaar → 1000/maand
// AOW:
//   samenwonend  16800/jaar → 1400/maand
//   alleenstaand 24000/jaar → 2000/maand

function buildFixture() {
  return {
    StatusCode: '000',
    Bijzonderheden: [],
    OntbrekendePuvsError: [],
    Totalen: { TeBereiken: 33600 },
    Details: {
      OuderdomsPensioenDetails: {
        OuderdomsPensioen: [
          // Vroeg blok vanaf leeftijd 65 — bevat Fonds Alfa (gegarandeerd).
          // Dit zet Alfa's vroegste ingangsleeftijd op 65, ook al staat 'ie ook
          // in het levenslange blok (vanaf 67).
          {
            Van: { Leeftijd: { Jaren: 65, Maanden: 0 } },
            Tot: { Leeftijd: { Jaren: 67, Maanden: 0 } },
            Pensioen: [
              {
                TeBereiken: 14400,
                Opgebouwd: 9000,
                PensioenUitvoerder: 'Fonds Alfa',
                HerkenningsNummer: 'ALF-001',
              },
            ],
          },
          // AOW-blok (eerste blok met een AOW-veld).
          {
            Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
            Tot: { Leeftijd: { Jaren: 67, Maanden: 3 } },
            AOW: {
              AOWDetailsOpbouw: {
                TeBereikenSamenwonend: 16800,
                TeBereikenAlleenstaand: 24000,
              },
            },
          },
          // LEVENSLANG blok (Tot.OuderdomsPensioenEvent === 'Overlijden').
          {
            Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
            Tot: { OuderdomsPensioenEvent: 'Overlijden' },
            Pensioen: [
              {
                TeBereiken: 14400,
                Opgebouwd: 9000,
                PensioenUitvoerder: 'Fonds Alfa',
                HerkenningsNummer: 'ALF-001',
              },
              {
                TeBereiken: 9000,
                Opgebouwd: 6000,
                PensioenUitvoerder: 'Fonds Gamma',
                HerkenningsNummer: 'GAM-003',
              },
            ],
            IndicatiefPensioen: [
              {
                TeBereiken: 7200,
                Opgebouwd: 4000,
                PensioenUitvoerder: 'Fonds Beta',
                HerkenningsNummer: 'BET-002',
              },
              {
                TeBereiken: 3000,
                Opgebouwd: 1500,
                PensioenUitvoerder: 'Fonds Gamma',
                HerkenningsNummer: 'GAM-003',
              },
            ],
          },
        ],
      },
      PartnerPensioenDetails: {
        PartnerPensioen: [
          {
            Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
            Tot: { PartnerEvent: 'Overlijden' },
            Pensioen: [
              {
                PensioenUitvoerder: 'Fonds Alfa',
                Bedragen: { VerzekerdBedragNaPens: 6000, OpgebouwdBedragNaPens: 4000 },
              },
              {
                PensioenUitvoerder: 'Fonds Gamma',
                Bedragen: { VerzekerdBedragNaPens: 3600, OpgebouwdBedragNaPens: 2400 },
              },
            ],
          },
        ],
      },
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mijnpensioenJsonToParseResult', () => {
  describe('1. pot-per-uitvoerder', () => {
    it('aantal regelingen = unieke uitvoerders in het levenslange blok; namen kloppen', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      // Levenslang blok kent 3 unieke uitvoerders: Alfa, Beta, Gamma.
      expect(result.regelingen).toHaveLength(3)
      const namen = result.regelingen.map((r) => r.fondsNaam)
      expect(namen).toContain('Fonds Alfa')
      // Beta en Gamma hebben een indicatief deel → suffix.
      expect(namen).toContain('Fonds Beta (deels indicatief)')
      expect(namen).toContain('Fonds Gamma (deels indicatief)')
    })
  })

  describe('2. gegarandeerd + indicatief optellen + (deels indicatief)-suffix', () => {
    it('Fonds Gamma brutoBedrag = Math.round((9000+3000)/12) = 1000', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      const gamma = result.regelingen.find((r) => r.fondsNaam.startsWith('Fonds Gamma'))
      expect(gamma).toBeDefined()
      expect(gamma?.brutoBedrag).toBe(Math.round(12000 / 12)) // 1000
      expect(gamma?.fondsNaam).toBe('Fonds Gamma (deels indicatief)')
    })

    it('puur gegarandeerde uitvoerder (Fonds Alfa) krijgt GEEN suffix', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      const alfa = result.regelingen.find((r) => r.fondsNaam.startsWith('Fonds Alfa'))
      expect(alfa?.fondsNaam).toBe('Fonds Alfa')
      expect(alfa?.brutoBedrag).toBe(Math.round(14400 / 12)) // 1200
    })

    it('puur indicatieve uitvoerder (Fonds Beta) krijgt WEL suffix', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      const beta = result.regelingen.find((r) => r.fondsNaam.startsWith('Fonds Beta'))
      expect(beta?.fondsNaam).toBe('Fonds Beta (deels indicatief)')
      expect(beta?.brutoBedrag).toBe(Math.round(7200 / 12)) // 600
    })
  })

  describe('3. ingangLeeftijd = vroegste blok waar uitvoerder voorkomt', () => {
    it('Fonds Alfa → 65 (vroege blok), niet de levenslang-leeftijd 67', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      const alfa = result.regelingen.find((r) => r.fondsNaam.startsWith('Fonds Alfa'))
      expect(alfa?.ingangLeeftijd).toBe(65)
    })

    it('Fonds Gamma → 67 (komt alleen in het levenslange blok voor)', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      const gamma = result.regelingen.find((r) => r.fondsNaam.startsWith('Fonds Gamma'))
      expect(gamma?.ingangLeeftijd).toBe(67)
    })
  })

  describe('4. AOW samenwonend vs alleenstaand', () => {
    it('samenwonend ≠ alleenstaand en beide === Math.round(jaar/12) van het juiste veld', () => {
      const samen = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: true })
      const alleen = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      expect(samen.aowBedrag).toBe(Math.round(16800 / 12)) // 1400
      expect(alleen.aowBedrag).toBe(Math.round(24000 / 12)) // 2000
      expect(samen.aowBedrag).not.toBe(alleen.aowBedrag)
    })
  })

  describe('5. ontbrekende secties', () => {
    it('json zonder Details → regelingen:[], aowBedrag:null, geen throw', () => {
      const result = mijnpensioenJsonToParseResult({ StatusCode: '000' }, { samenwonend: false })
      expect(result.regelingen).toEqual([])
      expect(result.aowBedrag).toBeNull()
      expect(result.nabestaandenpensioen).toBeNull()
    })

    it('json zonder OuderdomsPensioenDetails → regelingen:[], geen throw', () => {
      const result = mijnpensioenJsonToParseResult(
        { StatusCode: '000', Details: {} },
        { samenwonend: false },
      )
      expect(result.regelingen).toEqual([])
      expect(result.aowBedrag).toBeNull()
    })

    it('volkomen onzinnige input (null / string / number) → lege resultaat, geen throw', () => {
      for (const bad of [null, 'oeps', 42, [], undefined]) {
        const result = mijnpensioenJsonToParseResult(bad, { samenwonend: false })
        expect(result.regelingen).toEqual([])
        expect(result.aowBedrag).toBeNull()
        expect(result.nabestaandenpensioen).toBeNull()
        expect(typeof result.samenvatting).toBe('string')
      }
    })
  })

  describe('7. 0-bedragen / lege uitvoerders worden overgeslagen', () => {
    it('uitvoerder met TeBereiken 0 in beide buckets levert geen regeling op', () => {
      const json = {
        StatusCode: '000',
        Details: {
          OuderdomsPensioenDetails: {
            OuderdomsPensioen: [
              {
                Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: [
                  { TeBereiken: 0, PensioenUitvoerder: 'Fonds Leeg', HerkenningsNummer: 'L-1' },
                  { TeBereiken: 12000, PensioenUitvoerder: 'Fonds Echt', HerkenningsNummer: 'E-1' },
                ],
                IndicatiefPensioen: [
                  { TeBereiken: 0, PensioenUitvoerder: 'Fonds Leeg', HerkenningsNummer: 'L-1' },
                ],
              },
            ],
          },
        },
      }
      const result = mijnpensioenJsonToParseResult(json, { samenwonend: false })
      expect(result.regelingen).toHaveLength(1)
      expect(result.regelingen[0].fondsNaam).toBe('Fonds Echt')
      expect(result.regelingen.every((r) => r.brutoBedrag > 0)).toBe(true)
    })
  })

  describe('8. alle regeling-types === ouderdomspensioen', () => {
    it('elke regeling heeft type ouderdomspensioen', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: true })
      expect(result.regelingen.length).toBeGreaterThan(0)
      expect(result.regelingen.every((r) => r.type === 'ouderdomspensioen')).toBe(true)
    })

    it('isGeindexeerd is altijd false (geen betrouwbaar JSON-veld)', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: true })
      expect(result.regelingen.every((r) => r.isGeindexeerd === false)).toBe(true)
    })
  })

  describe('9. nabestaandenpensioen best-effort', () => {
    it('PartnerPensioen met Tot.PartnerEvent=Overlijden → Math.round(som/12)', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: false })
      // 6000 + 3600 = 9600/jaar → 800/maand
      expect(result.nabestaandenpensioen).toBe(Math.round(9600 / 12))
    })

    it('json zonder partnerblok → nabestaandenpensioen: null', () => {
      const json = {
        StatusCode: '000',
        Details: {
          OuderdomsPensioenDetails: {
            OuderdomsPensioen: [
              {
                Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: [
                  { TeBereiken: 12000, PensioenUitvoerder: 'Fonds Solo', HerkenningsNummer: 'S-1' },
                ],
              },
            ],
          },
        },
      }
      const result = mijnpensioenJsonToParseResult(json, { samenwonend: false })
      expect(result.nabestaandenpensioen).toBeNull()
    })
  })

  describe('robuustheid bij geneste mistypes', () => {
    it('geneste verkeerd-getypeerde input throwt niet en levert geen geldige regeling op', () => {
      // Synthetische json met StatusCode '000' maar overal mistypes binnen het
      // OuderdomsPensioen-blok: een Pensioen-OBJECT i.p.v. array, een blok waarin
      // Pensioen-items primitives zijn, en een TeBereiken als string.
      const json = {
        StatusCode: '000',
        Details: {
          OuderdomsPensioenDetails: {
            OuderdomsPensioen: [
              // Pensioen als OBJECT i.p.v. array → asArray() levert [] → niets.
              {
                Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: { foo: 'bar' },
                IndicatiefPensioen: { baz: 123 },
              },
              // Pensioen-items zijn primitives (number/string) → asRecord() → null → overgeslagen.
              {
                Van: { Leeftijd: { Jaren: 65, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: [42, 'tekst'],
              },
              // TeBereiken als STRING i.p.v. number → asNumber() → null → telt als 0 → geen bedrag.
              {
                Van: { Leeftijd: { Jaren: 66, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: [
                  { TeBereiken: '9000', PensioenUitvoerder: 'Fonds Mistype', HerkenningsNummer: 'M-1' },
                ],
              },
            ],
          },
        },
      }

      // Garantie 1: nooit throwen, ongeacht hoe verkeerd de geneste structuur is.
      expect(() =>
        mijnpensioenJsonToParseResult(json, { samenwonend: false }),
      ).not.toThrow()

      // Garantie 2: zulke mistype-items leveren geen regeling met een geldig bedrag op.
      // Fonds Mistype heeft een string-TeBereiken (→ 0) en wordt dus overgeslagen.
      const result = mijnpensioenJsonToParseResult(json, { samenwonend: false })
      expect(result.regelingen).toEqual([])
      expect(result.regelingen.some((r) => r.fondsNaam.startsWith('Fonds Mistype'))).toBe(false)
    })
  })

  describe('samenvatting', () => {
    it('meervoud + AOW als beide aanwezig', () => {
      const result = mijnpensioenJsonToParseResult(buildFixture(), { samenwonend: true })
      expect(result.samenvatting).toBe(
        '3 pensioenpotten en AOW gevonden in je mijnpensioen.nl-overzicht.',
      )
    })

    it('enkelvoud zonder AOW', () => {
      const json = {
        StatusCode: '000',
        Details: {
          OuderdomsPensioenDetails: {
            OuderdomsPensioen: [
              {
                Van: { Leeftijd: { Jaren: 67, Maanden: 0 } },
                Tot: { OuderdomsPensioenEvent: 'Overlijden' },
                Pensioen: [
                  { TeBereiken: 12000, PensioenUitvoerder: 'Fonds Solo', HerkenningsNummer: 'S-1' },
                ],
              },
            ],
          },
        },
      }
      const result = mijnpensioenJsonToParseResult(json, { samenwonend: false })
      expect(result.samenvatting).toBe('1 pensioenpot gevonden in je mijnpensioen.nl-overzicht.')
    })

    it('niets gevonden → expliciete "geen gegevens"-tekst', () => {
      const result = mijnpensioenJsonToParseResult({ StatusCode: '000', Details: {} }, { samenwonend: false })
      expect(result.samenvatting).toBe('Geen pensioengegevens gevonden in je mijnpensioen.nl-overzicht.')
    })
  })
})

describe('parseMijnpensioenJson', () => {
  it('6a. StatusCode "999" → { ok:false }', () => {
    const text = JSON.stringify({ StatusCode: '999', OntbrekendePuvsError: [] })
    const res = parseMijnpensioenJson(text)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('999')
  })

  it('6b. ongeldige JSON-tekst → { ok:false } met nette melding', () => {
    const res = parseMijnpensioenJson('{ dit is geen json ')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Ongeldig JSON-bestand.')
  })

  it('6c. geldige StatusCode "000" → { ok:true } met data', () => {
    const text = JSON.stringify(buildFixture())
    const res = parseMijnpensioenJson(text)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toBeTypeOf('object')
  })

  it('6d. niet-lege OntbrekendePuvsError komt mee in de foutmelding bij fout-status', () => {
    const text = JSON.stringify({
      StatusCode: '888',
      OntbrekendePuvsError: ['PUV-X gaf een time-out'],
    })
    const res = parseMijnpensioenJson(text)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('888')
      expect(res.error).toContain('sommige pensioenuitvoerders gaven een fout')
    }
  })

  it('6e. ontbrekende StatusCode → nette fallback-tekst, geen throw', () => {
    const text = JSON.stringify({ Details: {} })
    const res = parseMijnpensioenJson(text)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('onbekend')
  })

  it('6f. JSON-array (geen object) → { ok:false }', () => {
    const res = parseMijnpensioenJson('[1,2,3]')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Ongeldig JSON-bestand.')
  })
})
