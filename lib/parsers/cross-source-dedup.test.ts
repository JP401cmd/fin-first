import { describe, it, expect } from 'vitest'
import {
  buildCrossSourceKeys,
  countCrossSourceDecisions,
  CROSS_SOURCE_DATE_TOLERANCE_DAYS,
  findCrossSourceDuplicate,
  normalizeIban,
  partitionCrossSourceDuplicates,
  shiftIsoDate,
  type CrossSourceCandidate,
} from './cross-source-dedup'

/**
 * Dedup-laag 2 — cross-bron duplicaatdetectie.
 *
 * Deze suite pint de sleutel vast: datum ±1 kalenderdag, bedrag exact op de cent
 * inclusief teken, tegenpartij-IBAN exact gelijk of (bij eenzijdig ontbrekende
 * IBAN) de genormaliseerde naam exact gelijk. Elke test die hier "geen match"
 * eist beschermt een échte transactie tegen stil verlies; dat is de dure fout.
 */

function tx(over: Partial<CrossSourceCandidate> = {}): CrossSourceCandidate {
  return {
    date: '2026-07-10',
    amount: -42.5,
    counterparty_iban: 'NL91ABNA0417164300',
    counterparty_name: 'Albert Heijn',
    ...over,
  }
}

describe('buildCrossSourceKeys', () => {
  it('zet het bedrag om naar hele centen, inclusief teken', () => {
    expect(buildCrossSourceKeys(tx({ amount: -42.5 })).amountCents).toBe(-4250)
    expect(buildCrossSourceKeys(tx({ amount: 42.5 })).amountCents).toBe(4250)
    // Doubles: -12.5 * 100 kan als -1249.9999… uit de vermenigvuldiging komen.
    // Afkappen zou daar -1249 van maken en de exacte match stil slopen.
    expect(buildCrossSourceKeys(tx({ amount: -12.5 })).amountCents).toBe(-1250)
    expect(buildCrossSourceKeys(tx({ amount: 8.13 })).amountCents).toBe(813)
    expect(buildCrossSourceKeys(tx({ amount: 0 })).amountCents).toBe(0)
  })

  it('normaliseert de IBAN en laat een lege tegenpartij null worden', () => {
    expect(buildCrossSourceKeys(tx({ counterparty_iban: 'nl91 abna 0417 1643 00' })).iban)
      .toBe('NL91ABNA0417164300')
    expect(buildCrossSourceKeys(tx({ counterparty_iban: '   ' })).iban).toBeNull()
    expect(buildCrossSourceKeys(tx({ counterparty_name: '   ' })).name).toBeNull()
  })

  it('gebruikt de canonieke tegenpartij-normalisatie, geen eigen variant', () => {
    // PSP-prefix + trailing filiaalnummer worden gestript — dat is precies wat
    // normalizeCounterparty doet en wat deze module NIET zelf naprogrammeert.
    expect(buildCrossSourceKeys(tx({ counterparty_name: 'CCV*BAKKER 12' })).name)
      .toBe(buildCrossSourceKeys(tx({ counterparty_name: 'Bakker' })).name)
  })

  it('levert NaN bij een onleesbare datum, zodat die nergens mee matcht', () => {
    expect(buildCrossSourceKeys(tx({ date: '10-07-2026' })).day).toBeNaN()
    expect(findCrossSourceDuplicate(tx({ date: '10-07-2026' }), [tx()])).toBeNull()
    expect(findCrossSourceDuplicate(tx(), [tx({ date: 'onzin' })])).toBeNull()
  })
})

describe('normalizeIban', () => {
  it('strips scheidingstekens en maakt hoofdletters', () => {
    expect(normalizeIban('nl91-abna 0417.1643 00')).toBe('NL91ABNA0417164300')
  })

  it('geeft null bij leeg of alleen ruis', () => {
    expect(normalizeIban(null)).toBeNull()
    expect(normalizeIban(undefined)).toBeNull()
    expect(normalizeIban('   ')).toBeNull()
    expect(normalizeIban('--')).toBeNull()
  })
})

