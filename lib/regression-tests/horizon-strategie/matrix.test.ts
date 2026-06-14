/**
 * Regressietest: horizon-grafiek × strategie-combinaties op de complete persona.
 *
 * Dit is de "verwachting vanuit de testsuite": draait de productie-engine (v2)
 * over alle 12 strategie-combinaties en eist dat élke combinatie binnen de
 * golden-marges (vrijheidsleeftijd ±0,5 jr, doelbedrag ±2%) blijft én alle
 * structurele/relationele invarianten haalt. Drift in een rekenmotor → rood.
 *
 * Golden-waarden staan in matrix.ts (EXPECTED). Regenereer ze bewust na een
 * gewenste rekenmotor-wijziging (zie de GENERATED:GOLDEN-blok-instructie daar).
 */
import { describe, it, expect } from 'vitest'
import { runHorizonStrategyMatrix, COMBOS, type ComboResult, type MatrixResult } from './matrix'

function allCombos(m: MatrixResult): ComboResult[] {
  return m.groups.flatMap((g) => g.combos)
}
function failedChecks(c: ComboResult): string[] {
  return c.checks.filter((ch) => !ch.pass).map((ch) => `${ch.name} — ${ch.detail}`)
}

describe('horizon-strategie regressiematrix', () => {
  const result = runHorizonStrategyMatrix()

  it('draait alle 12 combinaties', () => {
    expect(allCombos(result)).toHaveLength(COMBOS.length)
    expect(result.summary.total).toBe(COMBOS.length)
  })

  it('elke combinatie slaagt (golden + invarianten)', () => {
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

  it('is deterministisch (twee runs identieke uitkomsten)', () => {
    const a = runHorizonStrategyMatrix()
    const b = runHorizonStrategyMatrix()
    const pick = (m: MatrixResult) =>
      allCombos(m).map((c) => ({
        id: c.id,
        fire: c.actual.fireAgeFractional,
        doel: c.actual.requiredFirePortfolio,
        target: c.actual.targetEndPortfolio,
      }))
    expect(pick(a)).toEqual(pick(b))
  })

  it('alle combinaties zijn FIRE-bereikbaar op de complete persona', () => {
    const unreachable = allCombos(result).filter((c) => !c.actual.fireReachable)
    expect(unreachable.map((c) => c.id)).toEqual([])
  })
})
