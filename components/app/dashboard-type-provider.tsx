'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type DashboardType = 'widgets' | 'briefing'

interface DashboardTypeContextValue {
  dashboardType: DashboardType
  setDashboardType: (type: DashboardType) => Promise<void>
  loading: boolean
}

const DashboardTypeContext = createContext<DashboardTypeContextValue>({
  dashboardType: 'widgets',
  setDashboardType: async () => {},
  loading: true,
})

export function useDashboardType() {
  return useContext(DashboardTypeContext)
}

export function DashboardTypeProvider({ children }: { children: ReactNode }) {
  const [dashboardType, setType] = useState<DashboardType>('widgets')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard-type')
      .then(r => r.json())
      .then(d => {
        if (d.dashboard_type === 'widgets' || d.dashboard_type === 'briefing') {
          setType(d.dashboard_type)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setDashboardType = useCallback(async (type: DashboardType) => {
    setType(type)
    await fetch('/api/dashboard-type', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard_type: type }),
    })
  }, [])

  return (
    <DashboardTypeContext.Provider value={{ dashboardType, setDashboardType, loading }}>
      {children}
    </DashboardTypeContext.Provider>
  )
}
