import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseBrokerCSV, type ParsedHoldingRow } from './broker-csv'
import {
  detectDegiroCorporateActions,
  applyDegiroCorporateActions,
} from './degiro-corporate-actions'
import { computePositionFromTransactions } from '@/lib/holdings-aggregation'
import { buildTradeKeys } from '@/lib/holdings-import-key'

const fixture = (name: string): string =>
  readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8')

// ---------------------------------------------------------------------------
// DEGIRO Transactions.csv — splitsingen en conversies
// ---------------------------------------------------------------------------
//
// De transactie-export van DEGIRO heeft GEEN `Actie`-kolom; "Split Aanpassing"
// bestaat alleen in de web-UI. Een splitsing/conversie komt binnen als een PAAR
// rijen op dezelfde datum, zonder Order ID en zonder Uitvoeringsplaats, met een
// tegengesteld teken in `Aantal` en (vrijwel) dezelfde `Waarde EUR`.
//
// De fixture is volledig SYNTHETISCH: verzonnen ISIN's (landcode XX bestaat
// niet), verzonnen productnamen en verzonnen bedragen. Er staat niets in dat
// naar een echte rekening herleidbaar is.
//
// DE FIXTURE IS AFLOPEND GESORTEERD, net als de echte export: nieuwste rij
// bovenaan, de oorspronkelijke aankopen ONDERAAN. Dat is geen detail maar het
// hele punt — een kostbasis-afleiding die "voorafgaand" leest als
// "bestandspositie" vindt de aankopen dan niet, valt terug op de dagwaarde, en
// koppelt bij een keten de verkeerde rijen (met `costBasisKnown: true` erop).
// De laatste describe biedt dezelfde rijen OPLOPEND aan en eist dezelfde
// uitkomsten.
//
// Fixture-inhoud (18 rijen, van nieuw naar oud):
//   0-1   echte verkoop + koop op een dag MET Order ID  -> blijft sell/buy
//   2-3   forward split met DEZELFDE ISIN  THETA 60 uit -> THETA 120 in
//   4     stockdividend:   losse rij,   +3 @ 0,00       -> blijft buy
//   5     knock-out turbo: losse rij, -500 @ 0,00       -> blijft sell
//         (bewust op DEZELFDE dag als 4: bewijst dat een 0-waarde-paar niet
//          valselijk gekoppeld wordt)
//   6-7   conversie van een 0,00-inschrijving naar echte stukken
//   8-9   conversie zonder eerdere aankopen (kostbasis onbekend)
//   10-11 naamswijziging, gelijk aantal    BETA  50 uit -> BETA GROUP 50 in
//                                          (400,00 vs 400,01 = afrondingsmarge)
//   12-13 reverse split met ISIN-wijziging ALPHA 200 uit -> ALPHA NEW 20 in
//   14    THETA        koop  60 @5                   -> kostbasis   300,00
//   15    BETA HOLD.   koop  50 @6                   -> kostbasis   300,00
//   16-17 ALPHA        koop 100 @12 + koop 100 @10   -> kostbasis 2.200,00
// ---------------------------------------------------------------------------

const FIXTURE = 'degiro-transaction-corporate-actions.csv'

const parsed = parseBrokerCSV(fixture(FIXTURE), 'degiro')
const rows = parsed.rows

/**
 * Dezelfde fixture met de datarijen omgedraaid: OPLOPEND, oudste rij bovenaan.
 * De volgorde is het enige verschil — de rijen zelf zijn letterlijk dezelfde
 * tekst, dus een verschil in uitkomst kan alleen uit de volgorde komen.
 */
const reversedFixture = (name: string): string => {
  const lines = fixture(name).split('\n')
  const trailingNewline = lines[lines.length - 1] === ''
  if (trailingNewline) lines.pop()
  const [header, ...data] = lines
  return [header, ...data.reverse()].join('\n') + (trailingNewline ? '\n' : '')
}

const oplopend = parseBrokerCSV(reversedFixture(FIXTURE), 'degiro').rows

