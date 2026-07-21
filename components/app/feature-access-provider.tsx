'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { FeatureAccessData, FeatureAccessMap } from '@/lib/compute-feature-access'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import { FeatureAccessContext, type FeatureAccessContextValue } from '@/lib/feature-access/context'

// De context + de consumer-hooks (useFeatureAccess/useModuleAccess) wonen nu in
// lib/feature-access/context.ts (import-richting UI→lib). Hier ge-re-export zodat
// bestaande component-imports uit dit pad blijven werken. Precies één
// createContext-instantie (die uit lib) — zowel Provider als hooks gebruiken 'm.
export { useFeatureAccess, useModuleAccess } from '@/lib/feature-access/context'
export type { FeatureAccessContextValue }

export function FeatureAccessProvider({
  data,
  activeModules = [...ALL_MODULES],
  children,
}: {
  data: FeatureAccessData
  /** Active modules for the current user. Defaults to all modules (backward compat). */
  activeModules?: ModuleId[]
  children: ReactNode
}) {
  const [featureOverrides, setFeatureOverrides] = useState<FeatureAccessMap>(data.features)

  // Allow optimistic refresh after user toggles
  const refreshFeaturePrefs = useCallback((prefs: Record<string, boolean>) => {
    setFeatureOverrides(prev => {
      const next = { ...prev }
      for (const [id, enabled] of Object.entries(prefs)) {
        if (next[id]) {
          next[id] = { ...next[id], accessible: enabled, reason: enabled ? 'accessible' : 'user_disabled' }
        }
      }
      return next
    })
  }, [])

  const [moduleOverrides, setModuleOverrides] = useState<ModuleId[]>(activeModules)

  /** Update active modules client-side without page reload */
  const refreshModules = useCallback((modules: ModuleId[]) => {
    setModuleOverrides(modules)
  }, [])

  // Stable context value — re-renders consumers only when something they
  // actually depend on changes (not on every parent re-render).
  const contextValue = useMemo<FeatureAccessContextValue>(
    () => ({
      ...data,
      features: featureOverrides,
      refreshFeaturePrefs,
      activeModules: moduleOverrides,
      refreshModules,
    }),
    [data, featureOverrides, refreshFeaturePrefs, moduleOverrides, refreshModules],
  )

  return (
    <FeatureAccessContext.Provider value={contextValue}>
      {children}
    </FeatureAccessContext.Provider>
  )
}
