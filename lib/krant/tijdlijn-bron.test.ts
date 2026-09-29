import { describe, expect, it } from 'vitest'
import { aiKrantToegestaan, bepaalKrantBron, krantBronVoor, type KrantBron, type KrantVariant } from './tijdlijn-bron'

/**
 * bepaalKrantBron (B40) — élke tak: krantAccount × variant × inBeta × aiToegestaan.
 *
 * Een Krant-account (isNewsOnly) krijgt NOOIT 'ai' — dat wint altijd, ook als
 * de variant per ongeluk op 'ai' staat. `aiToegestaan` (kill-switch `ai_enabled`
 * + AI-abonnement, eindreview Y2 29-09) doet alléén ertoe wanneer variant='ai'
 * én krantAccount=false — buiten die ene combinatie is hij een no-op. De
 * matrix bewijst dat expliciet: elke rij wordt met aiToegestaan zowel true als
 * false getoetst, en voor alle rijen buiten variant='ai'/!krantAccount moet de
 * uitkomst gelijk blijven.
 */
describe('bepaalKrantBron — waarheidstabel', () => {
  const varianten: KrantVariant[] = [null, 'tijdlijn', 'ai']
  const bools = [true, false]

  const verwacht = (krantAccount: boolean, variant: KrantVariant, inBeta: boolean, aiToegestaan: boolean): KrantBron => {
    if (krantAccount) return inBeta ? 'tijdlijn' : 'wacht'
    if (variant === 'ai' && aiToegestaan) return 'ai'
    return inBeta ? 'tijdlijn' : 'ai'
  }

  for (const krantAccount of bools) {
    for (const variant of varianten) {
      for (const inBeta of bools) {
        for (const aiToegestaan of bools) {
          const uit = verwacht(krantAccount, variant, inBeta, aiToegestaan)
          it(`krantAccount=${krantAccount} variant=${variant} inBeta=${inBeta} aiToegestaan=${aiToegestaan} → ${uit}`, () => {
            expect(bepaalKrantBron({ krantAccount, variant, inBeta, aiToegestaan })).toBe(uit)
          })
        }
      }
    }
  }

  it('aiToegestaan is alleen een no-op buiten variant="ai" && !krantAccount: true/false geven daar dezelfde uitkomst', () => {
    for (const krantAccount of bools) {
      for (const variant of varianten) {
        for (const inBeta of bools) {
          if (!krantAccount && variant === 'ai') continue // precies de combinatie waar het wél uitmaakt
          expect(bepaalKrantBron({ krantAccount, variant, inBeta, aiToegestaan: true })).toBe(
            bepaalKrantBron({ krantAccount, variant, inBeta, aiToegestaan: false }),
          )
        }
      }
    }
  })

  it('de bewuste keuze "ai" zonder aiToegestaan valt terug op de standaard (nooit een AI-Krant die de lezer weigert)', () => {
    // Binnen de bèta: de nieuwe standaard is 'tijdlijn' — dus de stale 'ai'-keuze verandert van uitkomst.
    expect(bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: true, aiToegestaan: true })).toBe('ai')
    expect(bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: true, aiToegestaan: false })).toBe('tijdlijn')
    // Buiten de bèta is de standaard toevallig ook 'ai' — geen zichtbaar verschil, maar wel hetzelfde codepad.
    expect(bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: false, aiToegestaan: true })).toBe('ai')
    expect(bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: false, aiToegestaan: false })).toBe('ai')
  })
})

// ── aiKrantToegestaan ────────────────────────────────────────────────────────

describe('aiKrantToegestaan', () => {
  it('geen rij (null/undefined) → false', () => {
    expect(aiKrantToegestaan(null)).toBe(false)
    expect(aiKrantToegestaan(undefined)).toBe(false)
  })

  it('ai_enabled expliciet false → false, ongeacht het abonnement', () => {
    expect(aiKrantToegestaan({ ai_enabled: false, active_subscriptions: ['ai'] })).toBe(false)
  })

  it('ai_enabled null of ontbrekend (geen uitspraak) telt als "aan"', () => {
    expect(aiKrantToegestaan({ ai_enabled: null, active_subscriptions: ['ai'] })).toBe(true)
    expect(aiKrantToegestaan({ active_subscriptions: ['ai'] })).toBe(true)
  })

  it('geen "ai" in active_subscriptions → false', () => {
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: ['connected'] })).toBe(false)
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: [] })).toBe(false)
  })

  it('active_subscriptions geen array (null/undefined/rommel) telt als leeg → false', () => {
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: null })).toBe(false)
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: undefined })).toBe(false)
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: 'ai' })).toBe(false)
  })

  it('ai_enabled true/onbekend + "ai" in het abonnement → true', () => {
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: ['ai'] })).toBe(true)
    expect(aiKrantToegestaan({ ai_enabled: true, active_subscriptions: ['connected', 'ai'] })).toBe(true)
  })
})

