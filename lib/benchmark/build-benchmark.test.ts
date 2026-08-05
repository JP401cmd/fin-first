import { describe, it, expect } from 'vitest'
import { buildBenchmarkReport, type BenchmarkUserMetrics, type BuildBenchmarkArgs } from '@/lib/benchmark/build-benchmark'
import type { BenchmarkCohort } from '@/lib/benchmark/cohort'
import { CAPTION_AMOUNT_TOKEN, resolveMetricCaption } from '@/lib/benchmark-report-data'
import { formatMaskedCurrency, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

// Vaste "vandaag" voor alle tests.
const NOW = new Date('2026-06-15')

// ── Fixtures ─────────────────────────────────────────────

const completeCohort: BenchmarkCohort = {
  age: 40,
  ageBand: '35-45',
  ageBandLabel: '35–45 jaar',
  household: 'alleenstaand',
  householdLabel: 'Alleenstaand',
  complete: true,
  missing: [],
}

const fullUser: BenchmarkUserMetrics = {
  healthScoreTotal: 72,
  fireAgeFractional: 58.5,
  savingsRate6m: 18,
  netWorth: 200_000,
  yearlyIncome: 50_000,
  // €50 per dag → €100 = 2 vrijheidsdagen
  dailyExpenseRate: 50,
}

function makeArgs(overrides: Partial<BuildBenchmarkArgs> = {}): BuildBenchmarkArgs {
  return {
    user: fullUser,
    cohort: completeCohort,
    displayName: 'Test Gebruiker',
    generatedAt: '2026-06-15T10:00:00.000Z',
    now: NOW,
    ...overrides,
  }
}

// ── Scalar-router-vlag: default UIT = byte-identiek (FASE 6) ──────

describe('buildBenchmarkReport — kernelScalarEnabled', () => {
  it('vlag weggelaten ≡ kernelScalarEnabled:false (byte-identiek aan vandaag)', () => {
    const omitted = buildBenchmarkReport(makeArgs())
    const explicitFalse = buildBenchmarkReport(makeArgs({ kernelScalarEnabled: false }))
    expect(omitted).toEqual(explicitFalse)
  })

  it('vlag AAN draait de peer via de kernel zonder te crashen (5 metrics)', () => {
    const report = buildBenchmarkReport(makeArgs({ kernelScalarEnabled: true }))
    expect(report.metrics).toHaveLength(5)
    // De vrijheidsleeftijd-metric blijft aanwezig en getypeerd als 'modelled'.
    const fireAge = report.metrics.find(m => m.key === 'fire_age')!
    expect(fireAge.tier).toBe('modelled')
  })
})

// ── Test 1: volledig rapport — 5 metrics in volgorde ──────

describe('buildBenchmarkReport — volledig cohort', () => {
  it('retourneert precies 5 metrics', () => {
    const report = buildBenchmarkReport(makeArgs())
    expect(report.metrics).toHaveLength(5)
  })

  it('metrics staan in de volgorde: health, fire_age, savings_rate, net_worth, income', () => {
    const report = buildBenchmarkReport(makeArgs())
    const keys = report.metrics.map(m => m.key)
    expect(keys).toEqual(['health', 'fire_age', 'savings_rate', 'net_worth', 'income'])
  })

  it('fire_age heeft higherIsBetter:false', () => {
    const report = buildBenchmarkReport(makeArgs())
    const fireAge = report.metrics.find(m => m.key === 'fire_age')!
    expect(fireAge.higherIsBetter).toBe(false)
  })

  it('health heeft higherIsBetter:true', () => {
    const report = buildBenchmarkReport(makeArgs())
    const health = report.metrics.find(m => m.key === 'health')!
    expect(health.higherIsBetter).toBe(true)
  })

  it('savings_rate heeft higherIsBetter:true', () => {
    const report = buildBenchmarkReport(makeArgs())
    const m = report.metrics.find(m => m.key === 'savings_rate')!
    expect(m.higherIsBetter).toBe(true)
  })

  it('net_worth heeft higherIsBetter:true', () => {
    const report = buildBenchmarkReport(makeArgs())
    const m = report.metrics.find(m => m.key === 'net_worth')!
    expect(m.higherIsBetter).toBe(true)
  })

  it('income heeft higherIsBetter:true', () => {
    const report = buildBenchmarkReport(makeArgs())
    const m = report.metrics.find(m => m.key === 'income')!
    expect(m.higherIsBetter).toBe(true)
  })

  it('caption voor health vermeldt boven/onder wanneer er een verschil is', () => {
    const report = buildBenchmarkReport(makeArgs())
    const health = report.metrics.find(m => m.key === 'health')!
    // userValue=72 vs. peer-waarde (gemodelleerd) — caption moet "boven" of "onder" bevatten
    // of "Gelijk" bij 0-verschil
    expect(health.caption).toMatch(/boven|onder|Gelijk/)
  })

  it('caption voor savings_rate vermeldt meer/minder (user=18, ref=11 → meer)', () => {
    const report = buildBenchmarkReport(makeArgs())
    const m = report.metrics.find(m => m.key === 'savings_rate')!
    // user 18% vs ref 11% → 7%-punt meer
    expect(m.caption).toMatch(/meer/)
  })

  it('cohort.complete in uitvoer is true', () => {
    const report = buildBenchmarkReport(makeArgs())
    expect(report.cohort.complete).toBe(true)
  })

  it('generatedAt en displayName worden doorgegeven', () => {
    const report = buildBenchmarkReport(makeArgs())
    expect(report.generatedAt).toBe('2026-06-15T10:00:00.000Z')
    expect(report.displayName).toBe('Test Gebruiker')
  })

  it('sources zijn niet leeg bij volledig cohort', () => {
    const report = buildBenchmarkReport(makeArgs())
    expect(report.sources.length).toBeGreaterThan(0)
  })
})

// ── Test 2: deltaFreedom op net_worth ──────────────────────

describe('buildBenchmarkReport — deltaFreedom op net_worth', () => {
  it('deltaFreedom is aanwezig wanneer dailyExpenseRate > 0 en delta ≥ €100', () => {
    // netWorth=200_000, mediaan 35-45 alleenstaand ≈ 120_100 × 0.35 = 42_035 → delta ≈ +157_965
    const report = buildBenchmarkReport(makeArgs())
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    // Delta is groot genoeg en dailyRate=50 → deltaFreedom moet gevuld zijn
    expect(nw.deltaFreedom).not.toBeNull()
    expect(typeof nw.deltaFreedom).toBe('string')
  })

  it('deltaFreedom bevat "voorsprong" wanneer netWorth boven mediaan zit', () => {
    // netWorth=200_000 > mediaan alleenstaand ~42_035
    const report = buildBenchmarkReport(makeArgs())
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    expect(nw.deltaFreedom).toMatch(/voorsprong/)
  })

  it('deltaFreedom is null wanneer dailyExpenseRate = 0', () => {
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, dailyExpenseRate: 0 } }),
    )
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    expect(nw.deltaFreedom).toBeNull()
  })

  it('deltaFreedom bevat "achterstand" wanneer netWorth onder mediaan zit', () => {
    // Lage netWorth zodat we zeker onder de CBS-mediaan voor de band zitten
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, netWorth: 1_000, dailyExpenseRate: 50 } }),
    )
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    expect(nw.deltaFreedom).toMatch(/achterstand/)
  })
})

