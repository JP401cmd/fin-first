import { describe, it, expect } from 'vitest'
import {
  buildPortfolioValueHistory,
  type PortfolioTransaction,
  type PriceObservation,
} from './portfolio-value-history'

/**
 * Tests voor de portefeuille-waardecurve. De kern die bewezen moet worden is de
 * prijsladder: markt → laatst bekende transactieprijs → kostprijs, en dat elk
 * punt eerlijk meldt hoeveel van de waarde op trap 1 rust.
 */

function tx(
  holding_id: string,
  type: string,
  units: number,
  price_per_unit: number,
  date: string,
): PortfolioTransaction {
  return { holding_id, type, units, price_per_unit, total_amount: units * price_per_unit, date }
}

function price(holding_id: string, date: string, close_price: number): PriceObservation {
  return { holding_id, date, close_price }
}

describe('buildPortfolioValueHistory', () => {
  it('geeft niets terug zonder transacties', () => {
    const r = buildPortfolioValueHistory({ transactions: [], prices: [], today: '2026-08-10' })
    expect(r.points).toEqual([])
    expect(r.averagePricedFromMarket).toBe(0)
  })

  it('waardeert op de marktkoers van de peildatum, niet op de kostprijs', () => {
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 10, 100, '2026-01-15')],
      prices: [
        price('h1', '2026-01-31', 110),
        price('h1', '2026-02-28', 120),
      ],
      today: '2026-03-15',
    })

    // Peildatums: 1 feb, 1 mrt, en vandaag.
    expect(r.points.map((p) => p.date)).toEqual(['2026-02-01', '2026-03-01', '2026-03-15'])
    expect(r.points[0].marketValue).toBe(1100) // koers 31 jan
    expect(r.points[1].marketValue).toBe(1200) // koers 28 feb
    // De inleg beweegt níet mee met de koers.
    expect(r.points[0].costBasis).toBe(1000)
    expect(r.points[1].costBasis).toBe(1000)
    expect(r.points[0].pricedFromMarket).toBe(1)
  })

  it('valt terug op de laatst bekende transactieprijs zonder koershistorie', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('turbo', 'buy', 5, 100, '2026-01-10'),
        tx('turbo', 'buy', 5, 140, '2026-02-10'),
      ],
      prices: [],
      today: '2026-04-05',
    })

    // 1 feb: alleen de eerste koop is gezien → 5 × 100.
    expect(r.points[0]).toMatchObject({ date: '2026-02-01', marketValue: 500 })
    // 1 mrt: beide kopen → 10 stuks tegen de laatste transactieprijs 140.
    expect(r.points[1]).toMatchObject({ date: '2026-03-01', marketValue: 1400 })
    // Niets rust op een marktkoers — en dat wordt gemeld.
    expect(r.points[1].pricedFromMarket).toBe(0)
    expect(r.holdingsWithoutMarketPrice).toEqual(['turbo'])
  })

  it('mengt beide trappen en rapporteert het aandeel marktkoers per punt', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('aandeel', 'buy', 10, 100, '2026-01-10'),
        tx('turbo', 'buy', 10, 100, '2026-01-10'),
      ],
      prices: [price('aandeel', '2026-01-31', 100)],
      today: '2026-02-20',
    })

    const feb = r.points[0]
    expect(feb.marketValue).toBe(2000)
    // De helft van de waarde rust op een echte slotkoers.
    expect(feb.pricedFromMarket).toBeCloseTo(0.5, 6)
    expect(r.holdingsWithoutMarketPrice).toEqual(['turbo'])
  })

  it('laat een gesloten positie uit de curve vallen vanaf het moment van verkoop', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('h1', 'buy', 10, 100, '2026-01-10'),
        tx('h1', 'sell', 10, 130, '2026-02-10'),
      ],
      prices: [
        price('h1', '2026-01-31', 120),
        price('h1', '2026-02-28', 140),
      ],
      today: '2026-04-01',
    })

    expect(r.points[0]).toMatchObject({ date: '2026-02-01', marketValue: 1200, openPositions: 1 })
    // Ná de verkoop draagt de positie niets meer bij, ook al bewoog de koers door.
    expect(r.points[1]).toMatchObject({ date: '2026-03-01', marketValue: 0, openPositions: 0 })
  })

  it('telt een positie met alleen een verkoop niet als negatieve waarde mee', () => {
    // Het exportvenster bevat de oorspronkelijke aankoop niet: netto −5.
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('gezond', 'buy', 10, 100, '2026-01-10'),
        tx('gat', 'sell', 5, 116.66, '2026-01-15'),
      ],
      prices: [],
      today: '2026-03-01',
    })

    // Alleen de gezonde positie telt; de onvolledige drukt de waarde niet.
    expect(r.points[0]).toMatchObject({ date: '2026-02-01', marketValue: 1000, openPositions: 1 })
    expect(r.points.every((p) => p.marketValue >= 0)).toBe(true)
  })

  it('houdt de laatste bekende koers vast in maanden zonder observatie', () => {
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 10, 100, '2026-01-10')],
      prices: [price('h1', '2026-01-20', 150)],
      today: '2026-04-10',
    })

    // Eén observatie, vier peildatums (1 feb/mrt/apr + vandaag) — de koers wordt
    // doorgetrokken, niet teruggevallen op de kostprijs.
    expect(r.points.map((p) => p.date)).toEqual([
      '2026-02-01', '2026-03-01', '2026-04-01', '2026-04-10',
    ])
    expect(r.points.map((p) => p.marketValue)).toEqual([1500, 1500, 1500, 1500])
    expect(r.points.every((p) => p.pricedFromMarket === 1)).toBe(true)
  })

  it('gebruikt de kostprijs alleen als er geen enkele prijs bekend is', () => {
    const r = buildPortfolioValueHistory({
      // Een aankoop zonder prijs (bv. een overboeking) laat trap 2 leeg.
      transactions: [
        { holding_id: 'h1', type: 'buy', units: 10, price_per_unit: 0, total_amount: 0, date: '2026-01-10' },
      ],
      prices: [],
      today: '2026-03-01',
    })

    expect(r.points[0].marketValue).toBe(0) // avgCost is 0 bij prijs 0
    expect(r.points[0].openPositions).toBe(1)
  })

  // Given een dividenduitkering waarvan de broker het bedrag PER AANDEEL in
  // `price_per_unit` zet (Trading 212 "Price / share", eToro bedrag ÷ stuks);
  // When de positie daarna gewaardeerd wordt via trap 2;
  // Then mag dat dividend nooit als koers gelden — een positie van €9.000 zou
  // anders op €25 uitkomen.
  it('gebruikt een dividendbedrag per aandeel niet als koers', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('h1', 'buy', 100, 90, '2026-01-10'),
        tx('h1', 'dividend', 100, 0.25, '2026-02-05'),
      ],
      prices: [],
      today: '2026-04-01',
    })

    expect(r.points.map((p) => p.marketValue)).toEqual([9000, 9000, 9000])
  })

  // Given een 2-voor-1 aandelensplitsing, waarbij de engine het aantal
  // eenheden verdubbelt en de kostprijs halveert;
  // When de positie via trap 2 op de laatst bekende transactieprijs wordt
  // gewaardeerd;
  // Then moet die prijs mee gehalveerd worden — anders verdubbelt de waarde
  // uit het niets en leest dat als 100% rendement.
  it('corrigeert de laatst bekende prijs voor een aandelensplitsing', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('h1', 'buy', 100, 90, '2026-01-10'),
        // Split-rij: units = de factor, geen prijs.
        { holding_id: 'h1', type: 'split', units: 2, price_per_unit: 0, total_amount: 0, date: '2026-02-05' },
      ],
      prices: [],
      today: '2026-04-01',
    })

    // 100 × 90 vóór, 200 × 45 ná — dezelfde €9.000.
    expect(r.points.map((p) => p.marketValue)).toEqual([9000, 9000, 9000])
    // En de inleg beweegt evenmin: een split verandert je inleg niet.
    expect(r.points.map((p) => p.costBasis)).toEqual([9000, 9000, 9000])
  })

  it('sluit altijd af op de peildatum van vandaag', () => {
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 1, 100, '2026-01-10')],
      prices: [price('h1', '2026-08-09', 250)],
      today: '2026-08-10',
    })

    const last = r.points[r.points.length - 1]
    expect(last.date).toBe('2026-08-10')
    expect(last.marketValue).toBe(250)
  })

  it('begint nooit vóór de eerste transactie, ook niet bij een ruimer venster', () => {
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 10, 100, '2026-01-10')],
      prices: [],
      today: '2026-03-05',
      from: '2016-01-01', // 10 jaar terug gevraagd
    })

    // Geen 120 nulpunten vóór de eerste aankoop — alleen 1 feb, 1 mrt, vandaag.
    expect(r.points.map((p) => p.date)).toEqual(['2026-02-01', '2026-03-01', '2026-03-05'])
  })

  it('respecteert een venster dat NÁ de eerste transactie begint', () => {
    const r = buildPortfolioValueHistory({
      transactions: [
        tx('h1', 'buy', 10, 100, '2025-01-10'),
        tx('h1', 'buy', 10, 100, '2026-01-10'),
      ],
      prices: [],
      today: '2026-03-05',
      from: '2025-12-01',
    })

    expect(r.points[0].date).toBe('2026-01-01')
    // De aankoop uit 2025 telt wél mee — het venster knipt de weergave af,
    // niet de historie waaruit de positie volgt.
    expect(r.points[0].marketValue).toBe(1000)
  })

  it('respecteert de hardheid van een meegegeven observatie', () => {
    // De aanroeper geeft de actuele koers mee als slotobservatie, maar die is
    // met de hand ingevoerd — hij bepaalt wél de waarde, en telt níet als markt.
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 10, 100, '2026-01-10')],
      prices: [{ holding_id: 'h1', date: '2026-03-01', close_price: 150, tier: 'transaction' }],
      today: '2026-03-05',
    })

    const last = r.points[r.points.length - 1]
    expect(last.marketValue).toBe(1500)
    expect(last.pricedFromMarket).toBe(0)
    expect(r.holdingsWithoutMarketPrice).toEqual(['h1'])
  })

  it('rolt de jaargrens correct over', () => {
    const r = buildPortfolioValueHistory({
      transactions: [tx('h1', 'buy', 1, 100, '2025-11-10')],
      prices: [],
      today: '2026-02-15',
    })

    expect(r.points.map((p) => p.date)).toEqual([
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-02-15',
    ])
  })
})
