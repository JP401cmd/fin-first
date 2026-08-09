import { describe, it, expect, vi } from 'vitest'
import { buildActionItems, ACTIONS_LIMIT_VISIBLE, type ActionRunContext } from './actions'
import type { PerspectiveOption } from '@/lib/types/perspective'

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
    toggleDisplayMode: vi.fn(),
    displayMode: 'simple',
    toggleEuroView: vi.fn(),
    euroView: 'nominal',
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
    items.find((i) => i.id === 'action:perspective-partner')!.run!()
    expect(setPerspective).toHaveBeenCalledWith('partner')
  })

  it('klik op het actieve perspectief is no-op voor setPerspective', () => {
    const setPerspective = vi.fn()
    const items = buildActionItems(
      makeCtx({ currentPerspective: 'household', setPerspective }),
      [],
    )
    items.find((i) => i.id === 'action:perspective-household')!.run!()
    expect(setPerspective).not.toHaveBeenCalled()
  })

  it('elke optie sluit het palette na klik', () => {
    const closePalette = vi.fn()
    const items = buildActionItems(makeCtx({ closePalette }), [])
    items.find((i) => i.id === 'action:perspective-personal')!.run!()
    items.find((i) => i.id === 'action:perspective-household')!.run!()
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

describe('buildActionItems — zichtbaarheid binnen de standaard-cap', () => {
  // Given een gebruiker met vermogensregistratie en de euro-toggle in het
  // register, When de palette zonder zoekterm de eerste ACTIONS_LIMIT_VISIBLE
  // algemene acties toont, Then vallen zowel 'Synchroniseer prijzen' als de
  // euro-toggle binnen die cap — een nieuwe actie mag de sync-knop niet uit
  // de standaardlijst drukken.
  it("toont 'Synchroniseer prijzen' én de euro-toggle in de standaardlijst", () => {
    const items = buildActionItems(makeCtx(), ['vermogensregistratie'])
    const general = items.filter((i) => !i.id.startsWith('action:perspective-'))
    const defaultVisible = general.slice(0, ACTIONS_LIMIT_VISIBLE).map((i) => i.id)
    expect(defaultVisible).toContain('action:sync-prices')
    expect(defaultVisible).toContain('action:toggle-euro-view')
  })
})

describe('buildActionItems — euro-weergave', () => {
  function euroItem(ctx: ActionRunContext) {
    const item = buildActionItems(ctx, []).find((i) => i.id === 'action:toggle-euro-view')
    if (!item) throw new Error('action:toggle-euro-view ontbreekt in het register')
    return item
  }

  it('biedt in nominaal de stap naar huidige euro’s aan', () => {
    expect(euroItem(makeCtx({ euroView: 'nominal' })).label).toBe("Toon huidige euro's")
  })

  it('biedt in reële weergave de stap terug naar toekomstige euro’s aan', () => {
    expect(euroItem(makeCtx({ euroView: 'real' })).label).toBe("Toon toekomstige euro's")
  })

  it('roept de toggle aan en sluit het palet', () => {
    const toggleEuroView = vi.fn()
    const closePalette = vi.fn()
    const item = euroItem(makeCtx({ toggleEuroView, closePalette }))
    // Een action-item is per definitie een runner, geen href — als `run` ontbreekt
    // is de actie stuk, dus dat is hier een echte assertie en geen type-formaliteit.
    expect(item.run).toBeDefined()
    expect(item.href).toBeUndefined()
    item.run!()
    expect(toggleEuroView).toHaveBeenCalledTimes(1)
    expect(closePalette).toHaveBeenCalledTimes(1)
  })

  it('staat direct onder de weergavemodus-actie', () => {
    const ids = buildActionItems(makeCtx(), []).map((i) => i.id)
    expect(ids.indexOf('action:toggle-euro-view')).toBe(
      ids.indexOf('action:toggle-display-mode') + 1,
    )
  })
})

describe('buildActionItems — weergavemodus (APP-3)', () => {
  /**
   * De oude omschrijving ("Diepte-secties standaard tonen of inklappen")
   * beloofde inklapbaar-maar-bereikbaar. Dat gedrag bestaat niet: HideInSimple
   * haalt secties hard weg. De sublabel moet beschrijven wat er écht gebeurt.
   */
  it('omschrijft de modus als meer/minder detail, niet als inklappen', () => {
    const item = buildActionItems(makeCtx(), []).find(
      (i) => i.id === 'action:toggle-display-mode',
    )
    if (!item) throw new Error('action:toggle-display-mode ontbreekt in het register')
    expect(item.sublabel).toBe('Meer/minder detail op elke pagina')
    expect(item.sublabel).not.toMatch(/inklappen/i)
  })
})
