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
  countScreenProgress,
  deriveGuideStates,
  guideVisitSlugsForRoute,
  isGuideComplete,
  isGuideStepDone,
  GUIDE_VISIT_SLUG_BY_STEP_ID,
  type GuideAccountFacts,
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

  // S13 — `minimized` is ná de eerste rijen aan het staatstype toegevoegd. Elke
  // bestaande jsonb-rij mist het veld; die moet uitgeklapt terugkomen, niet
  // één keer stil ingeklapt (er is geen migratie die dit rechtzet).
  it('minimized ontbreekt in oude rijen → false (uitgeklapt)', () => {
    expect(parseWelcomeGuideState({}, DEFAULT_WELCOME_GUIDE).minimized).toBe(false)
    expect(parseWelcomeGuideState(null, DEFAULT_WELCOME_GUIDE).minimized).toBe(false)
    expect(
      parseWelcomeGuideState({ minimized: 'ja' }, DEFAULT_WELCOME_GUIDE).minimized,
    ).toBe(false)
  })

  it('leest minimized terug — los van dismissed (heropenbaar vs. voorgoed weg)', () => {
    const st = parseWelcomeGuideState({ minimized: true }, DEFAULT_WELCOME_GUIDE)
    expect(st.minimized).toBe(true)
    expect(st.status).toBe('active')
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

describe('reconcileCompleted & countScreenProgress', () => {
  it('dropt ids die niet meer in de config bestaan', () => {
    const ids = ['s1-bezittingen', 'verdwenen-id', 's2-grafiek']
    expect(reconcileCompleted(DEFAULT_WELCOME_GUIDE, ids)).toEqual([
      's1-bezittingen',
      's2-grafiek',
    ])
  })

  it('telt afgevinkte stappen per scherm', () => {
    const screen = DEFAULT_WELCOME_GUIDE.screens[0]
    expect(countScreenProgress(screen, ['s1-bezittingen', 's1-budget'])).toEqual({
      done: 2,
      total: 4,
      notApplicable: 0,
    })
    expect(countScreenProgress(screen, [])).toEqual({ done: 0, total: 4, notApplicable: 0 })
  })
})

// ── M1: de gids leidt af wat de app al weet ────────────────────────────────

/** Leeg account: elk signaal uit, niets bezocht. */
const EMPTY_FACTS: GuideAccountFacts = {
  hasAssets: false,
  hasDebts: false,
  hasBudgets: false,
  hasBankConnection: false,
  hasTransactions: false,
  hasFireParams: false,
  hasHorizonSetup: false,
  hasLifeEvents: false,
  hasRetirementExpenseChoice: false,
  hasGoals: false,
  hasScenarioPrefs: false,
  visitedSlugs: [],
  notApplicableStepIds: [],
}

/** Volledig gevuld account: alles ingevuld én alles bezocht. */
const FULL_FACTS: GuideAccountFacts = {
  hasAssets: true,
  hasDebts: true,
  hasBudgets: true,
  hasBankConnection: true,
  hasTransactions: true,
  hasFireParams: true,
  hasHorizonSetup: true,
  hasLifeEvents: true,
  hasRetirementExpenseChoice: true,
  hasGoals: true,
  hasScenarioPrefs: true,
  visitedSlugs: Object.values(GUIDE_VISIT_SLUG_BY_STEP_ID),
  notApplicableStepIds: [],
}

describe('deriveGuideStates — de bevinding uit M1', () => {
  it('gevuld account: scherm 1 staat op 4/4 (was 0/4)', () => {
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, FULL_FACTS)
    const screen = DEFAULT_WELCOME_GUIDE.screens[0]
    // Zonder afleiding — de situatie vóór M1 — is dit 0/4.
    expect(countScreenProgress(screen, [])).toEqual({ done: 0, total: 4, notApplicable: 0 })
    expect(countScreenProgress(screen, [], derived)).toEqual({
      done: 4,
      total: 4,
      notApplicable: 0,
    })
  })

  it('leeg account: niets wordt afgeleid afgevinkt', () => {
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, EMPTY_FACTS)
    for (const screen of DEFAULT_WELCOME_GUIDE.screens) {
      expect(countScreenProgress(screen, [], derived).done).toBe(0)
    }
  })

  it('bezoekstappen hangen aan het bezoekregister, niet aan financiële data', () => {
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, {
      ...EMPTY_FACTS,
      visitedSlugs: ['guide_nieuws'],
    })
    expect(derived['s3-nieuws']).toBe('done')
    expect(derived['s3-rekenhulp']).toBe('open')
  })

  it('s2-voorkeuren leunt op de horizon-setup, NIET op de FIRE-parameters', () => {
    // expected_return/inflation_rate hebben een DB-default: "gevuld" bewijst niets.
    const alleenParams = deriveGuideStates(DEFAULT_WELCOME_GUIDE, {
      ...EMPTY_FACTS,
      hasFireParams: true,
    })
    expect(alleenParams['s2-voorkeuren']).toBe('open')
    const metSetup = deriveGuideStates(DEFAULT_WELCOME_GUIDE, {
      ...EMPTY_FACTS,
      hasHorizonSetup: true,
    })
    expect(metSetup['s2-voorkeuren']).toBe('done')
  })

  it('s1-rekening telt zowel een bankkoppeling als een CSV-import', () => {
    expect(
      deriveGuideStates(DEFAULT_WELCOME_GUIDE, { ...EMPTY_FACTS, hasTransactions: true })[
        's1-rekening'
      ],
    ).toBe('done')
    expect(
      deriveGuideStates(DEFAULT_WELCOME_GUIDE, { ...EMPTY_FACTS, hasBankConnection: true })[
        's1-rekening'
      ],
    ).toBe('done')
  })

  it('onbekende stap-id → geen regel → handmatig, geen crash', () => {
    const config: WelcomeGuideConfig = {
      ...DEFAULT_WELCOME_GUIDE,
      screens: [
        {
          id: 'eigen-scherm',
          title: '',
          layout: 'list',
          required: true,
          enabled: true,
          steps: [{ id: 'door-beheerder-verzonnen', title: 'Iets eigens', enabled: true }],
        },
      ],
    }
    const derived = deriveGuideStates(config, FULL_FACTS)
    expect(derived['door-beheerder-verzonnen']).toBeUndefined()
    expect(isGuideStepDone('door-beheerder-verzonnen', [], derived)).toBe(false)
    expect(isGuideStepDone('door-beheerder-verzonnen', ['door-beheerder-verzonnen'], derived)).toBe(
      true,
    )
  })

  it("'n.v.t.' valt uit de noemer en telt nooit als afgevinkt", () => {
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, {
      ...FULL_FACTS,
      notApplicableStepIds: ['s1-schulden'],
    })
    expect(derived['s1-schulden']).toBe('nvt')
    expect(countScreenProgress(DEFAULT_WELCOME_GUIDE.screens[0], [], derived)).toEqual({
      done: 3,
      total: 3,
      notApplicable: 1,
    })
    // Ook een handmatig vinkje maakt een n.v.t.-stap niet "af".
    expect(isGuideStepDone('s1-schulden', ['s1-schulden'], derived)).toBe(false)
  })

  it('afgeleid gedaan wint van niets, maar vervuilt completedStepIds niet', () => {
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, { ...EMPTY_FACTS, hasAssets: true })
    // De afleiding leeft naast de handmatige lijst; die lijst blijft leeg.
    expect(isGuideStepDone('s1-bezittingen', [], derived)).toBe(true)
    const state: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE }
    expect(state.completedStepIds).toEqual([])
  })
})

