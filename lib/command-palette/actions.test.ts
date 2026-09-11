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

  it('behoudt de statische acties (toggle-privacy, sync, logout) — chat bewust niet (B-011-vervolg)', () => {
    const items = buildActionItems(makeCtx(), ['vermogensregistratie'])
    const ids = items.map((i) => i.id)
    expect(ids).not.toContain('action:open-chat')
    expect(ids).toContain('action:toggle-privacy')
    expect(ids).toContain('action:sync-prices')
    expect(ids).toContain('action:logout')
  })

  // De actie draaide tot 7 sep 2026 alleen de prijzen; sindsdien is het exact
  // dezelfde ronde als de sync-knop in de header (koersen + bankgegevens +
  // exchanges/wallets). Label en sublabel moeten dat dekken — "Synchroniseer
  // prijzen / Beleggings- en cryptokoersen verversen" beloofde minder dan de
  // actie doet, en dat was precies de melding.
  it("heet 'Alles synchroniseren' en noemt de bankgegevens in de sublabel", () => {
    const item = buildActionItems(makeCtx(), ['vermogensregistratie']).find(
      (i) => i.id === 'action:sync-prices',
    )
    if (!item) throw new Error('action:sync-prices ontbreekt in het register')
    expect(item.label).toBe('Alles synchroniseren')
    expect(item.sublabel).toMatch(/bank/i)
    expect(item.label).not.toMatch(/prijzen/i)
  })

  it('sluit het palet en start de ronde via de context-runner', async () => {
    const triggerPricesSync = vi.fn()
    const closePalette = vi.fn()
    const item = buildActionItems(makeCtx({ triggerPricesSync, closePalette }), [
      'vermogensregistratie',
    ]).find((i) => i.id === 'action:sync-prices')
    if (!item) throw new Error('action:sync-prices ontbreekt in het register')
    await item.run!()
    expect(closePalette).toHaveBeenCalledTimes(1)
    expect(triggerPricesSync).toHaveBeenCalledTimes(1)
  })

  // B-029: de gate stond op 'vermogensregistratie' toen de ronde alleen koersen
  // ververste. Nu hij ook banktransacties ophaalt — die bij 'budgetteren' horen —
  // sloot die gate een budgetteren-only gebruiker mét bankkoppeling uit, terwijl
  // de header-knop die exact dezelfde ronde draait nooit een gate had. Deze test
  // pint de correctie: geen gate, ongeacht de actieve modules.
  it('sync-prices is niet module-gated — spiegelt de ongegate header-knop', () => {
    const zonderModules = buildActionItems(makeCtx(), [])
    expect(zonderModules.find((i) => i.id === 'action:sync-prices')).toBeDefined()

    const budgetterenOnly = buildActionItems(makeCtx(), ['budgetteren'])
    expect(budgetterenOnly.find((i) => i.id === 'action:sync-prices')).toBeDefined()

    const metVermogen = buildActionItems(makeCtx(), ['vermogensregistratie'])
    expect(metVermogen.find((i) => i.id === 'action:sync-prices')).toBeDefined()
  })
})

describe('buildActionItems — zichtbaarheid binnen de standaard-cap', () => {
  // Given een gebruiker met vermogensregistratie en de euro-toggle in het
  // register, When de palette zonder zoekterm de eerste ACTIONS_LIMIT_VISIBLE
  // algemene acties toont, Then vallen zowel 'Alles synchroniseren' als de
  // euro-toggle binnen die cap — een nieuwe actie mag de sync-knop niet uit
  // de standaardlijst drukken.
  it("toont 'Alles synchroniseren' én de euro-toggle in de standaardlijst", () => {
    const items = buildActionItems(makeCtx(), ['vermogensregistratie'])
    const general = items.filter((i) => !i.id.startsWith('action:perspective-'))
    const defaultVisible = general.slice(0, ACTIONS_LIMIT_VISIBLE).map((i) => i.id)
    expect(defaultVisible).toContain('action:sync-prices')
    expect(defaultVisible).toContain('action:toggle-euro-view')
  })

  // De homescherm-toggle kwam er als zesde actie bij; de cap ging mee van 5
  // naar 6. Deze assertie bewaakt dat óók 'Uitloggen' — de onderste actie —
  // binnen de standaardlijst blijft vallen: een nieuwe actie toevoegen zonder
  // de cap te verhogen drukt anders stilzwijgend de onderste actie eruit.
  it("houdt de homescherm-toggle én 'Uitloggen' binnen de standaardlijst", () => {
    const items = buildActionItems(makeCtx(), ['vermogensregistratie'])
    const general = items.filter((i) => !i.id.startsWith('action:perspective-'))
    const defaultVisible = general.slice(0, ACTIONS_LIMIT_VISIBLE).map((i) => i.id)
    expect(defaultVisible).toContain('action:toggle-home-screen')
    expect(defaultVisible).toContain('action:logout')
  })
})

