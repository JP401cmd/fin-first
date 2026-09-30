import { describe, expect, it } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { maakNepClient } from '@/lib/krant/nep-client.fixture'
import { zetProductPreset } from './product-preset'

/**
 * Het gedeelde schrijfpad van de productpreset (Krant 2C, ADR 0192): PUT
 * /api/modules en de auth-callback. Borgt: beide kolommen in één update op de
 * eigen rij; `alleenVersAccount` raakt een account met afgeronde onboarding niet.
 */

function nep() {
  return maakNepClient({
    profiles: [
      { id: 'vers', onboarding_completed: false, active_modules: null, home_screen: 'overzicht' },
      { id: 'klaar', onboarding_completed: true, active_modules: null, home_screen: 'budget' },
    ],
  })
}

describe('zetProductPreset', () => {
  it('krant: beide kolommen, alleen de eigen rij', async () => {
    const n = nep()
    expect(await zetProductPreset(n.client as never, 'klaar', 'krant')).toEqual({ modules: ['nieuws'], homeScreen: 'nieuws', gezet: true })
    expect(n.rijen('profiles')[1]).toMatchObject({ active_modules: ['nieuws'], home_screen: 'nieuws' })
    expect(n.rijen('profiles')[0]).toMatchObject({ active_modules: null, home_screen: 'overzicht' })
  })

  it('geheel: alle modules in catalogusvolgorde, als verse array', async () => {
    const n = nep()
    const uit = await zetProductPreset(n.client as never, 'vers', 'geheel')
    expect(uit.modules).toEqual([...ALL_MODULES])
    expect(uit.modules).not.toBe(ALL_MODULES)
  })

  it('alleenVersAccount: vers → gezet; afgeronde onboarding → niets geraakt', async () => {
    const n = nep()
    expect((await zetProductPreset(n.client as never, 'vers', 'krant', { alleenVersAccount: true })).gezet).toBe(true)
    expect((await zetProductPreset(n.client as never, 'klaar', 'krant', { alleenVersAccount: true })).gezet).toBe(false)
    expect(n.rijen('profiles')[1]).toMatchObject({ active_modules: null, home_screen: 'budget' })
  })

  it('een DB-fout gooit (de route maakt er een generieke 500 van)', async () => {
    const n = maakNepClient({ profiles: [] }, { fouten: { 'profiles:update': 'check violation' } })
    await expect(zetProductPreset(n.client as never, 'x', 'krant')).rejects.toMatchObject({ message: 'check violation' })
  })
})
