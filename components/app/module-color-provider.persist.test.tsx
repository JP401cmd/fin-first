/* eslint-disable react-hooks/globals -- test-harnas: <Capture /> vangt hook-API's
 * bewust in buitenvariabelen zodat de tests setConfig/hydrateColors direct kunnen
 * aanroepen; de React-compiler compileert testbestanden niet. */
/**
 * Regressietests voor bug: /mijn/profiel triggert ongewenste PUT /api/appearance
 * via de persisterende setters (setConfig / setBudgetConfig) bij het inladen van
 * DB-kleuren.
 *
 * Gewenst gedrag (na de fix): het laadpad mag de provider nooit via de
 * persisterende setters voeden — het gebruikt de niet-persisterende
 * `hydrateColors`-API. Alleen echte gebruikersinteractie (setConfig /
 * setBudgetConfig) persisteert.
 *
 * Deze tests pinnen het gefixte gedrag:
 *   - Scenario 1: hydrateColors vuurt GEEN PUT.
 *   - Scenario 2: een gebruikerskeuze die binnen de debounce gevolgd wordt door
 *     een hydratatie persisteert nog steeds de KEUZE (geen clobber).
 *   - Scenario 3: een lopende debounce-timer wordt door `pagehide` direct
 *     geflusht (keepalive).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  ModuleColorProvider,
  useModuleColors,
  useColorHydration,
  useTopbarColor,
} from './module-color-provider'
import {
  DEFAULT_MODULE_COLORS,
  DEFAULT_TOPBAR_COLOR,
  type ModuleColorConfig,
  type BudgetColorConfig,
} from '@/lib/color-palette'
import { useEffect } from 'react'

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Mini-consumer die het laadpad van ProfielPage nabootst: roept de
 *  niet-persisterende `hydrateColors` aan met kleuren die net uit de DB zijn
 *  gelezen (eenmalig bij mount via effect) — exact zoals een DB-leesroute hoort
 *  te hydrateren. */