// ── Test 3: onvolledig cohort — geen ageBand ─────────────

describe('buildBenchmarkReport — onvolledig cohort (geen ageBand)', () => {
  const incompleteCohort: BenchmarkCohort = {
    age: null,
    ageBand: null,
    ageBandLabel: null,
    household: null,
    householdLabel: null,
    complete: false,
    missing: ['geboortedatum'],
  }

  it('metrics is leeg zonder ageBand', () => {
    const report = buildBenchmarkReport(
      makeArgs({ cohort: incompleteCohort }),
    )
    expect(report.metrics).toHaveLength(0)
  })

  it('global reality-check is WÈLGEVULD bij hoge netWorth/income (ook zonder cohort)', () => {
    const report = buildBenchmarkReport(
      makeArgs({ cohort: incompleteCohort }),
    )
    // user heeft yearlyIncome=50_000 → boven €5.000-drempel → income ingevuld
    expect(report.global.income).not.toBeNull()
    expect(report.global.income!.value).toBe(50_000)
  })

  it('global.wealth is ingevuld bij positief netWorth', () => {
    const report = buildBenchmarkReport(
      makeArgs({ cohort: incompleteCohort }),
    )
    expect(report.global.wealth).not.toBeNull()
    expect(report.global.wealth!.value).toBe(200_000)
  })

  it('cohort.complete in uitvoer is false', () => {
    const report = buildBenchmarkReport(
      makeArgs({ cohort: incompleteCohort }),
    )
    expect(report.cohort.complete).toBe(false)
    expect(report.cohort.missing).toContain('geboortedatum')
  })
})

