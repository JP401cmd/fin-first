'use client'

import { useState, useCallback } from 'react'
import type { ModuleId } from '@/lib/module-registry'
import { validateModules } from '@/lib/module-registry'

/**
 * Hook for toggling user-selectable modules.
 * Validates dependency rules before persisting, performs optimistic update,
 * and reloads the page after a successful save so nav/dashboard recomputes.
 */
export function useModuleToggle(initialModules: ModuleId[]) {
  const [modules, setModules] = useState<ModuleId[]>(initialModules)
  const [saving, setSaving] = useState(false)

  const toggle = useCallback(
    async (
      moduleId: ModuleId,
      enabled: boolean,
    ): Promise<{ success: boolean; errors: string[] }> => {
      const updated = enabled
        ? [...modules, moduleId]
        : modules.filter((m) => m !== moduleId)

      // Validate before any state update
      const validation = validateModules(updated)
      if (!validation.valid) return { success: false, errors: validation.errors }

      // Optimistic update
      setSaving(true)
      setModules(updated)

      try {
        const res = await fetch('/api/modules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modules: updated }),
        })

        if (!res.ok) {
          setModules(modules) // Revert on API error
          return { success: false, errors: ['Opslaan mislukt'] }
        }

        // Force full re-render: nav, dashboard layout, and widget gating all depend on active modules
        window.location.reload()
        return { success: true, errors: [] }
      } catch {
        setModules(modules) // Revert on network error
        return { success: false, errors: ['Netwerkfout'] }
      } finally {
        setSaving(false)
      }
    },
    [modules],
  )

  return { modules, toggle, saving }
}
