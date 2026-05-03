'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
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
 */
export type PaletteTheme = 'cream' | 'licht' | 'fd-bruin'

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
}

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
  }, [applyVars])

  const setBudgetConfig = useCallback((newConfig: BudgetColorConfig) => {
    budgetRef.current = newConfig
    setBudgetConfigState(newConfig)
    applyVars()
  }, [applyVars])

  const setPhaseConfig = useCallback((newConfig: PhaseColorConfig) => {
    phaseRef.current = newConfig
    setPhaseConfigState(newConfig)
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

  return (
    <ModuleColorContext.Provider value={{
      config, setConfig, getHex,
      budgetConfig, setBudgetConfig, getBudgetHex,
      phaseConfig, setPhaseConfig, getPhaseHex,
      fontTheme, setFontTheme,
      paletteTheme, setPaletteTheme,
    }}>
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
