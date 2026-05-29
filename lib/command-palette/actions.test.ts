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

describe('buildActionItems — perspectief-cycle', () => {
  it('voegt precies één perspectief-actie toe wanneer er meerdere opties zijn', () => {
    const items = buildActionItems(makeCtx(), [])
    const perspectiveItems = items.filter((i) => i.id.startsWith('action:perspective-'))
    expect(perspectiveItems).toHaveLength(1)
    expect(perspectiveItems[0].id).toBe('action:perspective-cycle')
  })

  it('toont geen perspectief-actie voor solo-gebruikers (1 optie)', () => {
    const items = buildActionItems(
      makeCtx({ availablePerspectives: [PERSPECTIVES[0]] }),
      [],
    )
    expect(items.filter((i) => i.id.startsWith('action:perspective-'))).toHaveLength(0)
  })

  it('toont huidige perspectief in label en volgende in sublabel', () => {
    const items = buildActionItems(makeCtx({ currentPerspective: 'personal' }), [])
    const cycle = items.find((i) => i.id === 'action:perspective-cycle')!
    expect(cycle.label).toBe('Perspectief: Persoonlijk')
    expect(cycle.sublabel).toContain('Huishouden')
    expect(cycle.sublabel).toContain('Beide partners samen')
  })

  it('cyclet naar het volgende perspectief in de array', () => {
    const setPerspective = vi.fn()
    const items = buildActionItems(
      makeCtx({ currentPerspective: 'household', setPerspective }),
      [],
    )
    const cycle = items.find((i) => i.id === 'action:perspective-cycle')!
    cycle.run()
    expect(setPerspective).toHaveBeenCalledWith('partner')
  })

  it('wraps van laatste terug naar eerste perspectief', () => {
    const setPerspective = vi.fn()
    const items = buildActionItems(
      makeCtx({ currentPerspective: 'partner', setPerspective }),
      [],
    )
    const cycle = items.find((i) => i.id === 'action:perspective-cycle')!
    cycle.run()
    expect(setPerspective).toHaveBeenCalledWith('personal')
  })

  it('roept closePalette na cycle', () => {
    const closePalette = vi.fn()
    const items = buildActionItems(makeCtx({ closePalette }), [])
    const cycle = items.find((i) => i.id === 'action:perspective-cycle')!
    cycle.run()
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
