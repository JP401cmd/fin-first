'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * InfoIconTooltip — canonieke editorial i-tooltip (derde info-affordance).
 *
 * Scherpe krant/editorial i-icoon met één-alinea-popover, náást:
 *  - `InlineInfoDisclosure` (i-knop + inline uitleg-paneel dat de layout duwt)
 *  - `GlossaryTerm` (onderstreepte term met begrip-definitie)
 * Deze primitive is de compacte inline-i met zwevende popover — ideaal naast
 * een label of KPI dat een korte toelichting nodig heeft zonder de layout te
 * verstoren.
 *
 * Toegankelijk:
 *  - knop met `aria-label`, `aria-expanded`, `aria-describedby`
 *  - tooltip met `role="tooltip"` + stabiele `id`
 *  - sluit op `Esc` en op klik buiten de tooltip
 *
 * Kleur volgt de actieve module/box via `--module-active-*` (route-layouts
 * zetten die), dus geen hardcoded hues. De rand + shadow-[0_2px_0] geven de
 * signature scherpe editorial-look.
 */
export function InfoIconTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Meer informatie"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center bg-[var(--subtle)] text-[var(--ink-3)] transition-colors hover:bg-[color-mix(in_srgb,var(--module-active-500)_14%,transparent)] hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 border border-[var(--ink)] bg-[var(--paper)] p-3 text-xs leading-snug text-[var(--ink-2)] shadow-[0_2px_0_var(--ink)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--ink)]" />
        </span>
      )}
    </span>
  )
}

/** Backwards-compat alias — behoud de historische naam `InfoTooltip`. */
export const InfoTooltip = InfoIconTooltip
