/**
 * Regressie — **opeethypotheek volgt "Wanneer nodig"** (bug-fix, ADR 0148; buiten het
 * Excel-oracle-domein).
 *
 * Defect: het strategie-scherm belooft bij Opeethypotheek + "Wanneer nodig" een start
 * "op het moment dat je vermogen op raakt", met de uiterste leeftijd als vangnet. De
 * kern kende die trigger alleen voor Verkopen (Excel P!B58 is verkoop-only); de opeet-tak
 * startte hard op `opeetStartleeftijdOpname` (= fallbackAge ?? triggerAge). Raakte het
 * liquide vermogen eerder op, dan vulde de synthetische tekort-lening het gat.
 *
 * Fix: een app-only veld `WoningStrategieParams.opeetTrigger` ('Wanneer nodig'). De
 * opeet-tak start dan (monotoon) zodra leeftijd ≥ FIRE ∧ Prognose!J(m−1) < drempel
 * (zelfde drempel/formule als Verkopen), óf op de uiterste leeftijd. De werkelijke
 * startmaand is engine-toestand: overwaarde-basis en startleeftijd worden op de maand
 * vóór de werkelijke start bevroren; de auto-opname spreidt over (90 − werkelijke
 * startleeftijd)·12. Afwezig/'Vaste leeftijd' ⇒ byte-identiek aan het oude gedrag; het
 * fixture-pad zet het veld nooit ⇒ oracle-parity onaangetast.
 */
import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { runKernelProjection, type KernelProjection } from '@/lib/horizon-kernel/engine'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// Startleeftijd expliciet op een heel getal, zodat maandindex ↔ leeftijd exact uitlijnt
// (m = (leeftijd − 47)·12) en de "nooit krap"-variant byte-identiek vergelijkbaar is.
const START_LEEFTIJD = 47
const FIRE_LEEFTIJD = 50 // geforceerd vroeg stopmoment → liquide raakt ruim vóór 80 op
const TRIGGER_AGE = 67
const FALLBACK_AGE = 80
const LEVENSVERWACHTING = 90

const HUIS = { id: 'house', name: 'Eigen woning', asset_type: 'eigen_huis', current_value: 500_000, expected_return: 2, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 } as unknown as Asset
const SPAAR = (bedrag: number) => ({ id: 'sav', name: 'Spaarrekening', asset_type: 'savings', current_value: bedrag, expected_return: 1, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 }) as unknown as Asset
const BELEG = { id: 'inv', name: 'Beleggingen', asset_type: 'investment', current_value: 200_000, expected_return: 5, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 } as unknown as Asset
const HYPOTHEEK = { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 200_000, interest_rate: 3, monthly_payment: 500, repayment_type: 'aflossingsvrij', is_active: true, linked_asset_id: 'house', net_worth_inclusion_pct: 100, include_aflossing_in_savings: false } as unknown as Debt

type Trigger = 'fixed_age' | 'on_depletion'

function housing(trigger: Trigger, over: Record<string, unknown> = {}) {
  return {
    mode: 'reverse_mortgage',
    trigger,
    triggerAge: TRIGGER_AGE,
    fallbackAge: FALLBACK_AGE,
    depletionThresholdYears: 2,
    maxLoanPct: 0.5,
    interestRate: 0.055,
    monthlyPayout: null,
    ...over,
  }
}

function kernelInput(housingConfig: Record<string, unknown>, spaar = 100_000): KernelInput {
  const profile = {
    date_of_birth: '1980-01-01',
    net_monthly_income: 5000,
    estimated_monthly_expenses: 3000,
    expected_return: 0.05,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: LEVENSVERWACHTING,
    withdrawal_strategy: 'static',
    housing_strategy_config: housingConfig,
  }
  const input = buildKernelInputFromAppWithNotices({
    profile: profile as never,
    assets: [HUIS, SPAAR(spaar), BELEG],
    debts: [HYPOTHEEK],
  }).input
  return { ...input, startLeeftijd: START_LEEFTIJD }
}

const mAt = (age: number) => Math.round((age - START_LEEFTIJD) * 12)

function opnameSerie(proj: KernelProjection): number[] {
  return proj.bez.map((row) => (row.beyondHorizon ? 0 : row.woning.opeetOpname))
}

