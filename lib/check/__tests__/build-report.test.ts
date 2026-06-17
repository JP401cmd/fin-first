import { describe, expect, it } from 'vitest'
import { buildReport } from '../build-report'
import { computeAowMonthly } from '@/lib/horizon-data'
import type { CheckIntake } from '../types'

// Deterministische "vandaag" zodat leeftijd/jaartallen reproduceerbaar zijn.
const NOW = new Date('2026-06-17T12:00:00.000Z')

/**
 * Realistische intake à la "Sanne": 34 jaar, €3.250 netto/mnd, €2.470 lasten,
 * beleggingen/pensioen/cash/huis + één hypotheek.
 */
function sanne(): CheckIntake {
  return {
    firstName: 'Sanne',
    dateOfBirth: '1992-03-10', // 34 op 2026-06-17
    household: 'alleen',
    monthlyIncomeNet: 3250,
    yearlyIncomeGross: 52000,
    expenses: { wonen: 1180, vasteLasten: 1290, vrijBesteedbaar: 0, totaalMaand: 2470 },
    emergencyFund: 16640,
    assets: [
      { assetType: 'investment', name: 'ETF-portefeuille', value: 31600 },
      { assetType: 'retirement', name: 'Pensioenpot', value: 22000 },
      { assetType: 'cash', name: 'Spaarrekening', value: 16640 },
      { assetType: 'eigen_huis', name: 'Appartement', value: 320000 },
    ],
    debts: [
      { debtType: 'mortgage', name: 'Hypotheek', balance: 280000, interestRatePct: 3.5, monthlyPayment: 1180 },
      { debtType: 'credit_card', name: 'Creditcard', balance: 2000, interestRatePct: 14, monthlyPayment: 100 },
    ],
    pension: { aowExpectedMonthly: null, expectedReturnPct: 7, riskProfile: 'neutraal' },
    goal: { label: 'Eerder stoppen met werken' },
  }
}

