import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { runHorizonLedger, buildChartSeries } from '@/lib/horizon-engine'
import { ledgerToUnifiedResult } from '@/lib/horizon-engine/adapter'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

function mkInput(over: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  const assets = [
    {
      id: 'a1',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 120_000,
      expected_return: 7,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: null,
    } as unknown as Asset,
  ]
  return {
    assets,
    debts: [],
    currentAge: 40,
    endAge: 90,
    yearlyExpenses: 30_000,
    annualSavings: 15_000,
    monthlySurplus: 1_250,
    monthlyIncome: 5_000,
    incomeGrowthRate: 0,
    grossReturn: 0.07,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS },
    hasPartner: false,
    ...over,
  }
}

describe('horizon-engine grootboek (Fase 1)', () => {
  it('produceert één rij per projectiejaar', () => {
    const r = runHorizonLedger(mkInput())
    expect(r.rows.length).toBe(51) // 40..90 inclusief
  })

  it('V_nodig daalt richting de eindleeftijd (onderwerp 1)', () => {
    const v = runHorizonLedger(mkInput()).vNodig
    expect(v[v.length - 1]).toBeLessThan(v[0])
  })

  it('deplete: V_nodig is ~0 op de eindleeftijd', () => {
    const r = runHorizonLedger(mkInput())
    expect(r.vNodig[r.vNodig.length - 1]).toBeCloseTo(0, 5)
  })

  it('behouden (perpetual): V_nodig eindigt op het initiële liquide vermogen', () => {
    const r = runHorizonLedger(mkInput({ strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 } }))
    expect(r.vNodig[r.vNodig.length - 1]).toBeCloseTo(120_000, 0)
  })

  it('legacy: V_nodig eindigt op het nalatenschapsbedrag', () => {
    const r = runHorizonLedger(mkInput({ strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 50_000 } }))
    expect(r.vNodig[r.vNodig.length - 1]).toBeCloseTo(50_000, 5)
  })

  it('liquide vermogen groeit tijdens de opbouw', () => {
    const r = runHorizonLedger(mkInput())
    expect(r.rows[5].liquideVermogen).toBeGreaterThan(r.rows[0].liquideVermogen)
  })

  it('deplete (opeten): de getoonde lijn eindigt op ~€0', () => {
    const r = runHorizonLedger(mkInput())
    if (r.fireReachable) {
      expect(r.rows[r.rows.length - 1].liquideVermogen).toBeLessThan(5000)
    }
  })

  it('perpetual (behouden): de getoonde lijn eindigt NIET op 0', () => {
    const r = runHorizonLedger(mkInput({ strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 } }))
    if (r.fireReachable) {
      expect(r.rows[r.rows.length - 1].liquideVermogen).toBeGreaterThan(1000)
    }
  })

  it('chart-series zijn consistent qua lengte', () => {
    const r = runHorizonLedger(mkInput())
    const s = buildChartSeries(r)
    expect(s.ages.length).toBe(r.rows.length)
    expect(s.vOp.length).toBe(r.rows.length)
    expect(s.vNodig.length).toBe(r.rows.length)
  })

  it('adapter levert een UnifiedProjectionResult met één rij per jaar', () => {
    const r = runHorizonLedger(mkInput())
    const u = ledgerToUnifiedResult(r, { yearlyExpenses: 30_000 })
    expect(u.rows.length).toBe(r.rows.length)
    expect(u.fireAge).toBe(r.fireAge)
    expect(u.rows[0].phase).toBe('accumulation')
  })

  it('pot-regel: surplus naar het gekozen type (spaargeld) i.p.v. beleggen', () => {
    const assets = [
      { id: 'inv', name: 'Beleggen', asset_type: 'investment', current_value: 50_000, expected_return: 7, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset,
      { id: 'sav', name: 'Spaar', asset_type: 'savings', current_value: 50_000, expected_return: 1, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset,
    ]
    const base = runHorizonLedger(mkInput({ assets }))
    const potted = runHorizonLedger(mkInput({ assets }), { surplusTargetTypes: ['savings'] })
    // Default: surplus → investable (beleggen). Pot-regel: surplus → spaargeld.
    expect(base.rows[1].assets.find((a) => a.id === 'inv')!.instroom).toBeGreaterThan(0)
    expect(potted.rows[1].assets.find((a) => a.id === 'sav')!.instroom).toBeGreaterThan(0)
    expect(potted.rows[1].assets.find((a) => a.id === 'inv')!.instroom).toBe(0)
  })

  // ── Legacy = need-only (ADR 0014) ─────────────────────────────────────────
  // Regressie tegen de surplus-verdampingsbug: legacy gebruikte de spend-down-
  // annuïteit, die in het grootboek het surplus uit de assets trok zónder het te
  // consumeren → de nalatenschap werd nooit gehaald (eindigde ~€70k ónder doel,
  // soms ~€0). Fix: legacy onttrekt need-only, het residu groeit naar het doel.
  const mkLegacy = (legacyAmount: number) =>
    runHorizonLedger(mkInput({ annualSavings: 25_000, monthlySurplus: 25_000 / 12, strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount } }))

  it('legacy: bereikbaar voor een gezonde spaarder (was kunstmatig onhaalbaar)', () => {
    const r = mkLegacy(100_000)
    expect(r.fireReachable).toBe(true)
    expect(r.fireAge).not.toBeNull()
  })

  it('legacy: eindvermogen haalt het nalatenschapsbedrag (geen verdamping)', () => {
    for (const L of [50_000, 200_000, 300_000]) {
      const r = mkLegacy(L)
      expect(r.fireReachable).toBe(true)
      const end = r.rows[r.rows.length - 1].liquideVermogen
      // residu groeit naar de nalatenschap → eindigt op/boven het doel (ADR 0017:
      // doel-check is ≥ legacyAmount, geen tolerantie), en zeker niet ~€0 zoals
      // bij de oude annuïteit-verdamping.
      expect(end).toBeGreaterThanOrEqual(L)
    }
  })

  it('legacy: hoger nalatenschapsbedrag → niet vroegere FIRE en hoger eindvermogen', () => {
    const laag = mkLegacy(50_000)
    const hoog = mkLegacy(300_000)
    expect(hoog.fireAge!).toBeGreaterThanOrEqual(laag.fireAge!)
    const endLaag = laag.rows[laag.rows.length - 1].liquideVermogen
    const endHoog = hoog.rows[hoog.rows.length - 1].liquideVermogen
    expect(endHoog).toBeGreaterThanOrEqual(endLaag)
  })

  it('legacy: gebruikt geen spend-down-annuïteit (onttrekking ≈ netto behoefte, niet de annuïteit)', () => {
    // Bij need-only is de onttrekking in het eerste pensioenjaar ≈ de leefuitgaven
    // (+woonkosten −AOW/pensioen), NIET de veel hogere spend-down-annuïteit.
    const r = mkLegacy(200_000)
    const fireRow = r.rows.find((x) => x.leeftijd === r.fireAge)!
    const firstRetire = r.rows.find((x) => x.leeftijd >= r.fireAge! && !x.werkt)!
    const uitstroom = firstRetire.assets.reduce((s, a) => s + a.uitstroom, 0)
    const behoefte = firstRetire.totaleUitgaven - firstRetire.aowEnPensioen
    expect(fireRow).toBeDefined()
    // onttrekking blijft in de buurt van de behoefte (ruime marge), niet 1.5–2× zoals de annuïteit.
    expect(uitstroom).toBeLessThan(behoefte * 1.5 + 1_000)
  })

  // ── Recurring-eenheid (B2-fix) ─────────────────────────────────────────────
  // Regressie: recurring `amount` is een MAANDbedrag (conventie van
  // lifeEventsToCashflows; v1 annualiseert via recurringYearly). v2 telde het
  // als jaarbedrag → AOW/pensioen/huur ~12× te laag. Fix: × 12 in activeRecurring.
  it('recurring geïndexeerd: maandbedrag wordt geannualiseerd (×12), vlak reëel', () => {
    const r = runHorizonLedger(mkInput({
      cashflows: [{ id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: 1500, fromAge: 67, toAge: null, indexed: true }],
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    }))
    // €1.500/mnd geïndexeerd → €18.000/jaar (vlak reëel), niet €1.500.
    expect(r.rows.find((x) => x.leeftijd === 70)!.aowEnPensioen).toBeCloseTo(18_000, 0)
    expect(r.rows.find((x) => x.leeftijd === 75)!.aowEnPensioen).toBeCloseTo(18_000, 0)
  })

  it('recurring niet-geïndexeerd erodeert reëel t.o.v. geïndexeerd', () => {
    const mk = (indexed: boolean) => runHorizonLedger(mkInput({
      cashflows: [{ id: 'a', name: 'A', type: 'recurring', direction: 'income', amount: 1000, fromAge: 50, toAge: null, indexed }],
    }))
    const idx = mk(true).rows.find((x) => x.leeftijd === 70)!.aowEnPensioen
    const non = mk(false).rows.find((x) => x.leeftijd === 70)!.aowEnPensioen
    expect(idx).toBeCloseTo(12_000, 0) // vlak reëel
    expect(non).toBeLessThan(idx) // nominaal vlak → reëel lager 20 jaar later
  })

  // ── Legacy = doel-zoekende FIRE-selectie (ADR 0017, vult ADR 0014 aan) ──────
  // De legacy-tak van meetsStrategyTarget koos de vroegste FIRE-leeftijd die de
  // brug naar pensioen overleefde (buffer-eis `minMid > 1`) ÉN ≥ legacyAmount−2%.
  // De −2%-tolerantie liet FIRE een jaar te vroeg accepteren waar het eindvermogen
  // nog ÓNDER de nalatenschap eindigde (bv. €197.778 voor een €200k-doel) — de
  // afbouw-lijn haalde het doel dus niet. Fix (ADR 0017): doel-check `≥ legacyAmount`
  // (geen −2%) → nooit ónder het doel; en de brug-ondergrens versoepelt van
  // `minMid > 1` naar floor 0 (de brug mág richting €0 dippen — de buffer zit al in
  // het door de gebruiker ingevoerde nalatenschapsbedrag — maar het liquide pad mag
  // nóóit negatief worden). Need-only-onttrekking blijft (ADR 0014).
  const mkLegacyHealthy = (legacyAmount: number) =>
    runHorizonLedger(mkInput({ annualSavings: 25_000, monthlySurplus: 25_000 / 12, strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount } }))

  // Config waar de oude −2%-tolerantie aantoonbaar een te-vroege FIRE accepteerde
  // die ÓNDER het doel eindigde. Geverifieerd via een OLD↔NEW-engine-sweep:
  //   OLD-gate: FIRE=48, eindvermogen €197.778  (< €200k → lijn haalt doel NIET)
  //   NEW-gate: FIRE=49, eindvermogen €346.910  (≥ €200k → doel gehaald)
  // (cv=200k, jaaruitgaven=25k, sparen=25k, AOW €1.500/mnd geïndexeerd, L=200k.)
  const mkLegacyBugConfig = (legacyAmount: number) =>
    runHorizonLedger(mkInput({
      assets: [{ id: 'a1', name: 'Beleggingen', asset_type: 'investment', current_value: 200_000, expected_return: 7, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset],
      yearlyExpenses: 25_000,
      annualSavings: 25_000, monthlySurplus: 25_000 / 12,
      cashflows: [{ id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: 1500, fromAge: 67, toAge: null, indexed: true } as never],
      strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount },
    }))

  it('legacy (bug-regressie): afbouw-lijn eindigt NIET ónder het doel (oude −2%-tolerantie weg)', () => {
    const L = 200_000
    const r = mkLegacyBugConfig(L)
    expect(r.fireReachable).toBe(true)
    const end = r.rows[r.rows.length - 1].liquideVermogen
    // ROOD vóór de fix: de OLD-gate eindigde op €197.778 (< €200k).
    expect(end).toBeGreaterThanOrEqual(L)
  })

  it('legacy: FIRE schuift bij de bug-config een jaar later, zodat de lijn het doel haalt', () => {
    // De −2%-tolerantie liet FIRE één jaar te vroeg accepteren (FIRE=48, eindigend
    // ónder het doel). Na de fix ligt FIRE op 49 en haalt de lijn het doel.
    const r = mkLegacyBugConfig(200_000)
    expect(r.fireAge).toBe(49) // oud: 48 (te vroeg, eindigde op €197.778 < doel)
  })

  it('legacy: eindvermogen blijft nooit ónder het doel (bias naar boven)', () => {
    for (const L of [50_000, 200_000, 300_000, 497_000]) {
      const r = mkLegacyHealthy(L)
      expect(r.fireReachable).toBe(true)
      const end = r.rows[r.rows.length - 1].liquideVermogen
      expect(end).toBeGreaterThanOrEqual(L)
    }
    // Ook op de bug-config (waar de oude tolerantie ónder het doel uitkwam):
    for (const L of [200_000, 497_000]) {
      const r = mkLegacyBugConfig(L)
      expect(r.fireReachable).toBe(true)
      expect(r.rows[r.rows.length - 1].liquideVermogen).toBeGreaterThanOrEqual(L)
    }
  })

  it('legacy: onvermijdelijke overshoot — zeer hoog vermogen, laag doel → FIRE nu, signaal gezet', () => {
    const r = runHorizonLedger(mkInput({
      assets: [{ id: 'big', name: 'Beleggen', asset_type: 'investment', current_value: 2_000_000, expected_return: 7, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset],
      annualSavings: 25_000,
      monthlySurplus: 25_000 / 12,
      strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 50_000 },
    }))
    expect(r.fireReachable).toBe(true)
    // FIRE zeer vroeg (kan nu al stoppen): de vroegste kandidaat (f = startAge)
    // eindigt al ≥ doel.
    expect(r.fireAge!).toBe(40)
    // Eindvermogen ligt onvermijdelijk boven het doel.
    const end = r.rows[r.rows.length - 1].liquideVermogen
    expect(end).toBeGreaterThan(50_000)
    // Signaal-veld staat aan voor de UI ("je kunt nu al stoppen").
    expect(r.legacyTargetUnavoidablyExceeded).toBe(true)
  })

  it('legacy: gewone (niet-onvermijdelijke) case zet het overshoot-signaal NIET', () => {
    const r = mkLegacyHealthy(200_000)
    expect(r.legacyTargetUnavoidablyExceeded).toBe(false)
  })

  it('perpetual & deplete: overshoot-signaal is altijd false (alleen legacy)', () => {
    const perp = runHorizonLedger(mkInput({ strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 } }))
    const dep = runHorizonLedger(mkInput())
    expect(perp.legacyTargetUnavoidablyExceeded).toBe(false)
    expect(dep.legacyTargetUnavoidablyExceeded).toBe(false)
  })

  // ── Woonlast-RENTE-vrijval bij payoff (Fase B, gecorrigeerd) ────────────────
  // Een geflagde schuld (include_aflossing_in_savings) heeft zijn HELE jaarlast
  // (rente + aflossing) als "uitgave" in de spaarquote-baseline verrekend en de
  // aflossing daarna teruggeteld. Netto blijft binnen annualSavings dus alleen de
  // RENTE permanent afgetrokken; de aflossing valt weg. Bij payoff brengt
  // `flaggedAflossing → 0` de aflossing AL terug in het surplus — dus mag
  // uitsluitend het RENTE-deel nog vrijvallen. (De eerdere implementatie liet de
  // volledige jaarlast vrijvallen → de aflossing werd dubbel hersteld, R te hoog.)
  //
  // Een geflagde hypotheek die in ~2 jaar afgelost is: balance 20k, rate 5%,
  // maandlast 11_000/12 → jaarlast 11_000 (rente+aflossing).
  //   age 40: begin 20k, rente 1.0k, aflossing 10k → eind 10k (loopt → lastRente=1.0k, freed 0)
  //   age 41: begin 10k, rente 0.5k, aflossing 10k (cap) → eind 0 (loopt → lastRente=0.5k, freed 0)
  //   age 42: begin 0  → afgelost → freedHousingCost = lastActiveRente = 0.5k (alléén rente)
  const LAST_ACTIVE_RENTE = 500 // rente van het laatste lopende jaar (age 41: 10k × 5%)
  const flaggedMortgage = (over: Record<string, unknown> = {}) => ({
    id: 'hyp',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    current_balance: 20_000,
    interest_rate: 5,
    monthly_payment: 11_000 / 12,
    repayment_type: 'annuiteit',
    is_tax_deductible: false,
    is_active: true,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: true,
    ...over,
  }) as unknown as UnifiedProjectionInput['debts'][number]

  // We willen alléén de accumulatie-jaren vergelijken (FIRE/onttrekking buiten
  // beschouwing) → forceer FIRE laat zodat 40..42 zeker in de opbouwfase zitten.
  const accInput = (debts: UnifiedProjectionInput['debts']) =>
    mkInput({ debts, forcedFireAge: 67 })
  const accSurplus = (r: ReturnType<typeof runHorizonLedger>, age: number) =>
    r.rows.find((x) => x.leeftijd === age)!.cashflowNetto

  it('vrijval: na payoff stijgt het surplus met ALLEEN het rente-deel (niet de volledige jaarlast)', () => {
    const r = runHorizonLedger(accInput([flaggedMortgage()]))
    const running = accSurplus(r, 41) // schuld loopt nog → baseline, geen vrijval
    const freed = accSurplus(r, 42)   // afgelost → alléén de rente valt vrij
    // De stijging t.o.v. het lopende jaar = (aflossing-aftrek vervalt: flagged→0,
    // de 10k aflossing keert terug) + (rente van het laatste lopende jaar: 0.5k).
    // De totale delta is dus ~10.5k, NIET de volledige jaarlast (11k) en zeker geen
    // 11k bovenóp het terugkeren van de aflossing.
    const lopendeAflossing = 10_000
    expect(freed - running).toBeCloseTo(lopendeAflossing + LAST_ACTIVE_RENTE, 6)
    // Strikt: de vrijval bovenóp het terugkeren van de aflossing is exact de rente
    // (0.5k), niet de volledige jaarlast.
    expect(freed - running - lopendeAflossing).toBeCloseTo(LAST_ACTIVE_RENTE, 6)
  })

  it('vrijval (economie-pin): het surplus na payoff = de loader-economie inkomen − E_overig (geen dubbeltelling)', () => {
    // LOADER-CONSISTENTE pin. We bouwen annualSavings zoals de loader hem levert:
    //   annualSavings = inkomen − E_overig − rente   (aflossing zit in flaggedAflossing → netto 0)
    // Met inkomen=40k, E_overig=22k en rente uit het laatste lopende jaar (0.5k):
    //   annualSavings = 40_000 − 22_000 − 500 = 17_500.
    // Tijdens de looptijd: surplus = annualSavings − flaggedAflossing(=10k) = 7_500.
    // Na payoff (geen woonlast meer) moet het ECONOMISCH juiste surplus
    //   inkomen − E_overig = 40_000 − 22_000 = 18_000 zijn — de rente valt vrij,
    // de aflossing was al netto-0. Dit is precies de test die de DUBBELTELLING vangt:
    // de oude formule gaf 40_000 − 22_000 + 10_000(aflossing terug) + 11_000(jaarlast)
    // = 29_000 (R=10k te hoog).
    const inkomen = 40_000
    const eOverig = 22_000
    const renteLaatsteJaar = LAST_ACTIVE_RENTE // 0.5k
    const annualSavings = inkomen - eOverig - renteLaatsteJaar // 17_500
    const r = runHorizonLedger(
      mkInput({ debts: [flaggedMortgage()], forcedFireAge: 67, annualSavings, monthlySurplus: annualSavings / 12 }),
    )
    // Looptijd: byte-identiek aan de baseline (geen vrijval) = annualSavings − aflossing.
    expect(accSurplus(r, 41)).toBeCloseTo(annualSavings - 10_000, 6) // 7_500
    // Na payoff: exact inkomen − E_overig (de rente valt vrij, aflossing al hersteld).
    expect(accSurplus(r, 42)).toBeCloseTo(inkomen - eOverig, 6) // 18_000
  })

  it('regressie: tijdens de looptijd is het surplus byte-identiek aan de pre-feature baseline', () => {
    // freedHousingCost = 0 zolang de schuld loopt → het lopende-jaar surplus moet
    // exact gelijk zijn aan dezelfde run zonder de freed-term. We pinnen dit door
    // de lopende jaren (40, 41) te vergelijken met de hand-uitgerekende baseline-
    // formule: surplus = annualSavings − flaggedAflossing.
    //   age 40: 15_000 − 10_000 = 5_000
    //   age 41: 15_000 − 10_000 = 5_000  (aflossing cap op begin 10k)
    const r = runHorizonLedger(accInput([flaggedMortgage()]))
    expect(accSurplus(r, 40)).toBeCloseTo(5_000, 6)
    expect(accSurplus(r, 41)).toBeCloseTo(5_000, 6)
  })

  it('regressie: zonder geflagde schuld is freedHousingCost altijd 0 (surplus = annualSavings)', () => {
    const r = runHorizonLedger(accInput([]))
    // Geen schuld → geen baseline → surplus = annualSavings (15k) elk opbouwjaar.
    expect(accSurplus(r, 40)).toBeCloseTo(15_000, 6)
    expect(accSurplus(r, 45)).toBeCloseTo(15_000, 6)
  })

  it('aflossingsvrije hypotheek: geen vrijval (balance daalt nooit → begin > 0 blijft true)', () => {
    // Interest-only: begin > 0 blijft elk jaar → de schuld bereikt nooit begin === 0
    // → freedHousingCost blijft 0 → surplus volgt de baseline. Correct: de woonlast
    // (rente) verdwijnt immers nooit.
    const io = flaggedMortgage({ repayment_type: 'aflossingsvrij', monthly_payment: 1_000 / 12, interest_rate: 5 })
    const r = runHorizonLedger(accInput([io]))
    // surplus = annualSavings − flaggedAflossing(0, want aflossingsvrij) + freed(0)
    //         = 15_000 elk jaar (geen aflossing, geen vrijval).
    expect(accSurplus(r, 40)).toBeCloseTo(15_000, 6)
    expect(accSurplus(r, 60)).toBeCloseTo(15_000, 6) // nog steeds geen vrijval
  })

  it('niet-geflagde schuld: telt niet mee in de baseline → geen vrijval', () => {
    // include_aflossing_in_savings = false → de aflossing zat NIET in de spaarquote,
    // dus geen flaggedAflossing-aftrek én geen freedHousingCost. Een lening die
    // tijdens de looptijd afgelost wordt verandert het surplus niet via vrijval.
    const lening = flaggedMortgage({ debt_type: 'loan', include_aflossing_in_savings: false })
    const r = runHorizonLedger(accInput([lening]))
    // surplus = annualSavings (15k) elk jaar; payoff verandert daar niets aan.
    expect(accSurplus(r, 40)).toBeCloseTo(15_000, 6)
    expect(accSurplus(r, 42)).toBeCloseTo(15_000, 6) // na payoff: nog steeds 15k
  })

  it('meerdere geflagde schulden: alleen de afgeloste valt vrij (alléén diens rente)', () => {
    // Schuld A lost in ~2 jaar af (laatste-jaar-rente 0.5k); schuld B is een lange,
    // nog lopende geflagde lening (hoog saldo). Na A's payoff valt alléén A's
    // laatste-lopende-jaar-RENTE vrij; B blijft lopen en valt niet vrij.
    const A = flaggedMortgage({ id: 'A', name: 'Hyp A' }) // 20k @5% → payoff ~age 42, lastRente 0.5k
    const B = flaggedMortgage({ id: 'B', name: 'Lening B', current_balance: 200_000, interest_rate: 3, monthly_payment: 3_000 / 12 }) // blijft lopen
    const r = runHorizonLedger(accInput([A, B]))
    // Referentie: alleen B (lopend) → het surplus daar bevat A's vrijval niet.
    const refB = runHorizonLedger(accInput([flaggedMortgage({ id: 'B', name: 'Lening B', current_balance: 200_000, interest_rate: 3, monthly_payment: 3_000 / 12 })]))
    // Na A's payoff (age 42) is het verschil precies A's laatste-jaar-rente (0.5k):
    // alleen A's rente viel vrij, niet A's volledige jaarlast.
    const freed = accSurplus(r, 42) - accSurplus(refB, 42)
    expect(freed).toBeCloseTo(LAST_ACTIVE_RENTE, 6)
  })

  it('vrijval: het rente-bedrag dat vrijvalt stroomt ook daadwerkelijk de assets in (vs. referentierun)', () => {
    // Het hogere surplus na payoff moet zichtbaar zijn als extra instroom in de
    // (investable) assets. We pinnen het BEDRAG t.o.v. een referentierun met een
    // identieke hypotheek die al op €0 begint (volledig afgelost vanaf jaar 0):
    // daar is er geen aflossing-terugkeer (flagged al 0) — alléén de rente-vrijval
    // ontbreekt, want lastActiveRente is dan nooit gezet → freed = 0.
    const r = runHorizonLedger(accInput([flaggedMortgage()]))
    const ref = runHorizonLedger(accInput([flaggedMortgage({ current_balance: 0 })]))
    const instroom = (run: ReturnType<typeof runHorizonLedger>, age: number) =>
      run.rows.find((x) => x.leeftijd === age)!.assets.reduce((s, a) => s + a.instroom, 0)
    // Na payoff (age 42) belegt de lopende-hypotheek-run exact de rente méér dan de
    // al-afgeloste referentie (die mist de lastActiveRente-vrijval).
    expect(instroom(r, 42) - instroom(ref, 42)).toBeCloseTo(LAST_ACTIVE_RENTE, 4)
  })

  // ── ADR 0027: deplete-FIRE-detectie = liquide ≥ V_nodig (Optie B) ───────────
  // De FIRE-stip (firePortfolioAtFire = liquide op FIRE) moet samenvallen met de
  // doel-lijn (requiredFirePortfolioAtFire = V_nodig op FIRE) — binnen ~½ jaar
  // vermogensopbouw — omdat ze nu dezelfde grondslag delen. Voorheen lagen ze
  // ~28% / ~4 jaar uiteen (forward-deplete-feasibility vs backward-annuïteit).
  it('deplete (ADR 0027): de FIRE-stip valt op de doel-lijn (binnen ~½ jaar opbouw)', () => {
    const r = runHorizonLedger(mkInput({ yearlyExpenses: 36_000, annualSavings: 24_000, monthlySurplus: 24_000 / 12 }))
    expect(r.fireReachable).toBe(true)
    const idx = r.rows.findIndex((x) => x.leeftijd === r.fireAge)
    expect(idx).toBeGreaterThan(1)
    const stip = r.liquideAtFire // = firePortfolioAtFire (reëel)
    const doel = r.requiredFirePortfolioAtFire // = V_nodig op FIRE (reëel)
    // De stip ligt op/boven de doel-lijn (vroegste passerende leeftijd) …
    expect(stip).toBeGreaterThanOrEqual(doel)
    // … en de overshoot is hooguit ÉÉN jaar bruto-vermogensopbouw rond die leeftijd:
    // jaarsparen + bruto rendement op de pot. Dit is de discrete stapgrootte waarmee
    // de stijgende opbouwcurve de dalende V_nodig-lijn in één jaar passeert (de
    // ~½-jaar-verwachting uit de bug-analyse, robuust uitgedrukt).
    const brutoJaaropbouw = 24_000 + 0.07 * doel
    expect(stip - doel).toBeLessThanOrEqual(brutoJaaropbouw)
  })

  it('deplete (ADR 0027): ook met spendable huis (include_full) valt de stip op de doel-lijn', () => {
    const huis = { id: 'huis', name: 'Eigen huis', asset_type: 'real_estate', current_value: 400_000, expected_return: 2, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset
    const beleggen = { id: 'a1', name: 'Beleggingen', asset_type: 'investment', current_value: 200_000, expected_return: 7, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: null } as unknown as Asset
    const r = runHorizonLedger(
      mkInput({ assets: [beleggen, huis], yearlyExpenses: 36_000, annualSavings: 24_000, monthlySurplus: 24_000 / 12, spendableAssetIds: ['huis'] }),
    )
    expect(r.fireReachable).toBe(true)
    const idx = r.rows.findIndex((x) => x.leeftijd === r.fireAge)
    expect(idx).toBeGreaterThan(1)
    const gap = r.liquideAtFire - r.requiredFirePortfolioAtFire
    const brutoJaaropbouw = 24_000 + 0.07 * r.requiredFirePortfolioAtFire
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(brutoJaaropbouw)
  })
})
