import { describe, expect, it } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { SAFE_REDIRECT_FALLBACK } from '@/lib/safe-redirect'
import { maakNepClient } from './nep-client.fixture'
import { KRANT_ONBOARDING_PAD, isKrantOnboardingPad, krantCallbackUrl } from './aanmelden-pad'
import {
  callbackBestemming,
  krantOnboardingNodig,
  krantOnboardingToegang,
  krantOnboardingToegangVoor,
  krantPresetToegestaan,
  onboardingPadVoor,
  productUitParam,
  stappenNaKlaar,
  isNetAangemaakt,
  zetKrantPresetBijAanmelden,
} from './aanmelden'
import { TIJDLIJN_BETA_OPEN } from './tijdlijn-beta'

/**
 * Krant 2C (ADR 0192) — aanmelden en onboarding achter de gesloten vlag.
 * De pure beslissingen krijgen de bèta-stand als argument, dus hier staan
 * beide vlagstanden; de lezers (die de constante gebruiken) worden getoetst op
 * de stand van vandaag (dicht → alleen de superadmin).
 */

describe('productUitParam — alleen de enum', () => {
  it('krant en geheel tellen, al het andere niet', () => {
    expect(productUitParam('krant')).toBe('krant')
    expect(productUitParam('geheel')).toBe('geheel')
    for (const ruw of [null, undefined, '', 'KRANT', 'budget', 'krant ', 'krant&x=1']) expect(productUitParam(ruw)).toBeNull()
  })
})

describe('krantPresetToegestaan — beide vlagstanden', () => {
  it.each([
    [false, true, true],
    [false, false, false],
    [true, true, false],
    [true, false, false],
  ])('onboardingCompleted=%s, inBeta=%s → %s', (onboardingCompleted, inBeta, verwacht) => {
    expect(krantPresetToegestaan({ onboardingCompleted, inBeta })).toBe(verwacht)
  })
})

describe('krantOnboardingNodig — volgt bepaalKrantBron', () => {
  it('alleen een Krant-account dat de tijdlijn leest', () => {
    expect(krantOnboardingNodig({ krantAccount: true, inBeta: true })).toBe(true)
    // Vlag dicht, geen superadmin: 'wacht' — geen Krant-onboarding.
    expect(krantOnboardingNodig({ krantAccount: true, inBeta: false })).toBe(false)
    expect(krantOnboardingNodig({ krantAccount: false, inBeta: true })).toBe(false)
    expect(krantOnboardingNodig({ krantAccount: false, inBeta: false })).toBe(false)
  })
})

describe('krantOnboardingToegangVoor — beide vlagstanden', () => {
  const krant = { active_modules: ['nieuws'], onboarding_completed: false }
  it('open voor een vers Krant-account binnen de bèta, afgerond als hij klaar is', () => {
    expect(krantOnboardingToegangVoor(krant, true)).toBe('open')
    expect(krantOnboardingToegangVoor({ ...krant, onboarding_completed: true }, true)).toBe('afgerond')
  })
  it('geen bij een dichte vlag, voor een Geheel-account en zonder rij', () => {
    expect(krantOnboardingToegangVoor(krant, false)).toBe('geen')
    expect(krantOnboardingToegangVoor({ active_modules: [...ALL_MODULES], onboarding_completed: false }, true)).toBe('geen')
    expect(krantOnboardingToegangVoor({ active_modules: null, onboarding_completed: false }, true)).toBe('geen')
    expect(krantOnboardingToegangVoor(null, true)).toBe('geen')
  })
})

describe('onboardingPadVoor — de omleidingen, vandaag (vlag dicht)', () => {
  it('superadmin met een Krant-account → Krant-onboarding', () => {
    expect(onboardingPadVoor({ role: 'superadmin', active_modules: ['nieuws'] })).toBe(KRANT_ONBOARDING_PAD)
  })
  it('gewone gebruiker met een Krant-account → gewone onboarding zolang de vlag dicht is', () => {
    expect(onboardingPadVoor({ role: 'user', active_modules: ['nieuws'] })).toBe(TIJDLIJN_BETA_OPEN ? KRANT_ONBOARDING_PAD : '/onboarding')
  })
  it('Geheel-account of geen moduleset → gewone onboarding, ook als superadmin', () => {
    expect(onboardingPadVoor({ role: 'superadmin', active_modules: [...ALL_MODULES] })).toBe('/onboarding')
    expect(onboardingPadVoor({ role: 'superadmin', active_modules: null })).toBe('/onboarding')
    expect(onboardingPadVoor(null)).toBe('/onboarding')
  })
})

