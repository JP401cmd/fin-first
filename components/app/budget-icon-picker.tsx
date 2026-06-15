'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { BudgetIcon, iconOptions } from '@/components/app/budget-shared'

/**
 * Compacte icoon-kiezer voor het budgetplan-editorscherm. Twee modes:
 *
 * - **popover** (default): een triggerknop met het huidige icoon; klik opent
 *   een grid in een `createPortal`-paneel met `position: fixed`, zodat het niet
 *   wordt afgekapt door de scroll-/overflow-container van de boomlijst.
 * - **inline**: het kale grid zonder trigger — voor het detail-subscherm waar
 *   ruimte genoeg is.
 *
 * Hergebruikt de canonieke `iconMap`/`iconOptions` uit `budget-shared.tsx`
 * (Lucide-naam → component); geen eigen icoon-lijst.
 */

const GRID = iconOptions

export function BudgetIconPicker({
  value,
  onChange,
  size = 'md',
  disabled = false,
  ariaLabel = 'Icoon kiezen',
}: {
  value: string
  onChange: (icon: string) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)

  const triggerSize = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  // Bereken paneel-positie t.o.v. de trigger; klap naar boven als er onderin
  // te weinig ruimte is.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const PANEL_W = 248
    const PANEL_H = 232
    const rect = triggerRef.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(rect.left, 8),
      window.innerWidth - PANEL_W - 8,
    )
    const below = rect.bottom + 6
    const top = below + PANEL_H > window.innerHeight ? rect.top - PANEL_H - 6 : below
    setCoords({ left, top: Math.max(8, top) })
  }, [open])

  // Sluit bij Escape, buiten-klik, scroll of resize.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onReflow() {
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', onReflow)
    // capture scroll op alle voorouders
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open])

  function pick(name: string) {
    onChange(name)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex ${triggerSize} shrink-0 items-center justify-center rounded-[var(--r)] border transition-colors ${
          open
            ? 'border-kern-500 bg-kern-50 text-kern-600'
            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
        } disabled:opacity-40`}
      >
        <BudgetIcon name={value} className={iconSize} />
      </button>

      {open && coords != null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            className="fixed z-[80] w-[248px] rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] p-2 shadow-[var(--s2)]"
            style={{ left: coords.left, top: coords.top }}
          >
            <div className="grid max-h-[200px] grid-cols-6 gap-1 overflow-y-auto">
              {GRID.map((name) => {
                const selected = name === value
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => pick(name)}
                    title={name}
                    aria-label={name}
                    aria-pressed={selected}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-[var(--r)] border transition-colors ${
                      selected
                        ? 'border-kern-500 bg-kern-50 text-kern-600'
                        : 'border-transparent text-[var(--ink-3)] hover:border-[var(--border-ed)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    <BudgetIcon name={name} className="h-4 w-4" />
                    {selected && (
                      <Check className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-kern-600 p-px text-white" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * Kaal, altijd-zichtbaar icoon-grid — voor het detail-subscherm. Geen portal,
 * geen trigger; selecteert direct.
 */
export function BudgetIconGrid({
  value,
  onChange,
}: {
  value: string
  onChange: (icon: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {GRID.map((name) => {
        const selected = name === value
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            aria-label={name}
            aria-pressed={selected}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              selected
                ? 'border-kern-500 bg-kern-50 text-kern-600'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
            }`}
          >
            <BudgetIcon name={name} className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
