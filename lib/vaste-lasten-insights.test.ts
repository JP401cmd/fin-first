import { describe, it, expect } from 'vitest'
import {
  buildVasteLastenInsights,
  cancelEffect,
} from './vaste-lasten-insights'
import {
  vasteLastenCardStatus,
  VASTE_LASTEN_GOOD_MAX,
  VASTE_LASTEN_WARN_MAX,
} from './cashflow-cards'
import { dailyExpenseRate, calculateFreedomTime } from './format'
import { SUBSCRIPTION_BENCHMARK } from './vaste-lasten-benchmarks'
import type { VasteLastenItem, VasteLastenSummary } from './vaste-lasten-summary'
import type { RecurringCategory } from './recurring-detection'
import { CATEGORY_LABELS } from './recurring-detection'

function mkItem(
  id: string,
  name: string,
  monthlyAmount: number,
  category: RecurringCategory,
): VasteLastenItem {
  return {
    id,
    name,
    averageAmount: monthlyAmount,
    monthlyAmount,
    frequency: 'monthly',
    nextDate: null,
    confidence: 'high',
    isVariableAmount: false,
    occurrences: null,
    alreadyConfirmed: true,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    categoryOverride: null,
  }
}

function mkSummary(
  subscriptions: VasteLastenItem[],
  vasteKosten: VasteLastenItem[],
): VasteLastenSummary {
  const totalSubs = subscriptions.reduce((s, i) => s + i.monthlyAmount, 0)
  const totalVK = vasteKosten.reduce((s, i) => s + i.monthlyAmount, 0)
  return {
    subscriptions,
    vasteKosten,
    terugkerendVariabel: [],
    totalMonthlySubscriptions: totalSubs,
    totalMonthlyVasteKosten: totalVK,
    totalMonthlyVariabel: 0,
    totalMonthly: totalSubs + totalVK,
    count: subscriptions.length + vasteKosten.length,
  }
}

const EMPTY: VasteLastenSummary = mkSummary([], [])

describe('buildVasteLastenInsights — aandeel & status pariteit', () => {
  it('status matcht vasteLastenCardStatus exact voor good/warn/bad', () => {
    const cases = [
      { total: 1000, income: 4000 }, // 25% → good
      { total: 2400, income: 4000 }, // 60% → warn
      { total: 3200, income: 4000 }, // 80% → bad
    ]
    for (const { total, income } of cases) {
      const summary = mkSummary([mkItem('a', 'Netflix', total, 'subscription')], [])
      const insights = buildVasteLastenInsights({
        summary,
        monthlyIncome: income,
        dailyExpenseRate: dailyExpenseRate(2500),
      })
      const expected = vasteLastenCardStatus({
        totalMonthly: total,
        count: 1,
        monthlyIncome: income,
      })
      expect(insights.status).toBe(expected)
      expect(insights.ratioPct).toBe(Math.round((total / income) * 100))
    }
  })

  it('meter-zones == statusdrempels (geen losse getallen)', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'X', 1000, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.meterGoodMax).toBe(VASTE_LASTEN_GOOD_MAX)
    expect(insights.meterWarnMax).toBe(VASTE_LASTEN_WARN_MAX)
  })

  it('grens < 50% is good, exact 50% is warn (spiegelt < / ≤)', () => {
    const good = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'X', 1999, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    const boundary = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'X', 2000, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(good.status).toBe('good')
    expect(boundary.status).toBe('warn')
  })
})

describe('buildVasteLastenInsights — vrijheidstijd', () => {
  it('freedomDaysPerMonth == canonieke calculateFreedomTime(total, dailyRate)', () => {
    const total = 1200
    const monthlyExpenses = 2500
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Huur', total, 'rent')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(monthlyExpenses),
    })
    const expected = calculateFreedomTime(total, dailyExpenseRate(monthlyExpenses))
    expect(insights.freedomDaysPerMonth).toBe(Math.round(expected.totalDays))
    expect(insights.freedomPerYear.totalDays).toBeCloseTo(
      calculateFreedomTime(total * 12, dailyExpenseRate(monthlyExpenses)).totalDays,
      1,
    )
  })

  it('geen uitgaven → geen vrijheidstijd (EMPTY breakdown, geen Infinity)', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Huur', 1000, 'rent')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: 0,
    })
    expect(insights.freedomDaysPerMonth).toBe(0)
    expect(insights.freedomPerMonth.isInfinite).toBe(false)
  })
})

