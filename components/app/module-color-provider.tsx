'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ModuleColorConfig, ModuleName, Shade } from '@/lib/color-palette'
import { generateModuleColorVars, generatePalette, DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

type ModuleColorContextType = {
  config: ModuleColorConfig
  setConfig: (config: ModuleColorConfig) => void
  getHex: (module: ModuleName, shade?: Shade) => string
}

const ModuleColorContext = createContext<ModuleColorContextType | null>(null)

/**
 * Applies module color CSS variables to document.documentElement.
 * Used for live preview (color picker) and hydration-time updates.
 *
 * Server-side inline styles handle initial render (no flash).
 * This provider handles dynamic updates after hydration.
 */
export function ModuleColorProvider({
  initialConfig,
  children,
}: {
  initialConfig: ModuleColorConfig
  children: React.ReactNode
}) {
  const [config, setConfigState] = useState<ModuleColorConfig>(initialConfig)

  const applyVars = useCallback((cfg: ModuleColorConfig) => {
    const vars = generateModuleColorVars(cfg)
    const root = document.documentElement
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
  }, [])

  const setConfig = useCallback((newConfig: ModuleColorConfig) => {
    setConfigState(newConfig)
    applyVars(newConfig)
  }, [applyVars])

  // Apply on mount (in case server-side style and client config diverge)
  useEffect(() => {
    applyVars(config)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getHex = useCallback((module: ModuleName, shade: Shade = 500): string => {
    const hex = config[module] || DEFAULT_MODULE_COLORS[module]
    const palette = generatePalette(hex)
    return palette[shade].hex
  }, [config])

  return (
    <ModuleColorContext.Provider value={{ config, setConfig, getHex }}>
      {children}
    </ModuleColorContext.Provider>
  )
}

export function useModuleColors() {
  const ctx = useContext(ModuleColorContext)
  if (!ctx) throw new Error('useModuleColors must be used within ModuleColorProvider')
  return ctx
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
