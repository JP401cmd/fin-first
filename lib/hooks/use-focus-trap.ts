'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

type UseFocusTrapOptions = {
  active: boolean
  containerRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function useFocusTrap({
  active,
  containerRef,
  initialFocusRef,
  returnFocusRef,
}: UseFocusTrapOptions): void {
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!active) return

    triggerRef.current = document.activeElement
    const timer = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      if (!containerRef.current) return
      const focusable = containerRef.current.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR
      )
      focusable?.focus()
    })

    // Focus-herstel hoort in de CLEANUP, niet in een `active === false`-tak.
    // Een dialog die sluit door te UNMOUNTEN draait die tak namelijk nooit:
    // `welcome-popup.tsx` en `sleepmodus-overlay.tsx` geven `active: true`
    // hardcoded mee en verdwijnen door een conditionele render. De focus bleef
    // dan op het zojuist verwijderde element staan, de browser viel terug op
    // <body>, en een schermlezergebruiker verloor zijn plek in de pagina —
    // precies het a11y-gat dat UR3-17 #27a beschrijft.
    //
    // Voor consumenten die `active` wél omschakelen (bottom-sheet, slide-in-
    // pane, command-palette, rondleiding) verandert er niets: die cleanup liep
    // al bij true→false, alleen deed hij toen enkel `cancelAnimationFrame`.
    return () => {
      cancelAnimationFrame(timer)
      const target = returnFocusRef?.current ?? triggerRef.current
      triggerRef.current = null
      // `isConnected` — is het triggerelement zelf ook al uit de DOM (hele
      // pagina genavigeerd), dan is er niets zinnigs om naar terug te keren.
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus()
      }
    }
  }, [active, containerRef, initialFocusRef, returnFocusRef])

  useEffect(() => {
    if (!active) return
    if (typeof document === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return

      const focusableEls = containerRef.current.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR
      )
      if (focusableEls.length === 0) return

      const first = focusableEls[0]
      const last = focusableEls[focusableEls.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, containerRef])
}
