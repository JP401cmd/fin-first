import { describe, it, expect } from 'vitest'
import {
  computeBox1Tax,
  marginalRateAt,
  effectiveRateAt,
  schijftariefOp,
  grossFromNet,
  BOX1_PARAMS,
} from './box1-tax'

describe('BOX1_PARAMS — constants', () => {
  it('heeft schijven voor 2025 en 2026', () => {
    expect(BOX1_PARAMS[2026].schijven).toHaveLength(3)
    expect(BOX1_PARAMS[2025].schijven).toHaveLength(3)
  })

  it('2026 schijf-tarieven kloppen met het onderzoeksdoc', () => {
    const s = BOX1_PARAMS[2026].schijven
    expect(s[0].tarief).toBeCloseTo(0.3575, 4)
    expect(s[0].tot).toBe(38_883)
    expect(s[1].tarief).toBeCloseTo(0.3756, 4)
    expect(s[1].tot).toBe(78_426)
    expect(s[2].tarief).toBeCloseTo(0.495, 4)
    expect(s[2].tot).toBeNull()
  })

  it('eigenwoningforfait = 0,35% en Hillen 2026 ≈ 71,8%', () => {
    expect(BOX1_PARAMS[2026].eigenwoningforfaitRate).toBeCloseTo(0.0035, 5)
    expect(BOX1_PARAMS[2026].hillenPct).toBeCloseTo(0.718, 3)
  })

  it('AOW schijf-1 tarief is lager dan niet-AOW (geen AOW-premie)', () => {
    expect(BOX1_PARAMS[2026].schijvenAow[0].tarief).toBeLessThan(
      BOX1_PARAMS[2026].schijven[0].tarief,
    )
  })
})

describe('schijftariefOp — juiste tarief per schijf', () => {
  it('inkomen in schijf 1 → 35,75% (2026)', () => {
    expect(schijftariefOp(30_000, 2026)).toBeCloseTo(0.3575, 4)
  })
  it('inkomen in schijf 2 → 37,56% (2026)', () => {
    expect(schijftariefOp(50_000, 2026)).toBeCloseTo(0.3756, 4)
  })
  it('inkomen in schijf 3 → 49,5% (2026)', () => {
    expect(schijftariefOp(100_000, 2026)).toBeCloseTo(0.495, 4)
  })
  it('AOW: schijf 1 lager tarief', () => {
    expect(schijftariefOp(30_000, 2026, true)).toBeCloseTo(0.197, 3)
  })
})

describe('computeBox1Tax — heffing vóór kortingen (schijf-grenzen)', () => {
  it('belast schijf 1 lineair tot de grens', () => {
    // Geen eigen woning, geen kortingen-effect op heffingVoorKortingen.
    const r = computeBox1Tax({ grossYearlyIncome: 38_883, year: 2026 })
    // 38883 * 0.3575
    expect(r.heffingVoorKortingen).toBeCloseTo(38_883 * 0.3575, 2)
  })

  it('belast schijf 2 cumulatief (grens schijf 1 + deel schijf 2)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 50_000, year: 2026 })
    const verwacht = 38_883 * 0.3575 + (50_000 - 38_883) * 0.3756
    expect(r.heffingVoorKortingen).toBeCloseTo(verwacht, 2)
  })

  it('belast schijf 3 cumulatief over de top', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 100_000, year: 2026 })
    const verwacht =
      38_883 * 0.3575 +
      (78_426 - 38_883) * 0.3756 +
      (100_000 - 78_426) * 0.495
    expect(r.heffingVoorKortingen).toBeCloseTo(verwacht, 2)
  })
})

