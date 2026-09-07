import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  HOLDING_TX_TYPES,
  TX_TYPE_LABEL,
  TX_TYPE_SIGN,
  SAME_DAY_ORDER,
  UNKNOWN_TX_LABEL,
  isHoldingTxType,
  sameDayOrder,
} from './holdings-transaction-types'

// ---------------------------------------------------------------------------
// De vangrail zelf
// ---------------------------------------------------------------------------
//
// `transfer_in`/`transfer_out` kwamen erbij zonder dat één van de zes
// consumenten een compile-fout gaf: een `Record<…>`-lookup met `|| default` en
// een if-keten over stringliteralen zijn allebei compile-blind. Deze suite pint
// vast wat de maps beloven, plus de twee regels die niet in het typesysteem
// passen: nooit terugvallen op "Koop", en geen teken bij een corporate action.
// ---------------------------------------------------------------------------

const bron = (relatief: string) =>
  readFileSync(path.resolve(__dirname, '..', relatief), 'utf-8')

describe('holdings-transactietypes — de maps zijn compleet', () => {
  it('Given elk bekend type, When opgezocht, Then heeft het een label, een teken en een rang', () => {
    for (const type of HOLDING_TX_TYPES) {
      expect(TX_TYPE_LABEL[type], type).toBeTruthy()
      expect(TX_TYPE_SIGN[type], type).toBeDefined()
      expect(Number.isFinite(SAME_DAY_ORDER[type]), type).toBe(true)
    }
  })

  it('Given de labels, When vergeleken, Then is elk label uniek', () => {
    const labels = HOLDING_TX_TYPES.map((t) => TX_TYPE_LABEL[t])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('Given een corporate action, When getoond, Then draagt hij GEEN teken en heet hij geen Koop of Verkoop', () => {
    // Een splitsing is winst noch verlies. Een `+` of een groene "Koop" zou
    // precies de beweging suggereren die niet heeft plaatsgevonden — en dat op
    // de plek waar de gebruiker de splitsing komt controleren.
    for (const type of ['transfer_in', 'transfer_out'] as const) {
      expect(TX_TYPE_SIGN[type]).toBe('')
      expect(TX_TYPE_LABEL[type]).not.toBe(TX_TYPE_LABEL.buy)
      expect(TX_TYPE_LABEL[type]).not.toBe(TX_TYPE_LABEL.sell)
    }
  })

  it('Given een onbekend type, When herkend, Then valt het buiten de maps en heet het niet Koop', () => {
    expect(isHoldingTxType('buy')).toBe(true)
    expect(isHoldingTxType('deposit')).toBe(false)
    expect(isHoldingTxType(null)).toBe(false)
    expect(isHoldingTxType(undefined)).toBe(false)
    expect(UNKNOWN_TX_LABEL).not.toBe(TX_TYPE_LABEL.buy)
  })
})

describe('SAME_DAY_ORDER — wat vertrekt gaat vóór wat binnenkomt', () => {
  it('Given twee benen van dezelfde datum, When gesorteerd, Then komt transfer_out eerst', () => {
    expect(sameDayOrder('transfer_out')).toBeLessThan(sameDayOrder('transfer_in'))
  })

  it('Given al het andere, When gesorteerd, Then houdt het rang 0 en blijft de bestaande volgorde intact', () => {
    for (const type of ['buy', 'sell', 'dividend', 'split'] as const) {
      expect(sameDayOrder(type), type).toBe(0)
    }
  })

  it('Given een onbekend of raar geschreven type, When gesorteerd, Then krijgt het rang 0 in plaats van een fout', () => {
    expect(sameDayOrder('deposit')).toBe(0)
    expect(sameDayOrder(null)).toBe(0)
    expect(sameDayOrder('TRANSFER_OUT')).toBe(-1) // case-insensitief
  })
})

describe('geen enkele consument valt terug op "Koop"', () => {
  // Bronniveau-toets, in de geest van `horizon-client.euro-view.test.ts`: het
  // typesysteem kan een `|| typeConfig.buy` niet verbieden, dus doen we dat
  // hier. Beide surfaces toonden vóór de fix BEIDE benen van een splitsing als
  // groene "Koop" met plusteken.
  const surfaces = [
    'components/app/holding-transaction-log.tsx',
    'components/core/holdings-client.tsx',
  ]

  for (const surface of surfaces) {
    it(`Given ${surface}, When gelezen, Then bevat het geen terugval naar de koop-config`, () => {
      const code = bron(surface)
      // Commentaarregels tellen niet mee: de toelichting bij de fix noemt het
      // oude patroon bewust, en die zin mag deze toets niet rood maken.
      const codeZonderCommentaar = code
        .split('\n')
        .filter((regel) => !regel.trim().startsWith('//') && !regel.trim().startsWith('*'))
        .join('\n')
      expect(codeZonderCommentaar).not.toMatch(/\|\|\s*typeConfig\.buy/)
      expect(code).toContain('holdings-transaction-types')
    })
  }
})
