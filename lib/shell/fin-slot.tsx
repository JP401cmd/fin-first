'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type FinSlotContextType = {
  slotEl: HTMLDivElement | null
  registerSlot: (el: HTMLDivElement | null) => void
}

const FinSlotContext = createContext<FinSlotContextType | null>(null)

/**
 * FinSlotProvider — deelt één DOM-plek tussen de nav-pill en Fin.
 *
 * `FloatingNavButton` (diep in de ResponsiveShell) en `FinHome` (los sibling in
 * de app-layout) zijn zusters in de React-boom, geen ouder/kind: er loopt geen
 * prop-pad tussen ze. De pill rendert daarom een leeg slot-element en meldt dat
 * hier aan; `FinHome` portalt zijn idle-bubbel erin. Zo staat Fins trigger op
 * mobiel visueel ín de nav-pill-rij, terwijl het twee onafhankelijke componenten
 * blijven — en erft de bubbel gratis de verberg-logica van de pill (die zet
 * `visibility: hidden` + `aria-hidden` bij een open overlay of immersieve route).
 */
export function FinSlotProvider({ children }: { children: ReactNode }) {
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null)
  const registerSlot = useCallback((el: HTMLDivElement | null) => setSlotEl(el), [])
  return (
    <FinSlotContext.Provider value={{ slotEl, registerSlot }}>
      {children}
    </FinSlotContext.Provider>
  )
}

export function useFinSlot() {
  const ctx = useContext(FinSlotContext)
  if (!ctx) throw new Error('useFinSlot must be used within FinSlotProvider')
  return ctx
}