/** Alle rijen van een instrument, in bestandsvolgorde. */
const byIsin = (isin: string, input: ParsedHoldingRow[] = rows): ParsedHoldingRow[] =>
  input.filter((r) => r.isin === isin)

/** De canonieke positie van een instrument over dit bestand. */
const positionOf = (isin: string, input: ParsedHoldingRow[] = rows) =>
  computePositionFromTransactions(
    byIsin(isin, input).map((r) => ({
      type: r.type,
      units: r.units,
      price_per_unit: r.price_per_unit,
      total_amount: r.total_amount,
      fees: r.fees,
      date: r.date,
    })),
  )

describe('DEGIRO corporate actions — de fixture zelf', () => {
  it('Given de synthetische export, When geparsed, Then komen alle 18 rijen door', () => {
    expect(parsed.errors).toEqual([])
    expect(rows).toHaveLength(18)
    expect(parsed.contentKind).toBe('transactions')
  })
})

describe('(a) reverse split met ISIN-wijziging', () => {
  it('Given een paar zonder Order ID op een datum, When gedetecteerd, Then wordt de oude regel transfer_out en de nieuwe transfer_in', () => {
    const out = rows[13]
    const inn = rows[12]
    expect(out.isin).toBe('XX0000000001')
    expect(out.type).toBe('transfer_out')
    expect(inn.isin).toBe('XX0000000002')
    expect(inn.type).toBe('transfer_in')
  })

  it('Given aankopen binnen het venster, When de conversie wordt verwerkt, Then draagt de nieuwe regel de MEEGENOMEN kostbasis (2.200,00), niet de dagwaarde (3.000,00)', () => {
    const inn = rows[12]
    expect(inn.units).toBe(20)
    expect(inn.total_amount).toBeCloseTo(2200, 6)
    expect(inn.price_per_unit).toBeCloseTo(110, 6)
  })

  it('Given de oude regel sluit, When de positie wordt herleid, Then is er GEEN verzonnen gerealiseerd resultaat (alleen de echte transactiekosten)', () => {
    const agg = positionOf('XX0000000001')
    expect(agg.netUnits).toBe(0)
    expect(agg.totalSoldUnits).toBe(0)
    expect(agg.totalProceeds).toBe(0)
    // 2 x EUR 2,00 werkelijke transactiekosten op de aankopen; verder niets.
    expect(agg.realizedPnL).toBeCloseTo(-4, 6)
  })

  it('Given de nieuwe regel opent, When de positie wordt herleid, Then telt de inleg NIET dubbel', () => {
    const agg = positionOf('XX0000000002')
    expect(agg.netUnits).toBe(20)
    expect(agg.avgCost).toBeCloseTo(110, 6)
    expect(agg.totalBoughtUnits).toBe(0)
    expect(agg.totalInvested).toBe(0)
    expect(agg.realizedPnL).toBe(0)
  })
})

describe('(b) naamswijziging met gelijk aantal', () => {
  it('Given twee benen die een cent schelen, When gedetecteerd, Then valt dat binnen de afrondingsmarge en vormt het een paar', () => {
    expect(rows[11].type).toBe('transfer_out')
    expect(rows[10].type).toBe('transfer_in')
  })

  it('Given de kostbasis 300,00 was, When de naam wijzigt, Then draagt de nieuwe regel 300,00 en niet de dagwaarde 400,00', () => {
    const agg = positionOf('XX0000000004')
    expect(agg.netUnits).toBe(50)
    expect(agg.avgCost).toBeCloseTo(6, 6)
    const oud = positionOf('XX0000000003')
    expect(oud.netUnits).toBe(0)
    expect(oud.totalProceeds).toBe(0)
    expect(oud.realizedPnL).toBeCloseTo(-1, 6) // alleen de echte fee
  })
})

describe('(c) conversie van een 0,00-inschrijving naar echte stukken', () => {
  it('Given beide benen 0,00 en een gelijk aantal, When gedetecteerd, Then vormt het een paar', () => {
    expect(rows[7].type).toBe('transfer_out')
    expect(rows[6].type).toBe('transfer_in')
  })

  it('Given een inschrijving zonder kostbasis, When geconverteerd, Then blijft er 0,00 gerealiseerd resultaat over', () => {
    expect(positionOf('XX0000000007').realizedPnL).toBe(0)
    const nieuw = positionOf('XX0000000008')
    expect(nieuw.netUnits).toBe(30)
    expect(nieuw.avgCost).toBe(0)
  })
})

