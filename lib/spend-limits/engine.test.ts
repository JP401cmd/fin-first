/**
 * Rekenmotor-tests voor grenzenpotten.
 *
 * Statische invoer, exact narekenbaar — geen database, geen tijd-afhankelijkheid
 * (elke test geeft zijn eigen `now` mee). Wat hier vastligt zijn de regels die
 * de kaart als grensgeval benoemt: periodegrenzen, exact op de grens, refunds,
 * transfers, lege periodes, de lopende periode buiten de reeks, en beide
 * regeltypen.
 */

import { describe, it, expect } from 'vitest'
import {
  SPEND_LIMIT_GRAIN_BY_PERIOD,
  SPEND_LIMIT_NEAR_LIMIT_PCT,
  SPEND_LIMIT_PACE_BASELINE_WINDOW,
  SPEND_LIMIT_PACE_MIN_PERIODS,
  SPEND_LIMIT_SCORE_MIN_PERIODS,
  SPEND_LIMIT_SCORE_THRESHOLDS,
  SPEND_LIMIT_SCORE_TREND_BONUS,
  SPEND_LIMIT_TREND_WINDOW,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  buildSpendLimitReport,
  closedPeriodsSinceCreation,
  computePeriodOutcome,
  computeSpendLimitPace,
  computeSpendLimitScore,
  computeSpendLimitTrend,
  computeStreaks,
  netSpendFromSums,
  resolveSpendLimitPeriods,
  sliceContainsMonth,
  spendLimitPeriodHasPace,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodOutcome,
  type SpendLimitRule,
  type SpendLimitTrend,
} from './engine'
import { counterpartyMatchesKey, spendLimitCounterpartyKey } from './counterparty-key'

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/**
 * Aggregaat-rij: `spend` is een positief uitgavebedrag, `refund` een ontvangst.
 *
 * `bucket` mag een maandsleutel ('2026-08') of een volledige datum
 * ('2026-08-10') zijn — een maandsleutel wordt aangevuld tot de eerste van die
 * maand, precies zoals `sliceContainsMonth` doet.
 */
function row(
  bucket: string,
  spend: number,
  opts: { refund?: number; count?: number; type?: string | null; names?: string[] } = {},
): SpendLimitAggregateRow {
  return {
    bucketStart: bucket.length === 7 ? `${bucket}-01` : bucket,
    transactionType: opts.type === undefined ? 'expense' : opts.type,
    sumPositief: opts.refund ?? 0,
    sumNegatief: -spend,
    count: opts.count ?? 1,
    ...(opts.names ? { matchedNames: opts.names } : {}),
  }
}

function outcome(periodKey: string, matched: number, limit: number): SpendLimitPeriodOutcome {
  return computePeriodOutcome(
    { periodKey, label: periodKey, since: `${periodKey}-01`, until: `${periodKey}-28`, isOpen: false },
    [row(periodKey, matched)],
    limit,
  )
}

// ── Periodevensters ─────────────────────────────────────────────────────────