describe('buildActionItems — euro-weergave', () => {
  function euroItem(ctx: ActionRunContext) {
    const item = buildActionItems(ctx, []).find((i) => i.id === 'action:toggle-euro-view')
    if (!item) throw new Error('action:toggle-euro-view ontbreekt in het register')
    return item
  }

  it('biedt in nominaal de stap naar huidige euro’s aan', () => {
    expect(euroItem(makeCtx({ euroView: 'nominal' })).label).toBe("Switch naar huidige euro's")
  })

  it('biedt in reële weergave de stap terug naar toekomstige euro’s aan', () => {
    expect(euroItem(makeCtx({ euroView: 'real' })).label).toBe("Switch naar toekomstige euro's")
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

describe('buildActionItems — homescherm', () => {
  function homeItem(ctx: ActionRunContext) {
    const item = buildActionItems(ctx, []).find((i) => i.id === 'action:toggle-home-screen')
    if (!item) throw new Error('action:toggle-home-screen ontbreekt in het register')
    return item
  }

  it('biedt vanuit Overzicht de stap naar Budgetteren als startscherm aan', () => {
    const item = homeItem(makeCtx({ homeScreen: 'overzicht' }))
    expect(item.label).toBe('Switch naar Budgetteren')
    expect(item.sublabel).toBe('Als startscherm')
  })

  it('biedt vanuit Budgetteren de stap terug naar Overzicht als startscherm aan', () => {
    expect(homeItem(makeCtx({ homeScreen: 'budget' })).label).toBe('Switch naar Overzicht')
  })

  it('roept de toggle aan en sluit het palet', () => {
    const toggleHomeScreen = vi.fn()
    const closePalette = vi.fn()
    const item = homeItem(makeCtx({ toggleHomeScreen, closePalette }))
    // Een action-item is per definitie een runner, geen href — als `run` ontbreekt
    // is de actie stuk, dus dat is hier een echte assertie en geen type-formaliteit.
    expect(item.run).toBeDefined()
    expect(item.href).toBeUndefined()
    item.run!()
    expect(toggleHomeScreen).toHaveBeenCalledTimes(1)
    expect(closePalette).toHaveBeenCalledTimes(1)
  })

  it('staat direct onder de euro-weergave-actie (profiel-brede voorkeuren bij elkaar)', () => {
    const ids = buildActionItems(makeCtx(), []).map((i) => i.id)
    expect(ids.indexOf('action:toggle-home-screen')).toBe(
      ids.indexOf('action:toggle-euro-view') + 1,
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
    const find = (ctx: ActionRunContext) => {
      const item = buildActionItems(ctx, []).find((i) => i.id === 'action:toggle-display-mode')
      if (!item) throw new Error('action:toggle-display-mode ontbreekt in het register')
      return item
    }
    // Richtinggevend sinds W-006: de sublabel noemt wat de doelstand oplevert.
    expect(find(makeCtx({ displayMode: 'simple' })).sublabel).toBe('Meer detail op elke pagina')
    expect(find(makeCtx({ displayMode: 'full' })).sublabel).toBe('Minder detail op elke pagina')
    expect(find(makeCtx()).sublabel).not.toMatch(/inklappen/i)
  })
})

describe('buildActionItems — schakelaars noemen hun doelstand (W-006)', () => {
  function label(id: string, ctx: ActionRunContext) {
    const item = buildActionItems(ctx, []).find((i) => i.id === id)
    if (!item) throw new Error(`${id} ontbreekt in het register`)
    return item.label
  }

  it('weergavemodus: "Switch naar volledig" vanuit Eenvoudig en andersom', () => {
    expect(label('action:toggle-display-mode', makeCtx({ displayMode: 'simple' }))).toBe('Switch naar volledig')
    expect(label('action:toggle-display-mode', makeCtx({ displayMode: 'full' }))).toBe('Switch naar eenvoudig')
  })

  it('bedragen: de doelstand, nooit de huidige stand', () => {
    expect(label('action:toggle-privacy', makeCtx({ privacyMasked: false }))).toBe('Switch naar verborgen bedragen')
    expect(label('action:toggle-privacy', makeCtx({ privacyMasked: true }))).toBe('Switch naar zichtbare bedragen')
  })

  it('precies de vier schakelaars beginnen met "Switch naar"; sync en uitloggen houden hun werkwoord', () => {
    const general = buildActionItems(makeCtx(), []).filter((i) => !i.id.startsWith('action:perspective-'))
    const switches = general.filter((i) => i.label.startsWith('Switch naar ')).map((i) => i.id)
    expect(switches).toEqual([
      'action:toggle-privacy',
      'action:toggle-display-mode',
      'action:toggle-euro-view',
      'action:toggle-home-screen',
    ])
    expect(general.find((i) => i.id === 'action:sync-prices')!.label).toBe('Alles synchroniseren')
    expect(general.find((i) => i.id === 'action:logout')!.label).toBe('Uitloggen')
  })

  it('elke actie heeft een icoon en een korte sublabel (knop-inhoud)', () => {
    const general = buildActionItems(makeCtx(), []).filter((i) => !i.id.startsWith('action:perspective-'))
    for (const item of general) {
      expect(item.icon, item.id).toBeDefined()
      expect(item.sublabel, item.id).toBeTruthy()
      expect(item.sublabel!.length, item.id).toBeLessThanOrEqual(32)
    }
  })

  it('uitloggen is ondergeschikt, de rest niet', () => {
    const general = buildActionItems(makeCtx(), []).filter((i) => !i.id.startsWith('action:perspective-'))
    expect(general.filter((i) => i.subordinate).map((i) => i.id)).toEqual(['action:logout'])
  })

  it('draagt zoektermen voor de oude benamingen, zodat "verberg" en "startscherm" blijven vinden', () => {
    const items = buildActionItems(makeCtx(), [])
    expect(items.find((i) => i.id === 'action:toggle-privacy')!.keywords).toContain('Bedragen verbergen')
    expect(items.find((i) => i.id === 'action:toggle-home-screen')!.keywords).toContain('Startscherm')
  })
})
