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
  children,
}: {
  initialConfig: ModuleColorConfig
  initialBudgetConfig?: BudgetColorConfig
  initialPhaseConfig?: PhaseColorConfig
  children: React.ReactNode
}) {
  const [config, setConfigState] = useState<ModuleColorConfig>(initialConfig)
  const [budgetConfig, setBudgetConfigState] = useState<BudgetColorConfig>(
    initialBudgetConfig ?? DEFAULT_BUDGET_COLORS
  )
  const [phaseConfig, setPhaseConfigState] = useState<PhaseColorConfig>(
    initialPhaseConfig ?? DEFAULT_PHASE_COLORS
  )

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

  // Apply on mount (in case server-side style and client config diverge)
  useEffect(() => {
    applyVars()
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