describe('computeBox1Tax — heffingskortingen', () => {
  it('algemene heffingskorting is maximaal onder de afbouwgrens', () => {
    const start = BOX1_PARAMS[2026].algemeneHeffingskorting.afbouwStart
    const r = computeBox1Tax({ grossYearlyIncome: start - 1_000, year: 2026 })
    expect(r.algemeneHeffingskorting).toBeCloseTo(
      BOX1_PARAMS[2026].algemeneHeffingskorting.max,
      2,
    )
  })

  it('hoger inkomen → lagere algemene heffingskorting (afbouw)', () => {
    const laag = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026 })
    const hoog = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    expect(hoog.algemeneHeffingskorting).toBeLessThan(laag.algemeneHeffingskorting)
  })

  it('algemene heffingskorting bouwt af naar 0 bij zeer hoog inkomen', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 500_000, year: 2026 })
    expect(r.algemeneHeffingskorting).toBe(0)
  })

  it('arbeidskorting loopt op en bouwt daarna af', () => {
    const opbouw = computeBox1Tax({ grossYearlyIncome: 35_000, year: 2026 })
    const afbouwVer = computeBox1Tax({ grossYearlyIncome: 120_000, year: 2026 })
    expect(opbouw.arbeidskorting).toBeGreaterThan(0)
    expect(afbouwVer.arbeidskorting).toBeLessThan(opbouw.arbeidskorting)
  })

  it('IACK alleen met kinderen onder 12', () => {
    const zonder = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026 })
    const met = computeBox1Tax({
      grossYearlyIncome: 40_000,
      year: 2026,
      heeftKinderenOnder12: true,
    })
    expect(zonder.iack).toBe(0)
    expect(met.iack).toBeGreaterThan(0)
  })
})

describe('computeBox1Tax — marginalRate', () => {
  it('marginalRate in een korting-afbouwzone ligt boven het pure schijftarief', () => {
    // 60.000 ligt in schijf 2 (37,56%) én in de afbouwzone van algemene
    // heffingskorting + arbeidskorting → marginaal tarief moet hoger zijn.
    const income = 60_000
    const schijf = schijftariefOp(income, 2026)
    const marginaal = marginalRateAt(income, 2026)
    expect(marginaal).toBeGreaterThan(schijf)
  })

  it('marginalRate is gelijk aan het result-veld', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    expect(r.marginalRate).toBeCloseTo(marginalRateAt(60_000, 2026), 6)
  })

  it('marginalRate bij zeer hoog inkomen ≈ topschijf (geen afbouw meer)', () => {
    const marginaal = marginalRateAt(300_000, 2026)
    // Kortingen zijn weg, dus marginaal ≈ 49,5%.
    expect(marginaal).toBeCloseTo(0.495, 2)
  })
})

describe('effectiveRateAt', () => {
  it('effectief tarief stijgt met het inkomen (progressie)', () => {
    const laag = effectiveRateAt(30_000, 2026)
    const hoog = effectiveRateAt(150_000, 2026)
    expect(hoog).toBeGreaterThan(laag)
  })

  it('effectief tarief < marginaal tarief bij progressieve heffing', () => {
    expect(effectiveRateAt(80_000, 2026)).toBeLessThan(marginalRateAt(80_000, 2026))
  })

  it('returnt 0 bij inkomen ≤ 0', () => {
    expect(effectiveRateAt(0, 2026)).toBe(0)
  })
})

describe('computeBox1Tax — eigen woning (forfait + Hillen)', () => {
  it('forfait = 0,35% WOZ', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
    })
    expect(r.eigenwoningforfait).toBeCloseTo(400_000 * 0.0035, 2)
  })

  it('Hillen-aftrek wanneer rente laag is (forfait > rente)', () => {
    // WOZ 400k → forfait 1400; rente 200 → saldoVoorHillen 1200 > 0 → Hillen toepassen.
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 200,
    })
    const saldoVoorHillen = r.eigenwoningforfait - r.hypotheekrenteaftrek
    expect(saldoVoorHillen).toBeGreaterThan(0)
    expect(r.hillenAftrek).toBeCloseTo(saldoVoorHillen * 0.718, 2)
    // Saldo na Hillen is positief maar sterk verlaagd.
    expect(r.eigenwoningSaldo).toBeCloseTo(saldoVoorHillen * (1 - 0.718), 2)
    expect(r.eigenwoningSaldo).toBeLessThan(saldoVoorHillen)
  })

  it('geen Hillen wanneer rente hoog is (forfait < rente) → netto aftrekpost', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 8_000,
    })
    expect(r.hillenAftrek).toBe(0)
    // Forfait 1400 - rente 8000 = -6600 → negatief saldo = aftrekpost.
    expect(r.eigenwoningSaldo).toBeLessThan(0)
    // Belastbaar inkomen ligt onder bruto door de aftrek.
    expect(r.belastbaarInkomen).toBeLessThan(50_000)
  })

  it('hypotheekrenteaftrek verlaagt de te betalen belasting t.o.v. zonder woning', () => {
    const zonder = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    const met = computeBox1Tax({
      grossYearlyIncome: 60_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 10_000,
    })
    expect(met.tax).toBeLessThan(zonder.tax)
  })
})

