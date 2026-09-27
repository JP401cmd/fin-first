import { describe, it, expect } from 'vitest'
import { isStrategieKey, strategieHref } from './strategie-route'

describe('strategie-route — levensstrategieën wonen in katern Plan', () => {
  it('strategieHref wijst naar /toekomst met de rij en het anker van het blok', () => {
    expect(strategieHref('pensioen')).toBe('/toekomst?rij=pensioen#levensstrategieen')
    expect(strategieHref('aow')).toBe('/toekomst?rij=aow#levensstrategieen')
  })

  it('isStrategieKey kent precies de vier strategieën', () => {
    for (const k of ['aow', 'pensioen', 'huis', 'werk']) expect(isStrategieKey(k)).toBe(true)
    for (const k of ['open', '', undefined, 'AOW']) expect(isStrategieKey(k)).toBe(false)
  })
})