describe('(d) knock-out van een turbo blijft een echte sluiting', () => {
  it('Given een LOSSE negatieve rij op 0,00 zonder Order ID, When gedetecteerd, Then blijft het type sell', () => {
    const knockOut = rows[5]
    expect(knockOut.isin).toBe('XX0000000009')
    expect(knockOut.type).toBe('sell')
    expect(knockOut.price_per_unit).toBe(0)
  })
})

describe('(e) stockdividend blijft een koop op 0,00', () => {
  it('Given een LOSSE positieve rij op 0,00 op dezelfde dag als een knock-out, When gedetecteerd, Then blijven beide ongepaard', () => {
    const stockdiv = rows[4]
    expect(stockdiv.isin).toBe('XX0000000010')
    expect(stockdiv.type).toBe('buy')
    expect(rows[5].type).toBe('sell')
  })
})

describe('(f) paar met DEZELFDE ISIN (forward split)', () => {
  it('Given een split op dezelfde ISIN, When verwerkt, Then staat het sluitende been VOOR het openende', () => {
    // In het aflopende bronbestand stond het in-been bovenaan (rij 2) en het
    // uit-been eronder (rij 3). Beide dragen dezelfde datum en dezelfde ISIN,
    // dus de canonieke engine — stabiel gesorteerd op datum — zou de stukken
    // even dubbel tellen (60 oud + 120 nieuw) en op EUR 400 inleg uitkomen.
    // De pass zet ze daarom in de sluitende-dan-openende volgorde.
    expect(rows[2].type).toBe('transfer_out')
    expect(rows[2].units).toBe(60)
    expect(rows[3].type).toBe('transfer_in')
    expect(rows[3].units).toBe(120)
    expect(rows[2].date).toBe(rows[3].date)
  })

  it('Given 60 uit en 120 in op dezelfde ISIN, When verwerkt, Then blijft de positie positief en de totale kostbasis gelijk', () => {
    expect(rows[2].type).toBe('transfer_out')
    expect(rows[3].type).toBe('transfer_in')
    const agg = positionOf('XX0000000011')
    expect(agg.netUnits).toBe(120)
    expect(agg.avgCost).toBeCloseTo(2.5, 6)
    // Kostbasis blijft 300,00 - een split verandert je inleg niet.
    expect(agg.netUnits * agg.avgCost).toBeCloseTo(300, 6)
    expect(agg.totalProceeds).toBe(0)
  })
})

describe('(g) kostbasis onbekend: terugval op de dagwaarde', () => {
  it('Given geen voorafgaande aankopen in het venster, When geconverteerd, Then opent de nieuwe regel op de dagwaarde uit Waarde EUR', () => {
    expect(rows[9].type).toBe('transfer_out')
    expect(rows[8].type).toBe('transfer_in')
    const nieuw = positionOf('XX0000000006')
    expect(nieuw.netUnits).toBe(10)
    expect(nieuw.avgCost).toBeCloseTo(100, 6) // 1.000,00 dagwaarde / 10 stuks
  })

  it('Given de terugval, When de oude regel sluit, Then is er nog steeds geen fictieve realisatie', () => {
    const oud = positionOf('XX0000000005')
    expect(oud.totalProceeds).toBe(0)
    expect(oud.realizedPnL).toBe(0)
  })

  it('Given de terugval, When de detector rapporteert, Then is die expliciet gemarkeerd', () => {
    const pairs = detectDegiroCorporateActions(rows)
    const gamma = pairs.find((p) => rows[p.outIndex].isin === 'XX0000000005')
    expect(gamma?.costBasisKnown).toBe(false)
    const alpha = pairs.find((p) => rows[p.outIndex].isin === 'XX0000000001')
    expect(alpha?.costBasisKnown).toBe(true)
  })
})

