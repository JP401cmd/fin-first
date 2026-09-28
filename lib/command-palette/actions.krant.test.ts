import { describe, it, expect, vi } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { buildActionItems, type ActionRunContext } from './actions'

/**
 * Krant 2B — welke ⌘K-acties een Krant-account krijgt. Alleen de acties met
 * `krantZichtbaar` (bedragen verbergen, weergave, uitloggen) en nooit de
 * perspectief-acties; elk ander account krijgt exact de lijst van vóór 2B.
 */

function ctx(overrides: Partial<ActionRunContext> = {}): ActionRunContext {
  return {
    router: { push: vi.fn() },
    closePalette: vi.fn(),
    togglePrivacy: vi.fn(),
    privacyMasked: false,
    toggleDisplayMode: vi.fn(),
    displayMode: 'simple',
    toggleEuroView: vi.fn(),
    euroView: 'nominal',
    toggleHomeScreen: vi.fn(),
    homeScreen: 'overzicht',
    triggerPricesSync: vi.fn(),
    currentPerspective: 'personal',
    availablePerspectives: [
      { id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw data' },
      { id: 'household', label: 'Huishouden', description: 'Samen' },
    ],
    setPerspective: vi.fn(),
    ...overrides,
  } as ActionRunContext
}

describe('buildActionItems — Krant-account', () => {
  it('alleen privacy, weergave en uitloggen — geen startscherm, sync, euro-weergave of perspectief', () => {
    const ids = buildActionItems(ctx(), ['nieuws']).map((i) => i.id)
    expect(ids).toEqual(['action:toggle-privacy', 'action:toggle-display-mode', 'action:logout'])
  })
})

describe('buildActionItems — bestaande accounts ongewijzigd', () => {
  it('alle zes modules: de volledige lijst, inclusief perspectief', () => {
    const ids = buildActionItems(ctx(), [...ALL_MODULES]).map((i) => i.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'action:toggle-privacy',
        'action:toggle-display-mode',
        'action:toggle-euro-view',
        'action:toggle-home-screen',
        'action:sync-prices',
        'action:logout',
        'action:perspective-personal',
        'action:perspective-household',
      ]),
    )
  })

  it('een lege moduleset (zoals de bestaande tests hem gebruiken) is géén Krant-account', () => {
    const ids = buildActionItems(ctx(), []).map((i) => i.id)
    expect(ids).toContain('action:sync-prices')
    expect(ids).toContain('action:toggle-home-screen')
  })
})
