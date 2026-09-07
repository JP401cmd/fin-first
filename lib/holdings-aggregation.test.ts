import { describe, it, expect } from 'vitest'
import {
  computePositionFromTransactions,
  valuePosition,
  deriveStoredAggregates,
  HOLDINGS_TX_AGG_LIMIT,
  type PositionTransaction,
} from './holdings-aggregation'
import { PERSONAS } from './test-personas'

describe('computePositionFromTransactions', () => {
  it('geeft een lege positie terug zonder transacties', () => {
    const agg = computePositionFromTransactions([])
    expect(agg.netUnits).toBe(0)
    expect(agg.isClosed).toBe(true)
    expect(agg.realizedPnL).toBe(0)
  })

  it('Shell-voorbeeld: 10 kopen @ €10 + 5 verkopen @ €15 → 5 over, kostprijs €10, gerealiseerd €25', () => {
    const txs: PositionTransaction[] = [
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
    ]
    const agg = computePositionFromTransactions(txs)
    expect(agg.netUnits).toBe(5)
    expect(agg.avgCost).toBeCloseTo(10, 6)
    expect(agg.realizedPnL).toBeCloseTo(25, 6)
    expect(agg.isClosed).toBe(false)

    const valued = valuePosition(agg, 20)
    expect(valued.currentValue).toBeCloseTo(100, 6) // 5 × 20
    expect(valued.unrealizedPnL).toBeCloseTo(50, 6) // (20−10) × 5
    expect(valued.totalPnL).toBeCloseTo(75, 6) // 25 realized + 50 unrealized
  })

  it('TAKEAWAY (echte data): 465 gekocht − 465 verkocht → netto 0, gerealiseerd ≈ €290', () => {
    // Exact de 8 transacties uit de productie-DB voor holding 566f0f4d-…
    const txs: PositionTransaction[] = [
      { type: 'buy', units: 10, price_per_unit: 99.62, date: '2021-01-11' },
      { type: 'buy', units: 40, price_per_unit: 76.48, date: '2021-06-08' },
      { type: 'sell', units: 20, price_per_unit: 81.91, date: '2021-09-01' },
      { type: 'buy', units: 15, price_per_unit: 61, date: '2021-11-17' },
      { type: 'buy', units: 200, price_per_unit: 12.87, date: '2023-11-09' },
      { type: 'buy', units: 120, price_per_unit: 10.66, date: '2024-08-06' },
      { type: 'buy', units: 80, price_per_unit: 12.865, date: '2024-08-16' },
      { type: 'sell', units: 445, price_per_unit: 19.11, date: '2025-02-24' },
    ]
    const agg = computePositionFromTransactions(txs)
    expect(agg.netUnits).toBe(0)
    expect(agg.isClosed).toBe(true)
    expect(agg.totalBoughtUnits).toBe(465)
    expect(agg.totalSoldUnits).toBe(465)
    // Realized ≈ €290 (de gebruiker zag €290 indicatief).
    expect(agg.realizedPnL).toBeGreaterThan(285)
    expect(agg.realizedPnL).toBeLessThan(295)

    // Gesloten positie → marktwaarde 0, totaal = realized.
    const valued = valuePosition(agg, 19.11)
    expect(valued.currentValue).toBe(0)
    expect(valued.unrealizedPnL).toBe(0)
    expect(valued.totalPnL).toBeCloseTo(agg.realizedPnL, 6)
  })

  it('sorteert zelf op datum (volgorde-onafhankelijk)', () => {
    const ordered = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
    ])
    const shuffled = computePositionFromTransactions([
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
    ])
    expect(shuffled).toEqual(ordered)
  })

  it('trekt transactiekosten van het gerealiseerde resultaat af', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01', fees: 1 },
      { type: 'sell', units: 10, price_per_unit: 12, date: '2024-06-01', fees: 1 },
    ])
    // 10×(12−10)=20 gerealiseerd, −2 kosten = 18.
    expect(agg.netUnits).toBe(0)
    expect(agg.realizedPnL).toBeCloseTo(18, 6)
    expect(agg.totalFees).toBeCloseTo(2, 6)
  })

  it('telt dividend als inkomsten bij het gerealiseerde resultaat', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 5, date: '2024-03-01' },
    ])
    expect(agg.netUnits).toBe(10)
    expect(agg.dividends).toBeCloseTo(5, 6)
    expect(agg.realizedPnL).toBeCloseTo(5, 6)
  })
})

