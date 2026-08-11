import { describe, expect, it } from 'vitest'
import { buildReport } from '../build-report'
import { computeAowMonthly } from '@/lib/horizon-data'
import type { CheckIntake } from '../types'

// FASE 6 stap 5A: `buildReport` draait nu op de horizon-kernel (echte monthly-resolution
// bisectie per call, ~1200 iteraties). Sommige tests roepen `buildReport` 2-3x aan
// (baseline vs. varianten) en zaten daardoor tegen/over het vitest-default (5000ms) aan —
// tot 10s gemeten in volledige isolatie, geen contention.
//
// Geen lokale testTimeout-override meer (Notion-kaart "Testisolatie:
// cash-account-view.test.tsx faalt intermitterend", 11 aug 2026): dit bestand
// zette 'm eerder lokaal op 20000ms, wat de globale 30000ms uit
// vitest.config.ts (bewust ruim gezet vóór dit bestand, juist voor
// rekenzware FIRE-/Monte-Carlo-tests onder load) weer verlaagde. Onder volle-
// suite-contentie liep dat de globale marge in — laat het bestand nu de
// globale 30000ms erven.

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
    expect(report.cta.perks.length).toBe(5)
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
    // assets: 31600 + 22000 + 16640 (spaarrekening) + 16640 (noodfonds als cash)
    //   + 320000 = 406880; schulden: 282000 → 124880
    expect(report.snapshot.netWorth).toBe(124880)
    // spaarquote = (3250 − 2470)/3250 = 24%
    expect(report.snapshot.savingsRatePct).toBeCloseTo(24, 0)
    expect(report.snapshot.savingsMonthly).toBe(780)
    expect(report.snapshot.expenseToIncomePct).toBe(76)
    expect(report.snapshot.netWorthFreedom.years).toBeGreaterThan(0)
  })

  // Fix 1 + Fix 3 (50%-huismethodiek): de eigen woning telt voor 50% van haar
  // NETTO overwaarde mee in de vrijheids-/FIRE-grondslag. Voor Sanne (incl. het
  // noodfonds €16.640 dat nu als liquide cash meetelt — WF-START-08-bug1-fix):
  //   netWorth (incl. huis)        = 124.880
  //   overwaarde (320k − 280k)     =  40.000
  //   fireEligibleNetWorth         = 124.880 − 0,5×40.000 = 104.880
  // De vrijheidstijd rust op 104.880 (= snapshot.freedomBaseEur), het getoonde
  // €-saldo blijft het volle netto vermogen incl. huis. De vrijheid is
  // single-sourced met lifeGrid.alreadyFundedYears + twoFutures.stopToday.
  it('snapshot-vrijheid: 50%-huis FIRE-eligible grondslag (104.880), NIET netto incl. huis', () => {
    // Het getoonde €-saldo blijft het volledige netto vermogen (incl. huis).
    expect(report.snapshot.netWorth).toBe(124880)

    // Fix 3: de vrijheidstijd rust op het vrijheidsvermogen (FIRE-eligible, 50% huis).
    expect(report.snapshot.freedomBaseEur).toBe(104880)

    // De vrijheidstijd is op dezelfde grondslag als lifeGrid.alreadyFundedYears.
    const f = report.snapshot.netWorthFreedom
    // freedomBaseEur ÷ dagtarief ÷ 365 ≈ alreadyFundedYears (decimale jaren).
    const dailyExpense = (2470 * 12) / 365
    const baseDecimalYears = (report.snapshot.freedomBaseEur / dailyExpense) / 365
    expect(report.lifeGrid.alreadyFundedYears).toBeCloseTo(baseDecimalYears, 1)

    // ── Snapshot-vrijheid == "stop vandaag" (twoFutures), die op fireEligibleNetWorth
    //    rekent — één grondslag in het hele rapport. Dit is de harde grondslag-pin. ──
    expect(f.totalDays).toBeCloseTo(report.twoFutures.stopToday.totalDays ?? 0, 1)
    expect(f.years).toBe(report.twoFutures.stopToday.years)
    expect(f.months).toBe(report.twoFutures.stopToday.months)

    // ── Tegenproef: het zou GEEN netWorth-incl-huis-vrijheid mogen zijn. ──
    // Netto incl. huis = €108.240; FIRE-eligible (50% van de €40k overwaarde
    // weggelaten) = €88.240. De €-grondslag van de vrijheid is dus < het getoonde
    // netWorth-saldo én het verschil bedraagt exact de niet-meegerekende €20k.
    const snapshotImpliedEur = (f.totalDays ?? 0) * dailyExpense
    expect(snapshotImpliedEur).toBeLessThan(report.snapshot.netWorth) // < €124.880
    expect(snapshotImpliedEur).toBeCloseTo(104880, -3) // ≈ FIRE-eligible €104,9k (±€500)
    // Het verschil met netWorth = de niet-meegerekende helft van de overwaarde (€20k).
    expect(report.snapshot.netWorth - report.snapshot.freedomBaseEur).toBe(20000)
  })

  it('dualBars: eigen woning telt voor 50% mee voor FIRE (vol €, halve vrijheid)', () => {
    const huis = report.dualBars.find((b) => b.bucket === 'huis')
    expect(huis).toBeDefined()
    // countsForFire blijft FALSE (het huis-bucket vervuilt de cash-drag-som niet);
    // de 50%-bijdrage zit als synthetisch bezit in de FIRE-pot, niet in dit bucket.
    expect(huis!.countsForFire).toBe(false)
    // Het label reflecteert de 50%-weging, niet "telt niet mee".
    expect(huis!.freedomLabel).toContain('telt voor 50% mee')
    expect(huis!.freedomLabel).not.toBe('telt niet mee')
    // De getoonde € blijft de VOLLE netto huiswaarde = 320000 − 280000 = 40000.
    expect(huis!.eur).toBe(40000)
    const belegg = report.dualBars.find((b) => b.bucket === 'beleggingen')
    expect(belegg?.countsForFire).toBe(true)
  })

  // Fix 2: de gezondheidssectie toont de VOLLEDIGE actieve v2-pijlerset (mirror
  // /overzicht), niet de gestripte 3-pijlers + grijze budget-placeholder. De engine
  // laat inactieve indicatoren (geen budgetten → budget_discipline) zelf vallen.
  it('health: volledige actieve v2-pijlerset, GEEN grijze budget-placeholder', () => {
    expect(report.health.score).toBeGreaterThanOrEqual(0)
    expect(report.health.score).toBeLessThanOrEqual(100)
    const ids = report.health.pillars.map((p) => p.id)
    // Voor Sanne actief: spaarquote, noodfonds, schuldenlast, schuldratio,
    // FIRE-voortgang, vermogensspreiding (6 pijlers; budget_discipline inactief).
    expect(ids).toEqual([
      'savings_rate',
      'emergency_fund',
      'debt_service_ratio',
      'debt_ratio',
      'fire_progress',
      'asset_concentration',
    ])
    // Geen grijze "budget"-placeholder meer.
    expect(ids).not.toContain('budget_discipline')
    expect(report.health.pillars.some((p) => p.status === 'grey')).toBe(false)
    // Alle actieve pijlers dragen een score.
    expect(report.health.pillars.every((p) => p.score != null)).toBe(true)
  })

  // Fix 1: de eigen-woning-disclosure (50%-weging) hangt aan het rapport-DTO.
  it('houseInclusion: 50%-weging bij eigen woning', () => {
    expect(report.houseInclusion).not.toBeNull()
    expect(report.houseInclusion!.weightPct).toBe(50)
    expect(report.houseInclusion!.note).toMatch(/50%/)
  })

  it('benchmark draagt de CBS-badge + vier rijen', () => {
    expect(report.benchmark.sourceBadge).toBe('Geraamd (CBS-basis)')
    expect(report.benchmark.rows.map((r) => r.label)).toEqual([
      'Spaarquote', 'Vermogen', 'Inkomen (netto/jr)', 'Gezondheidsgetal',
    ])
  })

  it('kruising: V_op stijgt; eindjaar = nu + (90 − leeftijd)', () => {
    // `vNodig` (per-jaar benodigd-vermogen-reeks) is VERVALLEN sinds de kernel-migratie
    // (FASE 6 stap 5A) — de kernel-bridge levert alleen een scalair `requiredFirePortfolio`,
    // geen per-jaar V_nodig-reeks (die was LedgerRow-only in de verwijderde v2-grootboek-
    // engine). Zie de module-doc van `ReportKruising` in lib/check/types.ts.
    expect(report.kruising.vOp.length).toBeGreaterThan(0)
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

  // Fix 4: gevoeligheid vergelijkt op FRACTIONELE fireAge (sub-jaars). De drie
  // betekenisvolle hefbomen (spaarquote +4pp / rendement +1pp / +€20k lump) leveren
  // een NIET-NUL maand-delta — niet "geen verschil" en niet allemaal "onbereikbaar".
  it('sensitivity: fractionele fireAge → niet-nul maand-deltas (geen "geen verschil")', () => {
    const meaningful = ['Spaarquote +4pp', 'Rendement +1pp', 'Eenmalig +€20k beleggen']
    const rows = report.sensitivity.filter((s) => meaningful.includes(s.lever))
    expect(rows.length).toBe(3)
    // Geen enkele "geen verschil" en geen enkele "onbereikbaar" voor deze drie.
    for (const r of rows) {
      expect(r.effectLabel).not.toBe('geen verschil')
      expect(r.effectLabel).not.toBe('onbereikbaar')
      // Effect-label draagt een maand-getal (en is "beter" = eerder vrij).
      expect(r.effectLabel).toMatch(/mnd/)
      expect(r.better).toBe(true)
    }
    // Niet ALLE hefbomen onbereikbaar.
    expect(report.sensitivity.every((s) => s.effectLabel === 'onbereikbaar')).toBe(false)
  })

  it('withdrawalStrategies: SWR/VPW/Guyton-Klinger; jaar-1 > 0 wanneer FIRE haalbaar', () => {
    const strategies = report.withdrawalStrategies.map((s) => s.strategy)
    expect(strategies).toEqual(['Vast (SWR)', 'VPW (herrekend)', 'Guyton-Klinger'])
    expect(report.withdrawalStrategies.every((s) => s.year1 >= 0)).toBe(true)
  })

  it('will-moves zijn deterministisch; intro blijft leeg (W6 vult die)', () => {
    expect(report.will.intro).toBe('')
    // Liquide pot = spaarrekening 16.640 + noodfonds 16.640 = 33.280 (WF-START-08-
    // bug1-fix: het noodfonds telt nu als cash mee). Dat is >4 mnd buffer én >30%
    // cash-aandeel van het vrijheidsvermogen, dus zowel de bufferoverschot- als de
    // cash-drag-zet verschijnen. Onder de 4-zetten-cap (1 gegarandeerd + 3)
    // verdringen die de verwaarloosbare creditcard-aflos-zet (€2.000 @ 14% ≈ €3/dag).
    expect(report.will.moves.some((m) => m.title.includes('bufferoverschot'))).toBe(true)
    expect(report.will.moves.some((m) => m.title.includes('stilstaande cash'))).toBe(true)
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

  // Fix 1/3: zonder eigen woning is er geen huis-disclosure en valt het
  // vrijheidsvermogen samen met het volledige netto vermogen.
  it('geen eigen woning → houseInclusion null, freedomBaseEur = netWorth', () => {
    const r = buildReport(base({ assets: [{ assetType: 'investment', name: 'ETF', value: 50000 }] }), NOW)
    expect(r.houseInclusion).toBeNull()
    expect(r.snapshot.freedomBaseEur).toBe(r.snapshot.netWorth)
  })

  // Fix 1: alleen-huis (liquide 0, 0 spaarquote). De 50%-overwaarde telt nu mee:
  //   netWorth = 300k − 250k = 50k; overwaarde = 50k;
  //   FIRE-eligible = 50k − 0,5×50k = 25k (≠ 0 zoals onder de oude vol-uitsluiting).
  // Er is dus een positief — zij het klein — vrijheidsvermogen.
  it('alleen-huis (liquide 0): 50%-overwaarde geeft klein FIRE-eligible vermogen; lifeGrid consistent', () => {
    const r = buildReport(base({
      emergencyFund: 0, // écht liquide 0 — geen noodfonds dat als cash meetelt
      assets: [{ assetType: 'eigen_huis', name: 'Huis', value: 300000 }],
      debts: [{ debtType: 'mortgage', name: 'Hyp', balance: 250000, interestRatePct: 3, monthlyPayment: 1000 }],
      monthlyIncomeNet: 2000,
      expenses: { wonen: 1000, vasteLasten: 800, vrijBesteedbaar: 200, totaalMaand: 2000 }, // 0 spaarquote
    }), NOW)
    // FIRE-eligible vermogen = 50k − 0,5×50k = 25k (vrijheidsvermogen > 0).
    expect(r.snapshot.freedomBaseEur).toBe(25000)
    // Kleine maar positieve voortgang (geen "0%" meer).
    const progress = r.fireCards.find((c) => c.key === 'progress')!
    expect(progress.value).not.toBe('0%')
    // Al-vrijgekochte jaren > 0 (er is FIRE-eligible vermogen).
    expect(r.lifeGrid.alreadyFundedYears).toBeGreaterThan(0)
    // lifeGrid is intern consistent: grind/free zijn óf beide null (onhaalbaar) óf
    // beide een getal (haalbaar) — nooit half-ingevuld.
    const bothNull = r.lifeGrid.grindYears === null && r.lifeGrid.freeYears === null
    const bothSet = r.lifeGrid.grindYears != null && r.lifeGrid.freeYears != null
    expect(bothNull || bothSet).toBe(true)
    // fireReachable correspondeert met fireAge.
    expect(r.lifeGrid.fireReachable).toBe(r.lifeGrid.fireAge != null)
    // De huis-disclosure is aanwezig.
    expect(r.houseInclusion).not.toBeNull()
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  // Fix 1: alleen-huis met grotere uitgaven + 0 spaarquote. De synthetische
  // verzilverbare-overwaarde-pot (50% van €50k = €25k, groeit op woning-rendement)
  // is niet meer leeg, dus de zero-portfolio-guard valt NIET meer in: FIRE is via
  // dat groeiende vermogen + AOW-brug uiteindelijk bereikbaar (laat in het leven).
  it('alleen-huis met 0 spaarquote → 50%-overwaarde maakt FIRE (laat) bereikbaar', () => {
    const r = buildReport(base({
      emergencyFund: 0, // écht liquide 0 — geen noodfonds dat als cash meetelt
      assets: [{ assetType: 'eigen_huis', name: 'Huis', value: 300000 }],
      debts: [{ debtType: 'mortgage', name: 'Hyp', balance: 250000, interestRatePct: 3, monthlyPayment: 1000 }],
      monthlyIncomeNet: 6000,
      expenses: { wonen: 2000, vasteLasten: 2000, vrijBesteedbaar: 2000, totaalMaand: 6000 }, // 0 spaarquote
    }), NOW)
    // Vrijheidsvermogen = 50k − 0,5×50k = 25k.
    expect(r.snapshot.freedomBaseEur).toBe(25000)
    // FIRE is bereikbaar via de meegroeiende overwaarde + AOW (lifeGrid consistent).
    expect(r.lifeGrid.fireReachable).toBe(r.lifeGrid.fireAge != null)
    const bothNull = r.lifeGrid.grindYears === null && r.lifeGrid.freeYears === null
    const bothSet = r.lifeGrid.grindYears != null && r.lifeGrid.freeYears != null
    expect(bothNull || bothSet).toBe(true)
    // twoFutures spiegelt lifeGrid (zelfde fireAge-bron).
    expect(r.twoFutures.fireAge).toBe(r.lifeGrid.fireAge)
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
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

// ── Per-asset rendement (taak 1) ─────────────────────────────────────────────

describe('buildReport — per-asset verwacht rendement', () => {
  function base(overrides: Partial<CheckIntake> = {}): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1990-01-01',
      household: 'alleen',
      monthlyIncomeNet: 4000,
      yearlyIncomeGross: null,
      expenses: { wonen: 900, vasteLasten: 500, vrijBesteedbaar: 600, totaalMaand: 2000 },
      emergencyFund: 8000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 120000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: 5, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('per-asset rendement-override raakt de FIRE-projectielijn niet meer (kernel-migratie benadering M1)', () => {
    // KERNEL-MIGRATIE-benadering (build-report.ts, blok "KERNEL-MIGRATIE" #1): sinds de
    // v2-grootboek-engine is verwijderd, draait de projectie op ÉÉN synthetische
    // scalar-pot met het globale profiel-`grossReturn` — de itemized asset-mix (incl. een
    // per-asset rendement-override) voedt de projectielijn niet meer. Dit VERVANGT de
    // oude verwachting ("hoger per-asset rendement bouwt sneller op"): die was v2-
    // grootboek-specifiek (itemized per-asset groei) en is met opzet losgelaten — één
    // motor, één antwoord (zie ook de scalar-router-doc). Golden: vOp/fireAge zijn
    // byte-identiek met/zonder de override.
    const globaal = buildReport(base(), NOW)
    const perAsset = buildReport(base({
      assets: [{ assetType: 'investment', name: 'ETF', value: 120000, expectedReturnPct: 9 }],
    }), NOW)
    expect(perAsset.kruising.vOp).toEqual(globaal.kruising.vOp)
    expect(perAsset.lifeGrid.fireAge).toBe(globaal.lifeGrid.fireAge)
  })
})

// ── Uitgaven na pensioen (taak 2) ────────────────────────────────────────────

describe('buildReport — uitgaven na pensioen', () => {
  function base(overrides: Partial<CheckIntake> = {}): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1985-01-01',
      household: 'alleen',
      monthlyIncomeNet: 5000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 600, vrijBesteedbaar: 400, totaalMaand: 2000 },
      emergencyFund: 10000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 250000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: 6, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('leeg (null) → ongewijzigd t.o.v. de huidige situatie', () => {
    const zonder = buildReport(base(), NOW)
    const metNull = buildReport(base({
      pension: { aowExpectedMonthly: null, expectedReturnPct: 6, riskProfile: null, retirementMonthlyExpenses: null },
    }), NOW)
    // Identieke kruising-curve (geen post-pensioen-cashflow toegevoegd).
    expect(metNull.kruising.vOp).toEqual(zonder.kruising.vOp)
    expect(metNull.lifeGrid.fireAge).toBe(zonder.lifeGrid.fireAge)
  })

  it('lagere post-pensioen-uitgave → FIRE niet later / onttrekking niet hoger', () => {
    const basis = buildReport(base(), NOW)
    const lager = buildReport(base({
      // Halve uitgaven na pensioen (€1.000 i.p.v. €2.000/mnd).
      pension: { aowExpectedMonthly: null, expectedReturnPct: 6, riskProfile: null, retirementMonthlyExpenses: 1000 },
    }), NOW)
    // Minder uitgeven na pensioen mag FIRE nooit later maken.
    if (basis.lifeGrid.fireAge != null && lager.lifeGrid.fireAge != null) {
      expect(lager.lifeGrid.fireAge).toBeLessThanOrEqual(basis.lifeGrid.fireAge)
    } else {
      // Of het werd haalbaar waar het basispad dat niet was.
      expect(lager.lifeGrid.fireReachable).toBe(true)
    }
    // De levenspad-eindwaarde (netto vermogen op 90) ligt niet lager bij minder uitgeven.
    const endBasis = basis.lifePath.points[basis.lifePath.points.length - 1].value
    const endLager = lager.lifePath.points[lager.lifePath.points.length - 1].value
    expect(endLager).toBeGreaterThanOrEqual(endBasis)
  })
})

// ── Fin-tips: tot 4 gescoorde zetten (taak 3) ───────────────────────────────

describe('buildReport — Fin-tips (gescoorde pool, tot 4)', () => {
  it('rijke situatie levert tot 4 zetten (cap), spaarquote-zet als sluitstuk', () => {
    const r = buildReport({
      firstName: null,
      dateOfBirth: '1990-01-01',
      household: 'alleen',
      monthlyIncomeNet: 4000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 700, vrijBesteedbaar: 300, totaalMaand: 2000 },
      // Grote buffer (cash-drag + bufferoverschot) + dure schuld + lage AOW.
      emergencyFund: 40000,
      assets: [
        { assetType: 'cash', name: 'Spaargeld', value: 80000 },
        { assetType: 'investment', name: 'ETF', value: 30000 },
      ],
      debts: [
        { debtType: 'credit_card', name: 'Creditcard', balance: 5000, interestRatePct: 15, monthlyPayment: 150 },
      ],
      pension: { aowExpectedMonthly: 800, expectedReturnPct: 6, riskProfile: null },
      goal: null,
    }, NOW)
    // Meer dan één zet (pool vult zich) en nooit meer dan het maximum van 4.
    expect(r.will.moves.length).toBeGreaterThan(1)
    expect(r.will.moves.length).toBeLessThanOrEqual(4)
    // De spaarquote-zet is altijd aanwezig en sluit de lijst af.
    const last = r.will.moves[r.will.moves.length - 1]
    expect(last.title).toContain('spaarquote')
    expect(last.kind).toBe('fire-months')
    // De niet-baseline-zetten staan op impact (gainDays) gesorteerd, hoog → laag.
    const nonBaseline = r.will.moves.filter((m) => m.kind === 'freedom-days')
    for (let i = 1; i < nonBaseline.length; i++) {
      expect(nonBaseline[i].gainDays ?? 0).toBeLessThanOrEqual(nonBaseline[i - 1].gainDays ?? 0)
    }
  })

  it('dure schuld die alle andere zetten domineert verschijnt vooraan', () => {
    // Geen buffer/cash-drag/pensioengat; alleen een forse dure schuld → die zet
    // moet de pool aanvoeren (vóór de spaarquote-sluitsteen).
    const r = buildReport({
      firstName: null,
      dateOfBirth: '1990-01-01',
      household: 'alleen',
      monthlyIncomeNet: 4000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 700, vrijBesteedbaar: 300, totaalMaand: 2000 },
      emergencyFund: 6000, // < 4 mnd → geen bufferoverschot
      assets: [{ assetType: 'investment', name: 'ETF', value: 40000 }],
      debts: [
        { debtType: 'credit_card', name: 'Creditcard', balance: 30000, interestRatePct: 18, monthlyPayment: 600 },
      ],
      pension: { aowExpectedMonthly: 2000, expectedReturnPct: 6, riskProfile: null }, // geen pensioengat
      goal: null,
    }, NOW)
    const schuldZet = r.will.moves.find((m) => m.title.includes('duurste schuldpost'))
    expect(schuldZet).toBeDefined()
    expect((schuldZet!.gainDays ?? 0)).toBeGreaterThan(0)
    // Eerste zet is de dure-schuld-zet (hoogste impact); spaarquote sluit af.
    expect(r.will.moves[0].title).toContain('duurste schuldpost')
    expect(r.will.moves[r.will.moves.length - 1].title).toContain('spaarquote')
  })

  it('tidy situatie (geen schuld, kleine buffer) → minimaal de spaarquote-zet', () => {
    const r = buildReport({
      firstName: null,
      dateOfBirth: '1990-01-01',
      household: 'alleen',
      monthlyIncomeNet: 3000,
      yearlyIncomeGross: null,
      expenses: { wonen: 900, vasteLasten: 500, vrijBesteedbaar: 600, totaalMaand: 2000 },
      emergencyFund: 4000, // 2 mnd → geen bufferoverschot
      assets: [{ assetType: 'investment', name: 'ETF', value: 60000 }],
      debts: [],
      pension: { aowExpectedMonthly: 2000, expectedReturnPct: 6, riskProfile: null }, // geen pensioengat
      goal: null,
    }, NOW)
    expect(r.will.moves.length).toBeGreaterThanOrEqual(1)
    expect(r.will.moves.some((m) => m.title.includes('spaarquote'))).toBe(true)
  })

  it('alle freedom-days-zetten dragen een niet-negatieve gainDays', () => {
    const r = buildReport({
      firstName: null,
      dateOfBirth: '1990-01-01',
      household: 'alleen',
      monthlyIncomeNet: 4000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 700, vrijBesteedbaar: 300, totaalMaand: 2000 },
      emergencyFund: 40000,
      assets: [{ assetType: 'cash', name: 'Spaargeld', value: 80000 }],
      debts: [{ debtType: 'credit_card', name: 'CC', balance: 5000, interestRatePct: 15, monthlyPayment: 150 }],
      pension: { aowExpectedMonthly: 800, expectedReturnPct: 6, riskProfile: null },
      goal: null,
    }, NOW)
    for (const m of r.will.moves) {
      if (m.kind === 'freedom-days') {
        expect(m.gainDays ?? 0).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

// ── Levensgebeurtenissen → projectie + markers (taak 4) ──────────────────────

describe('buildReport — levensgebeurtenissen', () => {
  function base(overrides: Partial<CheckIntake> = {}): CheckIntake {
    return {
      firstName: null,
      dateOfBirth: '1990-01-01', // 36 op 2026-06-17
      household: 'alleen',
      monthlyIncomeNet: 4000,
      yearlyIncomeGross: null,
      expenses: { wonen: 1000, vasteLasten: 600, vrijBesteedbaar: 400, totaalMaand: 2000 },
      emergencyFund: 8000,
      assets: [{ assetType: 'investment', name: 'ETF', value: 150000 }],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: 6, riskProfile: null },
      goal: null,
      ...overrides,
    }
  }

  it('eenmalige erfenis raakt V_op niet meer (kernel-migratie benadering M2), maar verschijnt als niet-illustratieve marker', () => {
    const zonder = buildReport(base(), NOW)
    const metErfenis = buildReport(base({
      lifeEvents: [{ key: 'erfenis', label: 'Erfenis', age: 45, amount: 100000 }],
    }), NOW)

    // KERNEL-MIGRATIE-benadering #2 (build-report.ts): de scalar-pot achter `kruising.vOp`
    // kent geen kasstromen naast inkomen−uitgaven — levensgebeurtenissen vormen de
    // projectielijn NIET meer (dat deed vóór de v2-verwijdering wél). Ze blijven wél
    // zichtbaar als LEVENSPAD-MARKER (zie hieronder). Dit VERVANGT de oude "V_op stijgt
    // door de erfenis"-verwachting: vOp is nu byte-identiek met/zonder het event.
    expect(metErfenis.kruising.vOp).toEqual(zonder.kruising.vOp)

    // Marker aanwezig, type 'leven', niet-illustratief, met "+€" eenmalig-effect.
    const marker = metErfenis.lifePath.markers.find((m) => m.name === 'Erfenis')
    expect(marker).toBeDefined()
    expect(marker!.type).toBe('leven')
    expect(marker!.illustrative).toBe(false)
    expect(marker!.age).toBe(45)
    expect(marker!.effect).toContain('+')
  })

  it('erfenis brengt FIRE niet later (meevaller versnelt opbouw)', () => {
    const zonder = buildReport(base(), NOW)
    const metErfenis = buildReport(base({
      lifeEvents: [{ key: 'erfenis', label: 'Erfenis', age: 40, amount: 150000 }],
    }), NOW)
    if (zonder.lifeGrid.fireAge != null && metErfenis.lifeGrid.fireAge != null) {
      expect(metErfenis.lifeGrid.fireAge).toBeLessThanOrEqual(zonder.lifeGrid.fireAge)
    } else {
      expect(metErfenis.lifeGrid.fireReachable).toBe(true)
    }
  })

  it('geen lifeEvents → ongewijzigde kruising en geen extra markers', () => {
    const zonder = buildReport(base(), NOW)
    const leeg = buildReport(base({ lifeEvents: [] }), NOW)
    expect(leeg.kruising.vOp).toEqual(zonder.kruising.vOp)
    // Geen 'leven'-markers behalve het afgeleide FIRE-moment.
    const levenMarkers = leeg.lifePath.markers.filter((m) => m.type === 'leven' && m.name !== 'FIRE-moment bereikt')
    expect(levenMarkers).toHaveLength(0)
  })

  it('event in het verleden (leeftijd < huidige leeftijd) verschijnt niet als marker', () => {
    const r = buildReport(base({
      lifeEvents: [{ key: 'erfenis', label: 'Oude erfenis', age: 25, amount: 50000 }],
    }), NOW)
    expect(r.lifePath.markers.some((m) => m.name === 'Oude erfenis')).toBe(false)
  })

  it('eenmalige KOST (negatief bedrag) raakt V_op niet meer (kernel-migratie benadering M2), marker blijft tekencorrect', () => {
    const zonder = buildReport(base(), NOW)
    const metKost = buildReport(base({
      lifeEvents: [{ key: 'grote_aankoop', label: 'Grote aankoop', age: 45, amount: -80000 }],
    }), NOW)
    // Zie de erfenis-test hierboven: levensgebeurtenissen vormen de scalar-pot-
    // projectielijn niet meer sinds de kernel-migratie — vOp is byte-identiek.
    expect(metKost.kruising.vOp).toEqual(zonder.kruising.vOp)
    // Marker draagt een "−"-effect.
    const marker = metKost.lifePath.markers.find((m) => m.name === 'Grote aankoop')
    expect(marker?.effect).toContain('−')
  })

  it('terugkerende uitgave (negatief recurringYearly) raakt V_op niet meer (kernel-migratie benadering M2)', () => {
    const zonder = buildReport(base(), NOW)
    const metUitgave = buildReport(base({
      lifeEvents: [{
        key: 'studie', label: 'Studie kind', age: 45,
        recurringYearly: -12000, durationYears: 4,
      }],
    }), NOW)
    // Zie de erfenis-/KOST-tests hierboven: levensgebeurtenissen vormen de scalar-pot-
    // projectielijn niet meer sinds de kernel-migratie — vOp is byte-identiek.
    expect(metUitgave.kruising.vOp).toEqual(zonder.kruising.vOp)
    const marker = metUitgave.lifePath.markers.find((m) => m.name === 'Studie kind')
    expect(marker?.effect).toContain('/jaar')
  })
})

// ── Kruising-scenariobanden bewust NIET meer berekend (hot-path-opschoning) ───
//
// De DeKruising-grafiek is uit het rapport verwijderd; `kruising.scenarios` werd
// nergens meer gerenderd maar kostte per rapport twee extra, dure
// `runHorizonLedger`-runs. Het optionele veld (`scenarios?`) wordt nu bewust niet
// berekend. Deze test pint die opschoning: het veld is afwezig, de rest van de
// kruising-DTO blijft intact. (De levenslange waaier `lifePath.scenarios` blijft
// wél bestaan en hergebruikt het basis-grootboek — zie het blok hieronder.)
describe('buildReport — kruising.scenarios verwijderd (geen extra ledger-runs)', () => {
  it('kruising.scenarios is afwezig; de overige kruising-velden blijven gevuld', () => {
    const r = buildReport(sanne(), NOW)
    expect(r.kruising.scenarios).toBeUndefined()
    // De verplichte kruising-DTO blijft intact (vOp/crossing/etc. — `vNodig` is
    // VERVALLEN sinds de kernel-migratie, zie lib/check/types.ts).
    expect(r.kruising.vOp.length).toBeGreaterThan(0)
    expect(typeof r.kruising.fireReachable).toBe('boolean')
    expect(r.kruising.realReturnPct).toBeGreaterThan(0)
  })
})

// ── Levenslange scenariobanden −2% / +2% op de levenslijn ────────────────────

// Bug-fix: de ±2%-band is een ONZEKERHEIDSBAND op het rendement met een GEFIXT
// plan (zelfde inleg + zelfde FIRE-/onttrekkingstiming als de basislijn). De band
// moet op de BASIS-FIRE-leeftijd omslaan (niet op AOW), in de afbouw NIET omkeren
// (+2% ≥ −2% overal), en de waaier moet WIJDER worden i.p.v. samen te vallen.
// Deze tests VERVANGEN de oude (die het herrekende deplete-gedrag toetsten:
// omslag op AOW + convergentie in de afbouw — precies de bug).
describe('buildReport — levenslange scenariobanden (−2% / +2%)', () => {
  const r = buildReport(sanne(), NOW)
  const min2 = r.lifePath.scenarios!.find((s) => s.returnDeltaPct === -2)!
  const plus2 = r.lifePath.scenarios!.find((s) => s.returnDeltaPct === +2)!
  const at = (s: typeof min2, age: number) => s.points.find((p) => p.age === age)?.value ?? 0

  it('bevat precies twee banden met de juiste labels/delta', () => {
    expect(r.lifePath.scenarios).toBeDefined()
    expect(r.lifePath.scenarios!.length).toBe(2)
    expect(min2).toBeDefined()
    expect(plus2).toBeDefined()
    expect(min2.label).toContain('2% rendement')
    expect(plus2.label).toContain('2% rendement')
  })

  it('de reeksen lopen over de HELE levenslijn (zelfde lengte als lifePath.points, eindigen op 90)', () => {
    for (const s of [min2, plus2]) {
      expect(s.points.length).toBe(r.lifePath.points.length)
      expect(s.points[s.points.length - 1].age).toBe(90)
    }
  })

  // (d) Op t=0 raakt elke band de basislijn EXACT (cf[0]=0 → pot_s[0]=basePot[0],
  //     en de huis-overwaarde is op t=0 identiek). Reconstructie op `nettoVermogen`
  //     (zelfde grondslag als lifePath.points) → byte-identiek startpunt.
  it('(d) op t=0 = de basislijn exact (band hugt de lifePath-lijn aan de start)', () => {
    const base0 = r.lifePath.points[0].value
    expect(at(min2, r.masthead.age)).toBe(base0)
    expect(at(plus2, r.masthead.age)).toBe(base0)
    // Grondslag = netto incl. huis → eerste punt > €100k voor Sanne (mét huis).
    expect(base0).toBeGreaterThan(100000)
  })

  // (a) De band slaat om (belegbare pot stopt met groeien) op de BASIS-FIRE-leeftijd,
  //     NIET op de AOW-leeftijd (67) — dát was de bug. De omslag is zichtbaar in de
  //     −2%-band en de basislijn: hun netto-vermogen piekt rond de FIRE-leeftijd en
  //     daalt daarna richting de huis-overwaarde-vloer. De +2%-band put zó traag uit
  //     dat het netto vermogen (incl. WOZ-groei) blíjft stijgen tot 90 — dat is de
  //     bedoelde uitwaaiering, niet een omslag op AOW.
  it('(a) de band slaat om op de omslag van de BASISLIJN zelf, niet hardgecodeerd op AOW (67)', () => {
    // Golden herijkt (kernel-migratie): `lifePath.points`/de banden komen uit `baseRun`
    // — één kernel-run op het VOLLE netto vermogen (incl. huis), `deplete` tot 90
    // (`safeKernelRun`). `lifeGrid.fireAge` komt uit een ANDER, apart getrokken kernel-
    // resultaat: de FIRE-eligible/50%-huis-grondslag met een 'perpetual' SWR-doel
    // (`fireProj`). Vóór de migratie vielen die twee toevallig dicht bij elkaar; sinds
    // de kernel-migratie zijn het structureel verschillende runs (deplete-op-volle-pot
    // vs. perpetueel-op-halve-huis-pot) die niet meer per se dezelfde leeftijd geven
    // (hier: baseRun-omslag 58, lifeGrid.fireAge 72 — beide op zich plausibel). De
    // CONTRACT die deze test bewaakt blijft: de band slaat om bij de omslag van de
    // BASISLIJN zelf (géén hardgecodeerde AOW-omslag op 67 — dat was de oude bug) —
    // getoetst door de −2%-band te vergelijken met de basislijn, niet met `lifeGrid.fireAge`.
    expect(r.lifeGrid.fireAge).not.toBeNull()

    // Piek-leeftijd = laatste leeftijd waar de waarde (zwak monotoon) nog stijgt.
    const turnAge = (pts: { age: number; value: number }[]): number => {
      let peak = pts[0]
      for (const p of pts) if (p.value >= peak.value) peak = p
      return peak.age
    }
    const baseTurn = turnAge(r.lifePath.points)
    const min2Turn = turnAge(min2.points)
    // De −2%-band slaat om op DEZELFDE plek als de basislijn (beide gereconstrueerd
    // uit dezelfde `baseRun`-kasstroom — zie de module-doc van `buildLifePathScenarios`).
    expect(Math.abs(min2Turn - baseTurn)).toBeLessThanOrEqual(2)
    // Geen hardgecodeerde AOW-omslag: de omslag ligt niet toevallig exact op 67.
    expect(baseTurn).not.toBe(67)
  })

  // (b) In de AFBOUWFASE keert de ordening NIET om: +2% ≥ −2% op ELKE leeftijd na
  //     FIRE. (De bug liet +2% ónder −2% duiken → beide naar de huiswaarde-vloer.)
  it('(b) +2% ≥ −2% op elke afbouw-leeftijd (geen omkering)', () => {
    const baseFireAge = r.lifeGrid.fireAge as number
    const afbouw = r.lifePath.points.filter((p) => p.age >= baseFireAge)
    expect(afbouw.length).toBeGreaterThan(0)
    for (const p of afbouw) {
      expect(at(plus2, p.age)).toBeGreaterThanOrEqual(at(min2, p.age) - 1) // −1 = rond-tolerantie
    }
  })

  // (c) De spread (|+2% − −2%|) groeit door de opbouw (waaier wijder) en valt NIET
  //     terug naar ~0 vóór de −2%-band de huis-overwaarde-vloer raakt. We toetsen:
  //     spread op FIRE > spread vroeg in de opbouw, en de spread blijft > 0 tot de
  //     −2%-band vlak voor het einde de huiswaarde-vloer nadert.
  it('(c) de waaier wijdt uit door de opbouw en klapt niet vroegtijdig dicht', () => {
    const baseFireAge = r.lifeGrid.fireAge as number
    const spreadAt = (age: number) => Math.abs(at(plus2, age) - at(min2, age))
    // Spread groeit monotoon tot de basis-FIRE-leeftijd (opbouw-waaier wijdt uit).
    const opbouw = r.lifePath.points.filter((p) => p.age <= baseFireAge).map((p) => p.age)
    for (let i = 1; i < opbouw.length; i++) {
      expect(spreadAt(opbouw[i])).toBeGreaterThanOrEqual(spreadAt(opbouw[i - 1]) - 1)
    }
    // De spread op FIRE is fors groter dan vlak na de start (geen vlakke band).
    expect(spreadAt(baseFireAge)).toBeGreaterThan(spreadAt(r.masthead.age + 2))
    // De spread klapt niet onmiddellijk ná FIRE dicht: minstens enkele jaren afbouw
    // houden de banden uit elkaar (i.p.v. de buggy convergentie naar de huisvloer).
    expect(spreadAt(baseFireAge + 5)).toBeGreaterThan(1000)
  })

  it('is JSON-serialiseerbaar inclusief de levenslange banden', () => {
    expect(() => JSON.parse(JSON.stringify(r.lifePath.scenarios))).not.toThrow()
  })
})

// ── Tekort-guard: negatief FIRE-eligible vermogen → géén positieve vrijheid ───
//
// Bug-fix (MINOR-3): `calculateFreedomTime` rekent op de ABSOLUTE waarde, dus een
// NEGATIEF FIRE-eligible vermogen (huis-rijk / liquide-schuld-zwaar profiel —
// sinds de grondslag-fix vaker bereikbaar) zou anders als een POSITIEVE
// "X jaar vrijheid" renderen. De snapshot moet dat eerlijk als tekort tonen.
describe('buildReport — snapshot-vrijheid bij negatief FIRE-eligible vermogen', () => {
  /**
   * Huis-rijk, liquide-schuld-zwaar: positieve huis-overwaarde, maar de liquide
   * pot (cash − niet-hypotheek-schuld) is sterk negatief, zodat het FIRE-eligible
   * vermogen — zelfs met 50% van de overwaarde meegerekend — ten hoogste nul is.
   *
   *   assets:  huis 300.000 + cash 5.000                 = 305.000
   *   debts:   hypotheek 250.000 + creditcard 30.000      = 280.000
   *   netWorth = 305.000 − 280.000                        =  25.000
   *   huis-overwaarde = 300.000 − 250.000 (linked)        =  50.000
   *   FIRE-eligible = 25.000 − 0,5×50.000                 =       0  (≤ 0 → tekort)
   */
  function huisRijkSchuldZwaar(): CheckIntake {
    return {
      firstName: 'Bram',
      dateOfBirth: '1985-05-01',
      household: 'alleen',
      monthlyIncomeNet: 3000,
      yearlyIncomeGross: 48000,
      expenses: { wonen: 1300, vasteLasten: 700, vrijBesteedbaar: 200, totaalMaand: 2200 },
      // Écht 0 noodfonds — dit edge-scenario test de NEGATIEVE/nul FIRE-eligible-tak;
      // een noodfonds zou als liquide cash de pot boven nul tillen (WF-START-08-bug1-fix).
      emergencyFund: 0,
      assets: [
        { assetType: 'eigen_huis', name: 'Rijtjeshuis', value: 300000 },
        { assetType: 'cash', name: 'Spaarrekening', value: 5000 },
      ],
      debts: [
        { debtType: 'mortgage', name: 'Hypotheek', balance: 250000, interestRatePct: 3.5, monthlyPayment: 1100 },
        { debtType: 'credit_card', name: 'Creditcard', balance: 30000, interestRatePct: 14, monthlyPayment: 400 },
      ],
      pension: { aowExpectedMonthly: null, expectedReturnPct: 7, riskProfile: 'neutraal' },
      goal: null,
    }
  }

  it('isDeficit=true en het label is het tekort-label, GEEN positieve duur', () => {
    const r = buildReport(huisRijkSchuldZwaar(), NOW)
    // Het getoonde €-saldo (netto vermogen incl. huis) blijft positief…
    expect(r.snapshot.netWorth).toBe(25000)
    // …maar de FIRE-inzetbare pot staat onder nul → tekort, geen positieve vrijheid.
    const f = r.snapshot.netWorthFreedom
    expect(f.isDeficit).toBe(true)
    expect(f.isInfinite).toBe(false)
    expect(f.years).toBe(0)
    expect(f.months).toBe(0)
    expect(f.totalDays).toBe(0)
    // Het label is het eerlijke tekort-label, NIET een positieve "X jaar"-string.
    expect(r.snapshot.netWorthFreedomLabel).toBe('nog geen vrijheid')
    expect(r.snapshot.netWorthFreedomLabel).not.toMatch(/jaar|maand|dag/)
    // Volledig serialiseerbaar (report_snapshot).
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow()
  })

  it('"stop vandaag" (twoFutures + fireCards) toont hetzelfde tekort, geen positieve duur', () => {
    // Grondslag-pin op de NEGATIEVE tak: snapshot, twoFutures.stopToday én de
    // FIRE-kaart "stop_today" rekenen op dezelfde FIRE-eligible pot en moeten dus
    // ALLE DRIE het tekort tonen — niet de op |−25000| berekende positieve "X mnd".
    const r = buildReport(huisRijkSchuldZwaar(), NOW)

    // twoFutures.stopToday = deficit, label = tekort-label.
    expect(r.twoFutures.stopToday.isDeficit).toBe(true)
    expect(r.twoFutures.stopToday.years).toBe(0)
    expect(r.twoFutures.stopToday.months).toBe(0)
    expect(r.twoFutures.stopToday.totalDays).toBe(0)
    expect(r.twoFutures.stopTodayLabel).toBe('nog geen vrijheid')
    expect(r.twoFutures.stopTodayLabel).not.toMatch(/jaar|maand|dag/)

    // FIRE-kaart "stop_today" toont hetzelfde tekort-label.
    const stopCard = r.fireCards.find((c) => c.key === 'stop_today')!
    expect(stopCard.value).toBe('nog geen vrijheid')
    expect(stopCard.value).not.toMatch(/jaar|maand|dag/)

    // Pariteit: snapshot == twoFutures.stopToday op de tekort-tak (zoals op de
    // positieve tak — één grondslag in het hele rapport).
    expect(r.snapshot.netWorthFreedomLabel).toBe(r.twoFutures.stopTodayLabel)
    expect(r.snapshot.netWorthFreedom.isDeficit).toBe(r.twoFutures.stopToday.isDeficit)
  })

  it('positief FIRE-eligible vermogen blijft een positieve vrijheidstijd tonen', () => {
    // Tegenproef: Sanne (positief FIRE-eligible) houdt de positieve duur.
    const r = buildReport(sanne(), NOW)
    expect(r.snapshot.netWorthFreedom.isDeficit).toBe(false)
    expect(r.snapshot.netWorthFreedom.years).toBeGreaterThan(0)
    expect(r.snapshot.netWorthFreedomLabel).toMatch(/jaar|maand|dag/)
  })
})

// ── WF-START-08 / bug1 — noodfonds telt mee in netto vermogen ────────────────
// Regressie voor "2026-07-17-WF-START-08-bug1": het publieke Vrijheidsrapport
// toonde een te laag netto vermogen omdat buildPortfolio het noodfonds (los veld
// intake.emergencyFund) NIET als asset toevoegde, terwijl het geactiveerde
// account (intake-to-persona) dat wél doet. Dit legt het exacte UAT-scenario vast:
// noodfonds €6.600 + spaargeld €15.000 + beleggingen €8.000, geen schulden/huis
// → netWorth €29.600, buffer ≈ 9,8182 mnd, geen dubbeltelling.
describe('buildReport — WF-START-08: noodfonds in netto vermogen (bug1)', () => {
  function sanneCheck(): CheckIntake {
    return {
      firstName: 'Sanne',
      dateOfBirth: '1992-03-10',
      household: 'alleen',
      monthlyIncomeNet: 3200,
      yearlyIncomeGross: 51200,
      expenses: { wonen: 1000, vasteLasten: 700, vrijBesteedbaar: 500, totaalMaand: 2200 },
      emergencyFund: 6600,
      assets: [
        { assetType: 'savings', name: 'Spaargeld', value: 15000 },
        { assetType: 'investment', name: 'Beleggingen', value: 8000 },
      ],
      debts: [],
      pension: { aowExpectedMonthly: null, expectedReturnPct: null, riskProfile: null },
      goal: null,
    }
  }

  it('netto vermogen = noodfonds + spaargeld + beleggingen = €29.600 (exacte som)', () => {
    const r = buildReport(sanneCheck(), NOW)
    expect(r.snapshot.netWorth).toBe(29600)
    // Geen huis → vrijheidsvermogen == netto vermogen (100% liquide/FIRE-eligible).
    expect(r.snapshot.freedomBaseEur).toBe(29600)
  })

  it('buffer-dekking telt het noodfonds precies één keer: (6600+15000)/2200 ≈ 9,8 mnd', () => {
    const r = buildReport(sanneCheck(), NOW)
    // Liquide pot = noodfonds 6.600 + spaargeld 15.000 = 21.600 (beleggingen tellen
    // NIET mee als liquide); geen dubbeltelling van het noodfonds. snapshot.bufferMonths
    // is op 1 decimaal afgerond (round1) → 9,8 (canoniek 21.600/2.200 = 9,8182).
    expect(r.snapshot.bufferMonths).toBe(9.8)
  })

  it('potten-breakdown bevat het noodfonds in de cash-bucket (SSoT met account)', () => {
    const r = buildReport(sanneCheck(), NOW)
    const cash = r.dualBars.find((b) => b.bucket === 'cash')
    expect(cash).toBeDefined()
    // Cash-bucket = noodfonds 6.600 + spaargeld 15.000 = 21.600 (één keer geteld).
    expect(cash!.eur).toBe(21600)
  })
})