function eersteOpnameMaand(proj: KernelProjection): number {
  return opnameSerie(proj).findIndex((v) => v > 0)
}

function tekortSaldo(input: KernelInput, proj: KernelProjection, m: number): number {
  const slot = input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? 6
  const cel = proj.s[m]?.slots[slot]
  return typeof cel?.saldo === 'number' ? cel.saldo : 0
}

describe('kernel · opeethypotheek volgt "Wanneer nodig" (ADR 0148)', () => {
  it('adapter: reverse_mortgage + on_depletion zet opeetTrigger en de uiterste leeftijd op fallbackAge', () => {
    const w = kernelInput(housing('on_depletion')).woning
    expect(w.selector).toBe('Opeethypotheek')
    expect(w.opeetTrigger).toBe('Wanneer nodig')
    expect(w.opeetStartleeftijdOpname).toBe(FALLBACK_AGE)
    expect(w.drempelMaandenUitgave).toBe(24)
  })

  // ── (1) het defect: opname start zodra liquide krap wordt, niet pas op de uiterste leeftijd ──
  it('(1) liquide krap vóór de uiterste leeftijd → opname start op dat moment, niet pas op 80', () => {
    const input = kernelInput(housing('on_depletion'))
    const proj = runKernelProjection(input, { fireAge: FIRE_LEEFTIJD })
    const m0 = eersteOpnameMaand(proj)

    expect(m0).toBeGreaterThan(0)
    expect(m0).toBeGreaterThanOrEqual(mAt(FIRE_LEEFTIJD)) // nooit vóór het stopmoment
    expect(m0).toBeLessThan(mAt(FALLBACK_AGE)) // het defect: dit was exact mAt(80)

    // De trigger vuurt op de m−1-toets: J(m0−1) < drempel(m0), en de maand ervóór nog niet.
    const drempel = (m: number) =>
      (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) *
      Math.pow(1 + input.inflatie, m / 12) *
      input.woning.drempelMaandenUitgave
    const jVorig = (m: number) => {
      const row = proj.prognose[m - 1]
      return row === undefined || row.beyondHorizon ? 0 : row.nettoLiquide
    }
    expect(jVorig(m0)).toBeLessThan(drempel(m0))
    expect(jVorig(m0 - 1)).toBeGreaterThanOrEqual(drempel(m0 - 1))
  })

  it('(1) eerste opname = overwaarde(m−1)·max-leen% gespreid over (90 − werkelijke startleeftijd)·12', () => {
    // De spreidingsformule is sinds ADR 0150 het pad ZONDER `opeetOpnameNaarBehoefte`
    // (oracle-formule; de adapter zet die vlag bij monthlyPayout null). Hier gaat het om
    // de noemer over de wérkelijke startleeftijd, dus strip de vlag.
    const { opeetOpnameNaarBehoefte: _weg, ...woningZonder } = kernelInput(housing('on_depletion')).woning
    const input: KernelInput = { ...kernelInput(housing('on_depletion')), woning: woningZonder }
    const proj = runKernelProjection(input, { fireAge: FIRE_LEEFTIJD })
    const m0 = eersteOpnameMaand(proj)
    const row = proj.bez[m0]
    if (row.beyondHorizon) throw new Error('startmaand buiten horizon')
    const startLeeftijd = START_LEEFTIJD + m0 / 12
    const gewenst =
      (row.woning.overwaardeVorig * input.woning.opeetMaxLeningPctOverwaarde) /
      ((LEVENSVERWACHTING - startLeeftijd) * 12)
    // Cap-restant (S!P(m−1) = 0 in de startmaand) is ruim groter dan de spreiding →
    // opname = gewenst. Absolute tolerantie (1e-6 €): zelfde rijwaarden, zelfde formule.
    expect(row.woning.opeetOpname).toBeCloseTo(gewenst, 6)
    expect(gewenst).toBeLessThan(row.woning.opeetCap / (1 + input.woning.opeetRentePerJaar / 12))
    // De basis blijft bevroren: de maand erna spreidt over dezelfde noemer (geen herstart).
    const rij1 = proj.bez[m0 + 1]
    if (rij1.beyondHorizon) throw new Error('m0+1 buiten horizon')
    expect(rij1.woning.opeetOpname).toBeCloseTo(gewenst, 6)
  })

  it('(1) productie-symptoom: de tekort-lening op 75 is kleiner dan bij een harde start op 80', () => {
    const wn = kernelInput(housing('on_depletion'))
    const vast80 = kernelInput(housing('fixed_age', { triggerAge: FALLBACK_AGE }))
    const pWn = runKernelProjection(wn, { fireAge: FIRE_LEEFTIJD })
    const pVast = runKernelProjection(vast80, { fireAge: FIRE_LEEFTIJD })
    expect(tekortSaldo(wn, pWn, mAt(75))).toBeLessThan(tekortSaldo(vast80, pVast, mAt(75)))
  })

  // ── (2) regressie per variant ──────────────────────────────────────────────────
  it('(2a) opeet + Vaste leeftijd: start exact op triggerAge; veld afwezig ≡ "Vaste leeftijd" (byte-identiek)', () => {
    const met = kernelInput(housing('fixed_age'))
    expect(met.woning.opeetTrigger).toBe('Vaste leeftijd')
    const { opeetTrigger: _weg, ...zonderVeld } = met.woning
    const zonder: KernelInput = { ...met, woning: zonderVeld }

    const pMet = runKernelProjection(met, { fireAge: FIRE_LEEFTIJD })
    const pZonder = runKernelProjection(zonder, { fireAge: FIRE_LEEFTIJD })
    expect(eersteOpnameMaand(pMet)).toBe(mAt(TRIGGER_AGE))
    expect(opnameSerie(pMet)).toEqual(opnameSerie(pZonder))
    expect(pMet.bez.map((r) => (r.beyondHorizon ? null : r.woning))).toEqual(
      pZonder.bez.map((r) => (r.beyondHorizon ? null : r.woning)),
    )
  })

  it('(2b) opeet + Wanneer nodig, liquide nooit krap → start op de uiterste leeftijd, byte-identiek aan Vaste leeftijd 80', () => {
    const RUIM = 5_000_000
    const wn = kernelInput(housing('on_depletion'), RUIM)
    const vast80 = kernelInput(housing('fixed_age', { triggerAge: FALLBACK_AGE }), RUIM)
    const pWn = runKernelProjection(wn, { fireAge: FIRE_LEEFTIJD })
    const pVast = runKernelProjection(vast80, { fireAge: FIRE_LEEFTIJD })
    expect(eersteOpnameMaand(pWn)).toBe(mAt(FALLBACK_AGE))
    expect(opnameSerie(pWn)).toEqual(opnameSerie(pVast))
  })

  it('(2c) Verkopen: opeetTrigger is inert — beide verkoop-triggers ongewijzigd', () => {
    for (const trigger of ['fixed_age', 'on_depletion'] as const) {
      const basis = kernelInput({
        mode: 'downsize', trigger, triggerAge: TRIGGER_AGE, fallbackAge: FALLBACK_AGE,
        depletionThresholdYears: 2, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null,
      })
      expect(basis.woning.selector).toBe('Verkopen')
      const geforceerd: KernelInput = { ...basis, woning: { ...basis.woning, opeetTrigger: 'Wanneer nodig' } }
      const pBasis = runKernelProjection(basis, { fireAge: FIRE_LEEFTIJD })
      const pForce = runKernelProjection(geforceerd, { fireAge: FIRE_LEEFTIJD })
      const woningen = (p: KernelProjection) => p.bez.map((r) => (r.beyondHorizon ? null : r.woning))
      expect(woningen(pForce)).toEqual(woningen(pBasis))
      expect(opnameSerie(pBasis).every((v) => v === 0)).toBe(true)
      // De verkoop zelf vindt plaats (vaste leeftijd op 67; wanneer nodig ergens vóór 80).
      const verkoopmaand = pBasis.bez.findIndex((r) => !r.beyondHorizon && r.woning.verkocht === 1)
      expect(verkoopmaand).toBeGreaterThan(0)
      if (trigger === 'fixed_age') expect(verkoopmaand).toBe(mAt(TRIGGER_AGE))
      else expect(verkoopmaand).toBeLessThanOrEqual(mAt(FALLBACK_AGE))
    }
  })
})