describe('resolveSpendLimitPeriods', () => {
  it('levert de laatste N maanden oud→nieuw met de lopende maand als laatste', () => {
    const slices = resolveSpendLimitPeriods('month', new Date(2026, 7, 8), 3)
    expect(slices.map((s) => s.periodKey)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(slices.map((s) => s.isOpen)).toEqual([false, false, true])
  })

  it('geeft de juiste einddatum voor 28/29/30/31-daagse maanden', () => {
    const feb2026 = resolveSpendLimitPeriods('month', new Date(2026, 1, 15), 1)[0]
    expect(feb2026.until).toBe('2026-02-28')

    // 2028 is een schrikkeljaar.
    const feb2028 = resolveSpendLimitPeriods('month', new Date(2028, 1, 15), 1)[0]
    expect(feb2028.until).toBe('2028-02-29')

    const apr = resolveSpendLimitPeriods('month', new Date(2026, 3, 15), 1)[0]
    expect(apr.until).toBe('2026-04-30')

    const jan = resolveSpendLimitPeriods('month', new Date(2026, 0, 15), 1)[0]
    expect(jan.until).toBe('2026-01-31')
  })

  it('loopt correct over de jaargrens heen', () => {
    const slices = resolveSpendLimitPeriods('month', new Date(2026, 0, 10), 3)
    expect(slices.map((s) => s.periodKey)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('houdt de maand OPEN op zijn laatste dag — de dag is dan nog niet voorbij', () => {
    const slices = resolveSpendLimitPeriods('month', new Date(2026, 6, 31), 2)
    const juli = slices.find((s) => s.periodKey === '2026-07')
    expect(juli?.isOpen).toBe(true)
    // Eén dag later is juli wél afgesloten.
    const later = resolveSpendLimitPeriods('month', new Date(2026, 7, 1), 2)
    expect(later.find((s) => s.periodKey === '2026-07')?.isOpen).toBe(false)
  })
})

// ── De netto-regel zelf ─────────────────────────────────────────────────────

describe('netSpendFromSums — de enige plek waar teken en nul-regel staan', () => {
  it('keert het teken om: negatieve som + positieve som → netto UITGAVE', () => {
    // De aggregaten leveren uitgaven negatief en ontvangsten positief.
    expect(netSpendFromSums(-120, 20)).toBe(100)
  })

  it('levert een POSITIEVE nul bij een lege periode, nooit −0', () => {
    // −(0 + 0) is in IEEE-754 een negatieve nul; die zou als "−€ 0" op het
    // scherm belanden en maakt elke Object.is-vergelijking stroomafwaarts
    // verrassend. Dít is de regel die eerder op drie plekken overgeschreven was.
    expect(Object.is(netSpendFromSums(0, 0), -0)).toBe(false)
    expect(netSpendFromSums(0, 0)).toBe(0)
  })

  it('laat een netto-ontvangst negatief staan — niet geklemd op 0', () => {
    expect(netSpendFromSums(-20, 120)).toBe(-100)
  })

  it('leest de string-sommen die Postgres teruggeeft', () => {
    expect(netSpendFromSums('-120.50', '20.50')).toBe(100)
  })

  it('poetst een rekenfout niet weg: NaN blijft NaN', () => {
    expect(Number.isNaN(netSpendFromSums(Number.NaN, 0))).toBe(true)
  })
})

// ── Uitkomst per periode ────────────────────────────────────────────────────

describe('computePeriodOutcome', () => {
  const slice = {
    periodKey: '2026-07',
    label: 'juli 2026',
    since: '2026-07-01',
    until: '2026-07-31',
    isOpen: false,
  }

  it('binnen de grens: ruimte over, niets eroverheen', () => {
    const o = computePeriodOutcome(slice, [row('2026-07', 32)], 50)
    expect(o.periodMatchedAmount).toBe(32)
    expect(o.periodHeadroom).toBe(18)
    expect(o.periodOverAmount).toBe(0)
    expect(o.status).toBe('within')
  })

  it('boven de grens: overschrijding, geen ruimte', () => {
    const o = computePeriodOutcome(slice, [row('2026-07', 74.5)], 50)
    expect(o.periodOverAmount).toBeCloseTo(24.5, 10)
    expect(o.periodHeadroom).toBe(0)
    expect(o.status).toBe('exceeded')
  })

  it('EXACT op de grens telt als binnen', () => {
    const o = computePeriodOutcome(slice, [row('2026-07', 50)], 50)
    expect(o.status).toBe('within')
    expect(o.periodOverAmount).toBe(0)
    expect(o.periodHeadroom).toBe(0)
  })

  it('grens 0: elke uitgave is een overschrijding, geen uitgave is binnen', () => {
    expect(computePeriodOutcome(slice, [row('2026-07', 0.01)], 0).status).toBe('exceeded')
    expect(computePeriodOutcome(slice, [], 0).status).toBe('within')
  })

  it('lege periode = 0 uitgegeven en dus BINNEN de grens (niet "geen data")', () => {
    const o = computePeriodOutcome(slice, [], 50)
    expect(o.periodMatchedAmount).toBe(0)
    expect(o.matchedTransactionCount).toBe(0)
    expect(o.status).toBe('within')
  })

  it('een refund verlaagt het bedrag en kan de periode van boven naar binnen brengen', () => {
    const zonder = computePeriodOutcome(slice, [row('2026-07', 70)], 50)
    expect(zonder.status).toBe('exceeded')

    const met = computePeriodOutcome(slice, [row('2026-07', 70, { refund: 30, count: 2 })], 50)
    expect(met.periodMatchedAmount).toBe(40)
    expect(met.status).toBe('within')
  })

  it('netto teruggave levert een negatief bedrag op — niet stilzwijgend op nul geklemd', () => {
    const o = computePeriodOutcome(slice, [row('2026-07', 10, { refund: 60, count: 2 })], 50)
    expect(o.periodMatchedAmount).toBe(-50)
    expect(o.periodHeadroom).toBe(100)
    expect(o.periodOverAmount).toBe(0)
    expect(o.status).toBe('within')
  })

  it('sluit (joint_)transfer-rijen uit: eigen overboekingen zijn geen uitgave', () => {
    const rows = [
      row('2026-07', 30),
      row('2026-07', 500, { type: 'transfer' }),
      row('2026-07', 400, { type: 'joint_transfer' }),
    ]
    const o = computePeriodOutcome(slice, rows, 50)
    expect(o.periodMatchedAmount).toBe(30)
    expect(o.status).toBe('within')
  })

  it('negeert rijen uit een andere maand', () => {
    const o = computePeriodOutcome(slice, [row('2026-06', 999), row('2026-07', 10)], 50)
    expect(o.periodMatchedAmount).toBe(10)
  })

  it('verzamelt de gematchte tegenpartij-namen ontdubbeld en gesorteerd', () => {
    const rows = [
      row('2026-07', 20, { names: ['Shell Express 1032', 'SHELL NEDERLAND'] }),
      row('2026-07', 10, { names: ['Shell Express 1032'] }),
    ]
    const o = computePeriodOutcome(slice, rows, 50)
    expect(o.matchedCounterpartyNames).toEqual(['SHELL NEDERLAND', 'Shell Express 1032'])
  })
})

// ── Reeksen ─────────────────────────────────────────────────────────────────

describe('computeStreaks', () => {
  it('telt de aaneengesloten reeks tot en met de laatste afgesloten periode', () => {
    const periods = [
      outcome('2026-03', 80, 50), // boven
      outcome('2026-04', 20, 50),
      outcome('2026-05', 30, 50),
      outcome('2026-06', 45, 50),
    ]
    const s = computeStreaks(periods)
    expect(s.currentStreak).toBe(3)
    expect(s.longestStreak).toBe(3)
    expect(s.lastWithinPeriodKey).toBe('2026-06')
    expect(s.exceededPeriodCount).toBe(1)
    expect(s.closedPeriodCount).toBe(4)
  })

  it('onderscheidt de langste van de huidige reeks', () => {
    const periods = [
      outcome('2026-01', 10, 50),
      outcome('2026-02', 10, 50),
      outcome('2026-03', 10, 50),
      outcome('2026-04', 99, 50), // breekt
      outcome('2026-05', 10, 50),
    ]
    const s = computeStreaks(periods)
    expect(s.longestStreak).toBe(3)
    expect(s.currentStreak).toBe(1)
  })

  it('zet de reeks op 0 wanneer de laatste afgesloten periode boven de grens zat', () => {
    const s = computeStreaks([outcome('2026-05', 10, 50), outcome('2026-06', 99, 50)])
    expect(s.currentStreak).toBe(0)
    expect(s.longestStreak).toBe(1)
    expect(s.lastWithinPeriodKey).toBe('2026-05')
  })

  it('geeft nullen bij nul afgesloten periodes — geen NaN, geen null-reeks', () => {
    const s = computeStreaks([])
    expect(s).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastWithinPeriodKey: null,
      exceededPeriodCount: 0,
      closedPeriodCount: 0,
    })
  })
})

// ── Volledig rapport ────────────────────────────────────────────────────────

describe('buildSpendLimitReport', () => {
  const now = new Date(2026, 7, 8) // 8 augustus 2026

  it('houdt de LOPENDE periode buiten de reeks, ook als die boven de grens zit', () => {
    const report = buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: 50, period: 'month' },
      rows: [
        row('2026-06', 10),
        row('2026-07', 20),
        row('2026-08', 900), // lopende maand: fors eroverheen
      ],
      now,
      windowPeriods: 3,
    })

    expect(report.currentPeriod.periodKey).toBe('2026-08')
    expect(report.currentPeriod.isOpen).toBe(true)
    expect(report.currentPeriod.status).toBe('exceeded')

    // De reeks kijkt uitsluitend naar juni + juli.
    expect(report.closedPeriods.map((p) => p.periodKey)).toEqual(['2026-06', '2026-07'])
    expect(report.streaks.currentStreak).toBe(2)
    expect(report.streaks.exceededPeriodCount).toBe(0)
    expect(report.lastClosedPeriod?.periodKey).toBe('2026-07')
  })

  it('vult maanden zonder transacties aan als "binnen de grens"', () => {
    const report = buildSpendLimitReport({
      rule: { ruleType: 'counterparty', limitAmount: 50, period: 'month' },
      rows: [row('2026-07', 5, { names: ['Shell'] })],
      now,
      windowPeriods: 4,
    })
    expect(report.closedPeriods).toHaveLength(3)
    expect(report.closedPeriods.every((p) => p.status === 'within')).toBe(true)
    expect(report.streaks.currentStreak).toBe(3)
  })

  it('werkt voor beide regeltypen op dezelfde rijvorm', () => {
    const rows = [row('2026-07', 60)]
    const budget = buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: 50, period: 'month' },
      rows,
      now,
      windowPeriods: 2,
    })
    const counterparty = buildSpendLimitReport({
      rule: { ruleType: 'counterparty', limitAmount: 50, period: 'month' },
      rows,
      now,
      windowPeriods: 2,
    })
    expect(budget.lastClosedPeriod?.periodOverAmount).toBe(10)
    expect(counterparty.lastClosedPeriod?.periodOverAmount).toBe(10)
  })

  it('levert bij één periode alleen de lopende periode en een lege reeks', () => {
    const report = buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: 50, period: 'month' },
      rows: [row('2026-08', 10)],
      now,
      windowPeriods: 1,
    })
    expect(report.lastClosedPeriod).toBeNull()
    expect(report.closedPeriods).toHaveLength(0)
    expect(report.streaks.closedPeriodCount).toBe(0)
  })
})

// ── Kwartaal- en jaarperiodes (fase 5) ──────────────────────────────────────

const NOW_AUG_2026 = new Date(2026, 7, 8) // 8 augustus 2026 — midden in Q3

