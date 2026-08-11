/**
 * Tests voor de gedeelde portefeuille-totalen.
 *
 * Deze helper bestaat omdat de loader en `GET /api/holdings` elk hun eigen som
 * hadden. Wat hier vastgepind wordt is daarom niet alleen "telt hij goed op",
 * maar vooral: telt hij élke positie mee, in élke situatie, met wisselkoersen.
 */

import { describe, it, expect } from 'vitest'
import { sumHoldingTotals, type HoldingTotalsRow } from './holdings-totals'

function row(p: Partial<HoldingTotalsRow>): HoldingTotalsRow {
  return { units: 0, avg_purchase_price: 0, current_price: null, ...p }
}

describe('sumHoldingTotals', () => {
  it('gebruikt de engine-velden wanneer die er zijn — inclusief verkochte posities', () => {
    // De kern van de wijziging: een gesloten positie heeft units 0, dus élke som
    // over de holding-kolommen laat haar resultaat vallen. `pnl_total` niet.
    const totals = sumHoldingTotals([
      row({ units: 10, avg_purchase_price: 100, current_price: 150, pnl_total: 500, pnl_invested: 1000 }),
      row({ units: 0, avg_purchase_price: 0, current_price: null, pnl_total: 250, pnl_invested: 800 }),
    ])
    expect(totals.totalValue).toBe(1500)
    expect(totals.totalCost).toBe(1000)
    // 500 + 250 — de verkochte positie telt mee.
    expect(totals.totalPnL).toBe(750)
    expect(totals.totalInvested).toBe(1800)
  })

  it('valt per rij terug op de kolommen als de engine-velden ontbreken', () => {
    // Handmatig bijgehouden positie: nooit een transactie geïmporteerd. Zonder
    // deze terugval zou het rendement voor die hele groep gebruikers verdwijnen.
    const totals = sumHoldingTotals([
      row({ units: 10, avg_purchase_price: 100, current_price: 150 }),
    ])
    expect(totals.totalValue).toBe(1500)
    expect(totals.totalInvested).toBe(1000)
    expect(totals.totalPnL).toBe(500)
  })

  it('mengt beide grondslagen binnen één portefeuille', () => {
    const totals = sumHoldingTotals([
      row({ units: 10, avg_purchase_price: 100, current_price: 150, pnl_total: 600, pnl_invested: 1000 }),
      row({ units: 5, avg_purchase_price: 200, current_price: 240 }),
    ])
    expect(totals.totalValue).toBe(1500 + 1200)
    expect(totals.totalInvested).toBe(1000 + 1000)
    expect(totals.totalPnL).toBe(600 + 200)
  })

  it('behandelt een half paar engine-velden als ontbrekend', () => {
    // `pnl_total` zonder `pnl_invested` levert een teller zonder noemer op; dan
    // is de kolom-terugval de enige uitkomst die een bruikbaar percentage geeft.
    const totals = sumHoldingTotals([
      row({ units: 10, avg_purchase_price: 100, current_price: 150, pnl_total: 999, pnl_invested: null }),
    ])
    expect(totals.totalPnL).toBe(500)
    expect(totals.totalInvested).toBe(1000)
  })

  it('rekent de KOLOM-grondslag om, maar laat de ENGINE-velden ongemoeid', () => {
    // De koers hoort bij `current_price`/`avg_purchase_price`: die staan in de
    // noteringsvaluta van de holding-rij. `pnl_total`/`pnl_invested` komen uit de
    // aggregatie-engine, en die leest `currency` NERGENS — hij telt de bedragen
    // uit `investment_transactions` op zoals ze geboekt staan (in productie:
    // alle 370 in euro's). Ze nog eens met de dollarkoers schalen maakte van de
    // kop-KPI "Rendement sinds aankoop" een getal dat ~8% naast de waarde eronder
    // lag, en alléén voor wie een USD-genoteerde positie heeft.
    const totals = sumHoldingTotals(
      [row({ units: 10, avg_purchase_price: 100, current_price: 150, currency: 'USD', pnl_total: 500, pnl_invested: 1000 })],
      (c) => (c === 'USD' ? 0.9 : 1),
    )
    expect(totals.totalValue).toBeCloseTo(1350, 6)
    expect(totals.totalCost).toBeCloseTo(900, 6)
    expect(totals.totalPnL).toBeCloseTo(500, 6)
    expect(totals.totalInvested).toBeCloseTo(1000, 6)
  })

  it('rekent de terugval WÉL om — die leest de holding-kolommen', () => {
    // Zonder engine-velden is de kostbasis de holding-kolom zelf, dus staat het
    // resultaat in de noteringsvaluta en moet de koers er wél overheen.
    const totals = sumHoldingTotals(
      [row({ units: 10, avg_purchase_price: 100, current_price: 150, currency: 'USD' })],
      (c) => (c === 'USD' ? 0.9 : 1),
    )
    expect(totals.totalPnL).toBeCloseTo(450, 6)
    expect(totals.totalInvested).toBeCloseTo(900, 6)
  })

  it('waardeert zonder koers op de aankoopprijs, en geeft nullen bij een lege set', () => {
    const zonderKoers = sumHoldingTotals([row({ units: 4, avg_purchase_price: 25 })])
    expect(zonderKoers.totalValue).toBe(100)
    expect(zonderKoers.totalPnL).toBe(0)

    expect(sumHoldingTotals([])).toEqual({
      totalValue: 0, totalCost: 0, totalPnL: 0, totalInvested: 0,
    })
  })

  it('leest NUMERIC-kolommen die PostgREST als string levert', () => {
    const totals = sumHoldingTotals([
      row({ units: '10', avg_purchase_price: '100.50', current_price: '120.25' }),
    ])
    expect(totals.totalValue).toBeCloseTo(1202.5, 6)
    expect(totals.totalCost).toBeCloseTo(1005, 6)
  })
})