describe('guard: een echte koop en verkoop op een dag', () => {
  it('Given twee rijen MET Order ID en Uitvoeringsplaats, When gedetecteerd, Then blijven het buy en sell', () => {
    expect(rows[1].type).toBe('buy')
    expect(rows[0].type).toBe('sell')
  })
})

describe('detectDegiroCorporateActions', () => {
  it('Given de aflopende fixture, When gedetecteerd, Then vindt hij precies 5 paren, chronologisch gerapporteerd', () => {
    const pairs = detectDegiroCorporateActions(rows)
    // Chronologisch (01-06 t/m 01-11), dus in een aflopend bestand van ACHTEREN
    // naar voren. De rapportagevolgorde volgt de datum, niet de bestandspositie.
    expect(pairs.map((p) => [p.outIndex, p.inIndex])).toEqual([
      [13, 12],
      [11, 10],
      [9, 8],
      [7, 6],
      // THETA: bronvolgorde was in-been (2) boven uit-been (3); de pass zet ze
      // om, dus het uit-been staat hier op 2.
      [2, 3],
    ])
    expect(pairs.map((p) => rows[p.outIndex].date)).toEqual([
      '2025-06-01',
      '2025-07-01',
      '2025-08-01',
      '2025-09-01',
      '2025-11-01',
    ])
  })

  it('Given een lege lijst, When gedetecteerd, Then levert dat geen paren', () => {
    expect(detectDegiroCorporateActions([])).toEqual([])
  })
})

