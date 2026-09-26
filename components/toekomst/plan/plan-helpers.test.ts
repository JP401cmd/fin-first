import { describe, it, expect } from 'vitest'
import { FIRE_DOEL_ONDERSCHRIFT } from '@/lib/horizon/fire-doel-weergave'
import { ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT } from '@/lib/horizon/anker-copy'
import { doelbedragOnderschrift } from './plan-helpers'

/**
 * KPI 2 (Doelbedrag) — het onderschrift noemt het huis alleen als er een huis is
 * (C3 punt 6). Zonder eigen woning zei de tegel "benodigd — met je huis": de
 * standaard-grondslag is incl-huis, ook als er geen huis bestaat.
 */
const basis = { isFixedAnchorMode: false, hasPerspectiveHero: false, heeftEigenHuis: true } as const

describe('doelbedragOnderschrift', () => {
  it('met een eigen woning: het onderschrift per grondslag', () => {
    expect(doelbedragOnderschrift({ ...basis, grondslag: 'incl-huis' })).toBe(FIRE_DOEL_ONDERSCHRIFT['incl-huis'])
    expect(doelbedragOnderschrift({ ...basis, grondslag: 'excl-huis' })).toBe(FIRE_DOEL_ONDERSCHRIFT['excl-huis'])
  })

  it('zonder eigen woning: "benodigd", geen huis-kwalificatie', () => {
    for (const grondslag of ['incl-huis', 'excl-huis'] as const) {
      const tekst = doelbedragOnderschrift({ ...basis, heeftEigenHuis: false, grondslag })
      expect(tekst).toBe('benodigd')
      expect(tekst).not.toMatch(/huis/)
    }
  })

  it('vast anker en huishoudweergave houden hun eigen onderschrift', () => {
    expect(doelbedragOnderschrift({ ...basis, isFixedAnchorMode: true, grondslag: 'incl-huis' })).toBe(
      ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
    )
    expect(doelbedragOnderschrift({ ...basis, hasPerspectiveHero: true, grondslag: 'incl-huis' })).toBe('benodigd')
  })
})