function DbLoadViaEffect({
  moduleColors,
  budgetColors,
}: {
  moduleColors?: ModuleColorConfig
  budgetColors?: BudgetColorConfig
}) {
  const hydrateColors = useColorHydration()

  useEffect(() => {
    hydrateColors({ modules: moduleColors, budget: budgetColors })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

// ─── Setup / teardown ──────────────────────────────────────────────────────

let fetchCalls: { method: string; url: string; body: string }[] = []

beforeEach(() => {
  fetchCalls = []
  vi.useFakeTimers()
  window.localStorage.clear()

  // Vervang global fetch door een spy die alle aanroepen bijhoudt.
  // stubGlobal i.p.v. directe toewijzing: unstubAllGlobals() herstelt het
  // origineel gegarandeerd, ook onder niet-geïsoleerde pool-configs.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      url: String(input),
      body: typeof init?.body === 'string' ? init.body : '',
    })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Scenario 1: DB-laadpad mag GEEN PUT /api/appearance triggeren ─────────

describe('ModuleColorProvider — persist-gedrag bij DB-lading', () => {
  it(
    'kleuren laden via hydrateColors vuurt GEEN PUT /api/appearance ' +
    '(DB-leesroutes mogen nooit persisteren — clobber-bug)',
    async () => {
      const dbModuleColors: ModuleColorConfig = {
        kern: '#ff0000',
        wil: '#00ff00',
        horizon: '#0000ff',
        fin: '#ff00ff',
      }
      const dbBudgetColors: BudgetColorConfig = {
        income:  '#aabbcc',
        expense: '#bbccdd',
        savings: '#ccddee',
        debt:    '#ddeeff',
        other:   '#eeff00',
      }

      await act(async () => {
        render(
          <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
            <DbLoadViaEffect
              moduleColors={dbModuleColors}
              budgetColors={dbBudgetColors}
            />
          </ModuleColorProvider>,
        )
      })

      // Laat de debounce-timer (400ms) volledig afvuren
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      const appearancePuts = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )

      // hydrateColors persisteert bewust niet → 0 PUT-aanroepen.
      expect(appearancePuts).toHaveLength(0)
    },
  )
})

// ─── Scenario 2: Race — gebruikerskeuze mag NIET overschreven worden ───────

describe('ModuleColorProvider — clobber-bewijs bij race', () => {
  it(
    'een gebruikerskeuze (setConfig A) die binnen 400ms wordt gevolgd door een ' +
    'DB-hydratatie (hydrateColors staleB) persisteert de KEUZE A, niet de stale B',
    async () => {
      // Kleur A: de GEBRUIKER heeft net een nieuwe kleur gekozen
      const userChoiceA: ModuleColorConfig = {
        kern:    '#111111',
        wil:     '#222222',
        horizon: '#333333',
        fin:     '#444444',
      }
      // Kleur B: de STALE DB-waarden die het laadpad daarna hydrateert
      const staleDbB: ModuleColorConfig = {
        kern:    '#aaaaaa',
        wil:     '#bbbbbb',
        horizon: '#cccccc',
        fin:     '#dddddd',
      }

      let capturedSetConfig!: (c: ModuleColorConfig) => void
      let capturedHydrate!: (n: { modules?: ModuleColorConfig }) => void

      function Capture() {
        capturedSetConfig = useModuleColors().setConfig
        capturedHydrate = useColorHydration()
        return null
      }

      await act(async () => {
        render(
          <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
            <Capture />
          </ModuleColorProvider>,
        )
      })

      // Stap 1: gebruiker klikt op een kleur → setConfig(A) (persisteert, debounced)
      act(() => {
        capturedSetConfig(userChoiceA)
      })

      // Stap 2: binnen de debounce-window (< 400ms) hydrateert het laadpad staleB.
      // hydrateColors mag de lopende persist NIET aanraken/overschrijven.
      act(() => {
        capturedHydrate({ modules: staleDbB })
      })

      // Stap 3: debounce verstrijkt → de timer vuurt
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      const appearancePuts = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )

      // Er MOET een PUT zijn (de gebruikerskeuze A moest persisteren)
      expect(appearancePuts.length).toBeGreaterThanOrEqual(1)

      // De verstuurde body moet de GEBRUIKERSKEUZE A bevatten, niet de stale B.
      const lastPut = appearancePuts[appearancePuts.length - 1]
      const sentBody = JSON.parse(lastPut.body) as { module_colors?: ModuleColorConfig }

      expect(sentBody.module_colors?.kern).toBe('#111111') // userChoiceA — niet '#aaaaaa'
    },
  )
})

// ─── Scenario 3: pagehide-flush verzilvert een lopende debounce direct ─────

describe('ModuleColorProvider — flush-hardening bij pagehide', () => {
  it(
    'een keuze binnen de debounce-window die gevolgd wordt door `pagehide` ' +
    'wordt direct geflusht met keepalive (geen verloren save bij reload/sluit)',
    async () => {
      const userChoice: ModuleColorConfig = {
        kern:    '#abcabc',
        wil:     '#defdef',
        horizon: '#123123',
        fin:     '#456456',
      }

      let capturedSetConfig!: (c: ModuleColorConfig) => void

      function Capture() {
        capturedSetConfig = useModuleColors().setConfig
        return null
      }

      await act(async () => {
        render(
          <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
            <Capture />
          </ModuleColorProvider>,
        )
      })

      // Gebruiker kiest een kleur → debounced persist (timer loopt nog)
      act(() => {
        capturedSetConfig(userChoice)
      })

      // Vóór de 400ms verstrijkt sluit/reload de pagina → pagehide
      act(() => {
        window.dispatchEvent(new Event('pagehide'))
      })

      const appearancePuts = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )

      // De flush stuurt de PUT meteen, zónder dat de timer hoefde af te vuren.
      expect(appearancePuts.length).toBeGreaterThanOrEqual(1)

      const lastPut = appearancePuts[appearancePuts.length - 1]
      const sentBody = JSON.parse(lastPut.body) as { module_colors?: ModuleColorConfig }
      expect(sentBody.module_colors?.kern).toBe('#abcabc')

      // De fetch is met keepalive verstuurd zodat hij de navigatie overleeft.
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
      const putCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes('/api/appearance'),
      )
      expect(putCall).toBeTruthy()
      expect((putCall?.[1] as RequestInit | undefined)?.keepalive).toBe(true)

      // Voorkom dat een achtergebleven timer in een latere test nog vuurt.
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      const putsAfter = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )
      // Geen dubbele PUT: de timer is door de flush opgeruimd.
      expect(putsAfter.length).toBe(appearancePuts.length)
    },
  )
})

// ─── Scenario 4: visibilitychange → hidden flusht ook de lopende timer ────

