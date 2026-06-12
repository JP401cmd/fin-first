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
} from './module-color-provider'
import {
  DEFAULT_MODULE_COLORS,
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
      }
      // Kleur B: de STALE DB-waarden die het laadpad daarna hydrateert
      const staleDbB: ModuleColorConfig = {
        kern:    '#aaaaaa',
        wil:     '#bbbbbb',
        horizon: '#cccccc',
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
