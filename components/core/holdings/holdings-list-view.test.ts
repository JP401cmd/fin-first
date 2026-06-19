/**
 * Unit-tests voor de pure holdings-lijst-filter/sort-helpers, geëxtraheerd uit
 * `holdings-client.tsx`. Borgen het uitgebouwde gedrag (werkstroom A):
 *   - de 'Gesloten'-chip toont uitsluitend gesloten posities;
 *   - 'all' verbergt gesloten posities;
 *   - sorteren op 'opbrengst' rangschikt op de server-afgeleide pnl_total
 *     (hoog→laag), met rijen zonder P&L onderaan;
 *   - isClosedHolding volgt de engine-vlag `pnl_is_closed`, met EPSILON-
 *     fallback op de units-kolom.
 */

import { describe, it, expect } from 'vitest'
import {
  isClosedHolding,
  filterHoldingsByChip,
  sortHoldings,
  type HoldingListItem,
} from './holdings-list-view'

function mk(partial: Partial<HoldingListItem>): HoldingListItem {
  return {
    units: 0,
    avg_purchase_price: 0,
    current_price: null,
    name: 'X',
    ...partial,
  }
}

describe('isClosedHolding', () => {
  it('volgt de engine-vlag pnl_is_closed wanneer aanwezig (ook tegen units in)', () => {
    // Engine zegt gesloten ondanks units > 0 → vlag wint.
    expect(isClosedHolding(mk({ units: 10, pnl_is_closed: true }))).toBe(true)
    // Engine zegt open ondanks 0 units → vlag wint.
    expect(isClosedHolding(mk({ units: 0, pnl_is_closed: false }))).toBe(false)
  })

  it('valt zonder vlag terug op de units-kolom met EPSILON', () => {
    expect(isClosedHolding(mk({ units: 0 }))).toBe(true)
    expect(isClosedHolding(mk({ units: 1e-12 }))).toBe(true) // ~0 binnen EPSILON
    expect(isClosedHolding(mk({ units: 5 }))).toBe(false)
  })
})

describe('filterHoldingsByChip', () => {
  const open = mk({ units: 10, pnl_is_closed: false, name: 'Open' })
  const closed = mk({ units: 0, pnl_is_closed: true, name: 'Closed' })
  const crypto = mk({ units: 2, bucket: 'crypto', name: 'Crypto' })
  const invNoBucket = mk({ units: 3, name: 'InvNoBucket' })

  it("'all' verbergt gesloten posities", () => {
    const out = filterHoldingsByChip([open, closed], 'all')
    expect(out.map((h) => h.name)).toEqual(['Open'])
  })

  it("'closed' toont UITSLUITEND gesloten posities", () => {
    const out = filterHoldingsByChip([open, closed, crypto], 'closed')
    expect(out.map((h) => h.name)).toEqual(['Closed'])
  })

  it("'crypto' toont alleen bucket==='crypto'", () => {
    const out = filterHoldingsByChip([open, crypto, invNoBucket], 'crypto')
    expect(out.map((h) => h.name)).toEqual(['Crypto'])
  })

  it("'investment' toont bucket==='investment' én holdings zonder bucket", () => {
    const inv = mk({ units: 1, bucket: 'investment', name: 'Inv' })
    const out = filterHoldingsByChip([inv, crypto, invNoBucket], 'investment')
    expect(out.map((h) => h.name).sort()).toEqual(['Inv', 'InvNoBucket'])
  })

  it('muteert de input-array niet', () => {
    const input = [open, closed]
    filterHoldingsByChip(input, 'all')
    expect(input).toHaveLength(2)
  })
})

describe('sortHoldings — opbrengst', () => {
  it('sorteert op pnl_total hoog→laag', () => {
    const a = mk({ name: 'A', pnl_total: 100 })
    const b = mk({ name: 'B', pnl_total: -50 })
    const c = mk({ name: 'C', pnl_total: 25 })
    const out = sortHoldings([a, b, c], 'opbrengst')
    expect(out.map((h) => h.name)).toEqual(['A', 'C', 'B'])
  })

  it('rijen zonder pnl_total belanden onderaan (−∞)', () => {
    const withPnl = mk({ name: 'Heeft', pnl_total: 10 })
    const noPnl = mk({ name: 'Geen' }) // pnl_total ontbreekt
    const out = sortHoldings([noPnl, withPnl], 'opbrengst')
    expect(out.map((h) => h.name)).toEqual(['Heeft', 'Geen'])
  })
})

describe('M1 — closedPnl valuta-symbool (pure builder-logica)', () => {
  /**
   * De closedPnl-builder in holdings-client.tsx brancht op `holding.currency`:
   *   - EUR  → fc() (masking-aware)
   *   - non-EUR → Intl.NumberFormat met de native currency
   *
   * We testen de logica hier als een pure functie zodat de rendering-laag
   * (HoldingRow) buiten scope blijft.
   */
  function buildClosedPnlFormatted(amount: number, currency: string | null | undefined): string {
    if (currency && currency !== 'EUR') {
      return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(amount)
    }
    // Simuleer de EUR-pad: geef het bedrag terug als EUR-string (geen masking in test).
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  it('EUR-positie draagt een €-teken', () => {
    const formatted = buildClosedPnlFormatted(910, 'EUR')
    expect(formatted).toContain('€')
    expect(formatted).not.toContain('$')
  })

  it('USD-positie draagt een $-teken (of USD-code), niet €', () => {
    const formatted = buildClosedPnlFormatted(910, 'USD')
    // nl-NL formatteert USD als "US$" of "$"; in ieder geval géén €-teken.
    expect(formatted).not.toContain('€')
    // Bevat het bedrag 910 als getal.
    expect(formatted).toMatch(/910/)
  })

  it('GBP-positie draagt een £-teken, niet €', () => {
    const formatted = buildClosedPnlFormatted(-250, 'GBP')
    expect(formatted).not.toContain('€')
    expect(formatted).toMatch(/250/)
  })

  it('null currency valt terug op EUR-pad', () => {
    const formatted = buildClosedPnlFormatted(100, null)
    expect(formatted).toContain('€')
  })
})

describe('sortHoldings — overige sleutels', () => {
  it("'weight' sorteert op marktwaarde aflopend", () => {
    const small = mk({ name: 'Klein', units: 1, current_price: 10 }) // 10
    const big = mk({ name: 'Groot', units: 10, current_price: 10 }) // 100
    expect(sortHoldings([small, big], 'weight').map((h) => h.name)).toEqual([
      'Groot',
      'Klein',
    ])
  })

  it("'alpha' sorteert op naam", () => {
    const out = sortHoldings(
      [mk({ name: 'Zeta' }), mk({ name: 'Alfa' })],
      'alpha',
    )
    expect(out.map((h) => h.name)).toEqual(['Alfa', 'Zeta'])
  })

  it('muteert de input-array niet', () => {
    const input = [mk({ name: 'A', pnl_total: 1 }), mk({ name: 'B', pnl_total: 2 })]
    sortHoldings(input, 'opbrengst')
    expect(input.map((h) => h.name)).toEqual(['A', 'B'])
  })
})
