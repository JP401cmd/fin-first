import { describe, it, expect } from 'vitest'
import { isStrategieKey, strategieHref } from './strategie-route'

describe('strategie-route — levensstrategieën wonen in katern Instellingen', () => {
  it('strategieHref wijst naar /toekomst/instellingen', () => {
    expect(strategieHref('pensioen')).toBe('/toekomst/instellingen?rij=pensioen')
  })

  it('isStrategieKey kent precies de vier strategieën', () => {
    for (const k of ['aow', 'pensioen', 'huis', 'werk']) expect(isStrategieKey(k)).toBe(true)
    for (const k of ['open', '', undefined, 'AOW']) expect(isStrategieKey(k)).toBe(false)
  })
})