// ── Test 4: null user-waarden ──────────────────────────────

describe('buildBenchmarkReport — null user-waarden', () => {
  const nullUser: BenchmarkUserMetrics = {
    healthScoreTotal: null,
    fireAgeFractional: null,
    savingsRate6m: null,
    netWorth: null,
    yearlyIncome: null,
    dailyExpenseRate: 0,
  }

  it('geen crash bij alle-null user-waarden met volledig cohort', () => {
    expect(() => buildBenchmarkReport(makeArgs({ user: nullUser }))).not.toThrow()
  })

  it('caption health vermeldt "Onvoldoende" bij null healthScoreTotal', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    const health = report.metrics.find(m => m.key === 'health')!
    expect(health.caption).toMatch(/[Oo]nvoldoende/)
  })

  it('caption savings_rate vermeldt "Onvoldoende" bij null savingsRate6m', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    const m = report.metrics.find(m => m.key === 'savings_rate')!
    expect(m.caption).toMatch(/[Oo]nvoldoende/)
  })

  it('caption net_worth vermeldt "bezittingen" (CTA) bij null netWorth', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    expect(nw.caption.toLowerCase()).toMatch(/bezittingen/)
  })

  it('caption income vermeldt "jaarinkomen" of "profiel" (CTA) bij null yearlyIncome', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    const inc = report.metrics.find(m => m.key === 'income')!
    expect(inc.caption.toLowerCase()).toMatch(/jaarinkomen|profiel/)
  })

  it('global.income is null bij null yearlyIncome', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    expect(report.global.income).toBeNull()
  })

  it('global.wealth is null bij null netWorth', () => {
    const report = buildBenchmarkReport(makeArgs({ user: nullUser }))
    expect(report.global.wealth).toBeNull()
  })
})

// ── Test 5: global reality-check — drempellogica ──────────

describe('buildBenchmarkReport — global reality-check drempellogica', () => {
  it('topPercent is ingevuld bij inkomen boven de mondiale drempel', () => {
    // €55.000 = drempel top 1%
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, yearlyIncome: 55_000 } }),
    )
    expect(report.global.income!.topPercent).toBe(1)
  })

  it('topPercent is null bij inkomen onder laagste drempel (€5.000)', () => {
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, yearlyIncome: 3_000 } }),
    )
    // incomeTopPercent(3_000) = null
    expect(report.global.income!.topPercent).toBeNull()
  })

  it('global.wealth is null wanneer netWorth ≤ 0', () => {
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, netWorth: 0 } }),
    )
    // Schulden groter dan bezit: netWorth=0 → geen wealth-block
    expect(report.global.wealth).toBeNull()
  })

  it('global.wealth.topPercent is ingevuld bij netWorth ≥ €1.000', () => {
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, netWorth: 1_000 } }),
    )
    expect(report.global.wealth!.topPercent).toBe(70)
  })
})

