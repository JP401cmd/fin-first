import { describe, expect, it } from 'vitest'
import { nettoLiquideAtAge } from './vrijheidsdagen'

/**
 * De J-grondslag-opzoeking, getoetst tegen PRODUCTIEVORMIGE rijen.
 *
 * Dit is de plek waar de UR3-08-fix bijna stil misging. De afleiding stond in
 * `horizon-client` als inline expressie op
 * `unifiedRows.filter(r => r.phase === 'transition')[0]`, en die filter matcht op
 * productie nooit: de kernel kent geen overbrugging en zet `phase` uitsluitend op
 * 'accumulation' of 'withdrawal' (`lib/horizon-kernel/bridge.ts:44` en `:728`).
 * Het gevolg was geen fout getal maar een VERDWENEN regel op elk echt account —
 * onzichtbaar, omdat de modaltest de waarde als prop injecteert en zelf een
 * fixture met synthetische 'transition'-rijen bouwt.
 *
 * Daarom draagt elke fixture hieronder alleen de twee fasen die de kernel
 * werkelijk emit. Een rij met `phase: 'transition'` hoort hier niet thuis.
 */

type Rij = { age: number; phase: 'accumulation' | 'withdrawal'; startNettoLiquide?: number }

const RIJEN: Rij[] = [
  { age: 45, phase: 'accumulation', startNettoLiquide: 300_000 },
  { age: 46, phase: 'accumulation', startNettoLiquide: 340_000 },
  { age: 47, phase: 'withdrawal', startNettoLiquide: 380_000 },
  { age: 48, phase: 'withdrawal', startNettoLiquide: 360_000 },
]

describe('nettoLiquideAtAge', () => {
  it('vindt de J-grondslag op de gevraagde leeftijd zonder dat er een transition-rij bestaat', () => {
    expect(nettoLiquideAtAge(RIJEN, 47)).toBe(380_000)
  })

  it('werkt óók wanneer de startleeftijd in de opbouwfase valt (shortfall-scenario)', () => {
    // Bij shortfall is start = AOW-leeftijd en die ligt vóór FIRE, dus in
    // 'accumulation'. Ook dan moet er een grondslag komen.
    expect(nettoLiquideAtAge(RIJEN, 45)).toBe(300_000)
  })

  it('geeft undefined bij een leeftijd die niet in de rijen zit — geen nearest-match', () => {
    // Liever geen regel dan een regel op de verkeerde leeftijd: de deflatiefactor
    // hoort bij exact deze rij.
    expect(nettoLiquideAtAge(RIJEN, 99)).toBeUndefined()
  })

  it('geeft undefined bij ontbrekende rijen of leeftijd', () => {
    expect(nettoLiquideAtAge(null, 47)).toBeUndefined()
    expect(nettoLiquideAtAge(undefined, 47)).toBeUndefined()
    expect(nettoLiquideAtAge(RIJEN, null)).toBeUndefined()
    expect(nettoLiquideAtAge([], 47)).toBeUndefined()
  })

  it('valt niet terug op een andere grondslag wanneer startNettoLiquide ontbreekt', () => {
    // Een terugval J→I zou de eigen woning als op te leven vrijheidsdagen
    // presenteren. Ontbreekt J, dan hoort er niets te komen.
    const zonderJ = [{ age: 47, phase: 'withdrawal' as const, startNetWorth: 500_000 }]
    expect(nettoLiquideAtAge(zonderJ, 47)).toBeUndefined()
  })
})
