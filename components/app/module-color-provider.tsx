'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ModuleColorConfig, ModuleName, Shade, BudgetColorConfig, BudgetTypeName, PhaseColorConfig, PhaseColorName } from '@/lib/color-palette'
import {
  generateAllColorVars,
  generatePalette,
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'

export type FontTheme = 'editorial' | 'andada' | 'digital'

/**
 * Palette-thema's voor de page-bg / paper / subtle / borders.
 * Uitsluitend de "papieren onderlaag" — module-kleuren, ink-shades en accenten
 * blijven onafhankelijk gestuurd via `ModuleColorConfig`.
 *
 * `labelFont` (optioneel): sommige paletten dragen een eigen "krant"-typografie
 * voor de gedeelde editorial-labels (Kicker etc.). Wanneer gezet, activeert
 * `applyPaletteVars` `data-palette` op <html> zodat globals.css de labels naar
 * dat font kan scopen — zónder de andere paletten te raken. Ontbreekt het,
 * dan blijft de bestaande label-typografie (DM Mono) ongewijzigd.
 */
export type PaletteTheme = 'cream' | 'licht' | 'fd-bruin' | 'krant'

export const PALETTE_THEMES: Record<PaletteTheme, {
  label: string
  description: string
  bg: string
  paper: string
  subtle: string
  borderEd: string
  borderMd: string
}> = {
  cream: {
    label: 'Cream',
    description: 'Warm cream (default)',
    bg: '#f5efe2',
    paper: '#fbf7ec',
    subtle: '#f3ead9',
    borderEd: '#e3dac8',
    borderMd: '#ccc1aa',
  },
  licht: {
    label: 'Licht',
    description: 'Lichter cream, dichter bij wit',
    bg: '#fbf2e7',
    paper: '#fef9ef',
    subtle: '#f5ecd6',
    borderEd: '#e6dcc4',
    borderMd: '#d4c8a8',
  },
  'fd-bruin': {
    label: 'FD-bruin',
    description: 'Donkerder cream, FD.nl-stijl',
    bg: '#e9dcb8',
    paper: '#f0e6cf',
    subtle: '#e0d2a8',
    borderEd: '#c9b88e',
    borderMd: '#a89968',
  },
  // "Krant": knapperige redactionele wit-op-papier (bron: TriFinity Design
  // System-plaat). Lichtere, koelere basis met zuiver-witte kaarten voor
  // maximaal krantencontrast. Ink-shades blijven identiek aan de andere
  // paletten. Draagt een eigen label-font (Inter i.p.v. DM Mono) — gescopet
  // via data-palette="krant" in globals.css, dus opt-in en zonder regressie.
  krant: {
    label: 'Krant',
    description: 'Redactioneel wit — lichter, knapperig, Inter-labels',
    bg: '#faf9f6',
    paper: '#ffffff',
    subtle: '#f3f2ee',
    borderEd: '#e2e0d8',
    borderMd: '#c8c5ba',
  },
}

/**
 * Paletten die een eigen "krant"-label-typografie dragen. `applyPaletteVars`
 * zet `data-palette` op <html> zodat globals.css de gedeelde editorial-labels
 * (`.ed-kicker` e.d.) naar Inter kan scopen. Andere paletten blijven op de
 * bestaande DM-Mono-labels.
 */
const LABEL_FONT_PALETTES: ReadonlySet<PaletteTheme> = new Set(['krant'])

const PALETTE_STORAGE_KEY = 'tf-palette-theme'

type ModuleColorContextType = {
  // Module colors (unchanged API)
  config: ModuleColorConfig
  setConfig: (config: ModuleColorConfig) => void
  getHex: (module: ModuleName, shade?: Shade) => string

  // Budget colors
  budgetConfig: BudgetColorConfig
  setBudgetConfig: (config: BudgetColorConfig) => void
  getBudgetHex: (type: BudgetTypeName, shade?: Shade) => string

  // Phase colors
  phaseConfig: PhaseColorConfig
  setPhaseConfig: (config: PhaseColorConfig) => void
  getPhaseHex: (phase: PhaseColorName, shade?: Shade) => string

  /**
   * Niet-persisterende hydratatie vanuit een DB-leesroute. Zet refs + state +
   * CSS-vars, maar triggert NOOIT schedulePersist(). Gebruik dit overal waar
   * kleuren ingeladen worden (i.p.v. setConfig/setBudgetConfig): die setters
   * zijn uitsluitend voor echte gebruikersinteractie en zouden anders een
   * verse keuze overschrijven met stale DB-waarden (clobber-bug).
   */
  hydrateColors: (next: {
    modules?: ModuleColorConfig
    budget?: BudgetColorConfig
    phase?: PhaseColorConfig
  }) => void

  // Font theme
  fontTheme: FontTheme
  setFontTheme: (theme: FontTheme) => void

  // Palette (page-bg / paper / subtle / borders)
  paletteTheme: PaletteTheme
  setPaletteTheme: (theme: PaletteTheme) => void
}

const ModuleColorContext = createContext<ModuleColorContextType | null>(null)

/**
 * Applies all color CSS variables to document.documentElement.
 * Covers module (33) + budget (55) + phase (44) = 132 variables.
 *
 * Server-side inline styles handle initial render (no flash).
 * This provider handles dynamic updates after hydration.
 */
export function ModuleColorProvider({
  initialConfig,
  initialBudgetConfig,
  initialPhaseConfig,
  initialFontTheme = 'editorial',
  children,
}: {
  initialConfig: ModuleColorConfig
  initialBudgetConfig?: BudgetColorConfig
  initialPhaseConfig?: PhaseColorConfig
  initialFontTheme?: FontTheme
  children: React.ReactNode
}) {
  const [config, setConfigState] = useState<ModuleColorConfig>(initialConfig)
  const [budgetConfig, setBudgetConfigState] = useState<BudgetColorConfig>(
    initialBudgetConfig ?? DEFAULT_BUDGET_COLORS
  )
  const [phaseConfig, setPhaseConfigState] = useState<PhaseColorConfig>(
    initialPhaseConfig ?? DEFAULT_PHASE_COLORS
  )
  const [fontTheme, setFontThemeState] = useState<FontTheme>(initialFontTheme)
  const [paletteTheme, setPaletteThemeState] = useState<PaletteTheme>('cream')

  // Refs to avoid stale closures when any one config setter is called
  const moduleRef = useRef(config)
  const budgetRef = useRef(budgetConfig)
  const phaseRef = useRef(phaseConfig)

  // Debounce-timer voor het persisteren van kleur-keuzes naar profiles.
  // Eén gedeelde timer: snel achter elkaar klikken levert één PUT op.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Snapshot van wat er bij de eerstvolgende persist verstuurd moet worden.
  // BEWUST losgekoppeld van moduleRef/budgetRef: die refs volgen óók
  // niet-persisterende hydratatie (applyVars heeft de actueel getoonde kleuren
  // nodig). De persist mag echter UITSLUITEND de gebruikerskeuze versturen, ook
  // als er binnen het debounce-window stale DB-waarden gehydrateerd worden —
  // anders clobbert die hydratatie de keuze alsnog via de pending timer.
  const pendingPersistRef = useRef<{
    module_colors: ModuleColorConfig
    budget_colors: BudgetColorConfig
  } | null>(null)

  /**
   * Verstuurt de gesnapshotte kleur-keuze direct naar profiles via
   * /api/appearance. `keepalive: true` zorgt dat de request óók afrondt als de
   * pagina sluit/navigeert (browser houdt 'm in leven). Fire-and-forget: een
   * mislukte save mag de UI nooit blokkeren.
   */
  const sendPersist = useCallback(() => {
    const payload = pendingPersistRef.current
    if (!payload) return
    pendingPersistRef.current = null
    void fetch('/api/appearance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* offline / transient — CSS-vars blijven staan */ })
  }, [])

  /**
   * Snapshot de huidige keuze en persisteer 'm debounced (400ms) naar profiles.
   * CSS-vars zijn al direct toegepast; deze call zorgt dat de keuze een refresh
   * overleeft (layout laadt ze weer in). Een lopende timer wordt door de
   * pagehide/visibilitychange-flush hieronder direct verzilverd.
   */
  const schedulePersist = useCallback(() => {
    pendingPersistRef.current = {
      module_colors: moduleRef.current,
      budget_colors: budgetRef.current,
    }
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null
      sendPersist()
    }, 400)
  }, [sendPersist])

  const applyVars = useCallback(() => {
    const vars = generateAllColorVars({
      modules: moduleRef.current,
      budget: budgetRef.current,
      phase: phaseRef.current,
    })
    const root = document.documentElement
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
  }, [])

  const setConfig = useCallback((newConfig: ModuleColorConfig) => {
    moduleRef.current = newConfig
    setConfigState(newConfig)
    applyVars()
    schedulePersist()
  }, [applyVars, schedulePersist])

  const setBudgetConfig = useCallback((newConfig: BudgetColorConfig) => {
    budgetRef.current = newConfig
    setBudgetConfigState(newConfig)
    applyVars()
    schedulePersist()
  }, [applyVars, schedulePersist])

  const setPhaseConfig = useCallback((newConfig: PhaseColorConfig) => {
    phaseRef.current = newConfig
    setPhaseConfigState(newConfig)
    applyVars()
  }, [applyVars])

  /**
   * Niet-persisterende hydratatie: zet refs + state + CSS-vars zonder
   * schedulePersist(). Bewust GEEN persist — DB-leesroutes (bv. de
   * profielpagina) mogen nooit een PUT triggeren, anders overschrijven ze een
   * verse keuze met stale DB-waarden (clobber-bug). Alleen de losse setters
   * (setConfig/setBudgetConfig) — gebonden aan echte gebruikersinteractie —
   * persisteren.
   *
   * Heeft momenteel géén productie-afnemers: de layout hydrateert al
   * server-side via de initialConfig-props, dus client-side DB-loads zijn
   * overbodig geworden. Gereserveerd (en door de persist-regressietests
   * gecontracteerd) voor toekomstige DB-leesroutes — gebruik bij inladen
   * ALTIJD dit pad, nooit de setters.
   */
  const hydrateColors = useCallback((next: {
    modules?: ModuleColorConfig
    budget?: BudgetColorConfig
    phase?: PhaseColorConfig
  }) => {
    if (next.modules) { moduleRef.current = next.modules; setConfigState(next.modules) }
    if (next.budget)  { budgetRef.current = next.budget; setBudgetConfigState(next.budget) }
    if (next.phase)   { phaseRef.current = next.phase; setPhaseConfigState(next.phase) }
    applyVars()
  }, [applyVars])

  const applyFontVars = useCallback((theme: FontTheme) => {
    const pairs: [string, string] | null =
      theme === 'andada' ? ['var(--font-andada)', 'var(--font-andada)'] :
      theme === 'digital' ? ['var(--font-inter)', 'var(--font-inter)'] :
      null
    const targets = [document.body, document.querySelector('[data-app-root]')].filter(Boolean) as HTMLElement[]
    for (const el of targets) {
      if (pairs) {
        el.style.setProperty('--font-playfair', pairs[0])
        el.style.setProperty('--font-source-serif', pairs[1])
      } else {
        el.style.removeProperty('--font-playfair')
        el.style.removeProperty('--font-source-serif')
      }
    }
  }, [])

  const setFontTheme = useCallback((theme: FontTheme) => {
    setFontThemeState(theme)
    applyFontVars(theme)
  }, [applyFontVars])

  const applyPaletteVars = useCallback((theme: PaletteTheme) => {
    const palette = PALETTE_THEMES[theme]
    if (!palette) return
    const root = document.documentElement
    root.style.setProperty('--bg', palette.bg)
    root.style.setProperty('--paper', palette.paper)
    root.style.setProperty('--subtle', palette.subtle)
    root.style.setProperty('--border-ed', palette.borderEd)
    root.style.setProperty('--border-md', palette.borderMd)
    root.style.setProperty('--background', palette.bg)
    // Label-typografie is per-palet: alleen paletten met een eigen krant-font
    // krijgen data-palette gezet zodat globals.css de editorial-labels naar
    // Inter scopet. Andere paletten wissen het attribuut → DM-Mono-labels.
    if (LABEL_FONT_PALETTES.has(theme)) {
      root.dataset.palette = theme
    } else {
      delete root.dataset.palette
    }
  }, [])

  const setPaletteTheme = useCallback((theme: PaletteTheme) => {
    setPaletteThemeState(theme)
    applyPaletteVars(theme)
    try { localStorage.setItem(PALETTE_STORAGE_KEY, theme) } catch { /* private mode / quota */ }
  }, [applyPaletteVars])

  // Apply on mount (in case server-side style and client config diverge)
  useEffect(() => {
    applyVars()
    applyFontVars(initialFontTheme)
    // Hydrate palette from localStorage
    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY)
      if (stored && stored in PALETTE_THEMES) {
        const t = stored as PaletteTheme
        setPaletteThemeState(t)
        applyPaletteVars(t)
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush-hardening: een full reload / tab-sluit / app-switch binnen het 400ms
  // debounce-window zou een net-gemaakte kleurkeuze verliezen. We flushen een
  // lopende debounce-timer direct met dezelfde PUT (keepalive overleeft de
  // navigatie). `pagehide` dekt reload/sluit/back-forward-cache; de hidden-
  // overgang van `visibilitychange` dekt mobiel app-switchen (waar pagehide
  // niet altijd vuurt).
  useEffect(() => {
    const flush = () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current)
        persistTimer.current = null
        sendPersist()
      }
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sendPersist])

  const getHex = useCallback((module: ModuleName, shade: Shade = 500): string => {
    const hex = config[module] || DEFAULT_MODULE_COLORS[module]
    const palette = generatePalette(hex)
    return palette[shade].hex
  }, [config])

  const getBudgetHex = useCallback((type: BudgetTypeName, shade: Shade = 500): string => {
    const hex = budgetConfig[type] || DEFAULT_BUDGET_COLORS[type]
    const palette = generatePalette(hex)
    return palette[shade].hex
  }, [budgetConfig])

  const getPhaseHex = useCallback((phase: PhaseColorName, shade: Shade = 500): string => {
    const hex = phaseConfig[phase] || DEFAULT_PHASE_COLORS[phase]
    const palette = generatePalette(hex)
    return palette[shade].hex
  }, [phaseConfig])

  // Gememoized context-value: alle setters/getters zijn al useCallback, dus
  // zonder deze memo kreeg élke provider-render een nieuwe object-identiteit
  // en herrenderden alle useModuleColors/useModuleHex-consumers app-breed —
  // hoogfrequent tijdens kleur-slepen op /mijn/uiterlijk. Zelfde patroon als
  // PageStatusProvider/DisplayModeProvider/FeatureAccessProvider.
  const contextValue = useMemo(() => ({
    config, setConfig, getHex,
    budgetConfig, setBudgetConfig, getBudgetHex,
    phaseConfig, setPhaseConfig, getPhaseHex,
    hydrateColors,
    fontTheme, setFontTheme,
    paletteTheme, setPaletteTheme,
  }), [config, setConfig, getHex, budgetConfig, setBudgetConfig, getBudgetHex,
    phaseConfig, setPhaseConfig, getPhaseHex, hydrateColors,
    fontTheme, setFontTheme, paletteTheme, setPaletteTheme])

  return (
    <ModuleColorContext.Provider value={contextValue}>
      {children}
    </ModuleColorContext.Provider>
  )
}