describe('HOLDINGS_TX_AGG_LIMIT — cap-correctheidscontract (H1)', () => {
  /**
   * Toont dat de volgorde-afkap (nieuwste-N-first) een ANDERE avgCost en
   * realizedPnL oplevert dan de volledige set. Het detailpane-pad stuurde
   * vroeger `.order('date', { ascending: false }).limit(200)` → de earliest
   * aankopen worden dan weggelaten → gemiddelde kostprijs klopt niet.
   *
   * Zes transacties: initiële aankoop (datum 2020) + vijf latere. De initiële
   * aankoop heeft de laagste prijs → weglaten verhoogt de avgCost, waardoor
   * de gerealiseerde winst bij de verkoop daalt.
   */
  it('deelset (zonder vroegste aankoop) levert andere avgCost dan volledige set', () => {
    // Volledige historische set (chronologisch: vroegste eerst)
    const volledigSet: PositionTransaction[] = [
      { type: 'buy', units: 100, price_per_unit: 10, date: '2020-01-01' }, // vroegste/goedkoopste
      { type: 'buy', units: 50, price_per_unit: 20, date: '2021-01-01' },
      { type: 'buy', units: 50, price_per_unit: 22, date: '2022-01-01' },
      { type: 'buy', units: 50, price_per_unit: 24, date: '2023-01-01' },
      { type: 'buy', units: 50, price_per_unit: 26, date: '2024-01-01' },
      { type: 'sell', units: 100, price_per_unit: 30, date: '2025-01-01' },
    ]

    // Deelset: nieuwste 5 transacties (wat .order('date', DESC).limit(5) geeft)
    // De vroegste aankoop (2020-01-01) valt weg.
    const deelSet = volledigSet.slice(1) // zonder de eerste (2020) entry

    const aggVolledig = computePositionFromTransactions(volledigSet)
    const aggDeel = computePositionFromTransactions(deelSet)

    // Verschillende avgCost: zonder de goedkope 2020-aankoop is de gem. kostprijs hoger.
    expect(aggDeel.avgCost).toBeGreaterThan(aggVolledig.avgCost)

    // Verschillende realizedPnL: lagere kostprijs op de volledige set = hogere winst.
    expect(aggVolledig.realizedPnL).toBeGreaterThan(aggDeel.realizedPnL)
  })

  it('cap is minstens 5000 — per-ongeluk verlagen maakt deze test rood', () => {
    expect(HOLDINGS_TX_AGG_LIMIT).toBeGreaterThanOrEqual(5000)
  })
})

describe('computePositionFromTransactions — split (aandelensplitsing)', () => {
  it('2-voor-1 split verdubbelt units en halveert de kostprijs; kostbasis blijft gelijk', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 100, price_per_unit: 10, date: '2024-01-01' },
      { type: 'split', units: 2, price_per_unit: 0, date: '2024-06-01' },
    ])
    expect(agg.netUnits).toBe(200)
    expect(agg.avgCost).toBeCloseTo(5, 6)
    // Een split verandert je inleg niet, alleen de stukjes: 200×5 === 100×10.
    expect(agg.netUnits * agg.avgCost).toBeCloseTo(1000, 6)
  })

  it('split vóór een verkoop realiseert tegen de post-split kostprijs', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 100, price_per_unit: 10, date: '2024-01-01' },
      { type: 'split', units: 2, price_per_unit: 0, date: '2024-06-01' },
      { type: 'sell', units: 50, price_per_unit: 8, date: '2024-09-01' },
    ])
    expect(agg.netUnits).toBe(150)
    expect(agg.avgCost).toBeCloseTo(5, 6)
    // Verkoop 50 @ 8 tegen kostprijs 5 → gerealiseerd 50×(8−5)=150.
    expect(agg.realizedPnL).toBeCloseTo(150, 6)
  })
})