describe('ModuleColorProvider — flush-hardening bij visibilitychange hidden', () => {
  it(
    'een keuze binnen de debounce-window die gevolgd wordt door ' +
    '`visibilitychange` (→ hidden, mobiel app-switch) wordt direct geflusht',
    async () => {
      const userChoice: ModuleColorConfig = {
        kern:    '#fedcba',
        wil:     '#abcdef',
        horizon: '#112233',
        fin:     '#445566',
      }

      let capturedSetConfig!: (c: ModuleColorConfig) => void

      function Capture() {
        capturedSetConfig = useModuleColors().setConfig
        return null
      }

      await act(async () => {
        render(
          <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
            <Capture />
          </ModuleColorProvider>,
        )
      })

      // Gebruiker kiest een kleur — timer staat op 400ms
      act(() => {
        capturedSetConfig(userChoice)
      })

      // Simuleer mobiel app-switch: document wordt hidden vóór timer afvuurt
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      const appearancePuts = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )

      // De flush stuurt de PUT meteen, zónder dat de timer hoefde af te vuren.
      expect(appearancePuts.length).toBeGreaterThanOrEqual(1)

      const lastPut = appearancePuts[appearancePuts.length - 1]
      const sentBody = JSON.parse(lastPut.body) as { module_colors?: ModuleColorConfig }
      expect(sentBody.module_colors?.kern).toBe('#fedcba')

      // Timer opgeruimd — geen dubbele PUT daarna
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      const putsAfter = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )
      expect(putsAfter.length).toBe(appearancePuts.length)
    },
  )
})

// ─── Scenario 5: hydrateColors met alleen budget vuurt ook GEEN PUT ────────