describe('resolveSpendLimitPeriods — kwartaal', () => {
  it('levert de contract-sleutels, -labels en kalendergrenzen (AC-B4-01)', () => {
    const slices = resolveSpendLimitPeriods('quarter', NOW_AUG_2026, 3)
    expect(slices.map((s) => s.periodKey)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3'])
    expect(slices.map((s) => s.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026'])
    expect(slices.map((s) => s.since)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01'])
    expect(slices.map((s) => s.until)).toEqual(['2026-03-31', '2026-06-30', '2026-09-30'])
    // Alleen het lopende kwartaal is open — dezelfde datumregel als bij maanden.
    expect(slices.map((s) => s.isOpen)).toEqual([false, false, true])
  })

  it('loopt correct over de jaargrens heen', () => {
    const slices = resolveSpendLimitPeriods('quarter', new Date(2026, 1, 3), 3)
    expect(slices.map((s) => s.periodKey)).toEqual(['2025-Q3', '2025-Q4', '2026-Q1'])
    expect(slices[0].since).toBe('2025-07-01')
    expect(slices[1].until).toBe('2025-12-31')
  })

  it('houdt het kwartaal OPEN op zijn laatste dag', () => {
    const opLaatsteDag = resolveSpendLimitPeriods('quarter', new Date(2026, 5, 30), 1)[0]
    expect(opLaatsteDag.periodKey).toBe('2026-Q2')
    expect(opLaatsteDag.isOpen).toBe(true)
    const daarna = resolveSpendLimitPeriods('quarter', new Date(2026, 6, 1), 2)
    expect(daarna.find((s) => s.periodKey === '2026-Q2')?.isOpen).toBe(false)
  })
})

describe('resolveSpendLimitPeriods — jaar', () => {
  it('levert de contract-sleutels, -labels en kalendergrenzen (AC-B4-02)', () => {
    const slices = resolveSpendLimitPeriods('year', NOW_AUG_2026, 4)
    expect(slices.map((s) => s.periodKey)).toEqual(['2023', '2024', '2025', '2026'])
    expect(slices.map((s) => s.label)).toEqual(['2023', '2024', '2025', '2026'])
    expect(slices.map((s) => s.since)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'])
    expect(slices.map((s) => s.until)).toEqual(['2023-12-31', '2024-12-31', '2025-12-31', '2026-12-31'])
    expect(slices.map((s) => s.isOpen)).toEqual([false, false, false, true])
  })
})

describe('sliceContainsMonth', () => {
  it('is inclusief aan beide kanten en sluit de buurmaanden uit', () => {
    const q3 = resolveSpendLimitPeriods('quarter', NOW_AUG_2026, 1)[0]
    expect(['2026-07', '2026-08', '2026-09'].every((m) => sliceContainsMonth(q3, m))).toBe(true)
    expect(sliceContainsMonth(q3, '2026-06')).toBe(false)
    expect(sliceContainsMonth(q3, '2026-10')).toBe(false)
  })
})

describe('computePeriodOutcome — bereik-match over meerdere maanden', () => {
  it('kwartaal telt precies zijn drie maanden en negeert beide buurmaanden (AC-B0-01)', () => {
    // Q2 2026 = april t/m juni. Maart en juli liggen er direct naast.
    const q2 = resolveSpendLimitPeriods('quarter', NOW_AUG_2026, 2)[0]
    expect(q2.periodKey).toBe('2026-Q2')

    const o = computePeriodOutcome(
      q2,
      [
        row('2026-03', 999),
        row('2026-04', 10),
        row('2026-05', 20),
        row('2026-06', 30),
        row('2026-07', 999),
      ],
      50,
    )
    expect(o.periodMatchedAmount).toBe(60)
    expect(o.matchedTransactionCount).toBe(3)
    // Met de oude exacte-gelijkheidsmatch ('2026-04' !== '2026-Q2') zou hier 0
    // uitkomen en dus 'within' — een stille nul in plaats van een overschrijding.
    expect(o.status).toBe('exceeded')
    expect(o.periodOverAmount).toBe(10)
  })

  it('jaar telt precies zijn twaalf kalendermaanden (AC-B0-02)', () => {
    const y2025 = resolveSpendLimitPeriods('year', NOW_AUG_2026, 2)[0]
    expect(y2025.periodKey).toBe('2025')

    const maanden = Array.from({ length: 12 }, (_, i) =>
      row(`2025-${String(i + 1).padStart(2, '0')}`, 10),
    )
    const o = computePeriodOutcome(
      y2025,
      [row('2024-12', 999), ...maanden, row('2026-01', 999)],
      500,
    )
    expect(o.periodMatchedAmount).toBe(120)
    expect(o.matchedTransactionCount).toBe(12)
    expect(o.status).toBe('within')
  })

  it('EXACT op de grens telt als binnen — voor alle drie de periodesoorten (RE-06)', () => {
    for (const kind of ['month', 'quarter', 'year'] as SpendLimitPeriodKind[]) {
      const slice = resolveSpendLimitPeriods(kind, NOW_AUG_2026, 2)[0]
      const maand = `${slice.since.slice(0, 7)}`
      const o = computePeriodOutcome(slice, [row(maand, 50)], 50)
      expect(o.status).toBe('within')
      expect(o.periodOverAmount).toBe(0)
      expect(o.periodHeadroom).toBe(0)
    }
  })

  it('een lege periode telt als binnen — voor alle drie de periodesoorten (RE-06)', () => {
    for (const kind of ['month', 'quarter', 'year'] as SpendLimitPeriodKind[]) {
      const slice = resolveSpendLimitPeriods(kind, NOW_AUG_2026, 2)[0]
      const o = computePeriodOutcome(slice, [], 50)
      expect(o.periodMatchedAmount).toBe(0)
      expect(o.status).toBe('within')
      expect(o.isNearLimit).toBe(false)
    }
  })
})

// ── isNearLimit ─────────────────────────────────────────────────────────────

describe('isNearLimit', () => {
  const slice = resolveSpendLimitPeriods('month', NOW_AUG_2026, 2)[0] // 2026-07, afgesloten
  const maand = slice.periodKey

  it('slaat aan op precies de drempel en blijft eronder uit (AC-B0-08)', () => {
    expect(SPEND_LIMIT_NEAR_LIMIT_PCT).toBe(0.8)
    expect(computePeriodOutcome(slice, [row(maand, 80)], 100).isNearLimit).toBe(true)
    expect(computePeriodOutcome(slice, [row(maand, 95)], 100).isNearLimit).toBe(true)
    expect(computePeriodOutcome(slice, [row(maand, 79.99)], 100).isNearLimit).toBe(false)
  })

  it('is nooit waar zodra de periode boven de grens zit (AC-B0-09)', () => {
    const o = computePeriodOutcome(slice, [row(maand, 500)], 100)
    expect(o.status).toBe('exceeded')
    expect(o.isNearLimit).toBe(false)
  })

  it('is nooit waar bij een grens van 0 (AC-B0-10)', () => {
    // Zonder de limitAmount > 0-guard zou 0 >= 0,8 × 0 waar zijn en zou élke lege
    // periode op een nulgrens "bijna over je grens" melden.
    expect(computePeriodOutcome(slice, [], 0).isNearLimit).toBe(false)
    expect(computePeriodOutcome(slice, [row(maand, 0.01)], 0).isNearLimit).toBe(false)
  })
})

// ── Trend ───────────────────────────────────────────────────────────────────

describe('computeSpendLimitTrend', () => {
  /** N afgesloten periodes met de gegeven bedragen, oud → nieuw. */
  function closed(amounts: number[]): SpendLimitPeriodOutcome[] {
    return amounts.map((a, i) => outcome(`2026-${String(i + 1).padStart(2, '0')}`, a, 1000))
  }

  it('geeft geen getal en geen NaN bij minder dan 3 afgesloten periodes (AC-B0-04)', () => {
    for (const n of [0, 1, 2]) {
      const t = computeSpendLimitTrend(closed(Array.from({ length: n }, () => 100)))
      expect(t.recentAvgMatchedAmount).toBeNull()
      expect(t.priorAvgMatchedAmount).toBeNull()
      expect(t.avgMatchedAmountChange).toBeNull()
      expect(t.avgMatchedAmountChangePct).toBeNull()
      expect(t.direction).toBe('unknown')
      expect(t.movingAvgMatchedAmountByPeriod.every((m) => m.movingAvgMatchedAmount === null)).toBe(true)
    }
  })

  it('kent wél een recent gemiddelde maar nog geen richting bij 3–5 periodes', () => {
    const t = computeSpendLimitTrend(closed([30, 60, 90, 120, 150]))
    expect(t.recentAvgMatchedAmount).toBe(120) // 90+120+150 / 3
    expect(t.priorAvgMatchedAmount).toBeNull()
    expect(t.direction).toBe('unknown')
    expect(t.windowPeriods).toBe(SPEND_LIMIT_TREND_WINDOW)
  })

  it('noemt MINDER uitgeven improving — de richting is omgekeerd (FR-B0-07)', () => {
    const t = computeSpendLimitTrend(closed([100, 100, 100, 50, 50, 50]))
    expect(t.priorAvgMatchedAmount).toBe(100)
    expect(t.recentAvgMatchedAmount).toBe(50)
    expect(t.avgMatchedAmountChange).toBe(-50)
    expect(t.avgMatchedAmountChangePct).toBe(-50) // PROCENTPUNTEN, geen fractie
    expect(t.direction).toBe('improving')
  })

  it('noemt MEER uitgeven worsening', () => {
    const t = computeSpendLimitTrend(closed([50, 50, 50, 100, 100, 100]))
    expect(t.avgMatchedAmountChange).toBe(50)
    expect(t.avgMatchedAmountChangePct).toBe(100)
    expect(t.direction).toBe('worsening')
  })

  it('noemt een verschil onder de 5%-drempel stable (AC-B0-07)', () => {
    const t = computeSpendLimitTrend(closed([100, 100, 100, 104, 104, 104]))
    expect(t.avgMatchedAmountChangePct).toBeCloseTo(4, 10)
    expect(t.direction).toBe('stable')
    // Net erboven kantelt hij wél.
    expect(computeSpendLimitTrend(closed([100, 100, 100, 106, 106, 106])).direction).toBe('worsening')
  })

  it('noemt niets-naar-niets stable met 0% (AC-B0-05)', () => {
    const t = computeSpendLimitTrend(closed([0, 0, 0, 0, 0, 0]))
    expect(t.direction).toBe('stable')
    expect(t.avgMatchedAmountChange).toBe(0)
    expect(t.avgMatchedAmountChangePct).toBe(0)
  })

  it('deelt nooit door nul: prior 0 en recent > 0 is worsening zonder percentage (AC-B0-06)', () => {
    const t = computeSpendLimitTrend(closed([0, 0, 0, 40, 50, 60]))
    expect(t.direction).toBe('worsening')
    expect(t.avgMatchedAmountChange).toBe(50)
    expect(t.avgMatchedAmountChangePct).toBeNull() // nooit "Infinity%"
  })

  it('geeft prior 0 en een netto teruggave als improving zonder percentage', () => {
    const t = computeSpendLimitTrend(closed([0, 0, 0, -10, -20, -30]))
    expect(t.direction).toBe('improving')
    expect(t.avgMatchedAmountChangePct).toBeNull()
  })

  it('vult het voortschrijdend gemiddelde pas vanaf de derde periode', () => {
    const t = computeSpendLimitTrend(closed([10, 20, 30, 40, 50, 60]))
    expect(t.movingAvgMatchedAmountByPeriod.map((m) => m.movingAvgMatchedAmount)).toEqual([
      null, null, 20, 30, 40, 50,
    ])
    expect(t.movingAvgMatchedAmountByPeriod[2].periodKey).toBe('2026-03')
  })

  it('rekent alleen op AFGESLOTEN periodes — de lopende telt niet mee (FR-B0-08)', () => {
    const report = buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: 1000, period: 'month' },
      rows: [
        row('2026-03', 100), row('2026-04', 100), row('2026-05', 100),
        row('2026-06', 50), row('2026-07', 50),
        row('2026-08', 99999), // lopende maand
      ],
      now: NOW_AUG_2026,
      windowPeriods: 6,
    })
    expect(report.closedPeriods).toHaveLength(5)
    expect(report.trend.recentAvgMatchedAmount).toBeCloseTo((100 + 50 + 50) / 3, 10)
    expect(report.trend.priorAvgMatchedAmount).toBeNull() // pas vanaf 6 afgesloten
    expect(report.trend.movingAvgMatchedAmountByPeriod).toHaveLength(5)
  })
})

// ── Aanmaak-ondergrens (alleen de trend) ────────────────────────────────────

/**
 * Afgesloten maanden vanaf 2026-01, oud → nieuw. Maand N begint op
 * `2026-0N-01` — precies de datum waar de ondergrens tegenaan wordt gelegd.
 */
function maanden(amounts: number[]): SpendLimitPeriodOutcome[] {
  return amounts.map((a, i) => outcome(`2026-${String(i + 1).padStart(2, '0')}`, a, 1000))
}

describe('closedPeriodsSinceCreation', () => {
  it('houdt de aaneengesloten staart over die op of ná de aanmaakdag begint', () => {
    const periods = maanden([10, 20, 30, 40, 50, 60])
    // 1 april = de eerste dag van april ⇒ april telt mee.
    expect(closedPeriodsSinceCreation(periods, '2026-04-01').map((p) => p.periodKey)).toEqual([
      '2026-04', '2026-05', '2026-06',
    ])
    // Eén dag later liep april al toen de pot ontstond ⇒ april valt af.
    expect(closedPeriodsSinceCreation(periods, '2026-04-02').map((p) => p.periodKey)).toEqual([
      '2026-05', '2026-06',
    ])
  })

  it('leest een volledige ISO-tijdstempel als kalenderdatum (de DB levert timestamptz)', () => {
    const periods = maanden([10, 20, 30, 40, 50, 60])
    expect(
      closedPeriodsSinceCreation(periods, '2026-04-01T23:59:59.999Z').map((p) => p.periodKey),
    ).toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('clampt NIET bij een ontbrekende of onleesbare aanmaakdatum (datavlek-regel)', () => {
    const periods = maanden([10, 20, 30, 40, 50, 60])
    // Spiegelt streakStartsAfterCreation: doorlaten-bij-twijfel. Clampen-bij-
    // twijfel zou één datavlek de richting permanent laten zwijgen zonder signaal.
    for (const rot of [undefined, null, '', '   ', 'onbekend', '2026-4-1', '01-04-2026']) {
      expect(closedPeriodsSinceCreation(periods, rot)).toEqual(periods)
    }
  })
})

describe('computeSpendLimitTrend — aanmaak-ondergrens', () => {
  it('vertelt een splinternieuwe pot geen richting over periodes van vóór zijn bestaan', () => {
    // Negen lege maanden (de pot bestond nog niet — de motor telt zo'n periode
    // bewust als "binnen de grens") gevolgd door drie échte maanden.
    const periods = maanden([0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 60, 60])

    // Zó zag het eruit vóór de ondergrens: "je geeft meer uit dan daarvóór" —
    // een rekenartefact, want daarvóór bestond de grens niet.
    const zonderGrens = computeSpendLimitTrend(periods)
    expect(zonderGrens.direction).toBe('worsening')
    expect(zonderGrens.priorAvgMatchedAmount).toBe(0)

    const met = computeSpendLimitTrend(periods, SPEND_LIMIT_TREND_WINDOW, '2026-10-01T08:30:00.000Z')
    expect(met.direction).toBe('unknown')
    expect(met.priorAvgMatchedAmount).toBeNull()
    expect(met.avgMatchedAmountChange).toBeNull()
    expect(met.avgMatchedAmountChangePct).toBeNull()
    // Het eerlijke gemiddelde over de drie échte maanden blijft wél staan.
    expect(met.recentAvgMatchedAmount).toBe(60)
    expect(met.movingAvgMatchedAmountByPeriod.map((m) => m.periodKey)).toEqual([
      '2026-10', '2026-11', '2026-12',
    ])
  })

  it('geeft unknown en geen NaN zodra er ná de aanmaak nog niets is afgesloten', () => {
    const t = computeSpendLimitTrend(maanden([10, 20, 30, 40, 50, 60]), SPEND_LIMIT_TREND_WINDOW, '2026-07-01')
    expect(t.movingAvgMatchedAmountByPeriod).toEqual([])
    expect(t.recentAvgMatchedAmount).toBeNull()
    expect(t.priorAvgMatchedAmount).toBeNull()
    expect(t.avgMatchedAmountChange).toBeNull()
    expect(t.avgMatchedAmountChangePct).toBeNull()
    expect(t.direction).toBe('unknown')
    expect(t.windowPeriods).toBe(SPEND_LIMIT_TREND_WINDOW)
  })

  it('geeft pas een richting vanaf 2 × het trendvenster meetellende periodes', () => {
    const periods = maanden([0, 0, 0, 0, 0, 0, 90, 90, 90, 30, 30, 30])

    // 1 juli ⇒ precies zes meetellende maanden (3 vs. 3) ⇒ wél een richting.
    const zes = computeSpendLimitTrend(periods, SPEND_LIMIT_TREND_WINDOW, '2026-07-01')
    expect(zes.priorAvgMatchedAmount).toBe(90)
    expect(zes.recentAvgMatchedAmount).toBe(30)
    expect(zes.direction).toBe('improving')

    // Eén dag later valt juli af ⇒ vijf meetellende maanden ⇒ nog geen richting.
    const vijf = computeSpendLimitTrend(periods, SPEND_LIMIT_TREND_WINDOW, '2026-07-02')
    expect(vijf.priorAvgMatchedAmount).toBeNull()
    expect(vijf.recentAvgMatchedAmount).toBe(30)
    expect(vijf.direction).toBe('unknown')
  })

  it('laat een pot die ouder is dan het venster volledig ongemoeid', () => {
    const periods = maanden([100, 100, 100, 50, 50, 50])
    const zonder = computeSpendLimitTrend(periods)
    const met = computeSpendLimitTrend(periods, SPEND_LIMIT_TREND_WINDOW, '2025-06-15T09:00:00.000Z')
    expect(met).toEqual(zonder)
    expect(met.direction).toBe('improving')
  })
})

describe('computeSpendLimitScore', () => {
  const stable = computeSpendLimitTrend(maanden([100, 100, 100, 100, 100, 100]))
  const geen: SpendLimitTrend = { ...stable, direction: 'unknown' }

  it('zwijgt onder de drempel van drie meetellende periodes', () => {
    // Eén periode binnen de grens levert rekenkundig een 100 op. Waar, maar het
    // zegt niets — en een cijfer dat niets zegt is erger dan geen cijfer.
    for (const n of [0, 1, 2]) {
      const score = computeSpendLimitScore(maanden(Array(n).fill(10)), geen)
      expect(score.score).toBeNull()
      expect(score.label).toBeNull()
      expect(score.hitRatePct).toBeNull()
      expect(score.basisPeriodCount).toBe(n)
    }
  })

  it('geeft 100 bij een vlekkeloze historie en 0 bij een historie die altijd misging', () => {
    const perfect = computeSpendLimitScore(maanden([10, 10, 10, 10, 10, 10]), geen)
    expect(perfect.score).toBe(100)
    expect(perfect.label).toBe('strak')
    expect(perfect.hitRatePct).toBe(100)
    expect(perfect.basisPeriodCount).toBe(6)

    // Grens = 1000 (zie `maanden`), dus elke periode zit eroverheen.
    const altijdMis = computeSpendLimitScore(maanden([5000, 5000, 5000, 5000]), geen)
    expect(altijdMis.score).toBe(0)
    expect(altijdMis.label).toBe('los')
    expect(altijdMis.hitRatePct).toBe(0)
  })

  it('beloont herstel: dezelfde misser weegt lichter naarmate de nieuwe reeks groeit', () => {
    const netNaEenMisser = computeSpendLimitScore(maanden([10, 10, 10, 5000, 10]), geen)
    const langerHersteld = computeSpendLimitScore(maanden([10, 10, 10, 5000, 10, 10, 10]), geen)
    expect(langerHersteld.score!).toBeGreaterThan(netNaEenMisser.score!)
  })

  it('is MONOTOON: één periode van boven naar binnen verlaagt het cijfer nooit', () => {
    // De regressietest voor de niet-monotone reeks-noemer. Met de langste reeks
    // als noemer scoorde het slechtere patroon hieronder (83) HOGER dan het
    // betere (73), omdat een eigen record meegroeit met je historie.
    const BINNEN = 10
    const BOVEN = 5000 // grens = 1000, zie `maanden`
    const slechter = computeSpendLimitScore(
      maanden([BINNEN, BINNEN, BOVEN, BINNEN, BINNEN, BOVEN, BINNEN, BINNEN]),
      geen,
    )
    const beter = computeSpendLimitScore(
      maanden([BINNEN, BINNEN, BINNEN, BINNEN, BINNEN, BOVEN, BINNEN, BINNEN]),
      geen,
    )
    expect(beter.score!).toBeGreaterThan(slechter.score!)

    // En breder: kantel elke overschrijding één voor één om — het cijfer mag bij
    // geen enkele stap dalen. Dit vangt ook toekomstige gewichtswijzigingen.
    const start = [BOVEN, BOVEN, BINNEN, BOVEN, BINNEN, BINNEN, BOVEN, BINNEN, BOVEN, BINNEN]
    let vorige = computeSpendLimitScore(maanden(start), geen).score!
    for (let i = 0; i < start.length; i++) {
      if (start[i] !== BOVEN) continue
      const verbeterd = [...start]
      verbeterd[i] = BINNEN
      const nu = computeSpendLimitScore(maanden(verbeterd), geen).score!
      expect(nu).toBeGreaterThanOrEqual(vorige)
      start[i] = BINNEN
      vorige = nu
    }
  })

  it('verrekent de richting als correctie in beide kanten, en negeert een onbekende richting', () => {
    const periods = maanden([10, 10, 10, 5000, 10, 10])
    const neutraal = computeSpendLimitScore(periods, geen)
    const beter = computeSpendLimitScore(periods, { ...stable, direction: 'improving' })
    const slechter = computeSpendLimitScore(periods, { ...stable, direction: 'worsening' })

    expect(beter.score! - neutraal.score!).toBe(SPEND_LIMIT_SCORE_TREND_BONUS)
    expect(neutraal.score! - slechter.score!).toBe(SPEND_LIMIT_SCORE_TREND_BONUS)
    // 'stable' en 'unknown' geven allebei geen correctie — nooit een half oordeel.
    expect(computeSpendLimitScore(periods, stable).score).toBe(neutraal.score)
  })

  it('klemt op [0,100], ook als de richting-correctie eroverheen zou duwen', () => {
    const top = computeSpendLimitScore(maanden([10, 10, 10, 10]), { ...stable, direction: 'improving' })
    expect(top.score).toBe(100)
    const bodem = computeSpendLimitScore(maanden([5000, 5000, 5000]), { ...stable, direction: 'worsening' })
    expect(bodem.score).toBe(0)
  })

  it('telt alleen periodes ná de aanmaak — een splinternieuwe pot krijgt géén 100', () => {
    // Precies de valkuil waarvoor de ondergrens bestaat: de motor telt een
    // periode zonder transacties als "binnen de grens", dus zonder poort erft
    // een pot van vandaag een vlekkeloze historie die hij nooit heeft geleefd.
    const leegDanEcht = maanden([0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 5000, 10])

    const zonderPoort = computeSpendLimitScore(leegDanEcht, geen)
    // 10 van 12 binnen (×70 = 58,3) + lopende reeks 1 van de 3 (×30 = 10) = 68.
    expect(zonderPoort.score).toBe(68)
    expect(zonderPoort.hitRatePct).toBe(83)
    expect(zonderPoort.basisPeriodCount).toBe(12)

    // Pot gemaakt op 1 oktober ⇒ alleen okt/nov/dec tellen mee: 1 van 3 binnen.
    const metPoort = computeSpendLimitScore(leegDanEcht, geen, '2026-10-01')
    expect(metPoort.basisPeriodCount).toBe(3)
    expect(metPoort.hitRatePct).toBe(33)
    expect(metPoort.score).toBeLessThan(zonderPoort.score!)
  })

  it('geeft de opbouw prijs, en die reproduceert het cijfer exact', () => {
    // Het spinnenweb in de prestatieweergave tekent `components`. Zou dat niet
    // dezelfde termen zijn waarop `score` rust, dan kan de grafiek stil gaan
    // afwijken van het getal ernaast — deze test is die koppeling.
    const periods = maanden([10, 10, 10, 5000, 10, 10])
    for (const richting of ['improving', 'stable', 'worsening', 'unknown'] as const) {
      const s = computeSpendLimitScore(periods, { ...stable, direction: richting })
      const c = s.components!
      const bonus = (c.trend - 0.5) * 2 * SPEND_LIMIT_SCORE_TREND_BONUS
      const herbouwd = Math.round(c.hitRate * 70 + c.streak * 30 + bonus)
      expect(herbouwd).toBe(s.score)
    }
  })

  it('laat de opbouw weg zolang er geen cijfer is', () => {
    const s = computeSpendLimitScore(maanden([10]), geen)
    expect(s.score).toBeNull()
    expect(s.components).toBeNull()
  })

  it('houdt zich aan de drempelbanden van SPEND_LIMIT_SCORE_THRESHOLDS', () => {
    // De banden staan als data in de motor zodat de UI ze nooit hoeft na te bouwen.
    expect(SPEND_LIMIT_SCORE_THRESHOLDS.map((b) => b.min)).toEqual([80, 60, 40, 0])
    expect(SPEND_LIMIT_SCORE_MIN_PERIODS).toBe(SPEND_LIMIT_TREND_WINDOW)
    // De labels mogen NOOIT samenvallen met die van het gezondheidsgetal
    // (lib/financial-health.ts) — dezelfde woorden op andere banden is drift.
    expect(SPEND_LIMIT_SCORE_THRESHOLDS.map((b) => b.label)).toEqual([
      'strak', 'netjes', 'wisselend', 'los',
    ])
    // ...en ook niet met de stoplicht-woorden: 'Op koers' is app-breed de béste,
    // groene stand (nav-menu, doelen-view, budgetrapportage) en kan hier dus geen
    // tweede band zijn — hetzelfde woord op een andere plek in de rangorde leest
    // op twee schermen als twee verschillende dingen.
    const stoplicht = ['op koers', 'aandacht nodig', 'actie vereist']
    for (const band of SPEND_LIMIT_SCORE_THRESHOLDS) {
      expect(stoplicht).not.toContain(band.label)
    }
  })
})

describe('buildSpendLimitReport — de ondergrens raakt de trend én de score, niet de reeks', () => {
  const now = new Date(2026, 7, 8) // 8 augustus 2026
  const rule: SpendLimitRule = { ruleType: 'budget', limitAmount: 1000, period: 'month' }
  const windowPeriods = SPEND_LIMIT_WINDOW_BY_PERIOD.month // 13 = 12 afgesloten + de lopende

  it('nieuwe pot met lege historie: reeks en periode-uitkomsten ONGEWIJZIGD, richting unknown', () => {
    const zonder = buildSpendLimitReport({ rule, rows: [], now, windowPeriods })
    const met = buildSpendLimitReport({
      rule: { ...rule, createdAt: '2026-08-05T10:00:00.000Z' },
      rows: [],
      now,
      windowPeriods,
    })

    // De reeks blijft het kale datafeit — de mijlpaal-MELDING heeft daar zijn
    // eigen poort voor (streakStartsAfterCreation in lib/notifications).
    expect(met.closedPeriods).toEqual(zonder.closedPeriods)
    expect(met.streaks).toEqual(zonder.streaks)
    expect(met.currentPeriod).toEqual(zonder.currentPeriod)
    expect(met.lastClosedPeriod).toEqual(zonder.lastClosedPeriod)
    expect(met.streaks.closedPeriodCount).toBe(12)
    expect(met.streaks.currentStreak).toBe(12)

    // Alleen de richting zwijgt nu; vóór de ondergrens was dit 'stable' over
    // twaalf maanden waarin de pot niet bestond.
    expect(zonder.trend.direction).toBe('stable')
    expect(met.trend.direction).toBe('unknown')
    expect(met.trend.recentAvgMatchedAmount).toBeNull()
    expect(met.trend.movingAvgMatchedAmountByPeriod).toEqual([])

    // Idem voor de score: zonder poort zou een pot van drie dagen oud met een
    // vlekkeloze 100 pronken over twaalf maanden die hij nooit heeft geleefd.
    expect(zonder.score.score).toBe(100)
    expect(met.score.score).toBeNull()
    expect(met.score.basisPeriodCount).toBe(0)
  })

  it('pot ouder dan zijn venster: het hele rapport is identiek met en zonder aanmaakdatum', () => {
    const maandKeys = [
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
      '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ]
    const rows = maandKeys.map((m, i) => row(m, i >= 9 ? 40 : 100))

    const zonder = buildSpendLimitReport({ rule, rows, now, windowPeriods })
    const met = buildSpendLimitReport({
      rule: { ...rule, createdAt: '2024-01-15T00:00:00.000Z' },
      rows,
      now,
      windowPeriods,
    })

    expect(met).toEqual(zonder)
    expect(met.trend.direction).toBe('improving')
    expect(met.trend.movingAvgMatchedAmountByPeriod).toHaveLength(12)
  })
})

// ── Vensterlengtes ──────────────────────────────────────────────────────────

describe('SPEND_LIMIT_WINDOW_BY_PERIOD', () => {
  it('dekt maximaal 48 kalendermaanden en houdt altijd ≥3 afgesloten periodes over', () => {
    expect(SPEND_LIMIT_WINDOW_BY_PERIOD).toEqual({ day: 31, week: 14, month: 13, quarter: 9, year: 4 })
    // Ruwe lengte van één periode in maanden — dag en week ruim naar boven
    // afgerond op 1, want de 48-maands bovengrens is een plafond en geen doel.
    const maanden: Record<SpendLimitPeriodKind, number> = {
      day: 1,
      week: 1,
      month: 1,
      quarter: 3,
      year: 12,
    }
    for (const kind of Object.keys(SPEND_LIMIT_WINDOW_BY_PERIOD) as SpendLimitPeriodKind[]) {
      expect(SPEND_LIMIT_WINDOW_BY_PERIOD[kind] * maanden[kind]).toBeLessThanOrEqual(48)
      expect(SPEND_LIMIT_WINDOW_BY_PERIOD[kind] - 1).toBeGreaterThanOrEqual(SPEND_LIMIT_TREND_WINDOW)
    }
  })

  it('koppelt elke periodesoort aan een korrel die niet grover is dan de periode zelf', () => {
    // DE HARDE EIS onder `sliceContainsBucket`: een bucket mag nooit over een
    // periodegrens heen liggen. Zou een dagpot op maand-korrel rekenen, dan viel
    // een hele maand in één bucket en telde elke dag van die maand hetzelfde
    // bedrag — stil, zonder foutmelding.
    expect(SPEND_LIMIT_GRAIN_BY_PERIOD).toEqual({
      day: 'day',
      week: 'week',
      month: 'month',
      quarter: 'month',
      year: 'month',
    })
  })
})

// ── Dag- en weekperiodes ────────────────────────────────────────────────────

describe('resolveSpendLimitPeriods — dag', () => {
  it('geeft opeenvolgende dagen met vandaag als enige open periode', () => {
    const now = new Date(2026, 7, 10) // maandag 10 augustus 2026
    const slices = resolveSpendLimitPeriods('day', now, 3)

    expect(slices.map((s) => s.periodKey)).toEqual(['2026-08-08', '2026-08-09', '2026-08-10'])
    // Een dagperiode begint en eindigt op dezelfde dag.
    expect(slices[0].since).toBe('2026-08-08')
    expect(slices[0].until).toBe('2026-08-08')
    expect(slices.map((s) => s.isOpen)).toEqual([false, false, true])
    expect(slices[2].label).toBe('10 augustus 2026')
  })

  it('rolt over een maandgrens heen', () => {
    const slices = resolveSpendLimitPeriods('day', new Date(2026, 8, 1), 2) // 1 sep 2026
    expect(slices.map((s) => s.periodKey)).toEqual(['2026-08-31', '2026-09-01'])
  })

  it('telt alleen de transacties van díé dag', () => {
    const now = new Date(2026, 7, 10)
    const [gisteren, vandaag] = resolveSpendLimitPeriods('day', now, 2)
    const rows = [row('2026-08-09', 30), row('2026-08-10', 12)]

    expect(computePeriodOutcome(gisteren, rows, 20).periodMatchedAmount).toBe(30)
    expect(computePeriodOutcome(gisteren, rows, 20).status).toBe('exceeded')
    expect(computePeriodOutcome(vandaag, rows, 20).periodMatchedAmount).toBe(12)
    expect(computePeriodOutcome(vandaag, rows, 20).status).toBe('within')
  })
})

describe('resolveSpendLimitPeriods — week', () => {
  it('loopt van maandag tot en met zondag (ISO-8601)', () => {
    // Donderdag 13 augustus 2026 zit in de week van maandag 10 t/m zondag 16.
    const [week] = resolveSpendLimitPeriods('week', new Date(2026, 7, 13), 1)
    expect(week.since).toBe('2026-08-10')
    expect(week.until).toBe('2026-08-16')
    expect(week.isOpen).toBe(true)
  })

  it('gebruikt het ISO-JAAR in de sleutel, niet het kalenderjaar van de maandag', () => {
    // De week van maandag 29 december 2025 t/m zondag 4 januari 2026 is ISO-week
    // 1 van 2026: de donderdag (1 januari) valt in 2026. Een kale
    // `getFullYear()` op de maandag zou hier '2025-W01' zeggen.
    const [week] = resolveSpendLimitPeriods('week', new Date(2025, 11, 31), 1)
    expect(week.since).toBe('2025-12-29')
    expect(week.until).toBe('2026-01-04')
    expect(week.periodKey).toBe('2026-W01')
  })

  it('telt een dag-bucket in de week waar hij in valt, en niet in de buurweek', () => {
    const now = new Date(2026, 7, 13) // donderdag
    const [vorige, huidige] = resolveSpendLimitPeriods('week', now, 2)
    expect(vorige.since).toBe('2026-08-03')

    // De SQL levert bij week-korrel de MAANDAG als bucketdatum; beide weken
    // krijgen dus precies hun eigen bucket.
    const rows = [row('2026-08-03', 100), row('2026-08-10', 40)]
    expect(computePeriodOutcome(vorige, rows, 50).periodMatchedAmount).toBe(100)
    expect(computePeriodOutcome(huidige, rows, 50).periodMatchedAmount).toBe(40)
  })

  it('houdt de reeks eerlijk: de lopende week telt niet mee', () => {
    const now = new Date(2026, 7, 13)
    const report = buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: 50, period: 'week' },
      rows: [row('2026-08-03', 100), row('2026-08-10', 999)],
      now,
      windowPeriods: 2,
    })
    // De lopende week zit ver over de grens, maar breekt de reeks niet.
    expect(report.currentPeriod.status).toBe('exceeded')
    expect(report.closedPeriods).toHaveLength(1)
    expect(report.streaks.exceededPeriodCount).toBe(1)
  })
})

// ── Tegenpartij-sleutel (parity-helft van de SQL-functie) ───────────────────

describe('spendLimitCounterpartyKey', () => {
  it('strip alles buiten [0-9A-Za-z] en zet om naar hoofdletters', () => {
    expect(spendLimitCounterpartyKey('Shell Express 1032')).toBe('SHELLEXPRESS1032')
    expect(spendLimitCounterpartyKey('CCV*BAKKER B.V.')).toBe('CCVBAKKERBV')
    expect(spendLimitCounterpartyKey('Café Zürich')).toBe('CAFZRICH')
  })

  it('geeft een lege sleutel voor lege of tekenloze invoer', () => {
    expect(spendLimitCounterpartyKey(null)).toBe('')
    expect(spendLimitCounterpartyKey('  ')).toBe('')
    expect(spendLimitCounterpartyKey('!!! ***')).toBe('')
  })

  it('matcht als deeltekst — inclusief de bekende ruimhartigheid', () => {
    const key = spendLimitCounterpartyKey('shell')
    expect(counterpartyMatchesKey('Shell Express 1032', key)).toBe(true)
    expect(counterpartyMatchesKey('SHELL NEDERLAND B.V.', key)).toBe(true)
    expect(counterpartyMatchesKey('Albert Heijn', key)).toBe(false)
    // Bewust vastgelegd: een contains-match is ruim. De UI toont daarom altijd
    // welke namen daadwerkelijk zijn meegeteld.
    expect(counterpartyMatchesKey('Shellfish Bar', key)).toBe(true)
  })

  it('matcht nooit op een lege sleutel — die zou anders álles vangen', () => {
    expect(counterpartyMatchesKey('Albert Heijn', '')).toBe(false)
  })
})

// ── Tempo van de lopende periode (ADR 0119) ─────────────────────────────────

/**
 * Wat hier bewaakt wordt, en waarom:
 *
 *  1. de VERSTREKEN-fractie is een kalenderfeit — dagen inclusief vandaag, exact
 *     1 op de laatste dag, en DST-bestendig (een lokale millisecondendeling zit
 *     er over de klokwissel een dag naast);
 *  2. het PROGNOSEBEDRAG rust op het eigen historische DAGtempo en NIET op een
 *     lineaire run-rate — het EUR 2.480-geval uit de wens is het regressie-anker;
 *  3. de INVARIANT: het tempo raakt status, near-vlag, reeks, trend en score
 *     niet. Die assertie is de reden dat de meldingenlaag niet stil meeschuift.
 */

/** Eén pot-regel voor de tempo-tests; `createdAt` is standaard ruim genoeg. */
function paceRule(over: Partial<SpendLimitRule> = {}): SpendLimitRule {
  return {
    ruleType: 'counterparty',
    limitAmount: 100,
    period: 'month',
    createdAt: '2025-01-01T00:00:00Z',
    ...over,
  }
}

function paceReport(
  rows: SpendLimitAggregateRow[],
  now: Date,
  over: Partial<SpendLimitRule> = {},
) {
  const rule = paceRule(over)
  return buildSpendLimitReport({
    rule,
    rows,
    now,
    windowPeriods: SPEND_LIMIT_WINDOW_BY_PERIOD[rule.period],
  })
}

describe('computeSpendLimitPace — de tijd-as van de lopende periode', () => {
  it('telt de dag van vandaag mee: op de 1e is er één van 31 dagen om', () => {
    const pace = paceReport([row('2026-08', 80)], new Date(2026, 7, 1)).currentPeriodPace
    expect(pace).not.toBeNull()
    expect(pace?.periodDays).toBe(31)
    expect(pace?.elapsedDays).toBe(1)
    expect(pace?.remainingDays).toBe(30)
    expect(pace?.elapsedFraction).toBeCloseTo(1 / 31, 10)
    expect(pace?.usedFraction).toBeCloseTo(0.8, 10)
  })

  it('staat halverwege de maand op de juiste dag', () => {
    const pace = paceReport([row('2026-08', 50)], new Date(2026, 7, 16)).currentPeriodPace
    expect(pace?.elapsedDays).toBe(16)
    expect(pace?.remainingDays).toBe(15)
    expect(pace?.elapsedFraction).toBeCloseTo(16 / 31, 10)
  })

  it('staat op de LAATSTE dag exact op 1 — de periode is dan nog wel open', () => {
    const report = paceReport([row('2026-08', 50)], new Date(2026, 7, 31))
    expect(report.currentPeriod.isOpen).toBe(true)
    expect(report.currentPeriodPace?.elapsedFraction).toBe(1)
    expect(report.currentPeriodPace?.remainingDays).toBe(0)
    // Er valt niets meer te projecteren: het bedrag is dan de uitkomst zelf.
    expect(report.currentPeriodPace?.projectedAmount).toBeNull()
    expect(report.currentPeriodPace?.projectedExceeds).toBeNull()
  })

  it('kent de lengte van korte, lange en schrikkeljaar-maanden', () => {
    expect(paceReport([], new Date(2026, 1, 10)).currentPeriodPace?.periodDays).toBe(28)
    expect(paceReport([], new Date(2028, 1, 10)).currentPeriodPace?.periodDays).toBe(29)
    expect(paceReport([], new Date(2026, 3, 10)).currentPeriodPace?.periodDays).toBe(30)
    expect(paceReport([], new Date(2026, 0, 10)).currentPeriodPace?.periodDays).toBe(31)
  })

  it('blijft exact over een zomertijd-sprong heen (maart 31, oktober 31)', () => {
    // De klok verspringt in NL op 29 maart en 25 oktober 2026. Een lokale
    // millisecondendeling zou hier 30,96 resp. 31,04 dagen tellen en dus een dag
    // te weinig of te veel; de UTC-dagnummers zijn exact.
    const maart = paceReport([], new Date(2026, 2, 30)).currentPeriodPace
    expect(maart?.periodDays).toBe(31)
    expect(maart?.elapsedDays).toBe(30)
    const oktober = paceReport([], new Date(2026, 9, 26)).currentPeriodPace
    expect(oktober?.periodDays).toBe(31)
    expect(oktober?.elapsedDays).toBe(26)
  })

  it('geeft kwartaal- en jaarpotten wél een tempo, dag- en weekpotten niet', () => {
    expect(spendLimitPeriodHasPace('month')).toBe(true)
    expect(spendLimitPeriodHasPace('quarter')).toBe(true)
    expect(spendLimitPeriodHasPace('year')).toBe(true)
    expect(spendLimitPeriodHasPace('day')).toBe(false)
    expect(spendLimitPeriodHasPace('week')).toBe(false)

    // Q3 2026 = 1 jul t/m 30 sep = 92 dagen; 2026 = 365 dagen.
    const q = paceReport([], new Date(2026, 7, 1), { period: 'quarter' }).currentPeriodPace
    expect(q?.periodDays).toBe(92)
    expect(q?.elapsedDays).toBe(32)
    const y = paceReport([], new Date(2026, 7, 1), { period: 'year' }).currentPeriodPace
    expect(y?.periodDays).toBe(365)
    expect(y?.elapsedDays).toBe(213)

    expect(paceReport([], new Date(2026, 7, 1), { period: 'day' }).currentPeriodPace).toBeNull()
    expect(paceReport([], new Date(2026, 7, 1), { period: 'week' }).currentPeriodPace).toBeNull()
  })

  it('geeft geen tempo voor een AFGESLOTEN periode', () => {
    const closed = computePeriodOutcome(
      {
        periodKey: '2026-07',
        label: 'juli 2026',
        since: '2026-07-01',
        until: '2026-07-31',
        isOpen: false,
      },
      [row('2026-07', 40)],
      100,
    )
    expect(
      computeSpendLimitPace({
        period: 'month',
        current: closed,
        closedPeriods: [],
        now: new Date(2026, 7, 5),
      }),
    ).toBeNull()
  })

  it('deelt niet door nul: een grens van 0 geeft usedFraction null, geen NaN', () => {
    const pace = paceReport([row('2026-08', 25)], new Date(2026, 7, 10), {
      limitAmount: 0,
    }).currentPeriodPace
    expect(pace?.usedFraction).toBeNull()
    expect(Number.isNaN(pace?.elapsedFraction)).toBe(false)
  })
})

describe('computeSpendLimitPace — het prognosebedrag', () => {
  /** Mei/juni/juli 2026 op 95 elk: 31 + 30 + 31 = 92 dagen, 285 totaal. */
  const historie = [row('2026-05', 95), row('2026-06', 95), row('2026-07', 95)]
  const basisDagtempo = 285 / 92

  it('lost het geval uit de wens op: 80 op 1 augustus wordt ongeveer 173, niet 2.480', () => {
    const pace = paceReport([...historie, row('2026-08', 80)], new Date(2026, 7, 1))
      .currentPeriodPace
    expect(pace?.baselineDailyAmount).toBeCloseTo(basisDagtempo, 10)
    expect(pace?.projectedAmount).toBeCloseTo(80 + 30 * basisDagtempo, 10)
    // HET REGRESSIE-ANKER. De lineaire run-rate (gerealiseerd / verstreken-fractie)
    // geeft hier 80 / (1/31) = 2.480 — formeel juist, communicatief onbruikbaar,
    // en precies het scenario waarvoor deze uitbreiding is gevraagd.
    expect(pace?.projectedAmount).toBeLessThan(200)
    expect(pace?.projectedExceeds).toBe(true)
  })

  it('weegt het basistempo op DAGEN, niet als gemiddelde van periode-dagtempos', () => {
    // 285 / 92 = 3,0978. Het ongewogen gemiddelde van 95/31, 95/30 en 95/31 is
    // 3,0993 — klein, maar het is een andere grootheid en loopt bij kwartaal/jaar op.
    const ongewogen = (95 / 31 + 95 / 30 + 95 / 31) / 3
    const pace = paceReport([...historie, row('2026-08', 10)], new Date(2026, 7, 10))
      .currentPeriodPace
    expect(pace?.baselineDailyAmount).toBeCloseTo(285 / 92, 12)
    expect(pace?.baselineDailyAmount).not.toBeCloseTo(ongewogen, 12)
  })

  it('rust op de laatste N afgesloten periodes — hetzelfde venster als de trend', () => {
    expect(SPEND_LIMIT_PACE_BASELINE_WINDOW).toBe(SPEND_LIMIT_TREND_WINDOW)
    // Een oude, veel hogere maand mag het tempo niet omhoog trekken.
    const pace = paceReport(
      [row('2025-09', 900), ...historie, row('2026-08', 10)],
      new Date(2026, 7, 10),
    ).currentPeriodPace
    expect(pace?.basisPeriodCount).toBe(SPEND_LIMIT_PACE_BASELINE_WINDOW)
    expect(pace?.baselineDailyAmount).toBeCloseTo(basisDagtempo, 10)
  })

  it('zwijgt over het BEDRAG onder de historie-drempel, maar toont de markering wel', () => {
    expect(SPEND_LIMIT_PACE_MIN_PERIODS).toBe(SPEND_LIMIT_SCORE_MIN_PERIODS)
    // Aangemaakt op 15 juni 2026: alleen juli begint volledig ná die datum, dus
    // één meetellende afgesloten periode — te weinig voor een bedrag.
    const pace = paceReport([...historie, row('2026-08', 80)], new Date(2026, 7, 4), {
      createdAt: '2026-06-15T09:00:00Z',
    }).currentPeriodPace
    expect(pace?.basisPeriodCount).toBe(1)
    expect(pace?.baselineDailyAmount).toBeNull()
    expect(pace?.projectedAmount).toBeNull()
    expect(pace?.projectedExceeds).toBeNull()
    // De tempo-markering blijft: die heeft geen historie nodig.
    expect(pace?.elapsedDays).toBe(4)
    expect(pace?.usedFraction).toBeCloseTo(0.8, 10)
  })

  it('geeft geen negatieve prognose bij een periode waarin netto geld terugkwam', () => {
    // Drie lege afgesloten periodes: basistempo 0; de lopende maand staat netto
    // op -40 door een refund. -40 + 30 x 0 = -40 -> geen bedrag i.p.v. onzin.
    const pace = paceReport(
      [row('2026-05', 0), row('2026-06', 0), row('2026-07', 0), row('2026-08', 0, { refund: 40 })],
      new Date(2026, 7, 1),
    ).currentPeriodPace
    expect(pace?.baselineDailyAmount).toBe(0)
    expect(pace?.projectedAmount).toBeNull()
    // De markering blijft leesbaar; het negatieve gebruik is niet geklemd in de motor.
    expect(pace?.usedFraction).toBeCloseTo(-0.4, 10)
  })

  it('klemt een negatief historisch dagtempo op 0 i.p.v. de prognose te laten dalen', () => {
    const pace = paceReport(
      [
        row('2026-05', 0, { refund: 30 }),
        row('2026-06', 0, { refund: 30 }),
        row('2026-07', 0, { refund: 30 }),
        row('2026-08', 60),
      ],
      new Date(2026, 7, 1),
    ).currentPeriodPace
    expect(pace?.baselineDailyAmount).toBe(0)
    expect(pace?.projectedAmount).toBe(60)
    expect(pace?.projectedExceeds).toBe(false)
  })
})

describe('buildSpendLimitReport — het tempo raakt GEEN enkel bestaand getal', () => {
  it('laat status, near-vlag, reeks, trend en score staan waar ze stonden', () => {
    const rows = [row('2026-05', 95), row('2026-06', 95), row('2026-07', 95), row('2026-08', 10)]
    const report = paceReport(rows, new Date(2026, 7, 1))

    // De prognose ligt BOVEN de grens van 100...
    expect(report.currentPeriodPace?.projectedAmount).toBeGreaterThan(100)
    expect(report.currentPeriodPace?.projectedExceeds).toBe(true)
    // ...en toch staat de lopende periode op gerealiseerd 10: binnen, niet near.
    expect(report.currentPeriod.periodMatchedAmount).toBe(10)
    expect(report.currentPeriod.status).toBe('within')
    expect(report.currentPeriod.isNearLimit).toBe(false)
    expect(report.currentPeriod.periodOverAmount).toBe(0)
    expect(report.currentPeriod.periodHeadroom).toBe(90)

    // Reeks, trend en score zijn identiek aan de canonieke afleidingen over
    // uitsluitend de AFGESLOTEN periodes — het tempo zit daar met geen enkel
    // getal in.
    const rule = paceRule()
    const trend = computeSpendLimitTrend(
      report.closedPeriods,
      SPEND_LIMIT_TREND_WINDOW,
      rule.createdAt,
    )
    expect(report.streaks).toEqual(computeStreaks(report.closedPeriods))
    expect(report.trend).toEqual(trend)
    expect(report.score).toEqual(computeSpendLimitScore(report.closedPeriods, trend, rule.createdAt))
  })
})
