/**
 * Regressietest: horizon-grafiek × strategie-combinaties op de complete persona,
 * gemeten op de **horizon-kernel** (FASE 6, stap 2).
 *
 * Dit is de "verwachting vanuit de testsuite": draait per combinatie de horizon-kernel
 * (primair, via `computeConvergentieProjection({ kernelEnabled: true })`) én — voor de
 * v2-uitdrukbare combinaties — de v2-grootboek-engine (vergelijk, drift-bewaking). Elke
 * combinatie moet binnen de kernel-golden-marges (vrijheidsleeftijd ±0,5 jr, doelbedrag
 * ±2%) blijven, alle structurele/relationele invarianten halen, DAADWERKELIJK op de
 * kernel draaien (geen stille v2-terugval) én — waar van toepassing — de v2-goldens
 * halen. Drift in een rekenmotor → rood.
 *
 * Golden-waarden staan in matrix.ts (EXPECTED = kernel, EXPECTED_V2 = v2). Regenereer ze
 * bewust na een gewenste rekenmotor-wijziging (zie de GENERATED:GOLDEN-blok-instructie daar).
 */
import { describe, it, expect } from 'vitest'
import {
  runHorizonStrategyMatrix,
  COMBOS,
  isV2Expressible,
  type ComboResult,
  type MatrixResult,
} from './matrix'

function allCombos(m: MatrixResult): ComboResult[] {
  return m.groups.flatMap((g) => g.combos)
}
function failedChecks(c: ComboResult): string[] {
  return c.checks.filter((ch) => !ch.pass).map((ch) => `${ch.name} — ${ch.detail}`)
}

describe('horizon-strategie regressiematrix (kernel-primair)', () => {
  const result = runHorizonStrategyMatrix()

  it('draait alle combinaties', () => {
    expect(allCombos(result)).toHaveLength(COMBOS.length)
    expect(result.summary.total).toBe(COMBOS.length)
  })

  it('elke combinatie slaagt (kernel-golden + invarianten + v2-drift)', () => {
    const failing = allCombos(result).filter((c) => c.status === 'fail')
    const detail = failing.map((c) => `${c.id}:\n  ${failedChecks(c).join('\n  ')}`).join('\n')
    expect(detail).toBe('')
    expect(result.summary.passed).toBe(COMBOS.length)
    expect(result.summary.failed).toBe(0)
  })

  it('elke combinatie draait op de kernel (geen stille v2-terugval)', () => {
    const fellBack = allCombos(result).filter((c) => c.engine !== 'kernel' || c.fallbackReason)
    const detail = fellBack.map((c) => `${c.id}: engine=${c.engine} — ${c.fallbackReason ?? '—'}`).join('\n')
    expect(detail).toBe('')
  })

  // Per-combinatie test voor granulaire rapportage in CI.
  for (const combo of COMBOS) {
    it(`${combo.id} — ${combo.label}: alle checks groen`, () => {
      const r = allCombos(result).find((c) => c.id === combo.id)
      expect(r).toBeDefined()
      expect(failedChecks(r!)).toEqual([])
    })
  }

  it('kernel-only combinaties (afnemend/oplopend) dragen géén v2-vergelijkarm', () => {
    const kernelOnly = allCombos(result).filter((c) => c.kernelOnly)
    expect(kernelOnly.map((c) => c.id).sort()).toEqual(['C-afnemend', 'C-oplopend'])
    for (const c of kernelOnly) {
      expect(c.v2Actual).toBeNull()
      expect(c.v2Expected).toBeNull()
    }
    // Spiegelbeeld: elke v2-uitdrukbare combinatie draagt wél een v2-arm.
    for (const c of allCombos(result).filter((c) => !c.kernelOnly)) {
      expect(isV2Expressible(COMBOS.find((x) => x.id === c.id)!)).toBe(true)
      expect(c.v2Actual).not.toBeNull()
    }
  })

  // NB: één verse run tegen de reeds-berekende describe-`result` (i.p.v. twee nieuwe
  // runs) — de kernel-bisectie (16× solveFire × ~1200 maanden) is duur; twee extra
  // volledige matrices overschreden de 5s-default. Ruime testTimeout voor de zekerheid.
  it('is deterministisch (verse run == describe-run)', () => {
    const b = runHorizonStrategyMatrix()
    const pick = (m: MatrixResult) =>
      allCombos(m).map((c) => ({
        id: c.id,
        engine: c.engine,
        fire: c.kernelActual.fireAgeFractional,
        doel: c.kernelActual.requiredFirePortfolio,
        target: c.kernelActual.targetEndPortfolio,
      }))
    expect(pick(b)).toEqual(pick(result))
  }, 20000)

  it('alle combinaties zijn FIRE-bereikbaar op de complete persona (kernel-arm)', () => {
    const unreachable = allCombos(result).filter((c) => !c.kernelActual.fireReachable)
    expect(unreachable.map((c) => c.id)).toEqual([])
  })
})
