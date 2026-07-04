import { describe, it, expect } from 'vitest'
import type { SimCashflow } from '@/lib/fire-simulation'
import { cashflowsForYear } from './cashflows-for-year'

/**
 * Bug-fix 4 juli 2026 (eigenaar): de "Gebeurtenissen"-sectie van de jaar-detail-
 * kassabon toonde geïndexeerde stromen (AOW) vlak op élke leeftijd, terwijl de
 * kernel-secties in dezelfde modal geïndexeerde bedragen hanteren. Eén modal,
 * twee grondslagen. Fix: geïndexeerde stromen × `inflationFactor` van het jaar;
 * niet-geïndexeerde stromen blijven vlak.
 */

function recurring(partial: Partial<SimCashflow> & Pick<SimCashflow, 'id' | 'indexed'>): SimCashflow {
  return {
    name: partial.name ?? 'stroom',
    type: 'recurring',
    direction: 'income',
    amount: 1_000,
    fromAge: 67,
    toAge: null,
    ...partial,
  } as SimCashflow
}

function oneTime(partial: Partial<SimCashflow> & Pick<SimCashflow, 'id' | 'indexed'>): SimCashflow {
  return {
    name: partial.name ?? 'eenmalig',
    type: 'one_time',
    direction: 'income',
    amount: 50_000,
    fromAge: 90,
    toAge: null,
    ...partial,
  } as SimCashflow
}

const AOW_MONTHLY = 1_581.55
const AOW_YEAR = AOW_MONTHLY * 12 // 18.978,60 vlak reëel

describe('cashflowsForYear — inflatie-indexatie', () => {
  it('indexeert een geïndexeerde recurring stroom (AOW) met de inflatiefactor van het jaar', () => {
    const aow = recurring({ id: '__aow', name: 'AOW-uitkering', amount: AOW_MONTHLY, fromAge: 67, indexed: true })
    const factor = 2.4
    const out = cashflowsForYear([aow], 90, factor)
    expect(out).toHaveLength(1)
    expect(out[0].isAow).toBe(true)
    expect(out[0].amount).toBeCloseTo(AOW_YEAR * factor, 2)
  })

  it('laat een niet-geïndexeerde recurring stroom vlak, ongeacht de factor', () => {
    const vast = recurring({ id: 'le-lijfrente-1', name: 'Vaste lijfrente', amount: 500, fromAge: 67, indexed: false })
    const out = cashflowsForYear([vast], 90, 2.4)
    expect(out).toHaveLength(1)
    expect(out[0].amount).toBeCloseTo(500 * 12, 2) // 6.000, geen ×factor
  })

  it('indexeert ook een geïndexeerde one_time stroom; laat een vlakke one_time vlak', () => {
    const factor = 1.8
    const indexedOnce = oneTime({ id: 'le-inh-a', name: 'Geïndexeerde bate', amount: 10_000, fromAge: 90, indexed: true })
    const flatOnce = oneTime({ id: 'le-inh-b', name: 'Erfenis', amount: 50_000, fromAge: 90, indexed: false })
    const out = cashflowsForYear([indexedOnce, flatOnce], 90, factor)
    const byId = Object.fromEntries(out.map(o => [o.id, o.amount]))
    expect(byId['le-inh-a']).toBeCloseTo(10_000 * factor, 2)
    expect(byId['le-inh-b']).toBeCloseTo(50_000, 2)
  })

  it('plaatst een one_time stroom alleen in het juiste jaar', () => {
    const bate = oneTime({ id: 'le-inh-c', amount: 20_000, fromAge: 90, indexed: false })
    expect(cashflowsForYear([bate], 89, 1)).toHaveLength(0)
    expect(cashflowsForYear([bate], 90, 1)).toHaveLength(1)
    expect(cashflowsForYear([bate], 91, 1)).toHaveLength(0)
  })

  it('herkent AOW via id-prefix, exacte id en naam (AOW-splitsing blijft werken)', () => {
    const prefix = recurring({ id: 'le-aow-abc', name: 'AOW', amount: 100, indexed: true })
    const exact = recurring({ id: '__aow', name: 'Iets', amount: 100, indexed: true })
    const byName = recurring({ id: 'le-x-1', name: 'Mijn AOW-inkomen', amount: 100, indexed: true })
    const other = recurring({ id: 'le-pensioen-1', name: 'Pensioen', amount: 100, indexed: true })
    const out = cashflowsForYear([prefix, exact, byName, other], 90, 1)
    const aowFlags = Object.fromEntries(out.map(o => [o.id, o.isAow]))
    expect(aowFlags['le-aow-abc']).toBe(true)
    expect(aowFlags['__aow']).toBe(true)
    expect(aowFlags['le-x-1']).toBe(true)
    expect(aowFlags['le-pensioen-1']).toBe(false)
  })

  it('respecteert de expense-richting (negatieve delta), met indexatie', () => {
    const kosten = recurring({ id: 'le-zorg-1', name: 'Zorgkosten', direction: 'expense', amount: 200, indexed: true })
    const out = cashflowsForYear([kosten], 90, 2)
    expect(out[0].amount).toBeCloseTo(-(200 * 12) * 2, 2)
  })

  it('behandelt een niet-eindige of ≤ 0 factor als 1 (geen indexatie)', () => {
    const aow = recurring({ id: '__aow', name: 'AOW', amount: AOW_MONTHLY, indexed: true })
    expect(cashflowsForYear([aow], 90, Number.NaN)[0].amount).toBeCloseTo(AOW_YEAR, 2)
    expect(cashflowsForYear([aow], 90, 0)[0].amount).toBeCloseTo(AOW_YEAR, 2)
  })
})
