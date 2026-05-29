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

  it('markeert het huidige perspectief in sublabel', () => {
    const items = buildActionItems(makeCtx({ currentPerspective: 'household' }), [])
    const current = items.find((i) => i.id === 'action:perspective-household')
    const other = items.find((i) => i.id === 'action:perspective-personal')
    expect(current?.sublabel).toContain('nu actief')
    expect(other?.sublabel).not.toContain('nu actief')
  })

  it('run-callback roept setPerspective + closePalette', () => {
    const setPerspective = vi.fn()
    const closePalette = vi.fn()
    const items = buildActionItems(makeCtx({ setPerspective, closePalette }), [])

    const household = items.find((i) => i.id === 'action:perspective-household')
    expect(household).toBeDefined()
    household!.run()

    expect(setPerspective).toHaveBeenCalledWith('household')
    expect(closePalette).toHaveBeenCalled()
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
