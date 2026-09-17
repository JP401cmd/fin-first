import { describe, it, expect } from 'vitest'
import { isStrategieKey, resolveStrategieRedirect, strategieHref } from './strategie-route'

describe('strategie-route — levensstrategieën wonen op Voorkeuren', () => {
  it('strategieHref wijst naar /toekomst/voorkeuren', () => {
    expect(strategieHref('pensioen')).toBe('/toekomst/voorkeuren?strategie=pensioen')
  })

  it('isStrategieKey kent precies de vier strategieën', () => {
    for (const k of ['aow', 'pensioen', 'huis', 'werk']) expect(isStrategieKey(k)).toBe(true)
    for (const k of ['open', '', undefined, 'AOW']) expect(isStrategieKey(k)).toBe(false)
  })
})

describe('resolveStrategieRedirect — oude Gebeurtenissen-deeplink', () => {
  it('?strategie=aow → Voorkeuren', () => {
    expect(resolveStrategieRedirect({ strategie: 'aow' })).toBe('/toekomst/voorkeuren?strategie=aow')
  })

  it('behoudt overige query-params', () => {
    const target = resolveStrategieRedirect({ strategie: 'pensioen', via: 'box1', x: ['1', '2'] })
    expect(target?.startsWith('/toekomst/voorkeuren?')).toBe(true)
    const qs = new URLSearchParams(target!.split('?')[1])
    expect(qs.get('strategie')).toBe('pensioen')
    expect(qs.get('via')).toBe('box1')
    expect(qs.getAll('x')).toEqual(['1', '2'])
  })

  it('geen of ongeldige strategie → null (blijft op Gebeurtenissen)', () => {
    expect(resolveStrategieRedirect({})).toBeNull()
    expect(resolveStrategieRedirect({ nieuw: '1' })).toBeNull()
    expect(resolveStrategieRedirect({ strategie: 'open' })).toBeNull()
  })
})
