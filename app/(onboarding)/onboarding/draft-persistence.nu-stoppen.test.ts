import { describe, it, expect } from 'vitest'
import { sanitizeStoredDraft } from './draft-persistence'

/**
 * ADR 0127 D9 — de onboarding BIEDT 'nu-stoppen' niet aan, maar een opgeslagen
 * concept mag de waarde niet stil naar 'deplete' vouwen. De allowlist van de
 * draft-persistentie is afgeleid uit de canonieke lijst.
 */
describe("sanitizeStoredDraft — fire_end_strategy 'nu-stoppen'", () => {
  it('behoudt nu-stoppen in het concept', () => {
    const restored = sanitizeStoredDraft({
      lastStep: 'spaardoel',
      horizon: { fire_end_strategy: 'nu-stoppen', fire_end_age: 88, temporal_balance: 3 },
    })
    expect(restored!.horizon.fire_end_strategy).toBe('nu-stoppen')
    expect(restored!.horizon.fire_end_age).toBe(88)
  })

  it('een onbekende waarde valt nog steeds naar deplete', () => {
    const restored = sanitizeStoredDraft({
      lastStep: 'spaardoel',
      horizon: { fire_end_strategy: 'onzin', fire_end_age: 90, temporal_balance: 3 },
    })
    expect(restored!.horizon.fire_end_strategy).toBe('deplete')
  })
})
