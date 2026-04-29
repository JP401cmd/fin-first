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

    if (active) {
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
      return () => cancelAnimationFrame(timer)
    } else {
      const target = returnFocusRef?.current ?? triggerRef.current
      if (target && target instanceof HTMLElement) {
        target.focus()
      }
      triggerRef.current = null
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