// ── Test 6: fire_age caption-varianten ─────────────────────

describe('buildBenchmarkReport — fire_age caption-varianten', () => {
  it('caption vermeldt "eerder" wanneer gebruiker vroeger vrij is dan peer', () => {
    // fireAgeFractional=50 maar een peer heeft ook een fireAge (gemodelleerd via engine)
    // Zolang user < peer → "eerder"
    // We zetten user op 40 (erg jong) en verwachten "eerder" of "rond dezelfde leeftijd"
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, fireAgeFractional: 40 } }),
    )
    const m = report.metrics.find(m => m.key === 'fire_age')!
    // Caption moet vermelden dat de user eerder vrij is, of "rond dezelfde leeftijd"
    expect(m.caption).toMatch(/eerder|rond dezelfde|niet in zicht/)
  })

  it('caption vermeldt "later" wanneer gebruiker later vrij is dan peer', () => {
    // Stel user fireAge op 99 — duidelijk later dan welke peer ook
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, fireAgeFractional: 99 } }),
    )
    const m = report.metrics.find(m => m.key === 'fire_age')!
    expect(m.caption).toMatch(/later|rond dezelfde/)
  })

  it('caption vermeldt "niet in zicht" wanneer user geen fireAge heeft', () => {
    const report = buildBenchmarkReport(
      makeArgs({ user: { ...fullUser, fireAgeFractional: null } }),
    )
    const m = report.metrics.find(m => m.key === 'fire_age')!
    expect(m.caption).toMatch(/niet in zicht/)
  })
})

// ── Test 7: caption lekt geen persoonlijk EUR-bedrag (WF-RAPP-13) ──

describe('buildBenchmarkReport — caption is maskeerbaar', () => {
  it('net_worth en income bakken het bedrag niet in de zin maar leveren het apart', () => {
    const report = buildBenchmarkReport(makeArgs())
    for (const key of ['net_worth', 'income'] as const) {
      const m = report.metrics.find(x => x.key === key)!
      expect(m.caption).toContain(CAPTION_AMOUNT_TOKEN)
      // Geen server-geformatteerd EUR-bedrag meer in de zin zelf.
      expect(m.caption).not.toContain('€')
      expect(m.captionAmountEur).toBe(Math.abs(m.userValue! - m.referenceValue!))
    }
  })

  it('resolveMetricCaption maskeert het bedrag wanneer de privacy-toggle aan staat', () => {
    const report = buildBenchmarkReport(makeArgs())
    const nw = report.metrics.find(m => m.key === 'net_worth')!
    const masked = resolveMetricCaption(nw, v => formatMaskedCurrency(v, true))
    const open = resolveMetricCaption(nw, v => formatMaskedCurrency(v, false))

    expect(masked).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(masked).not.toContain('€')
    expect(masked).not.toContain(CAPTION_AMOUNT_TOKEN)
    expect(masked).not.toContain(String(nw.captionAmountEur))
    expect(open).toContain('€')
    expect(open).toContain('boven de mediaan van jouw doelgroep')
  })

  it('income zonder noemenswaardig verschil heeft geen bedrag om te maskeren', () => {
    // userValue vlak bij de cohort-mediaan → "Rond de referentie…" zonder bedrag.
    const report = buildBenchmarkReport(makeArgs())
    const median = report.metrics.find(m => m.key === 'income')!.referenceValue!
    const gelijk = buildBenchmarkReport(makeArgs({ user: { ...fullUser, yearlyIncome: median } }))
    const m = gelijk.metrics.find(x => x.key === 'income')!
    expect(m.captionAmountEur).toBeNull()
    expect(m.caption).not.toContain(CAPTION_AMOUNT_TOKEN)
    expect(resolveMetricCaption(m, v => formatMaskedCurrency(v, true))).toBe(m.caption)
  })
})