describe('findCrossSourceDuplicate — match op IBAN', () => {
  it('herkent dezelfde boeking met een andere omschrijving', () => {
    // Dit is de hele bestaansreden van laag 2: laag 1 hasht de omschrijving mee,
    // dus een bank-tekst en een CSV-tekst voor één boeking krijgen een andere hash.
    const existing = [tx({ counterparty_name: 'ALBERT HEIJN 1234' })]
    const found = findCrossSourceDuplicate(tx({ counterparty_name: 'AH to go Utrecht CS' }), existing)

    expect(found).not.toBeNull()
    expect(found?.reason).toBe('iban')
    expect(found?.match).toBe(existing[0])
  })

  it('matcht ook als de IBAN anders gespatieerd is', () => {
    const found = findCrossSourceDuplicate(
      tx({ counterparty_iban: 'NL91 ABNA 0417 1643 00' }),
      [tx({ counterparty_iban: 'nl91abna0417164300' })],
    )
    expect(found?.reason).toBe('iban')
  })

  it('matcht NIET bij twee verschillende IBANs, ook niet als de naam gelijk is', () => {
    // Twee verschillende IBANs zijn positief bewijs van twee tegenpartijen; een
    // gelijke naam mag dat niet overrulen (anders vallen twee filialen samen).
    const found = findCrossSourceDuplicate(
      tx({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'Albert Heijn' }),
      [tx({ counterparty_iban: 'NL02RABO0123456789', counterparty_name: 'Albert Heijn' })],
    )
    expect(found).toBeNull()
  })
})

describe('findCrossSourceDuplicate — naam-terugval', () => {
  it('valt terug op de genormaliseerde naam als één zijde geen IBAN heeft', () => {
    const found = findCrossSourceDuplicate(
      tx({ counterparty_iban: null, counterparty_name: 'CCV*BAKKER 12' }),
      [tx({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'Bakker' })],
    )
    expect(found?.reason).toBe('name')
  })

  it('valt terug op de naam als BEIDE zijden geen IBAN hebben', () => {
    const found = findCrossSourceDuplicate(
      tx({ counterparty_iban: null, counterparty_name: 'Bakker B.V.' }),
      [tx({ counterparty_iban: null, counterparty_name: 'Bakker' })],
    )
    expect(found?.reason).toBe('name')
  })

  it('matcht niet bij een afwijkende naam', () => {
    const found = findCrossSourceDuplicate(
      tx({ counterparty_iban: null, counterparty_name: 'Bakker' }),
      [tx({ counterparty_iban: null, counterparty_name: 'Slager' })],
    )
    expect(found).toBeNull()
  })

  it('matcht niet als één zijde géén IBAN én géén bruikbare naam heeft', () => {
    // Alleen datum + bedrag over: dat zou elke maandelijkse vaste last op
    // zichzelf laten lijken. Bewust geen match.
    expect(
      findCrossSourceDuplicate(
        tx({ counterparty_iban: null, counterparty_name: null }),
        [tx({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'Albert Heijn' })],
      ),
    ).toBeNull()

    expect(
      findCrossSourceDuplicate(
        tx({ counterparty_iban: null, counterparty_name: '  ' }),
        [tx({ counterparty_iban: null, counterparty_name: null })],
      ),
    ).toBeNull()
  })
})

describe('findCrossSourceDuplicate — datumtolerantie', () => {
  it('matcht binnen ±1 kalenderdag, in beide richtingen', () => {
    expect(CROSS_SOURCE_DATE_TOLERANCE_DAYS).toBe(1)
    expect(findCrossSourceDuplicate(tx({ date: '2026-07-11' }), [tx({ date: '2026-07-10' })])).not.toBeNull()
    expect(findCrossSourceDuplicate(tx({ date: '2026-07-09' }), [tx({ date: '2026-07-10' })])).not.toBeNull()
  })

  it('matcht NIET bij ±2 dagen', () => {
    expect(findCrossSourceDuplicate(tx({ date: '2026-07-12' }), [tx({ date: '2026-07-10' })])).toBeNull()
    expect(findCrossSourceDuplicate(tx({ date: '2026-07-08' }), [tx({ date: '2026-07-10' })])).toBeNull()
  })

  it('telt kalenderdagen over een maand- en jaargrens heen', () => {
    expect(findCrossSourceDuplicate(tx({ date: '2026-08-01' }), [tx({ date: '2026-07-31' })])).not.toBeNull()
    expect(findCrossSourceDuplicate(tx({ date: '2027-01-01' }), [tx({ date: '2026-12-31' })])).not.toBeNull()
    expect(findCrossSourceDuplicate(tx({ date: '2026-08-02' }), [tx({ date: '2026-07-31' })])).toBeNull()
  })
})

