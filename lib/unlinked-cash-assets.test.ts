import { describe, it, expect } from 'vitest'
import { buildUnlinkedCashAssets } from './unlinked-cash-assets'
import { SOLO_UNLINKED_CASH_SHARE } from './unlinked-cash'

/** Solo-context: geen huishouden, dus alles telt voor 100%. */
const SOLO = SOLO_UNLINKED_CASH_SHARE

describe('buildUnlinkedCashAssets', () => {
  it('maps each unlinked bank_account to a synthetic cash asset', () => {
    const rows = [
      { id: 'ba-1', name: 'Betaalrekening', balance: 3200 },
      { id: 'ba-2', name: ' Spaarrekening ', balance: '15000' },
    ]
    const result = buildUnlinkedCashAssets(rows, SOLO)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'ba-1',
      name: 'Betaalrekening',
      asset_type: 'cash',
      current_value: 3200,
      purchase_value: 3200, // geen fantoom-winst/verlies
      monthly_contribution: 0,
      net_worth_inclusion_pct: 100,
      ownership: 'personal',
      is_active: true,
      _syntheticCash: true,
    })
    // Trim + numerieke coercion op string-balances.
    expect(result[1].name).toBe('Spaarrekening')
    expect(result[1].current_value).toBe(15000)
  })

  it('falls back to a neutral name and 0 balance on missing/invalid data', () => {
    const result = buildUnlinkedCashAssets([{ id: 'ba-x', name: null, balance: null }], SOLO)
    expect(result[0].name).toBe('Bankrekening')
    expect(result[0].current_value).toBe(0)
    expect(result[0].purchase_value).toBe(0)
  })

  it('returns [] for empty/nullish input', () => {
    expect(buildUnlinkedCashAssets([], SOLO)).toEqual([])
    expect(buildUnlinkedCashAssets(null, SOLO)).toEqual([])
    expect(buildUnlinkedCashAssets(undefined, SOLO)).toEqual([])
  })

  // ADR 0101: een GEDEELDE rekening is voor beide partners zichtbaar en mag dus
  // niet bij allebei voor het volle saldo in het bezittingen-totaal landen.
  it('weegt een gedeelde rekening op het huishoud-aandeel', () => {
    const rows = [
      { id: 'ba-shared', name: 'Gezamenlijk', balance: 4000, ownership: 'shared' },
      { id: 'ba-own', name: 'Eigen', balance: 1000, ownership: 'personal' },
    ]
    const mine = buildUnlinkedCashAssets(rows, { perspective: 'personal', mySharePct: 50 })

    expect(mine[0].current_value).toBe(2000)
    expect(mine[0].purchase_value).toBe(2000)
    expect(mine[1].current_value).toBe(1000)
  })

  it('toont een gedeelde rekening vol in de huishoud-blik', () => {
    const rows = [{ id: 'ba-shared', name: 'Gezamenlijk', balance: 4000, ownership: 'shared' }]
    const household = buildUnlinkedCashAssets(rows, {
      perspective: 'household',
      mySharePct: 50,
    })

    expect(household[0].current_value).toBe(4000)
  })

  // Regressie op het bug-kaartje "bezitting niet gelijk" (P0): het bezittingen-
  // totaal (excl. eigen woning) op /overzicht/bezittingen moet aansluiten op de
  // canonieke totalAssets (hero-hefboomkaart), niet op de onvolledige assets-only
  // som. Reproduceert de exacte cijfers uit de melding: assets-excl-home € 55.001
  // + 6 ongekoppelde bankrekeningen (€ 74.250) = € 129.251.
  it('closes the bezittingen-vs-hero delta to zero (bug: bezitting niet gelijk)', () => {
    // "excl. eigen woning" telt de volledige current_value per bezitting, zonder
    // eigen_huis — spiegelt totalValueExclHome in assets-client.tsx.
    const realAssets = [
      { asset_type: 'cash', current_value: 15000 },
      { asset_type: 'cash', current_value: 1 }, // companion-cash van gekoppelde rekening
      { asset_type: 'savings', current_value: 40000 },
      { asset_type: 'eigen_huis', current_value: 500000 }, // wordt uitgesloten
    ]
    const assetsOnlyExclHome = realAssets
      .filter((a) => a.asset_type !== 'eigen_huis')
      .reduce((s, a) => s + a.current_value, 0)
    expect(assetsOnlyExclHome).toBe(55001)

    const unlinkedBankRows = [
      { id: 'b1', name: 'A', balance: 3200 },
      { id: 'b2', name: 'B', balance: 15000 },
      { id: 'b3', name: 'C', balance: 850 },
      { id: 'b4', name: 'D', balance: 5200 },
      { id: 'b5', name: 'E', balance: 35000 },
      { id: 'b6', name: 'F', balance: 15000 },
    ]
    const synthetic = buildUnlinkedCashAssets(unlinkedBankRows, SOLO)

    // Synthetische cash is per definitie asset_type 'cash' → nooit eigen_huis,
    // telt dus volledig mee in het excl-home-totaal.
    const combinedExclHome =
      assetsOnlyExclHome + synthetic.reduce((s, a) => s + a.current_value, 0)

    // horizon-data-loader: totalAssets − eigenHuis = 129.251 (canoniek).
    const canonicalExclHome = 129251
    expect(combinedExclHome).toBe(canonicalExclHome)
    expect(canonicalExclHome - combinedExclHome).toBe(0) // delta 0 met de hero-kaart
  })
})