describe('computePositionFromTransactions — transfer_out / transfer_in', () => {
  // De twee benen van een corporate action (DEGIRO-splitsing, naamswijziging,
  // conversie). De oude regel sluit zonder opbrengst; de nieuwe opent met de
  // meegenomen kostbasis. De `split`-tak hierboven blijft ongemoeid: die kent
  // FACTOR-semantiek op één ISIN en past niet op een paar met absolute
  // aantallen op twee ISIN's.

  it('Given een positie van 200 @ €11, When transfer_out 200, Then sluit hij zonder opbrengst en zonder realisatie', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 200, price_per_unit: 11, date: '2025-01-01' },
      { type: 'transfer_out', units: 200, price_per_unit: 11, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(0)
    expect(agg.totalSoldUnits).toBe(0)
    expect(agg.totalProceeds).toBe(0)
    expect(agg.realizedPnL).toBe(0)
    expect(agg.isClosed).toBe(true)
  })

  it('Given een transfer_in van 20 @ €110, When herleid, Then telt de inleg NIET mee in totalInvested', () => {
    const agg = computePositionFromTransactions([
      { type: 'transfer_in', units: 20, price_per_unit: 110, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(20)
    expect(agg.avgCost).toBeCloseTo(110, 6)
    // Anders wordt de inleg over de oude én de nieuwe regel dubbelgeteld.
    expect(agg.totalBoughtUnits).toBe(0)
    expect(agg.totalInvested).toBe(0)
  })

  it('Given een gedeeltelijke transfer_out, When herleid, Then blijft de kostprijs van de rest gelijk', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 100, price_per_unit: 10, date: '2025-01-01' },
      { type: 'transfer_out', units: 40, price_per_unit: 10, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(60)
    expect(agg.avgCost).toBeCloseTo(10, 6)
    expect(agg.realizedPnL).toBe(0)
  })

  it('Given een transfer_in op een bestaande positie, When herleid, Then middelt de kostprijs zoals bij een koop', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 100, price_per_unit: 10, date: '2025-01-01' },
      { type: 'transfer_in', units: 100, price_per_unit: 20, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(200)
    expect(agg.avgCost).toBeCloseTo(15, 6)
  })

  it('Given een forward split als paar op dezelfde regel, When herleid, Then blijft de totale kostbasis gelijk', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 60, price_per_unit: 5, date: '2025-01-01' },
      { type: 'transfer_out', units: 60, price_per_unit: 5, date: '2025-06-01' },
      { type: 'transfer_in', units: 120, price_per_unit: 2.5, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(120)
    expect(agg.avgCost).toBeCloseTo(2.5, 6)
    expect(agg.netUnits * agg.avgCost).toBeCloseTo(300, 6)
    expect(agg.totalProceeds).toBe(0)
  })

  it('Given een transfer_out zonder voorafgaande aankoop, When herleid, Then wordt de positie negatief (zichtbaar gat, geen stilte)', () => {
    // Spiegelt het `sell`-gedrag: holdings-sync klemt op 0 en zet
    // `historyIncomplete`. Een genegeerde transfer_out zou de oude regel juist
    // op zijn volledige aantal laten staan — dubbeltelling, en stil.
    const agg = computePositionFromTransactions([
      { type: 'transfer_out', units: 50, price_per_unit: 4, date: '2025-06-01' },
    ])
    expect(agg.netUnits).toBe(-50)
  })
})

describe('deriveStoredAggregates — engine-uitvoer als op te slaan holding-aggregaten', () => {
  it('units === netUnits en avgPurchasePrice === avgCost (geen tweede berekening)', () => {
    const txs: PositionTransaction[] = [
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'buy', units: 10, price_per_unit: 20, date: '2024-02-01' },
    ]
    const agg = computePositionFromTransactions(txs)
    const stored = deriveStoredAggregates(txs)
    expect(stored.units).toBe(agg.netUnits)
    expect(stored.avgPurchasePrice).toBe(agg.avgCost)
    expect(stored.avgPurchasePrice).toBeCloseTo(15, 6)
  })
})