describe('findCrossSourceDuplicate — bedrag', () => {
  it('matcht niet bij één cent verschil', () => {
    expect(findCrossSourceDuplicate(tx({ amount: -42.51 }), [tx({ amount: -42.5 })])).toBeNull()
    expect(findCrossSourceDuplicate(tx({ amount: -42.49 }), [tx({ amount: -42.5 })])).toBeNull()
  })

  it('matcht niet bij een omgekeerd teken', () => {
    // Een terugbetaling van €42,50 is géén duplicaat van de betaling van €42,50.
    expect(findCrossSourceDuplicate(tx({ amount: 42.5 }), [tx({ amount: -42.5 })])).toBeNull()
  })
})

describe('partitionCrossSourceDuplicates', () => {
  it('houdt de volgorde aan en markeert alleen de duplicaten', () => {
    const existing = [tx({ date: '2026-07-10', amount: -42.5 })]
    const decisions = partitionCrossSourceDuplicates(
      [
        tx({ date: '2026-07-10', amount: -42.5, counterparty_name: 'Andere tekst' }),
        tx({ date: '2026-07-10', amount: -9.99 }),
      ],
      existing,
    )

    expect(decisions.map((d) => d.reason)).toEqual(['iban', null])
    expect(decisions[1].candidate.amount).toBe(-9.99)
  })

  it('laat één bestaande rij hooguit één kandidaat absorberen', () => {
    // Twee échte boekingen van €5 bij dezelfde bakker op dezelfde dag, één
    // bestaande CSV-rij. Zou de match een filter zijn, dan verdween er stil één.
    const bakker = { counterparty_iban: null, counterparty_name: 'Bakker', amount: -5, date: '2026-07-10' }
    const decisions = partitionCrossSourceDuplicates(
      [{ ...bakker }, { ...bakker }],
      [{ ...bakker }],
    )

    expect(decisions.map((d) => d.reason)).toEqual(['name', null])
  })

  it('vergelijkt kandidaten NIET onderling', () => {
    // Twee identieke rijen uit dezelfde bron zijn het werk van laag 1, niet van
    // laag 2. Zonder bestaande rijen is deze laag per definitie een no-op —
    // precies wat er op een verse rekening gebeurt.
    const decisions = partitionCrossSourceDuplicates([tx(), tx()], [])
    expect(decisions.map((d) => d.reason)).toEqual([null, null])
  })

  it('is een no-op bij een lege bestaande-lijst', () => {
    const decisions = partitionCrossSourceDuplicates([tx(), tx({ amount: -1 })], [])
    expect(decisions.every((d) => d.reason === null)).toBe(true)
  })
})

describe('countCrossSourceDecisions', () => {
  it('telt per reden, zodat de blinde vlek van de naam-terugval meetbaar is', () => {
    const counts = countCrossSourceDecisions([
      { candidate: null, reason: 'iban' },
      { candidate: null, reason: 'name' },
      { candidate: null, reason: 'name' },
      { candidate: null, reason: null },
    ])
    expect(counts).toEqual({ iban: 1, name: 2, total: 3 })
  })
})

describe('shiftIsoDate', () => {
  it('verschuift over maand- en jaargrenzen', () => {
    expect(shiftIsoDate('2026-07-31', 1)).toBe('2026-08-01')
    expect(shiftIsoDate('2026-08-01', -1)).toBe('2026-07-31')
    expect(shiftIsoDate('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('laat een onleesbare datum ongemoeid in plaats van een gok te doen', () => {
    expect(shiftIsoDate('onzin', -1)).toBe('onzin')
  })
})