describe('buildVasteLastenInsights — benchmark-delta', () => {
  it('delta = abonnementen − geciteerde benchmark, en aboveBenchmark klopt', () => {
    const subsMonthly = SUBSCRIPTION_BENCHMARK.avgMonthlyPerPerson + 51
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Bundel', subsMonthly, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.subscriptionBenchmarkMonthly).toBe(SUBSCRIPTION_BENCHMARK.avgMonthlyPerPerson)
    expect(insights.subscriptionDeltaMonthly).toBeCloseTo(51, 2)
    expect(insights.aboveSubscriptionBenchmark).toBe(true)
  })

  it('onder benchmark → aboveBenchmark false, negatieve delta', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Spotify', 20, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.aboveSubscriptionBenchmark).toBe(false)
    expect(insights.subscriptionDeltaMonthly).toBeLessThan(0)
  })
})

describe('buildVasteLastenInsights — samenstelling & grootste post', () => {
  it('composition sommeert naar totaal en is aflopend gesorteerd', () => {
    const summary = mkSummary(
      [mkItem('s1', 'Netflix', 16, 'subscription'), mkItem('s2', 'Spotify', 10, 'subscription')],
      [mkItem('v1', 'Huur', 900, 'rent'), mkItem('v2', 'Energie', 180, 'utility')],
    )
    const insights = buildVasteLastenInsights({
      summary,
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    const sum = insights.composition.reduce((s, c) => s + c.monthlyAmount, 0)
    expect(sum).toBeCloseTo(insights.totalMonthly, 2)
    // Aflopend
    for (let i = 1; i < insights.composition.length; i++) {
      expect(insights.composition[i - 1].monthlyAmount).toBeGreaterThanOrEqual(
        insights.composition[i].monthlyAmount,
      )
    }
    // Shares sommeren naar ~1
    const shareSum = insights.composition.reduce((s, c) => s + c.share, 0)
    expect(shareSum).toBeCloseTo(1, 5)
    // Grootste post = Huur
    expect(insights.largestItem?.name).toBe('Huur')
    expect(insights.largestSubscription?.name).toBe('Netflix')
  })
})

describe('buildVasteLastenInsights — edge cases', () => {
  it('leeg → hasData false, status neutral, ratio null', () => {
    const insights = buildVasteLastenInsights({
      summary: EMPTY,
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.hasData).toBe(false)
    expect(insights.status).toBe('neutral')
    expect(insights.ratioOfIncome).toBeNull()
    expect(insights.ratioPct).toBeNull()
    expect(insights.meterValue).toBeNull()
    expect(insights.composition).toHaveLength(0)
    expect(insights.largestItem).toBeNull()
  })

  it('inkomen 0 → ratio null, status neutral, maar wél totalen', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Huur', 1000, 'rent')], []),
      monthlyIncome: 0,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.ratioOfIncome).toBeNull()
    expect(insights.status).toBe('neutral')
    expect(insights.totalMonthly).toBe(1000)
    expect(insights.totalYearly).toBe(12000)
  })

  it('alleen abonnementen → vasteKostenMonthly 0, subscriptionCount > 0', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([mkItem('a', 'Netflix', 16, 'subscription')], []),
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(insights.vasteKostenMonthly).toBe(0)
    expect(insights.vasteKostenCount).toBe(0)
    expect(insights.subscriptionCount).toBe(1)
  })
})

