/**
 * Roadmap M — flex-spending (must/nice-split) in tabel **Ont** (ADR 0042).
 *
 * Deterministische unit-tests van de `computeOnt`-mechaniek buiten het parity-domein:
 *  - vlag UIT → byte-identiek aan de hele-term-factor (Excel-oracle-pad);
 *  - vlag AAN + nice-fractie 1 → identiek aan de hele-term-factor (dus inert);
 *  - vlag AAN + nice-fractie 0 → must-only (factor raakt de uitgave nooit);
 *  - tussenwaarde → alléén het nice-deel beweegt, must staat vast;
 *  - `flexNiceCutStep` → dieper snijden op nice bij een guardrails-dip;
 *  - regime-richting: negatieve shift (dip) verlaagt de nice-onttrekking; een
 *    positieve shift (raise) laat het must-deel onaangeroerd.
 *
 * De byte-parity van het Excel-oracle (vlag UIT) wordt bewaakt door
 * `test/horizon-oracle/parity-ont.test.ts`; deze suite bewijst de nieuwe tak.
 */

import { describe, expect, it } from 'vitest'
import { computeOnt, type OntDep } from './ont'
import type { KernelInput, MonthIndex, Onttrekkingsprofiel } from '../types'

// ── Minimale KernelInput: computeOnt leest alléén startLeeftijd/inflatie/
//    onttrekkingsprofiel/inkomenUitgaven (zie scaffold + computeOnt). Cast is veilig. ──
interface InputOver {
  profiel: Onttrekkingsprofiel
  startLeeftijd?: number
  uitgaveNaPensioenPerJaar?: number
  flexNiceOnly?: boolean
  flexNiceFractiePerJaar?: number
  flexNiceCutStep?: number
}

function makeInput(over: InputOver): KernelInput {
  return {
    startLeeftijd: over.startLeeftijd ?? 40,
    inflatie: 0, // index = 1 → baseTerm = uitgave/12, ongeacht m
    onttrekkingsprofiel: {
      profiel: over.profiel,
      fase1TotLeeftijd: 75,
      factor1Pct: 100,
      fase2TotLeeftijd: 85,
      factor2Pct: 85,
      factor3Pct: 70,
      guardrailFloor: 0.8,
      guardrailCeiling: 1.2,
      guardrailOnderdrempelRatio: 0.8,
      guardrailBovendrempelRatio: 1.2,
      guardrailStap: 0.1,
    },
    inkomenUitgaven: {
      nettoJaarinkomen: 0,
      nettoJaaruitgaven: 0,
      uitgaveNaPensioenPerJaar: over.uitgaveNaPensioenPerJaar ?? 24_000,
      flexNiceOnly: over.flexNiceOnly,
      flexNiceFractiePerJaar: over.flexNiceFractiePerJaar,
      flexNiceCutStep: over.flexNiceCutStep,
    },
  } as unknown as KernelInput
}

/** Regime via de guardrails-ratio liquide/anker: dip (<0,8), neutraal, raise (>1,2). */
type Regime = 'dip' | 'neutraal' | 'raise'
function makeDep(regime: Regime): OntDep {
  const anker = 1_000
  const liquide = regime === 'dip' ? 500 : regime === 'raise' ? 1_500 : 1_000
  return {
    fireMaand: 0,
    guardrailsAnker: anker,
    liquideNettoVorigeMaand: liquide,
    huurNaVerkoop: 0,
    vervallenHypotheeklast: 0,
    box3VorigeMaand: 0,
    partnerTotaal: 0,
  }
}

const M: MonthIndex = 12 // leeftijd 41 (in-horizon, ná fireMaand 0), index = 1
const BASE = 24_000 / 12 // = 2000 €/mnd bij inflatie 0

