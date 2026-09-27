import { describe, it, expect } from 'vitest'
import { startLayoutTimer } from './layout-timer'

describe('startLayoutTimer', () => {
  it('eerste timer op de instantie is cold, daarna warm', () => {
    expect(startLayoutTimer().finish().cold).toBe(true)
    expect(startLayoutTimer().finish().cold).toBe(false)
  })

  it('stappen zijn niet-negatief en passen binnen het totaal; ontbrekende markers tellen als 0', () => {
    const timer = startLayoutTimer()
    timer.mark('auth')
    timer.mark('batch')
    const t = timer.finish()
    for (const v of [t.authMs, t.batchMs, t.leverMs, t.guideMs]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(t.totalMs)
    }
    expect(t.leverMs).toBe(0)
    expect(t.guideMs).toBe(0)
    expect(t.renderedAt).toBeGreaterThan(0)
  })
})