describe('callbackBestemming', () => {
  it('Krant-onboarding alleen als de preset gezet is; anders de gewone landing', () => {
    expect(callbackBestemming(KRANT_ONBOARDING_PAD, true)).toBe(KRANT_ONBOARDING_PAD)
    expect(callbackBestemming(KRANT_ONBOARDING_PAD, false)).toBe(SAFE_REDIRECT_FALLBACK)
    expect(callbackBestemming('/overzicht', false)).toBe('/overzicht')
    expect(callbackBestemming('/check/activeren?token=x', false)).toBe('/check/activeren?token=x')
  })
})

describe('aanmelden-pad', () => {
  it('bouwt de callback-URL met next en product', () => {
    const url = new URL(krantCallbackUrl('https://app.test'))
    expect(url.pathname).toBe('/auth/callback')
    expect(url.searchParams.get('next')).toBe('/onboarding/krant')
    expect(url.searchParams.get('product')).toBe('krant')
  })
  it('herkent het pad als prefix op een segment', () => {
    expect(isKrantOnboardingPad('/onboarding/krant')).toBe(true)
    expect(isKrantOnboardingPad('/onboarding/krant?x=1')).toBe(true)
    expect(isKrantOnboardingPad('/onboarding/krantX')).toBe(false)
    expect(isKrantOnboardingPad('/onboarding')).toBe(false)
  })
})

describe('stappenNaKlaar — nooit identity', () => {
  it("voegt alleen 'krant' toe en houdt bestaande stappen", () => {
    expect(stappenNaKlaar(null)).toEqual(['krant'])
    expect(stappenNaKlaar([])).toEqual(['krant'])
    expect(stappenNaKlaar(['krant'])).toEqual(['krant'])
    expect(stappenNaKlaar(['welkom', 'krant'])).toEqual(['welkom', 'krant'])
    expect(stappenNaKlaar(['x', 3, null])).toEqual(['x', 'krant'])
    expect(stappenNaKlaar(null)).not.toContain('identity')
  })
})

const NU = new Date('2026-10-01T08:00:00Z')
const VERS = { aangemaaktOp: '2026-10-01T07:58:00Z', nu: NU }

describe('zetKrantPresetBijAanmelden — de callback op de eigen rij (vlag dicht)', () => {
  function nep(rij: Record<string, unknown>) {
    return maakNepClient({ profiles: [rij, { id: 'ander', role: 'superadmin', onboarding_completed: false, active_modules: null, home_screen: 'overzicht' }] })
  }

  it('vers account binnen de bèta (superadmin) → preset gezet, alleen op de eigen rij', async () => {
    const n = nep({ id: 'u1', role: 'superadmin', onboarding_completed: false, active_modules: null, home_screen: 'overzicht' })
    expect(await zetKrantPresetBijAanmelden(n.client as never, 'u1', VERS)).toBe(true)
    expect(n.rijen('profiles')[0]).toMatchObject({ active_modules: ['nieuws'], home_screen: 'nieuws' })
    expect(n.rijen('profiles')[1]).toMatchObject({ active_modules: null, home_screen: 'overzicht' })
    const update = n.queriesOp('profiles').find((q) => q.stappen.some((s) => s.m === 'update'))!
    expect(update.stappen).toContainEqual({ m: 'eq', args: ['id', 'u1'] })
    expect(update.stappen).toContainEqual({ m: 'eq', args: ['onboarding_completed', false] })
  })

  it('bestaand account (onboarding_completed = true) → niets', async () => {
    const n = nep({ id: 'u1', role: 'superadmin', onboarding_completed: true, active_modules: null, home_screen: 'overzicht' })
    expect(await zetKrantPresetBijAanmelden(n.client as never, 'u1', VERS)).toBe(false)
    expect(n.rijen('profiles')[0]).toMatchObject({ active_modules: null, home_screen: 'overzicht' })
    expect(n.queriesOp('profiles').some((q) => q.stappen.some((s) => s.m === 'update'))).toBe(false)
  })

  it('gewone gebruiker bij een dichte vlag → niets (gewone onboarding)', async () => {
    const n = nep({ id: 'u1', role: 'user', onboarding_completed: false, active_modules: null, home_screen: 'overzicht' })
    expect(await zetKrantPresetBijAanmelden(n.client as never, 'u1', VERS)).toBe(TIJDLIJN_BETA_OPEN)
    if (!TIJDLIJN_BETA_OPEN) expect(n.rijen('profiles')[0]).toMatchObject({ active_modules: null })
  })

  it('leesfout → niets (fail-closed)', async () => {
    const n = maakNepClient({ profiles: [] }, { fouten: { 'profiles:select': 'kapot' } })
    expect(await zetKrantPresetBijAanmelden(n.client as never, 'u1', VERS)).toBe(false)
  })
})