describe('Ont · roadmap M flex-spending (must/nice-split)', () => {
  it('vlag UIT → hele-term-factor (Excel-oracle-pad), per profiel', () => {
    // Vast: factor 1.
    expect(computeOnt(makeInput({ profiel: 'Vast' }), makeDep('dip'), M).onttrekking).toBeCloseTo(BASE, 6)
    // Guardrails-dip: factor MAX(0,8; 0,9) = 0,9.
    expect(
      computeOnt(makeInput({ profiel: 'Guardrails' }), makeDep('dip'), M).onttrekking,
    ).toBeCloseTo(BASE * 0.9, 6)
    // Afnemend op leeftijd 81 (slow-go) → factor2 85%.
    expect(
      computeOnt(makeInput({ profiel: 'Afnemend', startLeeftijd: 80 }), makeDep('neutraal'), M)
        .onttrekking,
    ).toBeCloseTo(BASE * 0.85, 6)
  })

  it('vlag AAN + nice-fractie 1 → identiek aan de hele-term-factor (inert)', () => {
    const off = computeOnt(makeInput({ profiel: 'Guardrails' }), makeDep('dip'), M).onttrekking
    const on = computeOnt(
      makeInput({ profiel: 'Guardrails', flexNiceOnly: true, flexNiceFractiePerJaar: 1 }),
      makeDep('dip'),
      M,
    ).onttrekking
    expect(on).toBeCloseTo(off, 9)
    expect(on).toBeCloseTo(BASE * 0.9, 6)
  })

  it('vlag AAN + nice-fractie 0 → must-only (factor raakt de uitgave nooit)', () => {
    const on = computeOnt(
      makeInput({ profiel: 'Guardrails', flexNiceOnly: true, flexNiceFractiePerJaar: 0 }),
      makeDep('dip'),
      M,
    ).onttrekking
    expect(on).toBeCloseTo(BASE, 6) // volledige must, ongefactord
  })

  it('tussenwaarde (0,5) → alléén nice beweegt, must staat vast (Guardrails-dip)', () => {
    const on = computeOnt(
      makeInput({ profiel: 'Guardrails', flexNiceOnly: true, flexNiceFractiePerJaar: 0.5 }),
      makeDep('dip'),
      M,
    ).onttrekking
    // must = 2000·0,5 = 1000 (vast); nice = 2000·0,5·0,9 = 900 → 1900.
    expect(on).toBeCloseTo(1_900, 6)
    // Ligt strikt tussen must-only (2000) en hele-term-factor (1800).
    expect(on).toBeGreaterThan(BASE * 0.9)
    expect(on).toBeLessThan(BASE)
  })

  it('flexNiceCutStep → dieper snijden op nice bij een guardrails-dip', () => {
    const on = computeOnt(
      makeInput({
        profiel: 'Guardrails',
        flexNiceOnly: true,
        flexNiceFractiePerJaar: 0.5,
        flexNiceCutStep: 0.6, // ProjectionLab-conventie: nice ×0,4
      }),
      makeDep('dip'),
      M,
    ).onttrekking
    // must 1000 + nice 2000·0,5·0,4 = 400 → 1400 (dieper dan de 1900 zonder cut-step).
    expect(on).toBeCloseTo(1_400, 6)
  })

  it('cut-step raakt alleen de DIP, niet de raise/neutraal', () => {
    const mk = (regime: Regime) =>
      computeOnt(
        makeInput({
          profiel: 'Guardrails',
          flexNiceOnly: true,
          flexNiceFractiePerJaar: 0.5,
          flexNiceCutStep: 0.6,
        }),
        makeDep(regime),
        M,
      ).onttrekking
    // raise: guardrailsFactor 1,1 ≥ 1 → cut-step inert → must 1000 + nice 2000·0,5·1,1 = 1100 → 2100.
    expect(mk('raise')).toBeCloseTo(2_100, 6)
    // neutraal: factor 1 → must 1000 + nice 1000 → 2000.
    expect(mk('neutraal')).toBeCloseTo(2_000, 6)
    // dip: 1400 (zie vorige test).
    expect(mk('dip')).toBeCloseTo(1_400, 6)
  })

  it('cut-step is inert buiten het Guardrails-profiel', () => {
    // Vast: factor 1, guardrailsFactor irrelevant → must 1000 + nice 1000 → 2000.
    const on = computeOnt(
      makeInput({
        profiel: 'Vast',
        flexNiceOnly: true,
        flexNiceFractiePerJaar: 0.5,
        flexNiceCutStep: 0.6,
      }),
      makeDep('dip'),
      M,
    ).onttrekking
    expect(on).toBeCloseTo(2_000, 6)
  })

  it('richting: negatieve shift (dip) verlaagt de onttrekking; must-deel invariant tussen regimes', () => {
    const input = makeInput({
      profiel: 'Guardrails',
      flexNiceOnly: true,
      flexNiceFractiePerJaar: 0.5,
    })
    const dip = computeOnt(input, makeDep('dip'), M).onttrekking // 1900
    const neutraal = computeOnt(input, makeDep('neutraal'), M).onttrekking // 2000
    const raise = computeOnt(input, makeDep('raise'), M).onttrekking // 2100
    // Negatieve shift → lagere onttrekking (nice geknepen); positieve → hogere.
    expect(dip).toBeLessThan(neutraal)
    expect(raise).toBeGreaterThan(neutraal)
    // Het must-deel (baseTerm·(1−nice) = 1000) is per regime identiek: het verschil
    // tussen twee regimes zit VOLLEDIG in het nice-deel (2000·0,5·Δfactor).
    const mustDeel = BASE * (1 - 0.5)
    expect(dip - BASE * 0.5 * 0.9).toBeCloseTo(mustDeel, 6)
    expect(raise - BASE * 0.5 * 1.1).toBeCloseTo(mustDeel, 6)
    expect(neutraal - BASE * 0.5 * 1.0).toBeCloseTo(mustDeel, 6)
  })

  it('vóór de FIRE-maand blijft de onttrekking 0 (vlag verandert de gate niet)', () => {
    const input = makeInput({ profiel: 'Guardrails', flexNiceOnly: true, flexNiceFractiePerJaar: 0.5 })
    const dep: OntDep = { ...makeDep('dip'), fireMaand: 24 }
    expect(computeOnt(input, dep, M).onttrekking).toBe(0)
  })
})