describe('cancelEffect', () => {
  it('jaarbedrag = maand × 12 en vrijheid via canonieke helpers', () => {
    const { yearlyEuro, freedom } = cancelEffect(50, dailyExpenseRate(2500))
    expect(yearlyEuro).toBe(600)
    const expected = calculateFreedomTime(600, dailyExpenseRate(2500))
    expect(freedom.totalDays).toBeCloseTo(expected.totalDays, 5)
  })

  it('negatief bedrag wordt geklemd op 0', () => {
    const { yearlyEuro } = cancelEffect(-30, dailyExpenseRate(2500))
    expect(yearlyEuro).toBe(0)
  })

  it('tweede argument is een DAGTARIEF, geen maandbedrag (grondslag-pin)', () => {
    // Regressie op de vervolg-KRUIS-20-fix: wie hier per ongeluk het
    // MAANDbedrag doorgeeft (de oude signatuur) krijgt een ~30× te lage
    // vrijheidstijd. Deze assertie pint dat de noemer een €/dag-tarief is.
    // NB: `calculateFreedomTime` rondt totalDays af op 1 decimaal — vandaar
    // toBeCloseTo(..., 1) i.p.v. een exacte quotiënt-vergelijking.
    const dagtarief = dailyExpenseRate(2500) // ≈ €82,19/dag
    const perDag = cancelEffect(50, dagtarief).freedom.totalDays
    const perMaandVerkeerd = cancelEffect(50, 2500).freedom.totalDays
    expect(perDag).toBeCloseTo(600 / dagtarief, 1)
    expect(perMaandVerkeerd).toBeCloseTo(600 / 2500, 1)
    expect(perDag).toBeGreaterThan(perMaandVerkeerd * 25)
  })
})

describe('buildVasteLastenInsights — grondslag-pin (vervolg KRUIS-20)', () => {
  it('vrijheidstijd volgt het AANGELEVERDE dagtarief, niet een eigen maand-conversie', () => {
    // Twee identieke bundels, alleen een ander dagtarief: de vrijheidstijd moet
    // exact omgekeerd evenredig meebewegen. Zou de motor ooit weer zelf een
    // maandbedrag omrekenen, dan breekt deze verhouding.
    const summary = mkSummary([mkItem('a', 'Huur', 1200, 'rent')], [])
    const laag = buildVasteLastenInsights({ summary, monthlyIncome: 4000, dailyExpenseRate: 50 })
    const hoog = buildVasteLastenInsights({ summary, monthlyIncome: 4000, dailyExpenseRate: 100 })
    expect(laag.freedomPerMonth.totalDays).toBeCloseTo(1200 / 50, 1)
    expect(hoog.freedomPerMonth.totalDays).toBeCloseTo(1200 / 100, 1)
    // Het tarief reist mee naar de client zodat cancelEffect dezelfde noemer krijgt.
    expect(hoog.dailyExpenseRate).toBe(100)
  })
})

