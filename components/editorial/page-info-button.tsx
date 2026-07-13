'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Info } from 'lucide-react'

/**
 * PageInfoButton — "Wat zie ik hier?" info-knop voor hoofdpagina's.
 *
 * Toont een klein i-icoon; bij klik/tap opent een popover met 2-3 zinnen
 * die uitlegt wat de pagina toont en wat de gebruiker hier kan doen.
 *
 * Positie: absoluut t.o.v. parent (parent moet `relative` zijn).
 * Consistent rechts-boven geplaatst op alle ~15 hoofdpagina's.
 *
 * Design: editorial — mono uppercase label, module-active border,
 * subtle paper-background popover. Sluit bij Escape, outside-click/tap.
 *
 * Structuur: buitenste `<div>` draagt de absolute-positie (className prop),
 * binnenste `<div>` is `relative` anchor voor de popover. Zo conflicteren
 * position-utilities niet op hetzelfde element.
 */

interface PageInfoButtonProps {
  /** 2-3 zinnen die de pagina context geven. */
  description: string
  /** Optionele label boven de beschrijving (default: "Wat zie ik hier?"). */
  label?: string
  /** Extra CSS-classes op de wrapper (bijv. voor positie-overrides). */
  className?: string
}

export function PageInfoButton({
  description,
  label = 'Wat zie ik hier?',
  className = '',
}: PageInfoButtonProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Viewport-clamp: het panel ankert right-0 aan de knop, maar de knop staat
  // niet altijd tegen de schermrand (bv. rapportages-toolbar) — zonder clamp
  // valt 280px panel dan links buiten beeld op mobiel.
  const [shiftX, setShiftX] = useState(0)

  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0)
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const margin = 8
    let shift = 0
    if (rect.left < margin) shift = margin - rect.left
    else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right
    if (shift !== 0) setShiftX(shift)
  }, [open])

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div className={className}>
      <div ref={containerRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={label}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-all hover:border-[var(--module-active-500)] hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Info className="h-3.5 w-3.5" />
        </button>

        {open && (
          <div
            ref={panelRef}
            role="tooltip"
            className="absolute right-0 top-full z-50 mt-2 w-[min(280px,calc(100vw-1rem))] sm:w-[320px] rounded border border-[var(--border-ed)] bg-[var(--paper)] shadow-md"
            style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          >
            {/* Header */}
            <div className="border-b border-[var(--border-ed)] px-3 py-2">
              <span className="text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
                {label}
              </span>
            </div>
            {/* Body */}
            <div className="px-3 py-3">
              <p
                className="text-[13px] leading-relaxed text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