describe('computeBox1Tax — clamps & edge cases', () => {
  it('tax >= 0 (kortingen kunnen niet onder nul brengen)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 8_000, year: 2026 })
    expect(r.tax).toBeGreaterThanOrEqual(0)
  })

  it('inkomen 0 → alles 0', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 0, year: 2026 })
    expect(r.tax).toBe(0)
    expect(r.belastbaarInkomen).toBe(0)
    expect(r.effectiveRate).toBe(0)
    expect(r.nettoBesteedbaar).toBe(0)
  })

  it('negatief inkomen wordt op 0 geclampt', () => {
    const r = computeBox1Tax({ grossYearlyIncome: -5_000, year: 2026 })
    expect(r.grossYearlyIncome).toBe(0)
    expect(r.tax).toBe(0)
  })

  it('nettoBesteedbaar = bruto - tax', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 70_000, year: 2026 })
    expect(r.nettoBesteedbaar).toBeCloseTo(r.grossYearlyIncome - r.tax, 6)
  })

  it('freedomDays = tax / dailyExpenses (afgerond)', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 70_000,
      year: 2026,
      dailyExpenses: 100,
    })
    expect(r.freedomDays).toBe(Math.round(r.tax / 100))
  })

  it('freedomDays = 0 bij ontbrekende dailyExpenses', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 70_000, year: 2026 })
    expect(r.freedomDays).toBe(0)
  })
})

describe('grossFromNet — netto → bruto inversie', () => {
  it('rondreis: bruto → netto → bruto reproduceert het bruto (zonder eigen woning)', () => {
    for (const gross of [25_000, 45_000, 70_000, 120_000, 250_000]) {
      const netto = computeBox1Tax({ grossYearlyIncome: gross, year: 2026 }).nettoBesteedbaar
      const terug = grossFromNet(netto, 2026)
      // Op euro-niveau nauwkeurig (bisectie + afronding).
      expect(terug).toBeCloseTo(gross, -1)
      expect(Math.abs(terug - gross)).toBeLessThanOrEqual(2)
    }
  })

  it('bruto is hoger dan het netto-doel (er wordt belasting geheven)', () => {
    const bruto = grossFromNet(40_000, 2026)
    expect(bruto).toBeGreaterThan(40_000)
  })

  it('is monotoon: hoger netto → hoger bruto', () => {
    expect(grossFromNet(50_000, 2026)).toBeGreaterThan(grossFromNet(30_000, 2026))
  })

  it('overschat NIET zoals de platte marginaal-opslag', () => {
    // Platte methode: netto / (1 − marginaal). Bij een netto van 40k zit het
    // marginale tarief rond schijf 2 → flink hoger bruto dan de echte inversie.
    const netto = 40_000
    const marg = marginalRateAt(grossFromNet(netto, 2026), 2026)
    const plat = netto / (1 - marg)
    expect(grossFromNet(netto, 2026)).toBeLessThan(plat)
  })

  it('returnt 0 bij netto ≤ 0', () => {
    expect(grossFromNet(0, 2026)).toBe(0)
    expect(grossFromNet(-1_000, 2026)).toBe(0)
  })

  it('AOW-variant geeft een lager bruto voor hetzelfde netto (minder belasting)', () => {
    const netto = 30_000
    expect(grossFromNet(netto, 2026, { aow: true })).toBeLessThan(grossFromNet(netto, 2026))
  })
})

describe('computeBox1Tax — AOW', () => {
  it('AOW-gerechtigde betaalt minder belasting bij gelijk inkomen (lager schijf-1 tarief)', () => {
    const regulier = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026 })
    const aow = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026, aow: true })
    expect(aow.tax).toBeLessThan(regulier.tax)
  })
})
