import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WELCOME_GUIDE,
  DEFAULT_REVEALED_SCREENS,
  DEFAULT_WELCOME_GUIDE_STATE,
  parseWelcomeGuideConfig,
  parseWelcomeGuideState,
  getVisibleScreens,
  hasMoreScreens,
  reconcileCompleted,
  countCompletedOnScreen,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from './welcome-guide'

/**
 * Tests voor de welkomstgids-engine. Puur datamodel; geen IO. Borgt:
 *  - default-integriteit (5 schermen, 3 required, max 4 stappen)
 *  - parse valt netjes terug op default bij rommel en merged user-config
 *  - getVisibleScreens respecteert required + revealedScreens
 *  - reconcileCompleted dropt orphan-ids
 */

describe('DEFAULT_WELCOME_GUIDE — integriteit', () => {
  it('heeft 5 schermen waarvan 3 required', () => {
    expect(DEFAULT_WELCOME_GUIDE.screens).toHaveLength(5)
    expect(DEFAULT_WELCOME_GUIDE.screens.filter((s) => s.required)).toHaveLength(3)
    expect(DEFAULT_REVEALED_SCREENS).toBe(3)
  })

  it('required-schermen staan vooraan, optioneel erna', () => {
    const flags = DEFAULT_WELCOME_GUIDE.screens.map((s) => s.required)
    expect(flags).toEqual([true, true, true, false, false])
  })

  it('elk scherm heeft 1–4 stappen met unieke, niet-lege ids', () => {
    const allIds: string[] = []
    for (const screen of DEFAULT_WELCOME_GUIDE.screens) {
      expect(screen.steps.length).toBeGreaterThan(0)
      expect(screen.steps.length).toBeLessThanOrEqual(4)
      for (const step of screen.steps) {
        expect(step.id).toBeTruthy()
        expect(step.title).toBeTruthy()
        allIds.push(step.id)
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('alle schermen gebruiken de process-layout en hebben geen kop/intro', () => {
    for (const screen of DEFAULT_WELCOME_GUIDE.screens) {
      expect(screen.layout).toBe('process')
      expect(screen.title).toBe('')
      expect(screen.intro).toBeUndefined()
    }
  })

  it('parseScreen behoudt een scherm zonder titel (id volstaat)', () => {
    const cfg = parseWelcomeGuideConfig({
      screens: [{ id: 'kop-loos', steps: [{ id: 's', title: 'Stap' }] }],
    })
    expect(cfg.screens).toHaveLength(1)
    expect(cfg.screens[0].title).toBe('')
  })
})

describe('parseWelcomeGuideConfig', () => {
  it('valt terug op default bij null/undefined', () => {
    expect(parseWelcomeGuideConfig(null)).toBe(DEFAULT_WELCOME_GUIDE)
    expect(parseWelcomeGuideConfig(undefined)).toBe(DEFAULT_WELCOME_GUIDE)
  })

  it('valt terug op default bij ongeldige JSON-string', () => {
    expect(parseWelcomeGuideConfig('{niet: geldig')).toBe(DEFAULT_WELCOME_GUIDE)
  })

  it('valt terug op default bij ontbrekende/lege screens', () => {
    expect(parseWelcomeGuideConfig({})).toBe(DEFAULT_WELCOME_GUIDE)
    expect(parseWelcomeGuideConfig({ screens: [] })).toBe(DEFAULT_WELCOME_GUIDE)
    expect(parseWelcomeGuideConfig({ screens: [{ id: '', title: '' }] })).toBe(
      DEFAULT_WELCOME_GUIDE,
    )
  })

  it('parset een geldige config en normaliseert ontbrekende velden', () => {
    const cfg = parseWelcomeGuideConfig({
      kicker: 'Hoi',
      screens: [
        {
          id: 'a',
          title: 'A',
          steps: [{ id: 's', title: 'Stap', icon: 'NietBestaand' }],
        },
      ],
    })
    expect(cfg.kicker).toBe('Hoi')
    expect(cfg.screens).toHaveLength(1)
    expect(cfg.screens[0].layout).toBe('list') // default
    expect(cfg.screens[0].required).toBe(false) // default
    expect(cfg.screens[0].enabled).toBe(true) // default
    expect(cfg.screens[0].steps[0].enabled).toBe(true)
    expect(cfg.screens[0].steps[0].icon).toBeUndefined() // onbekend icoon gedropt
  })

  it('parset een JSON-string net als een object', () => {
    const obj = { kicker: 'X', screens: [{ id: 'a', title: 'A', steps: [] }] }
    expect(parseWelcomeGuideConfig(JSON.stringify(obj)).kicker).toBe('X')
  })

  it('honoreert enabled:false op config-, scherm- en stapniveau', () => {
    const cfg = parseWelcomeGuideConfig({
      enabled: false,
      screens: [
        {
          id: 'a',
          title: 'A',
          enabled: false,
          steps: [{ id: 's', title: 'S', enabled: false }],
        },
      ],
    })
    expect(cfg.enabled).toBe(false)
    expect(cfg.screens[0].enabled).toBe(false)
    expect(cfg.screens[0].steps[0].enabled).toBe(false)
  })
})

describe('parseWelcomeGuideState', () => {
  it('geeft veilige defaults bij lege/ongeldige input', () => {
    const st = parseWelcomeGuideState(null, DEFAULT_WELCOME_GUIDE)
    expect(st.completedStepIds).toEqual([])
    expect(st.currentScreen).toBe(0)
    expect(st.revealedScreens).toBe(3)
    expect(st.status).toBe('active')
  })

  it('clamp revealedScreens binnen [#required, #enabled]', () => {
    const low = parseWelcomeGuideState({ revealedScreens: 0 }, DEFAULT_WELCOME_GUIDE)
    expect(low.revealedScreens).toBe(3)
    const high = parseWelcomeGuideState({ revealedScreens: 99 }, DEFAULT_WELCOME_GUIDE)
    expect(high.revealedScreens).toBe(5)
  })

  it('leest status dismissed terug', () => {
    const st = parseWelcomeGuideState({ status: 'dismissed' }, DEFAULT_WELCOME_GUIDE)
    expect(st.status).toBe('dismissed')
  })
})

describe('getVisibleScreens & hasMoreScreens', () => {
  it('toont standaard alleen de 3 required-schermen', () => {
    const visible = getVisibleScreens(DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE)
    expect(visible).toHaveLength(3)
    expect(visible.every((s) => s.required)).toBe(true)
    expect(hasMoreScreens(DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE)).toBe(true)
  })

  it('ontgrendelt optionele schermen op volgorde via revealedScreens', () => {
    const state: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE, revealedScreens: 4 }
    const visible = getVisibleScreens(DEFAULT_WELCOME_GUIDE, state)
    expect(visible).toHaveLength(4)
    expect(visible[3].id).toBe('verdiep-inzichten')
  })

  it('toont alles bij revealedScreens=5 en meldt geen "meer"', () => {
    const state: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE, revealedScreens: 5 }
    expect(getVisibleScreens(DEFAULT_WELCOME_GUIDE, state)).toHaveLength(5)
    expect(hasMoreScreens(DEFAULT_WELCOME_GUIDE, state)).toBe(false)
  })

  it('required komt altijd eerst, ook als config optioneel vooraan zet', () => {
    const cfg: WelcomeGuideConfig = {
      enabled: true,
      kicker: 'k',
      screens: [
        { id: 'opt', title: 'Opt', layout: 'list', required: false, enabled: true, steps: [] },
        { id: 'req', title: 'Req', layout: 'list', required: true, enabled: true, steps: [] },
      ],
    }
    const state = parseWelcomeGuideState({ revealedScreens: 1 }, cfg)
    const visible = getVisibleScreens(cfg, state)
    expect(visible[0].id).toBe('req')
  })

  it('telt uitgeschakelde schermen niet mee', () => {
    const cfg = parseWelcomeGuideConfig({
      screens: [
        { id: 'a', title: 'A', required: true, enabled: true, steps: [] },
        { id: 'b', title: 'B', required: true, enabled: false, steps: [] },
      ],
    })
    const state = parseWelcomeGuideState({}, cfg)
    const visible = getVisibleScreens(cfg, state)
    expect(visible.map((s) => s.id)).toEqual(['a'])
  })
})

describe('reconcileCompleted & countCompletedOnScreen', () => {
  it('dropt ids die niet meer in de config bestaan', () => {
    const ids = ['s1-bezittingen', 'verdwenen-id', 's2-grafiek']
    expect(reconcileCompleted(DEFAULT_WELCOME_GUIDE, ids)).toEqual([
      's1-bezittingen',
      's2-grafiek',
    ])
  })

  it('telt afgevinkte stappen per scherm', () => {
    const screen = DEFAULT_WELCOME_GUIDE.screens[0]
    expect(countCompletedOnScreen(screen, ['s1-bezittingen', 's1-budget'])).toBe(2)
    expect(countCompletedOnScreen(screen, [])).toBe(0)
  })
})