// ── krantBronVoor: leest de eigen rij via een nep-client ────────────────────

interface Rij {
  data: unknown
  error: { message: string } | null
}

function client(profiel: Rij, nieuwsprofiel: Rij) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (table === 'profiles' ? profiel : nieuwsprofiel),
        }),
      }),
    }),
  }
}

describe('krantBronVoor', () => {
  it('profiel-leesfout → fail-closed "wacht", geen enkel veld afgeleid, kanAiKiezen false', async () => {
    const c = client({ data: null, error: { message: 'kapot' } }, { data: { krant_variant: 'ai' }, error: null })
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit).toEqual({ bron: 'wacht', krantAccount: false, variant: null, inBeta: false, kanAiKiezen: false })
  })

  it('geen profielrij (geen fout, maar data null) → ook fail-closed "wacht"', async () => {
    const c = client({ data: null, error: null }, { data: null, error: null })
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.bron).toBe('wacht')
    expect(uit.kanAiKiezen).toBe(false)
  })

  it('nieuwsprofiel-leesfout → variant null (geen keuze bekend = de standaard), profiel telt nog gewoon mee', async () => {
    const c = client(
      { data: { role: 'superadmin', active_modules: null }, error: null },
      { data: { krant_variant: 'ai' }, error: { message: 'kapot' } },
    )
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.variant).toBeNull()
    // superadmin + variant null + inBeta true (superadmin) → tijdlijn.
    expect(uit.bron).toBe('tijdlijn')
    expect(uit.inBeta).toBe(true)
  })

  it('active_modules = ["nieuws"] → krantAccount true → nooit "ai", ook niet met variant "ai" en AI toegestaan; kanAiKiezen blijft false', async () => {
    const c = client(
      { data: { role: 'user', active_modules: ['nieuws'], ai_enabled: true, active_subscriptions: ['ai'] }, error: null },
      { data: { krant_variant: 'ai' }, error: null },
    )
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.krantAccount).toBe(true)
    expect(uit.bron).not.toBe('ai')
    expect(uit.kanAiKiezen).toBe(false)
    // inBeta false (gewone user, bèta-vlag dicht) → wacht.
    expect(uit.bron).toBe('wacht')
  })

  it('active_modules = null (alle zes) → geen Krant-account', async () => {
    const c = client({ data: { role: 'user', active_modules: null }, error: null }, { data: null, error: null })
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.krantAccount).toBe(false)
  })

  it('rol superadmin → inBeta true (de tijdelijke schakelaar); gewone user → false zolang TIJDLIJN_BETA_OPEN=false', async () => {
    const admin = client({ data: { role: 'superadmin', active_modules: null }, error: null }, { data: null, error: null })
    const gebruiker = client({ data: { role: 'user', active_modules: null }, error: null }, { data: null, error: null })
    expect((await krantBronVoor(admin as never, 'u1')).inBeta).toBe(true)
    expect((await krantBronVoor(gebruiker as never, 'u2')).inBeta).toBe(false)
  })

  it('een niet-string of onbekende variant-waarde in de rij telt als null', async () => {
    const c = client(
      { data: { role: 'user', active_modules: null }, error: null },
      { data: { krant_variant: 'iets-anders' }, error: null },
    )
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.variant).toBeNull()
  })

  it('kanAiKiezen: true zodra geen Krant-account, ai_enabled aan en het AI-abonnement er is', async () => {
    const c = client(
      { data: { role: 'user', active_modules: null, ai_enabled: true, active_subscriptions: ['ai'] }, error: null },
      { data: null, error: null },
    )
    expect((await krantBronVoor(c as never, 'u1')).kanAiKiezen).toBe(true)
  })

  it('kanAiKiezen: false zonder AI-abonnement, ook als het geen Krant-account is', async () => {
    const c = client(
      { data: { role: 'user', active_modules: null, ai_enabled: true, active_subscriptions: [] }, error: null },
      { data: null, error: null },
    )
    expect((await krantBronVoor(c as never, 'u1')).kanAiKiezen).toBe(false)
  })

  it('kanAiKiezen: false zodra de kill-switch (ai_enabled) uit staat, ook mét abonnement', async () => {
    const c = client(
      { data: { role: 'user', active_modules: null, ai_enabled: false, active_subscriptions: ['ai'] }, error: null },
      { data: null, error: null },
    )
    expect((await krantBronVoor(c as never, 'u1')).kanAiKiezen).toBe(false)
  })

  it('een bewuste keuze "ai" zonder AI-toegang valt terug: binnen de bèta wordt de bron alsnog "tijdlijn"', async () => {
    const c = client(
      { data: { role: 'superadmin', active_modules: null, ai_enabled: false, active_subscriptions: [] }, error: null },
      { data: { krant_variant: 'ai' }, error: null },
    )
    const uit = await krantBronVoor(c as never, 'u1')
    expect(uit.bron).toBe('tijdlijn')
    expect(uit.kanAiKiezen).toBe(false)
  })
})