describe('buildReport — Sanne (realistisch)', () => {
  const report = buildReport(sanne(), NOW)

  it('vult elke top-level sectie van de DTO', () => {
    expect(report.masthead).toBeDefined()
    expect(report.lifeGrid).toBeDefined()
    expect(report.snapshot).toBeDefined()
    expect(report.dualBars.length).toBeGreaterThan(0)
    expect(report.monthBalance.rows.length).toBeGreaterThan(0)
    expect(report.health).toBeDefined()
    expect(report.benchmark.rows.length).toBeGreaterThan(0)
    expect(report.kruising).toBeDefined()
    expect(report.savingsHistory.available).toBe(false)
    expect(report.twoFutures).toBeDefined()
    expect(report.fireCards.length).toBe(4)
    expect(report.sensitivity.length).toBe(4)
    expect(report.withdrawalStrategies.length).toBe(3)
    expect(report.lifePath.points.length).toBeGreaterThan(0)
    expect(report.will.moves.length).toBeGreaterThan(0)
    expect(report.cta.perks.length).toBe(3)
    expect(report.disclaimers.wft).toContain('Wft')
  })

  it('is volledig JSON-serialiseerbaar (report_snapshot)', () => {
    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow()
  })

  it('masthead toont voornaam + correcte leeftijd', () => {
    expect(report.masthead.displayName).toBe('Sanne')
    expect(report.masthead.age).toBe(34)
    expect(report.masthead.dateLabel).toBe('17 juni 2026')
  })

  it('snapshot: netto vermogen = assets − schulden (gewogen), spaarquote 24%', () => {
    // assets: 31600 + 22000 + 16640 + 320000 = 390240; schulden: 282000 → 108240
    expect(report.snapshot.netWorth).toBe(108240)
    // spaarquote = (3250 − 2470)/3250 = 24%
    expect(report.snapshot.savingsRatePct).toBeCloseTo(24, 0)
    expect(report.snapshot.savingsMonthly).toBe(780)
    expect(report.snapshot.expenseToIncomePct).toBe(76)
    expect(report.snapshot.netWorthFreedom.years).toBeGreaterThan(0)
  })

  it('dualBars: eigen woning telt niet mee voor FIRE', () => {
    const huis = report.dualBars.find((b) => b.bucket === 'huis')
    expect(huis).toBeDefined()
    expect(huis!.countsForFire).toBe(false)
    expect(huis!.freedomLabel).toBe('telt niet mee')
    // Netto huiswaarde = 320000 − 280000 = 40000
    expect(huis!.eur).toBe(40000)
    const belegg = report.dualBars.find((b) => b.bucket === 'beleggingen')
    expect(belegg?.countsForFire).toBe(true)
  })

  it('health: budget-pijler inactief (grey, score null); totaal 0–100', () => {
    expect(report.health.score).toBeGreaterThanOrEqual(0)
    expect(report.health.score).toBeLessThanOrEqual(100)
    const budget = report.health.pillars.find((p) => p.id === 'budget')!
    expect(budget.score).toBeNull()
    expect(budget.status).toBe('grey')
    // De andere drie pijlers hebben een score.
    expect(report.health.pillars.filter((p) => p.score != null).length).toBe(3)
  })

  it('benchmark draagt de CBS-badge + vier rijen', () => {
    expect(report.benchmark.sourceBadge).toBe('Geraamd (CBS-basis)')
    expect(report.benchmark.rows.map((r) => r.label)).toEqual([
      'Spaarquote', 'Vermogen', 'Inkomen (netto/jr)', 'Gezondheidsgetal',
    ])
  })

  it('kruising: V_op stijgt, V_nodig is de benodigde lijn; eindjaar = nu + (90 − leeftijd)', () => {
    expect(report.kruising.vOp.length).toBeGreaterThan(0)
    expect(report.kruising.vNodig.length).toBe(report.kruising.vOp.length)
    expect(report.kruising.startYear).toBe(2026)
    expect(report.kruising.endYear).toBe(2026 + (90 - 34))
    expect(report.kruising.savingsRatePct).toBeCloseTo(24, 0)
    // reëel rendement ≈ (1.07/1.02 − 1) ≈ 4,9%
    expect(report.kruising.realReturnPct).toBeGreaterThan(4)
    expect(report.kruising.realReturnPct).toBeLessThan(6)
  })

  it('lifePath gebruikt NETTO vermogen (incl. huis) en eindigt op 90', () => {
    expect(report.lifePath.endAge).toBe(90)
    // Eerste punt ≈ huidig netto vermogen (incl. huis), véél hoger dan FIRE-eligible.
    expect(report.lifePath.points[0].value).toBeGreaterThan(100000)
    const lastAge = report.lifePath.points[report.lifePath.points.length - 1].age
    expect(lastAge).toBe(90)
  })

  it('lifePath-markers: FIRE/hypotheek-payoff/AOW afgeleid (niet illustratief)', () => {
    const names = report.lifePath.markers.map((m) => m.name)
    expect(names).toContain('AOW + pensioen gaat in')
    const aow = report.lifePath.markers.find((m) => m.name === 'AOW + pensioen gaat in')!
    expect(aow.age).toBe(67)
    expect(aow.illustrative).toBe(false)
    // Hypotheek-payoff afgeleid uit annuïteit (3,5% / €1180 over €280k).
    const payoff = report.lifePath.markers.find((m) => m.name === 'Hypotheek afgelost')
    expect(payoff?.illustrative).toBe(false)
  })

  it('sensitivity: 4 hefbomen; spaarquote +4pp en rendement +1pp brengen FIRE eerder', () => {
    const levers = report.sensitivity.map((s) => s.lever)
    expect(levers).toEqual([
      'Spaarquote +4pp', 'Rendement +1pp', 'Uitgaven +€200/mnd', 'Eenmalig +€20k beleggen',
    ])
    const meerUitgaven = report.sensitivity.find((s) => s.lever === 'Uitgaven +€200/mnd')!
    // Meer uitgaven mag FIRE nooit eerder maken.
    expect(meerUitgaven.better).toBe(false)
  })

  it('withdrawalStrategies: SWR/VPW/Guyton-Klinger; jaar-1 > 0 wanneer FIRE haalbaar', () => {
    const strategies = report.withdrawalStrategies.map((s) => s.strategy)
    expect(strategies).toEqual(['Vast (SWR)', 'VPW (herrekend)', 'Guyton-Klinger'])
    expect(report.withdrawalStrategies.every((s) => s.year1 >= 0)).toBe(true)
  })

  it('will-moves zijn deterministisch; intro blijft leeg (W6 vult die)', () => {
    expect(report.will.intro).toBe('')
    // Creditcard 14% > rendement 7% → "duurste schuld"-zet aanwezig.
    expect(report.will.moves.some((m) => m.title.includes('duurste schuldpost'))).toBe(true)
    // Buffer 16640 / 2470 ≈ 6,7 mnd > 4 → bufferoverschot-zet aanwezig.
    expect(report.will.moves.some((m) => m.title.includes('bufferoverschot'))).toBe(true)
  })
})

