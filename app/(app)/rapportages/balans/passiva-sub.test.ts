import { describe, it, expect } from 'vitest'
import { passivaSubLabel } from './passiva-sub'

describe('passivaSubLabel — bijschrift Passiva-tegel (bevinding M30)', () => {
  it('noemt eigen vermogen naast het aantal schulden', () => {
    expect(passivaSubLabel(12)).toBe('12 schulden + eigen vermogen')
  })

  it('gebruikt enkelvoud bij één schuldpost', () => {
    expect(passivaSubLabel(1)).toBe('1 schuld + eigen vermogen')
  })

  it('laat het schuldendeel weg zonder schuldposten', () => {
    expect(passivaSubLabel(0)).toBe('eigen vermogen')
  })

  // Kern van M30: het bijschrift mag nooit uitsluitend "{n} schulden" zijn — dan
  // leest het volledige passiva-bedrag als schuld, terwijl het ook eigen vermogen bevat.
  it.each([0, 1, 2, 12, 99])('vermeldt altijd eigen vermogen (n=%i)', (n) => {
    expect(passivaSubLabel(n)).toContain('eigen vermogen')
    expect(passivaSubLabel(n)).not.toMatch(/^\d+ schuld(en)?$/)
  })
})
