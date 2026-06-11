'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'

// NB: dit was ooit een dual-purpose provider (dashboard-type widgets/briefing
// + ingeklapte-staat). Het AI-briefing-DAIshboard-systeem ("Systeem B") is
// verwijderd — zie docs/briefing-analyse.md. Wat resteert is uitsluitend de
// ingeklapte-staat van het widget-dashboard (localStorage-gedreven UI-pref).
// De naam blijft `DashboardType*` voor compat met de bestaande mount in
// app/(app)/layout.tsx.

interface DashboardTypeContextValue {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

const DashboardTypeContext = createContext<DashboardTypeContextValue>({
  isCollapsed: false,
  setIsCollapsed: () => {},
})

export function useDashboardType() {
  return useContext(DashboardTypeContext)
}

export function DashboardTypeProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('dashboard-collapsed') === 'true') {
        setIsCollapsedState(true)
      }
    } catch { /* noop */ }
  }, [])

  const setIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    try { localStorage.setItem('dashboard-collapsed', String(collapsed)) } catch { /* noop */ }
  }, [])

  // Stable context value — without this, the inline object literal triggers
  // re-renders in every consumer on every parent re-render even when nothing
  // actually changed.
  const value = useMemo(
    () => ({ isCollapsed, setIsCollapsed }),
    [isCollapsed, setIsCollapsed],
  )

  return (
    <DashboardTypeContext.Provider value={value}>
      {children}
    </DashboardTypeContext.Provider>
  )
}
