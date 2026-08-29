/**
 * Unit-tests voor de XML-serialisatie-adapter van mijnpensioenoverzicht.nl
 * (lib/pension/mijnpensioen-xml.ts).
 *
 * De fixture is volledig SYNTHETISCH (verzonnen uitvoerders/nummers/bedragen)
 * en bootst alleen de STRUCTUUR van de echte `pensioenaanspraken.xml` na —
 * nooit echte data. Hij is de exacte XML-tegenhanger van de JSON-fixture in
 * mijnpensioen-json.test.ts, zodat de pariteitstest betekenis heeft.
 *
 * Dekking (de eerste twee zijn de door de eigenaar geëiste tests):
 *  1. SINGLE-ELEMENT-ARRAY  — één <Pensioen> levert 1 pot, niet 0
 *  2. GETALLEN ALS STRING   — XML-tekstwaarden worden echte numbers
 *  3. Pariteit XML ↔ JSON   — zelfde inhoud → identiek PensionParseResult
 *  4. Idempotentie          — tweemaal hetzelfde bestand → identiek resultaat
 *  5. StatusCode            — "000" blijft string (ok), "999" → ok:false
 *  6. Onleesbare XML        — ok:false, geen throw
 *  7. Ontbrekende secties   — lege regelingen + null AOW, geen throw
 *  8. AOW samenwonend ≠ alleenstaand
 *  9. Namespace-prefix      — sleutels blijven gelijk (localName-conversie)
 */

import { describe, it, expect } from 'vitest'
import { parseMijnpensioenXml } from '@/lib/pension/mijnpensioen-xml'
import { mijnpensioenJsonToParseResult } from '@/lib/pension/mijnpensioen-json'

// ── Synthetische fixtures ────────────────────────────────────────────────────

/**
 * XML-tegenhanger van `buildFixture()` in mijnpensioen-json.test.ts.
 *
 * Jaarbedragen (TeBereiken):
 *   Fonds Alfa  — gegarandeerd 14400/jaar  → 1200/maand   (ingang 65)
 *   Fonds Beta  — indicatief    7200/jaar  →  600/maand   (ingang 67)
 *   Fonds Gamma — 9000 + 3000 = 12000/jaar → 1000/maand   (deels indicatief)
 * AOW: samenwonend 16800/jaar → 1400/maand · alleenstaand 24000/jaar → 2000/maand
 * Nabestaanden: 6000 + 3600 = 9600/jaar → 800/maand
 */
const XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Pensioenaanspraken>
  <StatusCode>000</StatusCode>
  <Totalen><TeBereiken>33600</TeBereiken></Totalen>
  <Details>
    <OuderdomsPensioenDetails>
      <OuderdomsPensioen>
        <Van><Leeftijd><Jaren>65</Jaren><Maanden>0</Maanden></Leeftijd></Van>
        <Tot><Leeftijd><Jaren>67</Jaren><Maanden>0</Maanden></Leeftijd></Tot>
        <Pensioen>
          <TeBereiken>14400</TeBereiken>
          <Opgebouwd>9000</Opgebouwd>
          <PensioenUitvoerder>Fonds Alfa</PensioenUitvoerder>
          <HerkenningsNummer>ALF-001</HerkenningsNummer>
        </Pensioen>
      </OuderdomsPensioen>
      <OuderdomsPensioen>
        <Van><Leeftijd><Jaren>67</Jaren><Maanden>0</Maanden></Leeftijd></Van>
        <Tot><Leeftijd><Jaren>67</Jaren><Maanden>3</Maanden></Leeftijd></Tot>
        <AOW>
          <AOWDetailsOpbouw>
            <TeBereikenSamenwonend>16800</TeBereikenSamenwonend>
            <TeBereikenAlleenstaand>24000</TeBereikenAlleenstaand>
          </AOWDetailsOpbouw>
        </AOW>
      </OuderdomsPensioen>
      <OuderdomsPensioen>
        <Van><Leeftijd><Jaren>67</Jaren><Maanden>0</Maanden></Leeftijd></Van>
        <Tot><OuderdomsPensioenEvent>Overlijden</OuderdomsPensioenEvent></Tot>
        <Pensioen>
          <TeBereiken>14400</TeBereiken>
          <Opgebouwd>9000</Opgebouwd>
          <PensioenUitvoerder>Fonds Alfa</PensioenUitvoerder>
          <HerkenningsNummer>ALF-001</HerkenningsNummer>
        </Pensioen>
        <Pensioen>
          <TeBereiken>9000</TeBereiken>
          <Opgebouwd>6000</Opgebouwd>
          <PensioenUitvoerder>Fonds Gamma</PensioenUitvoerder>
          <HerkenningsNummer>GAM-003</HerkenningsNummer>
        </Pensioen>
        <IndicatiefPensioen>
          <TeBereiken>7200</TeBereiken>
          <Opgebouwd>4000</Opgebouwd>
          <PensioenUitvoerder>Fonds Beta</PensioenUitvoerder>
          <HerkenningsNummer>BET-002</HerkenningsNummer>
        </IndicatiefPensioen>
        <IndicatiefPensioen>
          <TeBereiken>3000</TeBereiken>
          <Opgebouwd>1500</Opgebouwd>
          <PensioenUitvoerder>Fonds Gamma</PensioenUitvoerder>
          <HerkenningsNummer>GAM-003</HerkenningsNummer>
        </IndicatiefPensioen>
      </OuderdomsPensioen>
    </OuderdomsPensioenDetails>
    <PartnerPensioenDetails>
      <PartnerPensioen>
        <Van><Leeftijd><Jaren>67</Jaren><Maanden>0</Maanden></Leeftijd></Van>
        <Tot><PartnerEvent>Overlijden</PartnerEvent></Tot>
        <Pensioen>
          <PensioenUitvoerder>Fonds Alfa</PensioenUitvoerder>
          <Bedragen>
            <VerzekerdBedragNaPens>6000</VerzekerdBedragNaPens>
            <OpgebouwdBedragNaPens>4000</OpgebouwdBedragNaPens>
          </Bedragen>
        </Pensioen>
        <Pensioen>
          <PensioenUitvoerder>Fonds Gamma</PensioenUitvoerder>
          <Bedragen>
            <VerzekerdBedragNaPens>3600</VerzekerdBedragNaPens>
            <OpgebouwdBedragNaPens>2400</OpgebouwdBedragNaPens>
          </Bedragen>
        </Pensioen>
      </PartnerPensioen>
    </PartnerPensioenDetails>
  </Details>
