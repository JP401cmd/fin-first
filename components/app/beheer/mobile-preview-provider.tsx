'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface DevicePreset {
  name: string
  width: number
  height: number
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
]

interface MobilePreviewState {
  enabled: boolean
  device: DevicePreset
  setEnabled: (enabled: boolean) => void
  setDevice: (device: DevicePreset) => void
}

const STORAGE_KEY = 'trifinity_mobile_preview'

const MobilePreviewContext = createContext<MobilePreviewState | null>(null)

export function useMobilePreview() {
  const ctx = useContext(MobilePreviewContext)
  if (!ctx) throw new Error('useMobilePreview must be used within MobilePreviewProvider')
  return ctx
}

export function MobilePreviewProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false)
  const [device, setDeviceState] = useState<DevicePreset>(DEVICE_PRESETS[1])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (typeof parsed.enabled === 'boolean') setEnabledState(parsed.enabled)
        if (parsed.device) {
          const match = DEVICE_PRESETS.find(d => d.name === parsed.device)
          if (match) setDeviceState(match)
        }
      }
    } catch {}
    setMounted(true)
  }, [])

  function setEnabled(val: boolean) {
    setEnabledState(val)
    persist(val, device)
  }

  function setDevice(d: DevicePreset) {
    setDeviceState(d)
    persist(enabled, d)
  }

  function persist(en: boolean, dev: DevicePreset) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: en, device: dev.name }))
    } catch {}
  }

  return (
    <MobilePreviewContext.Provider value={{ enabled: mounted && enabled, device, setEnabled, setDevice }}>
      {children}
    </MobilePreviewContext.Provider>
  )
}