describe('krantOnboardingToegang — lezer op de eigen rij', () => {
  it('superadmin met Krant-account: open, en geen voor een ander of een leesfout', async () => {
    const n = maakNepClient({
      profiles: [
        { id: 'u1', role: 'superadmin', active_modules: ['nieuws'], onboarding_completed: false },
        { id: 'u2', role: 'superadmin', active_modules: null, onboarding_completed: false },
      ],
    })
    expect(await krantOnboardingToegang(n.client as never, 'u1')).toBe('open')
    expect(await krantOnboardingToegang(n.client as never, 'u2')).toBe('geen')
    const kapot = maakNepClient({}, { fouten: { 'profiles:select': 'kapot' } })
    expect(await krantOnboardingToegang(kapot.client as never, 'u1')).toBe('geen')
  })
})

// Security-run 0.92.28 (🟢-1): "vers" = ook net aangemaakt. Beide uiteinden en de randen.
describe('isNetAangemaakt en de preset bij een ouder account', () => {
  it('binnen 15 minuten ja; daarbuiten, zonder of met een onleesbaar moment nee', () => {
    expect(isNetAangemaakt('2026-10-01T07:45:00Z', NU)).toBe(true) // precies 15 min
    expect(isNetAangemaakt('2026-10-01T07:44:59Z', NU)).toBe(false)
    expect(isNetAangemaakt('2026-10-01T08:00:30Z', NU)).toBe(true) // kleine klokafwijking
    expect(isNetAangemaakt('2026-10-01T08:02:00Z', NU)).toBe(false)
    expect(isNetAangemaakt(null, NU)).toBe(false)
    expect(isNetAangemaakt('geen datum', NU)).toBe(false)
  })

  it('een ouder account met een onafgeronde onboarding wordt niet omgezet, ook niet binnen de bèta', async () => {
    const client = maakNepClient({ profiles: [{ id: 'u1', role: 'superadmin', onboarding_completed: false, active_modules: null, home_screen: 'overzicht' }] })
    expect(await zetKrantPresetBijAanmelden(client.client as never, 'u1', { aangemaaktOp: '2026-09-01T08:00:00Z', nu: NU })).toBe(false)
    expect(client.queriesOp('profiles')).toHaveLength(0)
  })
})

// Security-run 0.92.28 (🟡-1): een geblokkeerd account krijgt geen toegang, gelijk aan vereisBearer.
describe('krantOnboardingToegangVoor — geblokkeerd', () => {
  it('blocked_at gevuld → geen, ook voor een Krant-account binnen de bèta', () => {
    expect(krantOnboardingToegangVoor({ role: 'superadmin', active_modules: ['nieuws'], onboarding_completed: false, blocked_at: '2026-10-01T00:00:00Z' }, true)).toBe('geen')
    expect(krantOnboardingToegangVoor({ role: 'superadmin', active_modules: ['nieuws'], onboarding_completed: false, blocked_at: null }, true)).toBe('open')
  })
})

// Hertoets security 0.92.28: de omleiding van de layouts en de toegang van de
// Krant-onboarding zijn dezelfde toets — anders ontstaat een omleidingslus.
describe('invariant: onboardingPadVoor ⇔ toegang tot de Krant-onboarding (geen lus)', () => {
  it('voor elke combinatie van rol × modules × afgerond × geblokkeerd, bij een open én dichte vlag gelijk', () => {
    const rollen = ['user', 'superadmin', null]
    const modules: unknown[] = [['nieuws'], null, ['budgetteren', 'nieuws']]
    for (const role of rollen)
      for (const active_modules of modules)
        for (const onboarding_completed of [false, true])
          for (const blocked_at of [null, '2026-10-01T00:00:00Z']) {
            const p = { role, active_modules, onboarding_completed, blocked_at }
            const naarKrant = onboardingPadVoor(p) === KRANT_ONBOARDING_PAD
            const toegang = krantOnboardingToegangVoor(p, inTijdlijnBetaVoorTest(role)) !== 'geen'
            expect(naarKrant, JSON.stringify(p)).toBe(toegang)
          }
  })
})

/** De bèta-stand zoals inTijdlijnBeta hem bepaalt: de vlag, of de superadmin (lib/krant/tijdlijn-beta.ts). */
function inTijdlijnBetaVoorTest(rol: string | null): boolean {
  return TIJDLIJN_BETA_OPEN || rol === 'superadmin'
}
