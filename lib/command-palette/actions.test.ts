import { describe, it, expect, vi } from 'vitest'
import { buildActionItems, type ActionRunContext } from './actions'
import type { PerspectiveOption } from '@/components/app/perspective-provider'

/**
 * Tests voor buildActionItems — focus op de nieuwe dynamische
 * perspectief-acties die de oude AppHeader-PerspectiveSwitcher
 * vervangen.
 */

const PERSPECTIVES: PerspectiveOption[] = [
  { id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' },
  { id: 'household', label: 'Huishouden', description: 'Beide partners samen' },
  { id: 'partner', label: 'Partner', description: 'Alleen je partner' },
]

function makeCtx(overrides: Partial<ActionRunContext> = {}): ActionRunContext {
  return {
    router: { push: vi.fn() },
    closePalette: vi.fn(),
    openChat: vi.fn(),
    togglePrivacy: vi.fn(),
    privacyMasked: false,
    triggerPricesSync: vi.fn(),
    currentPerspective: 'personal',
    availablePerspectives: PERSPECTIVES,
    setPerspective: vi.fn(),
    ...overrides,
  }
}

describe('buildActionItems — perspectief-acties', () => {
  it('voegt één actie per beschikbaar perspectief toe', () => {
    const items = buildActionItems(makeCtx(), [])
    const perspectiveItems = items.filter((i) => i.id.startsWith('action:perspective-'))
    expect(perspectiveItems).toHaveLength(3)
    expect(perspectiveItems.map((i) => i.id)).toEqual([
      'action:perspective-personal',
      'action:perspective-household',
      'action:perspective-partner',
    ])
  })

  it('toont geen perspectief-acties voor solo-gebruikers (1 optie)', () => {
    const items = buildActionItems(
      makeCtx({ availablePerspectives: [PERSPECTIVES[0]] }),
      [],
    )
    expect(items.filter((i) => i.id.startsWith('action:perspective-'))).toHaveLength(0)
  })

  it('gebruikt korte labels (perspectief-naam) zonder "Wissel naar"-prefix', () => {
    const items = buildActionItems(makeCtx(), [])
    const personal = items.find((i) => i.id === 'action:perspective-personal')!
    const household = items.find((i) => i.id === 'action:perspective-household')!
    expect(personal.label).toBe('Persoonlijk')
    expect(household.label).toBe('Huishouden')
  })

  it('markeert het huidige perspectief met "· actief" in sublabel', () => {
    const items = buildActionItems(makeCtx({ currentPerspective: 'household' }), [])
    const current = items.find((i) => i.id === 'action:perspective-household')!
    const other = items.find((i) => i.id === 'action:perspective-personal')!
    expect(current.sublabel).toContain('· actief')
    expect(other.sublabel).not.toContain('actief')
  })

  it('klik op niet-actieve optie roept setPerspective met dat id', () => {
    const setPerspective = vi.fn()
    const items = buildActionItems(
      makeCtx({ currentPerspective: 'personal', setPerspective }),
      [],
    )
    items.find((i) => i.id === 'action:perspective-partner')!.run()
    expect(setPerspective).toHaveBeenCalledWith('partner')
  })

  it('klik op het actieve perspectief is no-op voor setPerspective', () => {
    const setPerspective = vi.fn()
    const items = buildActionItems(
      makeCtx({ currentPerspective: 'household', setPerspective }),
      [],
    )
    items.find((i) => i.id === 'action:perspective-household')!.run()
    expect(setPerspective).not.toHaveBeenCalled()
  })

  it('elke optie sluit het palette na klik', () => {
    const closePalette = vi.fn()
    const items = buildActionItems(makeCtx({ closePalette }), [])
    items.find((i) => i.id === 'action:perspective-personal')!.run()
    items.find((i) => i.id === 'action:perspective-household')!.run()
    expect(closePalette).toHaveBeenCalledTimes(2)
  })

  it('behoudt de bestaande statische acties (toggle-privacy, sync, logout, chat)', () => {
    const items = buildActionItems(makeCtx(), ['vermogensregistratie'])
    const ids = items.map((i) => i.id)
    expect(ids).toContain('action:open-chat')
    expect(ids).toContain('action:toggle-privacy')
    expect(ids).toContain('action:sync-prices')
    expect(ids).toContain('action:logout')
  })

  it('sync-prices blijft module-gated (vermogensregistratie)', () => {
    const withoutModule = buildActionItems(makeCtx(), [])
    expect(withoutModule.find((i) => i.id === 'action:sync-prices')).toBeUndefined()

    const withModule = buildActionItems(makeCtx(), ['vermogensregistratie'])
    expect(withModule.find((i) => i.id === 'action:sync-prices')).toBeDefined()
  })
})