export function useModuleColors() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('useModuleColors must be used within ModuleColorProvider')
  return ctx
}

export function useBudgetColors() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('useBudgetColors must be used within ModuleColorProvider')
  return { budgetConfig: ctx.budgetConfig, setBudgetConfig: ctx.setBudgetConfig, getBudgetHex: ctx.getBudgetHex }
}

export function usePhaseColors() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('usePhaseColors must be used within ModuleColorProvider')
  return { phaseConfig: ctx.phaseConfig, setPhaseConfig: ctx.setPhaseConfig, getPhaseHex: ctx.getPhaseHex }
}

/**
 * Geeft uitsluitend de niet-persisterende hydratatie-API terug. Bedoeld voor
 * DB-leesroutes (bv. de profielpagina) die ingeladen kleuren in de provider
 * willen zetten zónder een PUT /api/appearance te triggeren.
 */
export function useColorHydration() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('useColorHydration must be used within ModuleColorProvider')
  return ctx.hydrateColors
}

export function useFontTheme() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('useFontTheme must be used within ModuleColorProvider')
  return { fontTheme: ctx.fontTheme, setFontTheme: ctx.setFontTheme }
}

export function usePaletteTheme() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('usePaletteTheme must be used within ModuleColorProvider')
  return { paletteTheme: ctx.paletteTheme, setPaletteTheme: ctx.setPaletteTheme }
}

/**
 * Hook to get hex color for a module shade — for chart libraries.
 * Falls back to DEFAULT_MODULE_COLORS if provider is not mounted.
 */
export function useModuleHex(module: ModuleName, shade: Shade = 500): string {
  const ctx = useContext(ModuleColorContext)
  if (ctx) return ctx.getHex(module, shade)
  // Fallback without context
  const hex = DEFAULT_MODULE_COLORS[module]
  const palette = generatePalette(hex)
  return palette[shade].hex
}