/**
 * Regressie voor de bug "Holding-detail toont inconsistente kostenbasis"
 * (UAT-BEZIT-16): het opgeslagen `avg_purchase_price` mag NOOIT afwijken van de
 * transactie-afgeleide gewogen gemiddelde kostprijs — anders leest "ingelegd"
 * een andere bron dan "koerswinst" en telt het scherm niet op.
 */
describe('consistente kostenbasis — ingelegd + koerswinst === marktwaarde', () => {
  /** Bouwt een ISO-datum uit `monthsAgo` — spiegelt seed-persona.ts. */
  function personaTxDate(monthsAgo: number): string {
    const d = new Date()
    d.setMonth(d.getMonth() - monthsAgo)
    return d.toISOString()
  }

  it('single-source-invariant: netUnits×avgCost + ongerealiseerd === marktwaarde', () => {
    // Zolang ÉÉN avgCost zowel de kostbasis ("ingelegd") als de ongerealiseerde
    // winst ("koerswinst") voedt, telt het scherm per definitie op. Dit is de
    // generieke assertie die het hele bugtype afvangt.
    const cases: PositionTransaction[][] = [
      [{ type: 'buy', units: 100, price_per_unit: 10, date: '2020-01-01' }],
      [
        { type: 'buy', units: 100, price_per_unit: 10, date: '2020-01-01' },
        { type: 'buy', units: 50, price_per_unit: 20, date: '2021-01-01' },
        { type: 'sell', units: 30, price_per_unit: 25, date: '2022-01-01' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 40, date: '2022-06-01' },
      ],
    ]
    for (const txs of cases) {
      const agg = computePositionFromTransactions(txs)
      const valued = valuePosition(agg, 30)
      const ingelegd = agg.netUnits * agg.avgCost
      expect(ingelegd + valued.unrealizedPnL).toBeCloseTo(valued.currentValue, 6)
    }
  })

  it('persona compleet (Meesman): opgeslagen avg === transactie-afgeleide avgCost (geen stale 94,81)', () => {
    const meesman = PERSONAS.compleet.holdings!.find(
      (h) => h.assetName === 'Meesman Wereldwijd Totaal',
    )!
    const agg = computePositionFromTransactions(
      meesman.transactions.map((t) => ({
        type: t.type,
        units: t.units,
        price_per_unit: t.price_per_unit,
        total_amount: t.total_amount,
        date: personaTxDate(t.monthsAgo),
      })),
    )
    // Σ inleg / Σ units = 226.140 / 2.215 = 102,0948 (NIET het oude 94,81).
    expect(agg.avgCost).toBeCloseTo(102.0948, 4)
    expect(meesman.avg_purchase_price).toBeCloseTo(agg.avgCost, 4)
    expect(meesman.units).toBe(agg.netUnits)
  })

  it('Meesman detail-pane telt op: ingelegd(opgeslagen) + koerswinst(engine) === marktwaarde', () => {
    const meesman = PERSONAS.compleet.holdings!.find(
      (h) => h.assetName === 'Meesman Wereldwijd Totaal',
    )!
    const agg = computePositionFromTransactions(
      meesman.transactions.map((t) => ({
        type: t.type,
        units: t.units,
        price_per_unit: t.price_per_unit,
        total_amount: t.total_amount,
        date: personaTxDate(t.monthsAgo),
      })),
    )
    const valued = valuePosition(agg, meesman.current_price)
    // Exact de mix uit de bug: "ingelegd" leest het opgeslagen veld, "koerswinst"
    // de engine. Vóór de fix: 210.004 + 73.948 = 283.952 ≠ 300.088 (gat €16.136).
    const ingelegd = meesman.units * meesman.avg_purchase_price
    const koerswinst = valued.unrealizedPnL
    const marktwaarde = meesman.units * meesman.current_price
    expect(Math.abs(ingelegd + koerswinst - marktwaarde)).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// Volgorde binnen één datum
// ---------------------------------------------------------------------------
//
// Beide benen van een forward split op dezelfde ISIN dragen dezelfde datum, en
// in de database ordent NIETS ze: `id` is een random uuid en `created_at` is
// voor alle rijen van één upsert gelijk. De drie consumenten vragen bovendien
// drie verschillende sorteringen (`date ASC, created_at ASC`, geen `order()`,
// `date DESC`). De garantie hoort dus in de engine, niet in de parser: die
// levert een lijst af die na de DB-round-trip niet meer bestaat.
// ---------------------------------------------------------------------------

describe('computePositionFromTransactions — volgorde binnen één datum', () => {
  // 60 stuks à EUR 5 = EUR 300 inleg, daarna een 2-voor-1 split: 60 eruit,
  // 120 erin met dezelfde meegenomen kostbasis (EUR 2,50 per stuk).
  const koop: PositionTransaction = {
    type: 'buy',
    units: 60,
    price_per_unit: 5,
    total_amount: 300,
    date: '2025-05-01',
  }
  const uitBeen: PositionTransaction = {
    type: 'transfer_out',
    units: 60,
    price_per_unit: 5,
    total_amount: 300,
    date: '2025-11-01',
  }
  const inBeen: PositionTransaction = {
    type: 'transfer_in',
    units: 120,
    price_per_unit: 2.5,
    total_amount: 300,
    date: '2025-11-01',
  }

  it('Given het in-been vóór het uit-been in de invoer, When afgeleid, Then blijft de inleg EUR 300 en niet EUR 400', () => {
    // Dit is de volgorde die een `date DESC`-query of een query zonder
    // `order()` zomaar kan opleveren. Zonder tweede sorteersleutel telde de lus
    // 60 oude + 120 nieuwe stukken en middelde over 180: EUR 3,3333 per stuk.
    const agg = computePositionFromTransactions([koop, inBeen, uitBeen])
    expect(agg.netUnits).toBe(120)
    expect(agg.avgCost).toBeCloseTo(2.5, 6)
    expect(agg.netUnits * agg.avgCost).toBeCloseTo(300, 6)
  })

  it('Given elke denkbare invoervolgorde, When afgeleid, Then is de uitkomst identiek', () => {
    const permutaties: PositionTransaction[][] = [
      [koop, uitBeen, inBeen],
      [koop, inBeen, uitBeen],
      [uitBeen, inBeen, koop],
      [inBeen, uitBeen, koop],
      [uitBeen, koop, inBeen],
      [inBeen, koop, uitBeen],
    ]
    const uitkomsten = permutaties.map((p) => {
      const agg = computePositionFromTransactions(p)
      return {
        netUnits: agg.netUnits,
        avgCost: Math.round(agg.avgCost * 1e6) / 1e6,
        totalInvested: agg.totalInvested,
        totalProceeds: agg.totalProceeds,
        realizedPnL: agg.realizedPnL,
      }
    })
    for (const uitkomst of uitkomsten) {
      expect(uitkomst).toEqual(uitkomsten[0])
    }
    expect(uitkomsten[0]).toEqual({
      netUnits: 120,
      avgCost: 2.5,
      totalInvested: 300,
      totalProceeds: 0,
      realizedPnL: 0,
    })
  })

  it('Given een gewone koop en verkoop op dezelfde dag, When afgeleid, Then verandert er niets aan de bestaande volgorde', () => {
    // De rang raakt alleen transfer_*; al het andere houdt rang 0 en blijft dus
    // in de volgorde waarin het binnenkwam (stabiele sort).
    const koopA: PositionTransaction = {
      type: 'buy', units: 10, price_per_unit: 10, total_amount: 100, date: '2025-03-01',
    }
    const verkoopA: PositionTransaction = {
      type: 'sell', units: 10, price_per_unit: 15, total_amount: 150, date: '2025-03-01',
    }
    const agg = computePositionFromTransactions([koopA, verkoopA])
    expect(agg.netUnits).toBe(0)
    expect(agg.realizedPnL).toBeCloseTo(50, 6)
  })
})