describe('buildVasteLastenInsights — werktijd (C5 / ADR 0105)', () => {
  // €4.000/mnd vaste lasten op een bruto jaarinkomen van €96.000: precies de
  // helft van het werkjaar. Het uitgaven-dagtarief staat er bewust náást om te
  // pinnen dat werktijd er NIET op meebeweegt.
  const summary = mkSummary([mkItem('a', 'Huur', 4000, 'rent')], [])

  it('deelt op het INKOMEN-dagtarief, niet op het uitgaven-dagtarief', () => {
    const insights = buildVasteLastenInsights({
      summary,
      monthlyIncome: 5000,
      dailyExpenseRate: 100,
      dailyIncomeRate: 96_000 / 365,
    })
    expect(insights.workTimePerYear.hasBasis).toBe(true)
    expect(insights.workTimePerYear.monthsPerYear).toBeCloseTo(6, 1)
    expect(insights.workTimePerYear.shareOfWorkYear).toBeCloseTo(0.5, 6)
    // Een ANDER uitgaven-dagtarief mag de werktijd niet verschuiven.
    const anderTarief = buildVasteLastenInsights({
      summary,
      monthlyIncome: 5000,
      dailyExpenseRate: 250,
      dailyIncomeRate: 96_000 / 365,
    })
    expect(anderTarief.workTimePerYear.monthsPerYear).toBe(
      insights.workTimePerYear.monthsPerYear,
    )
    // ... terwijl de vrijheidstijd dat juist wél doet — twee grootheden.
    expect(anderTarief.freedomPerYear.totalDays).not.toBeCloseTo(
      insights.freedomPerYear.totalDays,
      1,
    )
  })

  it('zonder bruto jaarinkomen: geen werktijd-claim (het scherm laat de zin weg)', () => {
    const insights = buildVasteLastenInsights({
      summary,
      monthlyIncome: 5000,
      dailyExpenseRate: 100,
    })
    expect(insights.workTimePerYear.hasBasis).toBe(false)
    expect(insights.workTimePerYear.monthsPerYear).toBe(0)
    expect(insights.dailyIncomeRate).toBe(0)
    // De vrijheidstijd blijft ongemoeid — de terugval-zin heeft 'm nodig.
    expect(insights.freedomPerYear.totalDays).toBeGreaterThan(0)
  })

  it('zonder vaste lasten: geen werktijd, ook mét inkomen-basis', () => {
    const insights = buildVasteLastenInsights({
      summary: mkSummary([], []),
      monthlyIncome: 5000,
      dailyExpenseRate: 100,
      dailyIncomeRate: 96_000 / 365,
    })
    expect(insights.workTimePerYear.monthsPerYear).toBe(0)
  })
})

describe('buildVasteLastenInsights — topItems (S2)', () => {
  const subs = [
    mkItem('s1', 'Netflix', 16, 'subscription'),
    mkItem('s2', 'Sportschool', 35, 'subscription'),
    mkItem('s3', 'Krant', 9, 'subscription'),
    mkItem('s4', 'Cloud', 4, 'subscription'),
  ]
  const vk = [
    mkItem('v1', 'Huur', 900, 'rent'),
    mkItem('v2', 'Zorgverzekering', 140, 'insurance'),
    mkItem('v3', 'Energie', 180, 'utility'),
  ]
  const insights = buildVasteLastenInsights({
    summary: mkSummary(subs, vk),
    monthlyIncome: 4000,
    dailyExpenseRate: dailyExpenseRate(2500),
  })

  it('sorteert aflopend, capt op 5 en mengt abonnementen met vaste kosten', () => {
    expect(insights.topItems).toHaveLength(5)
    expect(insights.topItems.map((i) => i.name)).toEqual([
      'Huur',
      'Energie',
      'Zorgverzekering',
      'Sportschool',
      'Netflix',
    ])
    // Beide bronnen komen erin voor — geen kolom-per-soort.
    expect(insights.topItems.some((i) => i.category === 'subscription')).toBe(true)
    expect(insights.topItems.some((i) => i.category === 'rent')).toBe(true)
  })

  it('draagt het categorie-label mee zoals de bron het geeft', () => {
    expect(insights.topItems[0].categoryLabel).toBe(CATEGORY_LABELS.rent)
  })

  it('is leeg zonder vaste lasten', () => {
    const leeg = buildVasteLastenInsights({
      summary: EMPTY,
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(leeg.hasData).toBe(false)
    expect(leeg.topItems).toEqual([])
  })

  it('telt terugkerend-variabele posten NIET mee (H14)', () => {
    const summary = mkSummary(subs, vk)
    const withVariabel: typeof summary = {
      ...summary,
      terugkerendVariabel: [mkItem('x1', 'Boodschappen', 600, 'transport')],
      totalMonthlyVariabel: 600,
    }
    const res = buildVasteLastenInsights({
      summary: withVariabel,
      monthlyIncome: 4000,
      dailyExpenseRate: dailyExpenseRate(2500),
    })
    expect(res.topItems.some((i) => i.name === 'Boodschappen')).toBe(false)
  })
})
