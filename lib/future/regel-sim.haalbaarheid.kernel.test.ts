/**
 * Verschilregel zonder vrijheidsleeftijd op ECHTE kernel-runs (extend-feature 27 sep 2026).
 *
 * Pint drie dingen die de pure footer-test niet kan zien:
 *  1. `runRegelProjection` geeft `kernelStatus` (P!B93) en `maandHint` (P!B96) van DEZELFDE
 *     run door — byte-gelijk aan `computeConvergentieProjection`, de bron die ook de
 *     plan-melding "Plan nog niet haalbaar" voedt (`kernelMaandHint`). Geen tweede run.
 *  2. Een onhaalbaar plan (zo vroeg mogelijk) heeft géén vrijheidsleeftijd en wél een
 *     positieve €/mnd-maatstaf; een lagere uitgave na pensioen verkleint die.
 *  3. Een vast anker mét tekort heeft wél een leeftijd (het stopmoment) maar een
 *     tekort-status — de footer mag daar nooit "wordt haalbaar" zeggen.
 */
import { describe, expect, it } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { computeConvergentieProjection, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { isTekortStatus } from '@/lib/horizon-kernel/solver'
import { fireFooterEffect, piekInWeergave } from '@/components/future/regels/shared'
import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'
import { factorAtAge } from '@/lib/euro-display'
import { runRegelProjection, type RegelSimSnapshot } from './regel-sim'

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

/**
 * Een structureel tekort terwijl je werkt (€ 1.000 in, € 3.000 uit, geen bezit): zelfs nooit
 * stoppen haalt de eindleeftijd niet (P!B38 < 0 op de horizon) → `unreachable_within_horizon`
 * met een POSITIEVE P!B96. Dit is de klasse waarvoor de kern een maandtekort levert; zie de
 * laatste test voor de klasse zonder maatstaf.
 */
const INKOMEN = 1_000
const UITGAVEN = 3_000

function snapshot(extra: Partial<ConvergentieRawProfileRow> = {}): RegelSimSnapshot {
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(PINNED_AGE),
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    retirement_expense_method: 'custom_amount',
    retirement_expense_custom_amount: 40_000,
    net_monthly_income: INKOMEN,
    estimated_monthly_expenses: UITGAVEN,
    ...extra,
  }
  return {
    rawContext: {
      profile,
      assets: fx.assets.map((a) => ({ ...a, current_value: 0 })),
      debts: fx.debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
    },
  } as unknown as RegelSimSnapshot
}

