import { describe, expect, it } from 'vitest'
import { KLOK_MARGE_MS, leesvensterTotEnMet } from './leesvenster'

describe('leesvensterTotEnMet', () => {
  const nu = new Date('2026-09-29T10:00:00.000Z')

  it('reikt tot nu plus de klokmarge', () => {
    expect(leesvensterTotEnMet(nu)).toBe('2026-09-29T10:05:00.000Z')
    expect(Date.parse(leesvensterTotEnMet(nu)) - nu.getTime()).toBe(KLOK_MARGE_MS)
  })

  it('een regel van zojuist valt erbinnen, ook als de database een paar tellen voorloopt', () => {
    const net = '2026-09-29T10:00:03.000Z'
    expect(net <= leesvensterTotEnMet(nu)).toBe(true)
  })

  it('een rij met een datum in de toekomst valt erbuiten', () => {
    for (const later of ['2026-09-29T10:06:00.000Z', '2026-09-30T00:00:00.000Z', '2099-01-01T00:00:00.000Z']) {
      expect(later <= leesvensterTotEnMet(nu)).toBe(false)
    }
  })

  it('de marge is klein: minuten, geen uren', () => {
    expect(KLOK_MARGE_MS).toBeLessThanOrEqual(10 * 60 * 1000)
  })
})
