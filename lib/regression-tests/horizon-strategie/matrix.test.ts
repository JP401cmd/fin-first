/**
 * Regressietest: horizon-grafiek × strategie-combinaties op de complete persona,
 * gemeten op de **horizon-kernel** (FASE 6, stap 5A — kernel-only).
 *
 * Draait per combinatie de horizon-kernel (`computeConvergentieProjection`). Elke
 * combinatie moet binnen de golden-marges (vrijheidsleeftijd ±0,5 jr, doelbedrag ±2%)
 * blijven en alle structurele/relationele invarianten halen. Drift in de rekenmotor → rood.
 *
 * Golden-waarden staan in matrix.ts (EXPECTED). Regenereer ze bewust na een gewenste
 * rekenmotor-wijziging (zie de GENERATED:GOLDEN-blok-instructie daar). De vroegere
 * v2-vergelijkarm (EXPECTED_V2) is met de v2-engine-deletie vervallen.
 */
import { describe, it, expect } from 'vitest'
import {
  runHorizonStrategyMatrix,
  COMBOS,
  type ComboResult,
  type MatrixResult,
} from './matrix'

function allCombos(m: MatrixResult): ComboResult[] {
  return m.groups.flatMap((g) => g.combos)
}
function failedChecks(c: ComboResult): string[] {
  return c.checks.filter((ch) => !ch.pass).map((ch) => `${ch.name} — ${ch.detail}`)
}

describe('horizon-strategie regressiematrix (kernel)', () => {
  const result = runHorizonStrategyMatrix()

  it('draait alle combinaties', () => {
    expect(allCombos(result)).toHaveLength(COMBOS.length)
    expect(result.summary.total).toBe(COMBOS.length)
  })

  it('elke combinatie slaagt (kernel-golden + invarianten)', () => {
    const failing = allCombos(result).filter((c) => c.status === 'fail')
    const detail = failing.map((c) => `${c.id}:\n  ${failedChecks(c).join('\n  ')}`).join('\n')
    expect(detail).toBe('')
    expect(result.summary.passed).toBe(COMBOS.length)
    expect(result.summary.failed).toBe(0)
  })

  // Per-combinatie test voor granulaire rapportage in CI.
  for (const combo of COMBOS) {
    it(`${combo.id} — ${combo.label}: alle checks groen`, () => {
      const r = allCombos(result).find((c) => c.id === combo.id)
      expect(r).toBeDefined()
      expect(failedChecks(r!)).toEqual([])
    })
  }

  // NB: één verse run tegen de reeds-berekende describe-`result` (i.p.v. twee nieuwe
  // runs) — de kernel-bisectie (16× solveFire × ~1200 maanden) is duur; twee extra
  // volledige matrices overschreden de 5s-default. Ruime testTimeout voor de zekerheid.
  it('is deterministisch (verse run == describe-run)', () => {
    const b = runHorizonStrategyMatrix()
    const pick = (m: MatrixResult) =>
      allCombos(m).map((c) => ({
        id: c.id,
        fire: c.actual.fireAgeFractional,
        doel: c.actual.requiredFirePortfolio,
        target: c.actual.targetEndPortfolio,
      }))
    expect(pick(b)).toEqual(pick(result))
  }, 20000)

  it('alle combinaties zijn FIRE-bereikbaar op de complete persona', () => {
    const unreachable = allCombos(result).filter((c) => !c.actual.fireReachable)
    expect(unreachable.map((c) => c.id)).toEqual([])
  })
})