describe('isGuideComplete', () => {
  it('waar zodra elke zichtbare stap done of n.v.t. is', () => {
    const state: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE }
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, FULL_FACTS)
    // Scherm 3 kent één stap zonder afleiding niet — alle drie zichtbare
    // schermen zijn volledig afleidbaar, dus dit moet waar zijn.
    expect(isGuideComplete(DEFAULT_WELCOME_GUIDE, state, derived)).toBe(true)
  })

  it('onwaar zolang er nog een open stap is', () => {
    const state: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE }
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, {
      ...FULL_FACTS,
      hasBudgets: false,
    })
    expect(isGuideComplete(DEFAULT_WELCOME_GUIDE, state, derived)).toBe(false)
  })

  it('kijkt alleen naar ZICHTBARE schermen', () => {
    // Alles op scherm 1–3 gedaan, de optionele schermen nog niet ontgrendeld.
    const facts: GuideAccountFacts = {
      ...EMPTY_FACTS,
      hasAssets: true,
      hasDebts: true,
      hasBudgets: true,
      hasTransactions: true,
      hasHorizonSetup: true,
      hasLifeEvents: true,
      hasRetirementExpenseChoice: true,
      visitedSlugs: [
        'guide_toekomst_grafiek',
        'guide_vaste_lasten',
        'guide_tips',
        'guide_nieuws',
        'guide_rekenhulp',
      ],
    }
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, facts)
    expect(isGuideComplete(DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE, derived)).toBe(true)
    // Met een ontgrendeld vierde scherm is de gids niet meer af.
    const meer: WelcomeGuideState = { ...DEFAULT_WELCOME_GUIDE_STATE, revealedScreens: 4 }
    expect(isGuideComplete(DEFAULT_WELCOME_GUIDE, meer, derived)).toBe(false)
  })
})

describe('guideVisitSlugsForRoute', () => {
  it('/toekomst telt alleen exact, niet elke subroute', () => {
    expect(guideVisitSlugsForRoute('/toekomst')).toEqual(['guide_toekomst_grafiek'])
    expect(guideVisitSlugsForRoute('/toekomst/doelen')).toEqual([])
  })

  it('deeplink met query levert beide slugs', () => {
    const slugs = guideVisitSlugsForRoute('/toekomst', (k) => (k === 'whatif' ? 'open' : null))
    expect(slugs).toEqual(['guide_toekomst_grafiek', 'guide_whatif'])
  })

  it('prefix-routes tellen ook diepere paden', () => {
    expect(guideVisitSlugsForRoute('/nieuws/artikel-123')).toEqual(['guide_nieuws'])
    expect(guideVisitSlugsForRoute('/nieuwsbrief')).toEqual([])
    expect(guideVisitSlugsForRoute('/toekomst/rekenhulp/abc')).toEqual(['guide_rekenhulp'])
  })

  it('elke bezoek-slug verwijst naar een bestaande stap én een bestaande route', () => {
    const stepIds = new Set(
      DEFAULT_WELCOME_GUIDE.screens.flatMap((s) => s.steps.map((st) => st.id)),
    )
    for (const stepId of Object.keys(GUIDE_VISIT_SLUG_BY_STEP_ID)) {
      expect(stepIds.has(stepId)).toBe(true)
    }
  })
})