describe('idempotentie — hetzelfde bestand twee keer', () => {
  // De harde eis: een import die twee keer draaien niet overleeft, is niet af.
  // Hier op parser-niveau: dezelfde invoer moet twee keer exact dezelfde rijen
  // opleveren, en een tweede pass over de al omgezette rijen mag niets meer
  // veranderen (anders zou een herparse andere bedragen en dus andere
  // dedup-sleutels geven, en zou de tweede upload dubbele rijen schrijven).

  it('Given hetzelfde bestand, When twee keer geparsed, Then zijn de rijen identiek', () => {
    const tweede = parseBrokerCSV(fixture(FIXTURE), 'degiro')
    expect(tweede.rows).toEqual(rows)
  })

  it('Given al omgezette rijen, When de pass opnieuw draait, Then verandert er niets', () => {
    expect(applyDegiroCorporateActions(rows)).toEqual(rows)
    expect(detectDegiroCorporateActions(applyDegiroCorporateActions(rows))).toEqual(
      detectDegiroCorporateActions(rows),
    )
  })

  it('Given de OPLOPENDE volgorde, When de pass opnieuw draait, Then verandert er ook daar niets', () => {
    // Idempotentie mag niet aan de sorteerrichting hangen: een tweede pass over
    // al omgezette rijen moet in beide richtingen een no-op zijn.
    expect(applyDegiroCorporateActions(oplopend)).toEqual(oplopend)
    expect(
      detectDegiroCorporateActions(applyDegiroCorporateActions(oplopend)),
    ).toEqual(detectDegiroCorporateActions(oplopend))
  })

  it('Given al omgezette rijen, When de dedup-sleutels worden afgeleid, Then zijn ze stabiel', () => {
    const keysOf = (input: ParsedHoldingRow[]) =>
      buildTradeKeys(
        input
          .filter((r) => r.type !== 'position')
          .map((r) => ({
            externalId: r.externalId,
            isin: r.isin,
            ticker: r.ticker,
            date: r.date,
            type: r.type,
            units: r.units,
            price_per_unit: r.price_per_unit,
            total_amount: r.total_amount,
          })),
      )
    expect(keysOf(applyDegiroCorporateActions(rows))).toEqual(keysOf(rows))
    // En elke rij houdt een eigen sleutel — geen twee rijen die elkaar als
    // duplicaat wegstrepen.
    const keys = keysOf(rows)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// Volgorde-onafhankelijkheid
// ---------------------------------------------------------------------------
//
// De echte DEGIRO-export is aflopend, maar dat is geen garantie: een gebruiker
// kan in Excel sorteren voor hij uploadt, en een oudere export kan oplopend
// zijn. De uitkomst mag daar niet van afhangen. Deze describe biedt LETTERLIJK
// dezelfde regels in beide richtingen aan en vergelijkt de uitkomst op INHOUD
// (ISIN, datum, type, bedragen) in plaats van op rijnummer — rijnummers
// verschillen per definitie, de cijfers mogen dat niet.
//
// Waarom dit als test bestaat: de kostbasis-afleiding selecteerde de eerdere
// rijen ooit met `slice(0, outIndex)` — op bestandspositie. In een aflopend
// bestand vond die de aankopen niet (terugval op de dagwaarde) en pakte hij bij
// een keten de verkeerde rijen op, mét `costBasisKnown: true` erop. Een test die
// alleen de ene richting afdekt, ziet dat niet.
// ---------------------------------------------------------------------------

describe('volgorde-onafhankelijkheid — aflopend vs. oplopend', () => {
  const rond = (n: number) => Math.round(n * 1e6) / 1e6

  const alleIsins = (input: ParsedHoldingRow[]) =>
    [...new Set(input.map((r) => r.isin ?? r.name))].sort()

  /** De volledige uitkomst, gesorteerd op inhoud in plaats van op rijnummer. */
  const uitkomst = (input: ParsedHoldingRow[]) => ({
    paren: detectDegiroCorporateActions(input).map((p) => ({
      uit: input[p.outIndex].isin,
      in: input[p.inIndex].isin,
      datum: input[p.outIndex].date,
      basis: rond(p.carriedCostBasis),
      bekend: p.costBasisKnown,
    })),
    rijen: input
      .map((r) => ({
        isin: r.isin,
        datum: r.date,
        type: r.type,
        aantal: r.units,
        bedrag: rond(r.total_amount),
        prijs: rond(r.price_per_unit),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    posities: alleIsins(input).map((isin) => {
      const agg = positionOf(isin, input)
      return {
        isin,
        netUnits: rond(agg.netUnits),
        avgCost: rond(agg.avgCost),
        totalProceeds: rond(agg.totalProceeds),
        totalInvested: rond(agg.totalInvested),
        realizedPnL: rond(agg.realizedPnL),
      }
    }),
  })

  it('Given beide varianten, When geparsed, Then is de standaardfixture aflopend en de omgedraaide oplopend', () => {
    // Dit is de vangrail onder alle andere tests hier: draait iemand de fixture
    // ooit terug naar oplopend, dan valt dit om in plaats van dat de dekking
    // stilletjes verdwijnt.
    const datums = (input: ParsedHoldingRow[]) => input.map((r) => r.date as string)
    const nietStijgend = (d: string[]) => d.every((x, i) => i === 0 || d[i - 1] >= x)
    const nietDalend = (d: string[]) => d.every((x, i) => i === 0 || d[i - 1] <= x)

    expect(oplopend).toHaveLength(rows.length)
    expect(nietStijgend(datums(rows))).toBe(true)
    expect(nietDalend(datums(oplopend))).toBe(true)
    // En het is echt hetzelfde bestand: dezelfde datums, alleen omgekeerd.
    expect([...datums(oplopend)].reverse()).toEqual(datums(rows))
  })

  it('Given een OPLOPEND bestand, When verwerkt, Then is de uitkomst identiek aan de aflopende', () => {
    expect(uitkomst(oplopend)).toEqual(uitkomst(rows))
  })

  it('Given een OPLOPEND bestand, When de kostbasis wordt afgeleid, Then draagt ALPHA NEW nog steeds 2.200,00 en niet de dagwaarde', () => {
    // Het concrete geval uit de vondst: op bestandspositie liep dit mis.
    const inn = byIsin('XX0000000002', oplopend)[0]
    expect(inn.type).toBe('transfer_in')
    expect(inn.total_amount).toBeCloseTo(2200, 6)
    expect(inn.price_per_unit).toBeCloseTo(110, 6)
  })

  it('Given een OPLOPEND bestand, When THETA splitst, Then blijft de kostbasis 300,00 en NIET de dagwaarde 360,00', () => {
    // De stilste van de drie: op bestandspositie kwam hier 90,00 uit, mét
    // costBasisKnown: true. Een fout die zichzelf bekend noemt.
    const agg = positionOf('XX0000000011', oplopend)
    expect(agg.netUnits).toBe(120)
    expect(rond(agg.netUnits * agg.avgCost)).toBeCloseTo(300, 6)
    const paar = detectDegiroCorporateActions(oplopend).find(
      (p) => oplopend[p.outIndex].isin === 'XX0000000011',
    )
    expect(paar?.costBasisKnown).toBe(true)
    expect(paar?.carriedCostBasis).toBeCloseTo(300, 6)
  })

  it('Given beide richtingen, When de dedup-sleutels worden afgeleid, Then is de verzameling identiek', () => {
    // De sleutel van een rij zonder broker-id volgt uit de INHOUD (datum, type,
    // aantal, bedrag). Wijkt de kostbasis per sorteerrichting af, dan wijkt de
    // sleutel mee en schrijft een tweede upload dezelfde rij nog een keer weg.
    const keysOf = (input: ParsedHoldingRow[]) =>
      buildTradeKeys(
        input
          .filter((r) => r.type !== 'position')
          .map((r) => ({
            externalId: r.externalId,
            isin: r.isin,
            ticker: r.ticker,
            date: r.date,
            type: r.type,
            units: r.units,
            price_per_unit: r.price_per_unit,
            total_amount: r.total_amount,
          })),
      )
    expect([...keysOf(oplopend)].sort()).toEqual([...keysOf(rows)].sort())
  })
})

// ---------------------------------------------------------------------------
// Ketens: twee corporate actions achter elkaar op hetzelfde bezit
// ---------------------------------------------------------------------------
//
// De fixture kent geen keten; die bouwen we hier expliciet, want juist daar
// telt de VOLGORDE waarin de paren worden afgehandeld. Stap 2 moet de kostbasis
// van stap 1 meenemen, en dat mag niet aan de bestandsvolgorde hangen.
// ---------------------------------------------------------------------------

/** Een corporate-action-been: geen Order ID, geen Uitvoeringsplaats. */
const been = (
  isin: string,
  date: string,
  type: ParsedHoldingRow['type'],
  units: number,
  total: number,
): ParsedHoldingRow => ({
  name: isin,
  ticker: null,
  isin,
  units,
  price_per_unit: units > 0 ? total / units : 0,
  total_amount: total,
  date,
  type,
  fees: 0,
  currency: 'EUR',
  exchange: 'EAM',
  externalId: null,
  raw: {},
})

/** Een echte handelsregel: mét Order ID en Uitvoeringsplaats. */
const koop = (
  isin: string,
  date: string,
  units: number,
  total: number,
): ParsedHoldingRow => ({
  ...been(isin, date, 'buy', units, total),
  externalId: 'order-1',
  raw: { Uitvoeringsplaats: 'XAMS' },
})

const paarVoor = (input: ParsedHoldingRow[], isin: string) =>
  detectDegiroCorporateActions(input).find((p) => input[p.outIndex].isin === isin)

describe('ketens', () => {
  const beideRichtingen = (opbouw: ParsedHoldingRow[]) => ({
    oplopend: applyDegiroCorporateActions(opbouw),
    aflopend: applyDegiroCorporateActions([...opbouw].reverse()),
  })

  it('Given twee conversies op VERSCHILLENDE datums, When verwerkt, Then draagt de tweede stap de kostbasis van de eerste — in beide sorteerrichtingen', () => {
    // AAA (1.000,00 inleg) -> BBB op 01-02 (dagwaarde 1.500) -> CCC op 01-03
    // (dagwaarde 2.000). De inleg blijft 1.000,00; alleen de stukjes veranderen.
    const opbouw = [
      koop('AAA', '2025-01-10', 100, 1000),
      been('AAA', '2025-02-01', 'sell', 100, 1500),
      been('BBB', '2025-02-01', 'buy', 50, 1500),
      been('BBB', '2025-03-01', 'sell', 50, 2000),
      been('CCC', '2025-03-01', 'buy', 25, 2000),
    ]
    const { oplopend: op, aflopend: af } = beideRichtingen(opbouw)

    for (const [label, lijst] of [
      ['oplopend', op],
      ['aflopend', af],
    ] as const) {
      const stap1 = paarVoor(lijst, 'AAA')
      const stap2 = paarVoor(lijst, 'BBB')
      expect(stap1?.costBasisKnown, label).toBe(true)
      expect(stap1?.carriedCostBasis, label).toBeCloseTo(1000, 6)
      // Zonder chronologische ketenvolgorde zou stap 2 de nog niet omgezette
      // BBB-rij zien (1.500,00 dagwaarde) in plaats van de meegenomen 1.000,00.
      expect(stap2?.costBasisKnown, label).toBe(true)
      expect(stap2?.carriedCostBasis, label).toBeCloseTo(1000, 6)

      const ccc = lijst.find((r) => r.isin === 'CCC') as ParsedHoldingRow
      expect(ccc.type, label).toBe('transfer_in')
      expect(ccc.total_amount, label).toBeCloseTo(1000, 6)
      expect(ccc.price_per_unit, label).toBeCloseTo(40, 6)
    }
  })

  it('Given een keten die op ÉÉN datum valt, When verwerkt, Then is de kostbasis expliciet ONBEKEND in plaats van een gokje', () => {
    // Binnen één datum is er geen betrouwbare volgorde: we kunnen niet zien of
    // de tweede conversie voor of na de eerste lag. Dan liever een eerlijke
    // terugval op de dagwaarde dan een getal dat zichzelf 'bekend' noemt.
    const opbouw = [
      koop('AAA', '2025-01-10', 100, 1000),
      been('AAA', '2025-02-01', 'sell', 100, 1500),
      been('BBB', '2025-02-01', 'buy', 50, 1500),
      been('BBB', '2025-02-01', 'sell', 50, 1600),
      been('CCC', '2025-02-01', 'buy', 25, 1600),
    ]
    const { oplopend: op, aflopend: af } = beideRichtingen(opbouw)

    for (const [label, lijst] of [
      ['oplopend', op],
      ['aflopend', af],
    ] as const) {
      expect(paarVoor(lijst, 'AAA')?.carriedCostBasis, label).toBeCloseTo(1000, 6)
      expect(paarVoor(lijst, 'AAA')?.costBasisKnown, label).toBe(true)

      const stap2 = paarVoor(lijst, 'BBB')
      expect(stap2?.costBasisKnown, label).toBe(false)
      expect(stap2?.carriedCostBasis, label).toBeCloseTo(1600, 6)
      // De terugval blijft een terugval op de DAGWAARDE — geen fictieve
      // realisatie op het uit-been.
      const bbbUit = lijst.filter((r) => r.isin === 'BBB')
      expect(bbbUit.map((r) => r.type).sort(), label).toEqual([
        'transfer_in',
        'transfer_out',
      ])
    }
  })
})

// ---------------------------------------------------------------------------
// Vangrails rond de herkenning
// ---------------------------------------------------------------------------

describe('vangrail: een 0,00-paar geldt nooit als geverifieerde kostbasis', () => {
  it('Given twee benen van 0,00 met een gelijk aantal, When gekoppeld, Then is costBasisKnown false — ook mét eerdere aankopen', () => {
    // Een knock-out van 500 stuks en een bonusuitgifte van 500 stuks op
    // dezelfde dag dragen exact dezelfde signatuur als een echte 1-op-1
    // conversie: beide benen 0,00, gelijk aantal, geen Order ID. Dat
    // onderscheid is te zwak om een kostbasis op te baseren.
    const rijen = [
      koop('AAA', '2025-01-10', 500, 5000),
      been('AAA', '2025-02-01', 'sell', 500, 0),
      been('BBB', '2025-02-01', 'buy', 500, 0),
    ]
    // Het oordeel gaat over de BRONRIJEN, dus over de eerste pass — precies
    // wanneer het telt. (Na de omzetting dragen beide benen de meegenomen basis
    // en is het geen 0,00-paar meer; zie de docstring van costBasisKnown.)
    const paar = paarVoor(rijen, 'AAA')
    expect(paar?.costBasisKnown).toBe(false)
    // De WAARDE blijft wel de afgeleide kostbasis: de dagwaarde is hier per
    // definitie 0, en die overnemen zou een reële inleg van 5.000,00 wissen.
    expect(paar?.carriedCostBasis).toBeCloseTo(5000, 6)

    const omgezet = applyDegiroCorporateActions(rijen)
    expect(positionOf('BBB', omgezet).netUnits).toBe(500)
    // De rijen zelf zijn wél stabiel: een tweede pass verandert niets, dus de
    // dedup-sleutels blijven gelijk.
    expect(applyDegiroCorporateActions(omgezet)).toEqual(omgezet)
  })
})

describe('vangrail: een dividend op de actiedatum blokkeert de afleiding niet', () => {
  it('Given een dividendrij op dezelfde dag als de conversie, When afgeleid, Then blijft de kostbasis bekend', () => {
    // Een dividenduitkering verandert het aantal noch de gemiddelde kostprijs,
    // dus hij maakt de dagvolgorde niet ambigu. Zou hij dat wél doen, dan zette
    // een toevallige uitkering een prima kostbasis zonder reden op 'onbekend'.
    const rijen = [
      koop('AAA', '2025-01-10', 100, 1000),
      { ...been('AAA', '2025-02-01', 'dividend', 100, 25), externalId: 'div-1' },
      been('AAA', '2025-02-01', 'sell', 100, 1500),
      been('BBB', '2025-02-01', 'buy', 50, 1500),
    ]
    const omgezet = applyDegiroCorporateActions(rijen)
    const paar = paarVoor(omgezet, 'AAA')

    expect(paar?.costBasisKnown).toBe(true)
    expect(paar?.carriedCostBasis).toBeCloseTo(1000, 6)
  })

  it('Given een gewone AANKOOP op dezelfde dag, When afgeleid, Then is de kostbasis wél onbekend', () => {
    // Het contrast: een koop op de ochtend van de splitsing verandert de
    // positie wél, en we kunnen niet zien of hij voor of na de actie lag.
    const rijen = [
      koop('AAA', '2025-01-10', 100, 1000),
      koop('AAA', '2025-02-01', 50, 600),
      been('AAA', '2025-02-01', 'sell', 150, 1500),
      been('BBB', '2025-02-01', 'buy', 75, 1500),
    ]
    const paar = paarVoor(applyDegiroCorporateActions(rijen), 'AAA')
    expect(paar?.costBasisKnown).toBe(false)
  })
})

describe('vangrail: zonder Order ID-kolom draait de pass niet', () => {
  // Zonder die kolom is `externalId` voor élke rij null en is dus élke rij een
  // kandidaat. Een verkoop van EUR 70.000 en een aankoop van EUR 70.000 op
  // dezelfde dag zouden dan binnen de promille-marge koppelen en allebei hun
  // realisatie verliezen. Een gemiste splitsing is een zichtbaar verkeerd
  // label; een valselijk gekoppelde handelsdag is een stil verdwenen resultaat.
  const zonderOrderIdKolom = fixture(FIXTURE).replace(',Order ID,', ',,')

  it('Given een export zonder Order ID-kolom, When geparsed, Then blijven de benen gewoon buy en sell', () => {
    const zonder = parseBrokerCSV(zonderOrderIdKolom, 'degiro')
    expect(zonder.rows).toHaveLength(18)
    expect(zonder.contentKind).toBe('transactions')
    // Dezelfde rijen die mét de kolom transfer_out/transfer_in worden.
    expect(zonder.rows.map((r) => r.type)).not.toContain('transfer_out')
    expect(zonder.rows.map((r) => r.type)).not.toContain('transfer_in')
    expect(detectDegiroCorporateActions(zonder.rows).length).toBeGreaterThan(0)
  })

  it('Given dezelfde export MET de kolom, When geparsed, Then worden ze wél herkend', () => {
    expect(rows.map((r) => r.type)).toContain('transfer_out')
    expect(rows.map((r) => r.type)).toContain('transfer_in')
  })
})
