import { describe, it, expect } from 'vitest'
import { buildPersonaInput, DEFAULT_PARAMS } from '@/app/(app)/beheer/horizon-tabellen/persona'
import { runHorizonLedger, buildChartSeries } from '@/lib/horizon-engine'

// Bewaakt de data-keten van de beheer-inspector (/beheer/horizon-tabellen):
// persona → buildPersonaInput → runHorizonLedger → buildChartSeries.

describe('horizon-tabellen persona (werkende grafiek)', () => {
  it('levert een bereikbaar FIRE-snijpunt op de voorbeelddata', () => {
    const r = runHorizonLedger(buildPersonaInput(DEFAULT_PARAMS))
    expect(r.fireReachable).toBe(true)
    expect(r.fireAge).not.toBeNull()
  })

  it('grafiek: V_op stijgt in de opbouw en V_nodig daalt', () => {
    const s = buildChartSeries(runHorizonLedger(buildPersonaInput(DEFAULT_PARAMS)))
    expect(s.vOp[5]).toBeGreaterThan(s.vOp[0]) // stijgt tijdens de opbouw
    expect(s.vNodig[s.vNodig.length - 1]).toBeLessThan(s.vNodig[0]) // V_nodig daalt
  })
})