describe('runRegelProjection — haalbaarheid uit dezelfde run', () => {
  const snap = snapshot()
  const basis = runRegelProjection(snap)

  it('geeft kernelStatus en maandHint byte-gelijk door (bron van de plan-melding)', () => {
    const direct = computeConvergentieProjection({ rawContext: snap.rawContext })
    if (!direct.ok) throw new Error('kernel faalde')
    expect(basis.kernelStatus).toBe(direct.kernelStatus)
    expect(basis.maandHint).toBe(direct.kernelMaandHint)
  })

  it('een onhaalbaar plan: geen vrijheidsleeftijd, wél een positief maandtekort', () => {
    expect(basis.kernelStatus).toBe('unreachable_within_horizon')
    expect(basis.fireAgeFractional).toBeNull()
    expect(basis.maandHint).toBeGreaterThan(0)
  })

  it('iets meer inkomen, nog steeds onhaalbaar → tekort A → B, B kleiner', () => {
    const draft = runRegelProjection(snap, { cashflow: { monthlyIncome: INKOMEN + 300, monthlyExpenses: UITGAVEN } })
    expect(draft.fireAgeFractional).toBeNull()
    const e = fireFooterEffect(basis, draft)
    expect(e).toEqual({ kind: 'tekort', van: Math.round(basis.maandHint!), naar: Math.round(draft.maandHint!) })
    if (e.kind === 'tekort') expect(e.naar).toBeLessThan(e.van)
  })

  it('genoeg inkomen → wordt haalbaar met de vrijheidsleeftijd van het concept', () => {
    const draft = runRegelProjection(snap, { cashflow: { monthlyIncome: UITGAVEN + 1_500, monthlyExpenses: UITGAVEN } })
    expect(draft.fireAgeFractional).not.toBeNull()
    expect(isTekortStatus(draft.kernelStatus)).toBe(false)
    expect(fireFooterEffect(basis, draft)).toEqual({ kind: 'wordt-haalbaar', leeftijd: draft.fireAgeFractional })
  })

  it('stopmoment "op mijn AOW-leeftijd" met tekort: een leeftijd (het anker), nooit "wordt haalbaar"', () => {
    const draft = runRegelProjection(snap, {
      firePlan: { anchor: 'aow', stopAge: null, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    expect(draft.fireAgeFractional).not.toBeNull()
    expect(isTekortStatus(draft.kernelStatus)).toBe(true)
    expect(fireFooterEffect(basis, draft)).toEqual({
      kind: 'tekort',
      van: Math.round(basis.maandHint!),
      naar: Math.round(draft.maandHint!),
    })
  })

  describe('ADR 0149-klasse: onhaalbaar door een blijvende tekort-lening (geen P!B96)', () => {
    // € 2.000 in, € 2.600 uit, "geen tekort-lening in mijn plan" aan: de gap op de horizon is
    // ≥ 0 (AOW lost de lening later af), dus P!B96 ≤ 0 — de kern levert hier geen maandtekort,
    // wél een tekort-lening met een piek (het getal dat de melding op Plan noemt).
    const s = snapshot({ net_monthly_income: 2_000, estimated_monthly_expenses: 2_600, fire_no_deficit_loan: true })
    const b = runRegelProjection(s)

    it('de run: niet haalbaar, P!B96 ≤ 0, wél een leningpiek uit de melding-detector', () => {
      expect(b.kernelStatus).toBe('unreachable_within_horizon')
      expect(b.maandHint).toBeLessThanOrEqual(0)
      const direct = computeConvergentieProjection({ rawContext: s.rawContext })
      if (!direct.ok) throw new Error('kernel faalde')
      // Exact de melding op Plan: detector op de kernelrijen met de kernel-eindleeftijd.
      const notice = detectDeficitLoanFromRows(direct.result.rows, { endAge: direct.result.displayEndAge })
      expect(notice).not.toBeNull()
      expect(b.tekortLening).toEqual({
        piek: notice!.peak,
        leeftijd: notice!.peakAge,
        inflationFactor: factorAtAge(direct.result.rows, notice!.peakAge),
      })
    })

    it('minder tekort per maand → de piek vóór → ná, kleiner', () => {
      const d = runRegelProjection(s, { cashflow: { monthlyIncome: 2_200, monthlyExpenses: 2_600 } })
      expect(d.fireAgeFractional).toBeNull()
      expect(d.maandHint).toBeLessThanOrEqual(0)
      const e = fireFooterEffect(b, d)
      expect(e.kind).toBe('tekort-lening')
      if (e.kind !== 'tekort-lening') return
      expect(e.van).toEqual({ nominaal: b.tekortLening!.piek, inflationFactor: b.tekortLening!.inflationFactor })
      expect(piekInWeergave(e.naar, 'real')).toBeLessThan(piekInWeergave(e.van, 'real'))
    })

    it('omslag: tegenover een run mét P!B96 valt de vergelijking terug op de piek van beide', () => {
      expect(basis.tekortLening).not.toBeNull()
      const e = fireFooterEffect(b, basis)
      expect(e.kind).toBe('tekort-lening')
    })

    it('rest-klasse: onhaalbaar zonder P!B96 én zonder aanhoudende lening → eerlijk onbekend', () => {
      // € 2.300 in: nog steeds niet haalbaar, maar de detector van de melding ziet geen
      // aanhoudende tekort-lening (zelfherstellend of geen) — er is geen maatstaf.
      const d = runRegelProjection(s, { cashflow: { monthlyIncome: 2_300, monthlyExpenses: 2_600 } })
      expect(d.fireAgeFractional).toBeNull()
      expect(d.tekortLening).toBeNull()
      expect(fireFooterEffect(b, d)).toEqual({ kind: 'onbekend' })
    })

    it('basis haalbaar, concept in deze klasse → wordt niet haalbaar met de piek', () => {
      const haalbareBasis = runRegelProjection(snapshot({ net_monthly_income: 4_500, estimated_monthly_expenses: 2_600 }))
      expect(isTekortStatus(haalbareBasis.kernelStatus)).toBe(false)
      expect(haalbareBasis.fireAgeFractional).not.toBeNull()
      expect(fireFooterEffect(haalbareBasis, b)).toEqual({
        kind: 'wordt-niet-haalbaar',
        maat: { soort: 'lening', piek: { nominaal: b.tekortLening!.piek, inflationFactor: b.tekortLening!.inflationFactor } },
      })
    })
  })

  it('basis haalbaar, concept onhaalbaar met P!B96 → wordt niet haalbaar · tekort per maand', () => {
    const haalbareBasis = runRegelProjection(snapshot({ net_monthly_income: 4_500, estimated_monthly_expenses: 2_600 }))
    expect(haalbareBasis.fireAgeFractional).not.toBeNull()
    expect(fireFooterEffect(haalbareBasis, basis)).toEqual({
      kind: 'wordt-niet-haalbaar',
      maat: { soort: 'maand', euro: Math.round(basis.maandHint!) },
    })
  })
})
