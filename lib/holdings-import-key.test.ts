import { describe, it, expect } from 'vitest'
import { buildTradeKeys, type TradeKeyInput } from './holdings-import-key'

/**
 * De dedup-sleutel maakt een OVERLAPPENDE transactie-upload mogelijk: je mag bij
 * je broker een ruimere periode exporteren dan strikt nodig, omdat rijen die we
 * al hebben aan deze sleutel herkend en overgeslagen worden.
 *
 * Twee eisen, en ze trekken tegen elkaar in:
 *  - STABIEL: dezelfde transactie uit twee verschillende exports moet dezelfde
 *    sleutel krijgen, anders komt hij dubbel binnen.
 *  - ONDERSCHEIDEND: twee verschillende transacties mogen nooit dezelfde sleutel
 *    krijgen, anders verdwijnt er stil één.
 */

function tx(overrides: Partial<TradeKeyInput> = {}): TradeKeyInput {
  return {
    externalId: null,
    isin: 'IE00B3RBWM25',
    ticker: 'VWCE',
    date: '2026-03-01',
    type: 'buy',
    units: 10,
    price_per_unit: 100,
    total_amount: 1000,
    ...overrides,
  }
}

describe('buildTradeKeys — stabiliteit bij overlappende exports', () => {
  it('dezelfde transactie levert dezelfde sleutel, ongeacht wat er verder in het bestand staat', () => {
    const target = tx({ externalId: 'order-a' })

    // Export 1: alleen maart. Export 2: februari t/m maart (overlap).
    const eersteExport = buildTradeKeys([target])
    const tweedeExport = buildTradeKeys([
      tx({ externalId: 'order-oud', date: '2026-02-01' }),
      tx({ externalId: 'order-ouder', date: '2026-02-15' }),
      target,
    ])

    expect(tweedeExport[2]).toBe(eersteExport[0])
  })

  it('werkt ook zonder broker-id: de inhoud van de rij is dan de sleutel', () => {
    const target = tx()
    const eerste = buildTradeKeys([target])
    const tweede = buildTradeKeys([tx({ date: '2026-01-05', units: 3 }), target])
    expect(tweede[1]).toBe(eerste[0])
  })

  it('drijvendekomma-ruis breekt de sleutel niet', () => {
    // 0.1 + 0.2 === 0.30000000000000004 — zonder vaste afronding zou dezelfde
    // transactie uit twee exports een andere sleutel krijgen.
    const a = buildTradeKeys([tx({ price_per_unit: 0.1 + 0.2 })])
    const b = buildTradeKeys([tx({ price_per_unit: 0.3 })])
    expect(a[0]).toBe(b[0])
  })
})

describe('buildTradeKeys — onderscheidend vermogen', () => {
  it('twee identieke deelexecuties van dezelfde order krijgen elk een eigen sleutel', () => {
    // DEGIRO kan één order in stukken uitvoeren: zelfde Order ID, meerdere rijen.
    // Zonder volgnummer zou de tweede als duplicaat sneuvelen en de positie te
    // laag uitkomen.
    const keys = buildTradeKeys([
      tx({ externalId: 'order-a', units: 5 }),
      tx({ externalId: 'order-a', units: 5 }),
    ])
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[1]).toContain('#2')
  })

  it('het volgnummer is stabiel: dezelfde twee deelexecuties krijgen opnieuw #1 en #2', () => {
    const rows = [
      tx({ externalId: 'order-a', units: 5 }),
      tx({ externalId: 'order-a', units: 5 }),
    ]
    expect(buildTradeKeys(rows)).toEqual(buildTradeKeys([...rows]))
  })

  it('eToro: openen en sluiten delen één Position ID maar niet één sleutel', () => {
    // Beide regels dragen hetzelfde Position ID. Zou het id alleen de sleutel
    // zijn, dan zou een latere export waarin enkel de sluitregel valt, botsen
    // met de eerder geïmporteerde openregel — en stil verdwijnen.
    const open = buildTradeKeys([
      tx({ externalId: '12345', type: 'buy', date: '2026-01-10' }),
    ])
    const sluit = buildTradeKeys([
      tx({ externalId: '12345', type: 'sell', date: '2026-04-20' }),
    ])
    expect(open[0]).not.toBe(sluit[0])
  })

  it('zonder id zijn verschillende bedragen, data en instrumenten verschillende sleutels', () => {
    const basis = buildTradeKeys([tx()])[0]
    expect(buildTradeKeys([tx({ date: '2026-03-02' })])[0]).not.toBe(basis)
    expect(buildTradeKeys([tx({ units: 11 })])[0]).not.toBe(basis)
    expect(buildTradeKeys([tx({ price_per_unit: 101 })])[0]).not.toBe(basis)
    expect(buildTradeKeys([tx({ total_amount: 1001 })])[0]).not.toBe(basis)
    expect(buildTradeKeys([tx({ isin: 'NL0011794037' })])[0]).not.toBe(basis)
    expect(buildTradeKeys([tx({ type: 'sell' })])[0]).not.toBe(basis)
  })

  it('geeft precies één sleutel per rij, in bestandsvolgorde', () => {
    const keys = buildTradeKeys([tx(), tx({ date: '2026-03-02' }), tx()])
    expect(keys).toHaveLength(3)
    // Rij 3 is identiek aan rij 1 → volgnummer, geen botsing.
    expect(keys[0]).not.toBe(keys[2])
    expect(new Set(keys).size).toBe(3)
  })

  it('een lege lijst levert een lege lijst', () => {
    expect(buildTradeKeys([])).toEqual([])
  })
})
