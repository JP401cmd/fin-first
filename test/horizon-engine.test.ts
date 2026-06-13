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
      // residu groeit naar de nalatenschap → eindigt op/boven het doel (2% tol),
      // en zeker niet ~€0 zoals bij de oude annuïteit-verdamping.
      expect(end).toBeGreaterThanOrEqual(L * 0.98)
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
})