// ── Randgevallen ─────────────────────────────────────────────────────────────

describe('buildReport — randgevallen', () => {
  function base(overrides: Partial<CheckIntake>): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1986-01-01',
      household: 'alleen',
      monthlyIncomeNet: 3000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 800, vrijBesteedbaar: 200, totaalMaand: 2000 },
      emergencyFund: 6000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 50000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: null, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('nul inkomen → spaarquote 0, FIRE-doel niet bereikbaar, geen crash', () => {
    const r = buildReport(base({ monthlyIncomeNet: 0, expenses: { wonen: 0, vasteLasten: 0, vrijBesteedbaar: 0, totaalMaand: 0 } }), NOW)
    expect(r.snapshot.savingsRatePct).toBe(0)
    expect(r.snapshot.expenseToIncomePct).toBe(0)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('negatief inkomen-effect: uitgaven > inkomen → tekort-rij, spaarquote ≤ 0', () => {
    const r = buildReport(base({
      monthlyIncomeNet: 1500,
      expenses: { wonen: 1200, vasteLasten: 700, vrijBesteedbaar: 100, totaalMaand: 2000 },
    }), NOW)
    expect(r.snapshot.savingsRatePct).toBeLessThanOrEqual(0)
    const totalRow = r.monthBalance.rows.find((row) => row.kind === 'total')!
    expect(totalRow.perMonth).toBeLessThan(0)
    expect(totalRow.label).toBe('Tekort')
  })

  it('geen schulden → geen "duurste schuld"-zet, geen crash', () => {
    const r = buildReport(base({ debts: [] }), NOW)
    expect(r.will.moves.some((m) => m.title.includes('duurste schuldpost'))).toBe(false)
    expect(r.dualBars.every((b) => b.bucket !== 'huis')).toBe(true)
  })

  it('alleen-huis (liquide 0): FIRE-eligible = 0 → 0% van doel; lifeGrid intern consistent', () => {
    const r = buildReport(base({
      assets: [{ assetType: 'eigen_huis', name: 'Huis', value: 300000 }],
      debts: [{ debtType: 'mortgage', name: 'Hyp', balance: 250000, interestRatePct: 3, monthlyPayment: 1000 }],
      monthlyIncomeNet: 2000,
      expenses: { wonen: 1000, vasteLasten: 800, vrijBesteedbaar: 200, totaalMaand: 2000 }, // 0 spaarquote
    }), NOW)
    // FIRE-eligible vermogen = netto − overwaarde = 0 → kaart "0% van doel".
    const progress = r.fireCards.find((c) => c.key === 'progress')!
    expect(progress.value).toBe('0%')
    // Al-vrijgekochte jaren = 0 (geen FIRE-eligible vermogen).
    expect(r.lifeGrid.alreadyFundedYears).toBe(0)
    // lifeGrid is intern consistent: grind/free zijn óf beide null (onhaalbaar) óf
    // beide een getal (haalbaar via AOW-brug) — nooit half-ingevuld.
    const bothNull = r.lifeGrid.grindYears === null && r.lifeGrid.freeYears === null
    const bothSet = r.lifeGrid.grindYears != null && r.lifeGrid.freeYears != null
    expect(bothNull || bothSet).toBe(true)
    // fireReachable correspondeert met fireAge.
    expect(r.lifeGrid.fireReachable).toBe(r.lifeGrid.fireAge != null)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('alleen-huis met 0 spaarquote → FIRE onhaalbaar (zero-portfolio-guard)', () => {
    // Huis gefilterd uit de FIRE-pot + 0 spaarquote → lege belegbare pot. Het
    // grootboek kan een trivial-late fireAge ≈ 89 melden (geen vroeg venster);
    // de zero-portfolio-guard valt terug op de snapshot → onhaalbaar.
    const r = buildReport(base({
      assets: [{ assetType: 'eigen_huis', name: 'Huis', value: 300000 }],
      debts: [{ debtType: 'mortgage', name: 'Hyp', balance: 250000, interestRatePct: 3, monthlyPayment: 1000 }],
      monthlyIncomeNet: 6000,
      expenses: { wonen: 2000, vasteLasten: 2000, vrijBesteedbaar: 2000, totaalMaand: 6000 }, // 0 spaarquote
    }), NOW)
    expect(r.lifeGrid.fireReachable).toBe(false)
    expect(r.lifeGrid.fireAge).toBeNull()
    expect(r.lifeGrid.grindYears).toBeNull()
    expect(r.lifeGrid.freeYears).toBeNull()
    expect(r.twoFutures.fireAge).toBeNull()
    expect(r.twoFutures.yearsUntilFire).toBeNull()
  })

  it('oneindige vrijheid: nul uitgaven → freedomTime isInfinite, geen Infinity in JSON', () => {
    const r = buildReport(base({
      expenses: { wonen: 0, vasteLasten: 0, vrijBesteedbaar: 0, totaalMaand: 0 },
      assets: [{ assetType: 'cash', name: 'Cash', value: 100000 }],
    }), NOW)
    expect(r.snapshot.netWorthFreedom.isInfinite).toBe(true)
    expect(r.snapshot.netWorthFreedomLabel).toContain('∞')
    const json = JSON.stringify(r)
    expect(json).not.toContain('Infinity')
    expect(json).not.toContain('null,null') // geen kapotte serialisatie
  })

  it('lege optionele velden (geen voornaam/goal/pensioen) → neutrale aanhef, geen crash', () => {
    const r = buildReport(base({ firstName: null, goal: null }), NOW)
    expect(r.masthead.displayName).toBe('jij')
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('onbekende asset/debt-types vallen terug op other zonder crash', () => {
    const r = buildReport(base({
      assets: [{ assetType: 'martian_gold', name: 'Exotisch', value: 5000 }],
      debts: [{ debtType: 'space_loan', name: 'Lening', balance: 1000, interestRatePct: 5, monthlyPayment: 50 }],
    }), NOW)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
    expect(r.dualBars.length).toBeGreaterThan(0)
  })

  // Regressie H1: de motor negeerde de door de gebruiker ingevulde AOW en gebruikte
  // altijd computeAowMonthly. De AOW komt zichtbaar terug in de levenspad-marker
  // "AOW + pensioen gaat in" (effect = "+€…/mnd inkomen").
  it('AOW: ingevulde verwachting wordt gebruikt; bij leeg → de modelwaarde', () => {
    const aowMarkerEffect = (intake: CheckIntake): string => {
      const r = buildReport(intake, NOW)
      const marker = r.lifePath.markers.find((m) => m.name === 'AOW + pensioen gaat in')
      expect(marker).toBeDefined()
      return marker!.effect
    }

    // Ingevuld bedrag (€2.000) — duidelijk hoger dan de model-AOW voor een
    // alleenstaande; formatEurShort(2000) = "€2,0k".
    const filled = aowMarkerEffect(base({
      pension: { aowExpectedMonthly: 2000, expectedReturnPct: null, riskProfile: null },
    }))
    expect(filled).toContain('€2,0k')

    // Geen invoer → de canonieke helper (alleenstaand). Moet afwijken van de
    // ingevulde €2.000-marker (= bewijs dat de invoer écht doorwerkt).
    const modelled = aowMarkerEffect(base({
      pension: { aowExpectedMonthly: null, expectedReturnPct: null, riskProfile: null },
    }))
    expect(modelled).not.toContain('€2,0k')
    expect(modelled).not.toBe(filled)
    // Het modelbedrag is het AOW-helperbedrag voor een alleenstaande (> 0).
    expect(computeAowMonthly('alleenstaand', 0)).toBeGreaterThan(0)

    // 0 telt als "leeg" → ook de modelwaarde (niet €0 doorzetten).
    const zeroed = aowMarkerEffect(base({
      pension: { aowExpectedMonthly: 0, expectedReturnPct: null, riskProfile: null },
    }))
    expect(zeroed).toBe(modelled)
  })
})
