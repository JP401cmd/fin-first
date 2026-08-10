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
  SPEND_LIMIT_TREND_WINDOW,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  buildSpendLimitReport,
  closedPeriodsSinceCreation,
  computePeriodOutcome,
  computeSpendLimitTrend,
  computeStreaks,
  netSpendFromSums,
  resolveSpendLimitPeriods,
  sliceContainsMonth,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodOutcome,
  type SpendLimitRule,
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

describe('buildSpendLimitReport — de ondergrens raakt ALLEEN de trend', () => {
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