describe('ModuleColorProvider — persist-gedrag bij partieel budget-only hydrateren', () => {
  it(
    'hydrateColors({ budget }) zonder modules vuurt GEEN PUT /api/appearance ' +
    '(ook het budget-only pad is niet-persisterend)',
    async () => {
      const dbBudgetOnly: BudgetColorConfig = {
        income:  '#111aaa',
        expense: '#222bbb',
        savings: '#333ccc',
        debt:    '#444ddd',
        other:   '#555eee',
      }

      await act(async () => {
        render(
          <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
            <DbLoadViaEffect budgetColors={dbBudgetOnly} />
          </ModuleColorProvider>,
        )
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      const appearancePuts = fetchCalls.filter(
        (c) => c.method === 'PUT' && c.url.includes('/api/appearance'),
      )

      expect(appearancePuts).toHaveLength(0)
    },
  )
})

// ─── Scenario 5: TopBar-kleur (ADR 0174 D3, F2) ───────────────────────────

describe('ModuleColorProvider — TopBar-kleur', () => {
  type Api = ReturnType<typeof useModuleColors>
  let api!: Api
  let hydrate!: ReturnType<typeof useColorHydration>

  function Capture() {
    api = useModuleColors()
    hydrate = useColorHydration()
    return null
  }

  async function renderProvider(initialTopbarColor?: string | null) {
    await act(async () => {
      render(
        <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS} initialTopbarColor={initialTopbarColor}>
          <div data-app-root>
            <Capture />
          </div>
        </ModuleColorProvider>,
      )
    })
  }

  function appearancePuts() {
    return fetchCalls.filter((c) => c.method === 'PUT' && c.url.includes('/api/appearance'))
  }

  it('seedt uit de profielrij en vuurt bij mount geen PUT', async () => {
    await renderProvider('#1F2A44')
    expect(api.topbarColor).toBe('#1f2a44')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(appearancePuts()).toHaveLength(0)
  })

  it('zonder keuze (null) is de kleur de standaard', async () => {
    await renderProvider(null)
    expect(api.topbarColor).toBe(DEFAULT_TOPBAR_COLOR)
  })

  it('een keuze stuurt ALLEEN topbar_color, lowercase — de andere groepen niet', async () => {
    await renderProvider()
    act(() => { api.setTopbarColor('#1D4E6B') })
    expect(api.topbarColor).toBe('#1d4e6b')
    await act(async () => { vi.advanceTimersByTime(500) })

    const puts = appearancePuts()
    expect(puts).toHaveLength(1)
    expect(JSON.parse(puts[0].body)).toEqual({ topbar_color: '#1d4e6b' })
  })

  it('reset (de standaard of null) persisteert null', async () => {
    await renderProvider('#1f2a44')
    act(() => { api.setTopbarColor(DEFAULT_TOPBAR_COLOR) })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(JSON.parse(appearancePuts()[0].body)).toEqual({ topbar_color: null })
    expect(api.topbarColor).toBe(DEFAULT_TOPBAR_COLOR)
  })

  it('een accent en een balkkleur binnen één debounce gaan samen in één PUT, zonder budget_colors', async () => {
    await renderProvider()
    const accent = { ...DEFAULT_MODULE_COLORS, kern: '#123456' }
    act(() => { api.setConfig(accent) })
    act(() => { api.setTopbarColor('#4a2a45') })
    await act(async () => { vi.advanceTimersByTime(500) })

    const puts = appearancePuts()
    expect(puts).toHaveLength(1)
    const body = JSON.parse(puts[0].body)
    expect(body).toEqual({ module_colors: accent, topbar_color: '#4a2a45' })
    expect(body).not.toHaveProperty('budget_colors')
  })

  it('een hydratatie binnen de debounce voegt geen groep toe aan de lopende persist', async () => {
    await renderProvider()
    act(() => { api.setTopbarColor('#2f2f33') })
    act(() => { hydrate({ modules: { ...DEFAULT_MODULE_COLORS, kern: '#aaaaaa' } }) })
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(JSON.parse(appearancePuts()[0].body)).toEqual({ topbar_color: '#2f2f33' })
  })

  it('zet de --topbar-*-vars op documentElement ÉN op [data-app-root] (daar wint de SSR-inline)', async () => {
    await renderProvider()
    act(() => { api.setTopbarColor('#faf9f6') })

    const appRoot = document.querySelector<HTMLElement>('[data-app-root]')!
    for (const el of [document.documentElement, appRoot]) {
      expect(el.style.getPropertyValue('--topbar-bg')).toBe('#faf9f6')
      // Lichte balk → inkt als voorgrond.
      expect(el.style.getPropertyValue('--topbar-fg')).toBe('#1a1916')
    }
    // Ook de accenten landen op de app-root, anders blijft hun live preview
    // achter de SSR-waarde hangen.
    act(() => { api.setConfig({ ...DEFAULT_MODULE_COLORS, kern: '#123456' }) })
    expect(appRoot.style.getPropertyValue('--color-kern-500')).not.toBe('')
    await act(async () => { vi.advanceTimersByTime(500) })
  })

  it('een save die op de server of het netwerk mislukt, gaat mee met de volgende keuze', async () => {
    await renderProvider()
    const accent = { ...DEFAULT_MODULE_COLORS, kern: '#123456' }
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(input), body: String(init?.body ?? '') })
      calls += 1
      return new Response('{}', { status: calls === 1 ? 500 : 200 })
    }))

    act(() => { api.setConfig(accent) })
    await act(async () => { vi.advanceTimersByTime(500) })
    act(() => { api.setTopbarColor('#1f2a44') })
    await act(async () => { vi.advanceTimersByTime(500) })

    const puts = appearancePuts()
    expect(puts).toHaveLength(2)
    expect(JSON.parse(puts[1].body)).toEqual({ module_colors: accent, topbar_color: '#1f2a44' })
  })

  it('een 4xx wordt niet opnieuw verstuurd (ongeldige invoer blijft ongeldig)', async () => {
    await renderProvider()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(input), body: String(init?.body ?? '') })
      calls += 1
      return new Response('{}', { status: calls === 1 ? 400 : 200 })
    }))

    act(() => { api.setConfig({ ...DEFAULT_MODULE_COLORS, kern: '#654321' }) })
    await act(async () => { vi.advanceTimersByTime(500) })
    act(() => { api.setTopbarColor('#1f2a44') })
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(JSON.parse(appearancePuts()[1].body)).toEqual({ topbar_color: '#1f2a44' })
  })

  /**
   * F2 🟡-2 — de provider volgt de server na `router.refresh()`.
   *
   * Given: de kleur is op een ánder apparaat gewijzigd, en hier loopt een
   *   `router.refresh()`. De (app)-layout rendert opnieuw en geeft nieuwe
   *   `initial*`-props door; de SSR-inline op `[data-app-root]` volgt die al.
   * When: de provider rendert met die nieuwe props.
   * Then: zijn state, `useTopbarColor()` en de vars volgen mee, zonder PUT.
   *   Tot deze fix bleef de state op de oude waarde hangen (`useState` leest zijn
   *   startwaarde één keer), en de eerstvolgende `applyVars()` schreef de oude
   *   kleuren weer over de nieuwe heen.
   * Maar: een eigen keuze die nog niet bij de server is (debounce of PUT
   *   onderweg) wint van een server-render die daarvóór begon.
   */
  describe('volgt de server na router.refresh() (F2 🟡-2)', () => {
    function tree(props: { topbar?: string | null; modules?: ModuleColorConfig }) {
      return (
        <ModuleColorProvider
          initialConfig={props.modules ?? DEFAULT_MODULE_COLORS}
          initialTopbarColor={props.topbar}
        >
          <div data-app-root>
            <Capture />
          </div>
        </ModuleColorProvider>
      )
    }

    it('neemt een nieuwe balkkleur van de server over, zonder PUT', async () => {
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(tree({ topbar: '#1f2a44' })) })
      await act(async () => { view.rerender(tree({ topbar: '#1D4E6B' })) })

      expect(api.topbarColor).toBe('#1d4e6b')
      const appRoot = document.querySelector<HTMLElement>('[data-app-root]')!
      expect(document.documentElement.style.getPropertyValue('--topbar-bg')).toBe('#1d4e6b')
      expect(appRoot.style.getPropertyValue('--topbar-bg')).toBe('#1d4e6b')
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(appearancePuts()).toHaveLength(0)
    })

    it('neemt nieuwe accenten over, en een latere keuze in een andere groep schrijft ze niet terug', async () => {
      const nieuw = { ...DEFAULT_MODULE_COLORS, kern: '#123456' }
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(tree({})) })
      await act(async () => { view.rerender(tree({ modules: nieuw })) })
      expect(api.config.kern).toBe('#123456')

      const kernNa = document.documentElement.style.getPropertyValue('--color-kern-500')
      // setBudgetConfig draait `applyVars()` over álle groepen: daar kwamen tot de
      // fix de oude accenten uit de refs terug.
      act(() => { api.setBudgetConfig(api.budgetConfig) })
      expect(document.documentElement.style.getPropertyValue('--color-kern-500')).toBe(kernNa)
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(appearancePuts().map((p) => JSON.parse(p.body))).toEqual([{ budget_colors: api.budgetConfig }])
    })

    it('een eigen keuze binnen de debounce wint van een oudere server-render', async () => {
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(tree({ topbar: '#1f2a44' })) })
      act(() => { api.setTopbarColor('#4a2a45') })
      // Een refresh die vóór de PUT begon: de server kent de keuze nog niet.
      await act(async () => { view.rerender(tree({ topbar: '#1d4e6b' })) })

      expect(api.topbarColor).toBe('#4a2a45')
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(JSON.parse(appearancePuts()[0].body)).toEqual({ topbar_color: '#4a2a45' })
    })

    it('een eigen keuze waarvan de PUT nog onderweg is, wint ook', async () => {
      let release!: () => void
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(input), body: String(init?.body ?? '') })
        return new Promise<Response>((resolve) => { release = () => resolve(new Response('{}', { status: 200 })) })
      }))
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(tree({ topbar: '#1f2a44' })) })
      act(() => { api.setTopbarColor('#4a2a45') })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(appearancePuts()).toHaveLength(1)

      await act(async () => { view.rerender(tree({ topbar: '#1d4e6b' })) })
      expect(api.topbarColor).toBe('#4a2a45')

      // Is de PUT binnen, dan volgt de provider de server weer.
      await act(async () => { release() })
      await act(async () => { view.rerender(tree({ topbar: '#234a35' })) })
      expect(api.topbarColor).toBe('#234a35')
    })

    it('een refresh met dezelfde waarden (nieuw object) laat een lokale preview staan', async () => {
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(tree({ modules: { ...DEFAULT_MODULE_COLORS } })) })
      act(() => { hydrate({ modules: { ...DEFAULT_MODULE_COLORS, wil: '#abcdef' } }) })
      await act(async () => { view.rerender(tree({ modules: { ...DEFAULT_MODULE_COLORS } })) })
      expect(api.config.wil).toBe('#abcdef')
    })
  })

  it('useTopbarColor volgt de keuze, en valt zonder provider terug op de standaard', async () => {
    let seen = ''
    function Reader() {
      seen = useTopbarColor()
      return null
    }
    await act(async () => { render(<Reader />) })
    expect(seen).toBe(DEFAULT_TOPBAR_COLOR)

    await act(async () => {
      render(
        <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS} initialTopbarColor="#234a35">
          <Reader />
        </ModuleColorProvider>,
      )
    })
    expect(seen).toBe('#234a35')
  })
})
