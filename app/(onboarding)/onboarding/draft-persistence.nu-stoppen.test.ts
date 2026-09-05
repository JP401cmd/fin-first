import { describe, it, expect } from 'vitest'
import { sanitizeStoredDraft } from './draft-persistence'

/**
 * ADR 0127 D9 → ADR 0129: de onboarding BIEDT 'nu-stoppen' niet aan, en een
 * opgeslagen concept mag die keuze niet stil naar 'deplete' vouwen. Sinds de stap
 * "Jouw plan" (5 sep 2026) is 'nu-stoppen' geen eind-vorm meer maar een ANKER:
 * het concept herstelt als anker `now` + eind-vorm `deplete` — dezelfde
 * D2-vertaling als `parseFirePlan`. De keuze blijft; alleen de kolom verschuift.
 * (Vóór deze datum pinde deze test het label zelf in `fire_end_strategy`.)
 */
describe("sanitizeStoredDraft — legacy fire_end_strategy 'nu-stoppen'", () => {
  it('vertaalt nu-stoppen naar anker now + eind-vorm deplete, met behoud van de eindleeftijd', () => {
    const restored = sanitizeStoredDraft({
      lastStep: 'spaardoel',
      horizon: { fire_end_strategy: 'nu-stoppen', fire_end_age: 88, temporal_balance: 3 },
    })
    expect(restored!.horizon.fire_stop_anchor).toBe('now')
    expect(restored!.horizon.fire_stop_age).toBeNull()
    expect(restored!.horizon.fire_end_strategy).toBe('deplete')
    expect(restored!.horizon.fire_end_age).toBe(88)
  })

  it('een onbekende waarde valt nog steeds naar deplete × solved', () => {
    const restored = sanitizeStoredDraft({
      lastStep: 'spaardoel',
      horizon: { fire_end_strategy: 'onzin', fire_end_age: 90, temporal_balance: 3 },
    })
    expect(restored!.horizon.fire_end_strategy).toBe('deplete')
    expect(restored!.horizon.fire_stop_anchor).toBe('solved')
  })
})