</Pensioenaanspraken>`

/** De JSON-tegenhanger met exact dezelfde logische inhoud (voor de pariteit). */
function buildJsonFixture() {
  return {
    StatusCode: '000',
    Totalen: { TeBereiken: 33600 },
    Details: {
      OuderdomsPensioenDetails: {
        OuderdomsPensioen: [
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

/** Eén enkele pensioenpot — de single-element-valkuil in zijn zuiverste vorm. */
const XML_EEN_POT = `<?xml version="1.0" encoding="UTF-8"?>
<Pensioenaanspraken>
  <StatusCode>000</StatusCode>
  <Details>
    <OuderdomsPensioenDetails>
      <OuderdomsPensioen>
        <Van><Leeftijd><Jaren>68</Jaren><Maanden>0</Maanden></Leeftijd></Van>
        <Tot><OuderdomsPensioenEvent>Overlijden</OuderdomsPensioenEvent></Tot>
        <Pensioen>
          <TeBereiken>18000</TeBereiken>
          <PensioenUitvoerder>Fonds Solo</PensioenUitvoerder>
        </Pensioen>
      </OuderdomsPensioen>
    </OuderdomsPensioenDetails>
  </Details>
</Pensioenaanspraken>`

/** Hulpje: parse + map in één stap, met een harde ok-assertie. */
function parseEnMap(xml: string, samenwonend: boolean) {
  const parsed = parseMijnpensioenXml(xml)
  if (!parsed.ok) throw new Error(`onverwachte parse-fout: ${parsed.error}`)
  return mijnpensioenJsonToParseResult(parsed.data, { samenwonend })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseMijnpensioenXml', () => {
  describe('1. de single-element-array-valkuil', () => {
    it('levert bij ÉÉN <Pensioen> precies 1 regeling — niet nul', () => {
      const result = parseEnMap(XML_EEN_POT, true)
      expect(result.regelingen).toHaveLength(1)
      expect(result.regelingen[0].fondsNaam).toBe('Fonds Solo')
      expect(result.regelingen[0].brutoBedrag).toBe(1500) // 18000 / 12
      expect(result.regelingen[0].ingangLeeftijd).toBe(68)
    })

    it('forceert de herhaalbare knopen ook bij één voorkomen naar een array', () => {
      const parsed = parseMijnpensioenXml(XML_EEN_POT)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const root = parsed.data as Record<string, unknown>
      const details = root.Details as Record<string, unknown>
      const opDetails = details.OuderdomsPensioenDetails as Record<string, unknown>
      expect(Array.isArray(opDetails.OuderdomsPensioen)).toBe(true)
      const blokken = opDetails.OuderdomsPensioen as Record<string, unknown>[]
      expect(blokken).toHaveLength(1)
      expect(Array.isArray(blokken[0].Pensioen)).toBe(true)
      expect(blokken[0].Pensioen as unknown[]).toHaveLength(1)
    })

    it('geeft geen valse pot bij nul <Pensioen>-elementen', () => {
      const leeg = XML_EEN_POT.replace(
        /<Pensioen>[\s\S]*<\/Pensioen>/,
        '',
      )
      const result = parseEnMap(leeg, true)
      expect(result.regelingen).toHaveLength(0)
    })
  })

  describe('2. getallen komen als string uit XML', () => {
    it('coërceert bedragen naar echte numbers in de objectboom', () => {
      const parsed = parseMijnpensioenXml(XML_EEN_POT)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const root = parsed.data as Record<string, unknown>
      const details = root.Details as Record<string, unknown>
      const opDetails = details.OuderdomsPensioenDetails as Record<string, unknown>
      const blok = (opDetails.OuderdomsPensioen as Record<string, unknown>[])[0]
      const pot = (blok.Pensioen as Record<string, unknown>[])[0]
      expect(typeof pot.TeBereiken).toBe('number')
      expect(pot.TeBereiken).toBe(18000)
      const van = blok.Van as Record<string, unknown>
      const leeftijd = van.Leeftijd as Record<string, unknown>
      expect(typeof leeftijd.Jaren).toBe('number')
      expect(leeftijd.Jaren).toBe(68)
      expect(leeftijd.Maanden).toBe(0) // "0" mag geen null of "" worden
    })

    it('laat StatusCode "000" een string zijn (anders wordt élke export afgekeurd)', () => {
      const parsed = parseMijnpensioenXml(XML_FIXTURE)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const root = parsed.data as Record<string, unknown>
      expect(root.StatusCode).toBe('000')
      expect(typeof root.StatusCode).toBe('string')
    })

    it('laat code-achtige waarden met streepjes ongemoeid', () => {
      const parsed = parseMijnpensioenXml(XML_FIXTURE)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const root = parsed.data as Record<string, unknown>
      const details = root.Details as Record<string, unknown>
      const opDetails = details.OuderdomsPensioenDetails as Record<string, unknown>
      const blok = (opDetails.OuderdomsPensioen as Record<string, unknown>[])[0]
      const pot = (blok.Pensioen as Record<string, unknown>[])[0]
      expect(pot.HerkenningsNummer).toBe('ALF-001')
      expect(pot.PensioenUitvoerder).toBe('Fonds Alfa')
    })
  })

  describe('3. pariteit XML ↔ JSON — twee serialisaties, één model', () => {
    it('levert samenwonend hetzelfde PensionParseResult als de JSON-mapper', () => {
      const viaXml = parseEnMap(XML_FIXTURE, true)
      const viaJson = mijnpensioenJsonToParseResult(buildJsonFixture(), { samenwonend: true })
      expect(viaXml).toEqual(viaJson)
    })

    it('levert alleenstaand hetzelfde PensionParseResult als de JSON-mapper', () => {
      const viaXml = parseEnMap(XML_FIXTURE, false)
      const viaJson = mijnpensioenJsonToParseResult(buildJsonFixture(), { samenwonend: false })
      expect(viaXml).toEqual(viaJson)
    })

    it('mapt de fixture op de verwachte bedragen (borgt dat de pariteit niet leeg is)', () => {
      const result = parseEnMap(XML_FIXTURE, true)
      expect(result.regelingen).toHaveLength(3)
      const perNaam = Object.fromEntries(
        result.regelingen.map((r) => [r.fondsNaam, r]),
      )
      // Alfa is puur gegarandeerd; Beta is puur indicatief en Gamma deels —
      // beide laatste krijgen daarom het suffix van de mapper.
      expect(perNaam['Fonds Alfa'].brutoBedrag).toBe(1200)
      expect(perNaam['Fonds Alfa'].ingangLeeftijd).toBe(65)
      expect(perNaam['Fonds Beta (deels indicatief)'].brutoBedrag).toBe(600)
      expect(perNaam['Fonds Gamma (deels indicatief)'].brutoBedrag).toBe(1000)
      expect(result.aowBedrag).toBe(1400)
      expect(result.aowLeeftijd).toBe(67)
      expect(result.aowLeefsituatie).toBe('samenwonend')
      expect(result.nabestaandenpensioen).toBe(800)
    })
  })

  describe('4. idempotentie — tweemaal hetzelfde bestand verandert niets', () => {
    it('levert bij een tweede verwerking een identiek resultaat', () => {
      const eerste = parseEnMap(XML_FIXTURE, true)
      const tweede = parseEnMap(XML_FIXTURE, true)
      expect(tweede).toEqual(eerste)
    })

    it('houdt de dedup-sleutel (fondsnaam) stabiel tussen XML en JSON', () => {
      // reconcile.ts matcht op de genormaliseerde fondsnaam. Blijven die namen
      // gelijk tussen beide serialisaties, dan geeft een tweede import 'update'
      // en geen tweede pot — ook als de gebruiker eerst JSON en later XML kiest.
      const viaXml = parseEnMap(XML_FIXTURE, true).regelingen.map((r) => r.fondsNaam)
      const viaJson = mijnpensioenJsonToParseResult(buildJsonFixture(), {
        samenwonend: true,
      }).regelingen.map((r) => r.fondsNaam)
      expect(viaXml).toEqual(viaJson)
    })
  })

  describe('5. StatusCode-afhandeling', () => {
    it('weigert een export met StatusCode 999', () => {
      const xml = XML_FIXTURE.replace('<StatusCode>000</StatusCode>', '<StatusCode>999</StatusCode>')
      const parsed = parseMijnpensioenXml(xml)
      expect(parsed.ok).toBe(false)
      if (parsed.ok) return
      expect(parsed.error).toContain('999')
    })

    it('noemt ontbrekende pensioenuitvoerders in de foutmelding', () => {
      const xml = XML_FIXTURE.replace(
        '<StatusCode>000</StatusCode>',
        '<StatusCode>999</StatusCode><OntbrekendePuvsError><Puv>Fonds Delta</Puv></OntbrekendePuvsError>',
      )
      const parsed = parseMijnpensioenXml(xml)
      expect(parsed.ok).toBe(false)
      if (parsed.ok) return
      expect(parsed.error).toContain('pensioenuitvoerders')
    })

    it('weigert een export zonder StatusCode', () => {
      const xml = XML_FIXTURE.replace('<StatusCode>000</StatusCode>', '')
      const parsed = parseMijnpensioenXml(xml)
      expect(parsed.ok).toBe(false)
    })
  })

  describe('6. onleesbare invoer', () => {
    it('geeft ok:false bij kapotte XML in plaats van te throwen', () => {
      const parsed = parseMijnpensioenXml('<Pensioenaanspraken><StatusCode>000</Pensioen')
      expect(parsed.ok).toBe(false)
      if (parsed.ok) return
      expect(parsed.error).toBe('Ongeldig XML-bestand.')
    })

    it('geeft ok:false bij een leeg bestand', () => {
      expect(parseMijnpensioenXml('').ok).toBe(false)
    })

    it('geeft ok:false bij JSON dat per ongeluk als XML wordt aangeboden', () => {
      expect(parseMijnpensioenXml('{"StatusCode":"000"}').ok).toBe(false)
    })
  })

  describe('7. ontbrekende secties', () => {
    it('levert lege regelingen en null AOW zonder te throwen', () => {
      const xml = '<?xml version="1.0"?><Pensioenaanspraken><StatusCode>000</StatusCode></Pensioenaanspraken>'
      const result = parseEnMap(xml, true)
      expect(result.regelingen).toEqual([])
      expect(result.aowBedrag).toBeNull()
      expect(result.nabestaandenpensioen).toBeNull()
      expect(result.samenvatting).toContain('Geen pensioengegevens')
    })
  })

  describe('8. AOW per leefsituatie', () => {
    it('gebruikt het samenwonend-bedrag bij samenwonend', () => {
      expect(parseEnMap(XML_FIXTURE, true).aowBedrag).toBe(1400)
    })

    it('gebruikt het alleenstaand-bedrag bij alleenstaand', () => {
      const result = parseEnMap(XML_FIXTURE, false)
      expect(result.aowBedrag).toBe(2000)
      expect(result.aowLeefsituatie).toBe('alleenstaand')
    })
  })

  describe('9. namespaces', () => {
    it('mapt een namespace-prefixed export op dezelfde sleutels', () => {
      const xml = `<?xml version="1.0"?>
<pr:Pensioenaanspraken xmlns:pr="urn:pensioenregister">
  <pr:StatusCode>000</pr:StatusCode>
  <pr:Details>
    <pr:OuderdomsPensioenDetails>
      <pr:OuderdomsPensioen>
        <pr:Van><pr:Leeftijd><pr:Jaren>67</pr:Jaren></pr:Leeftijd></pr:Van>
        <pr:Tot><pr:OuderdomsPensioenEvent>Overlijden</pr:OuderdomsPensioenEvent></pr:Tot>
        <pr:Pensioen>
          <pr:TeBereiken>12000</pr:TeBereiken>
          <pr:PensioenUitvoerder>Fonds Namespace</pr:PensioenUitvoerder>
        </pr:Pensioen>
      </pr:OuderdomsPensioen>
    </pr:OuderdomsPensioenDetails>
  </pr:Details>
</pr:Pensioenaanspraken>`
      const result = parseEnMap(xml, true)
      expect(result.regelingen).toHaveLength(1)
      expect(result.regelingen[0].fondsNaam).toBe('Fonds Namespace')
      expect(result.regelingen[0].brutoBedrag).toBe(1000)
    })
  })
})
