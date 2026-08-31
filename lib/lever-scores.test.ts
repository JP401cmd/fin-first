/**
 * Schulden-hefboom: score, status en detail vertellen één verhaal (UR2-10).
 *
 * De bug: `computeLeverScores` codeerde "niets geregistreerd" voor de schulden-
 * hefboom als het getal 50. Dat valt in de amber-band (>= 30), dus een schoon
 * account las op /overzicht de kaart "Schuldenlast vraagt aandacht" bóven zijn
 * eigen detailregel "Geen data — Start", naast een gezondheidsscore-
 * onderverdeling "Schuld: 80". De drie andere hefbomen coderen 'geen data' al
 * als `null`.
 *
 * Deze suite grendelt drie dingen:
 *  1. het lege-data-pad van de schulden-hefboom (het defect zelf);
 *  2. de invariant waar de status-banner op leunt: detail met "— Start" ⟺
 *     status 'neutral' (lib/page-status/resolve.ts#LEVER_NO_DATA_MARKER);
 *  3. één curve, twee consumenten: de hefboomscore IS `scoreDebtRatio`, de
 *     curve van de gezondheidspijler `debt_ratio`.
 */

import { describe, it, expect } from 'vitest'
import { computeLeverScores, leverToLeverageStatus, type LeverScores } from './lever-scores'
import { scoreDebtRatio, hasDebtRatioData } from './financial-health'
import { hefboomVerdict } from './hefboom-status-copy'
import type { Hefboom } from './hefboom-config'

/** Minimale, verder neutrale invoer; per test alleen de schuld-assen gezet. */
function leverInput(over: {
  totalAssets: number
  totalDebts: number
  totalOriginalDebts?: number
  assetTypeCount?: number
  savingsRate?: number | null
}) {
  return {
    totalAssets: over.totalAssets,
    totalDebts: over.totalDebts,
    totalOriginalDebts: over.totalOriginalDebts,
    assetTypeCount: over.assetTypeCount ?? 0,
    savingsRate: over.savingsRate ?? null,
    box3TaxableAboveThreshold: 0,
    hasBox3Assets: false,
  }
}

describe('Schulden-hefboom — leeg account draagt geen waarschuwing (UR2-10)', () => {
  it('geen vermogen én geen schuld → neutral, geen score, geen oordeel', () => {
    const { debts } = computeLeverScores(leverInput({ totalAssets: 0, totalDebts: 0 }))

    expect(debts.status).toBe('neutral')
    expect(debts.score).toBeNull()
    expect(debts.detail).toBe('Geen data — Start')

    // De kaart op /overzicht en het kompas in de shell lezen hetzelfde: bij
    // 'neutral' is er geen domeinoordeel, dus geen "Schuldenlast vraagt
    // aandacht". Dít is de zin uit de bugmelding.
    const verdict = hefboomVerdict('schulden', leverToLeverageStatus(debts.status))
    expect(verdict).toBeNull()
  })

  it('is expliciet NIET amber — de oude 50-codering viel in de amber-band', () => {
    const { debts } = computeLeverScores(leverInput({ totalAssets: 0, totalDebts: 0 }))
    expect(debts.status).not.toBe('amber')
    expect(debts.score).not.toBe(50)
  })

  it('schuldenvrij MÉT vermogen blijft groen — de grens verschuift niet', () => {
    const { debts } = computeLeverScores(leverInput({ totalAssets: 120_000, totalDebts: 0, assetTypeCount: 2 }))
    expect(debts.status).toBe('green')
    expect(debts.score).toBe(100)
    expect(debts.detail).toBe('Schuldenvrij')
    expect(hefboomVerdict('schulden', leverToLeverageStatus(debts.status))).toBe('Aflossing op schema')
  })

  it('zware schuldenlast blijft rood mét oordeel (contrastgeval van de kaart)', () => {
    const { debts } = computeLeverScores(
      leverInput({ totalAssets: 100_000, totalDebts: 350_000, assetTypeCount: 2 }),
    )
    expect(debts.status).toBe('red')
    expect(debts.score).toBe(0)
    expect(hefboomVerdict('schulden', leverToLeverageStatus(debts.status))).toBe('Hoge schuldenlast')
  })
})

describe('Eén curve, twee consumenten — hefboom == gezondheidspijler', () => {
  const paren: Array<[number, number]> = [
    [0, 0],
    [120_000, 0],
    [9_700, 13_900],
    [100_000, 350_000],
    [400_000, 100_000],
    [0, 25_000],
    [250_000, 250_000],
  ]

  it.each(paren)(
    'assets=%s / debts=%s: hefboomscore volgt scoreDebtRatio (of null bij geen data)',
    (assets, debts) => {
      const { debts: lever } = computeLeverScores(leverInput({ totalAssets: assets, totalDebts: debts }))
      const verwacht = hasDebtRatioData(assets, debts) ? scoreDebtRatio(assets, debts) : null
      expect(lever.score).toBe(verwacht)
    },
  )
})

describe('Invariant: "— Start" in het detail ⟺ status neutral', () => {
  // Waar de status-banner op leunt: `lib/page-status/resolve.ts` filtert een
  // hefboom uit de melding zodra zijn detail dit sentinel draagt. Die gate was
  // een pleister voor exact deze bug; hij mag nooit meer nódig zijn.
  const gevallen: Array<{ naam: string; scores: LeverScores }> = [
    {
      naam: 'volledig leeg account',
      scores: computeLeverScores(leverInput({ totalAssets: 0, totalDebts: 0 })),
    },
    {
      naam: 'alleen schuld, geen vermogen',
      scores: computeLeverScores(leverInput({ totalAssets: 0, totalDebts: 25_000 })),
    },
    {
      naam: 'gevuld account',
      scores: computeLeverScores({
        ...leverInput({ totalAssets: 500_000, totalDebts: 200_000, assetTypeCount: 4, savingsRate: 22 }),
        box3TaxableAboveThreshold: 150_000,
        hasBox3Assets: true,
        budgetsTotal: 5,
        budgetsOver: 0,
        budgetsOnTrack: 5,
      }),
    },
  ]

  const keys: Array<keyof LeverScores> = ['assets', 'debts', 'cashflow', 'tax']

  for (const { naam, scores } of gevallen) {
    it.each(keys)(`${naam} — %s`, (key) => {
      const entry = scores[key]
      expect(entry.detail.includes('— Start')).toBe(entry.status === 'neutral')
    })
  }
})

describe('Alle vier de hefbomen: neutral betekent géén domeinoordeel', () => {
  const HEFBOOM_VOOR_LEVER: Record<keyof LeverScores, Hefboom> = {
    assets: 'bezittingen',
    debts: 'schulden',
    cashflow: 'cashflow',
    tax: 'belasting',
  }

  it('een volledig leeg account draagt nergens een waarschuwingszin', () => {
    const scores = computeLeverScores(leverInput({ totalAssets: 0, totalDebts: 0 }))
    for (const key of Object.keys(HEFBOOM_VOOR_LEVER) as Array<keyof LeverScores>) {
      const status = leverToLeverageStatus(scores[key].status)
      expect(status).toBe('neutral')
      expect(hefboomVerdict(HEFBOOM_VOOR_LEVER[key], status)).toBeNull()
    }
  })
})
