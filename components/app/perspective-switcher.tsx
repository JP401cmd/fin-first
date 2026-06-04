'use client'

import { useState, useRef, useEffect } from 'react'
import { usePerspective, type Perspective } from '@/components/app/perspective-provider'
import { Users, User, UserCheck, Check, ChevronDown } from 'lucide-react'

/**
 * PerspectiveSwitcher — de "weergave-badge": toont én wisselt het actieve
 * perspectief (Eigen / Huishouden / Partner). Verschijnt alleen voor leden van
 * een huishouden (self-gating). Gerenderd in de sidebar (desktop) en de
 * mobiele TopBar zodat altijd zichtbaar is welke weergave actief is.
 *
 * Stijl (ui/ux-skill): een `rounded-full` pill-badge — de enige toegestane
 * ronde vorm. Tint per perspectief, consistent met OwnershipBadge:
 *   • Eigen      → neutraal (ink/subtle)
 *   • Huishouden → kern-tint
 *   • Partner    → horizon-tint
 */

const perspectiveIcons: Record<Perspective, typeof Users> = {
  personal: User,
  household: Users,
  partner: UserCheck,
}

/** Pill-tint per perspectief (badge-achtergrond + rand + tekst). */
const pillTint: Record<Perspective, string> = {
  personal: 'bg-[var(--subtle)] border-[var(--border-md)] text-[var(--ink-2)]',
  household: 'bg-kern-50 border-kern-300 text-kern-800',
  partner: 'bg-horizon-50 border-horizon-300 text-horizon-800',
}

export function PerspectiveSwitcher({
  compact = false,
  menuAlign = 'right',
}: {
  /** Icoon-only pill (collapsed sidebar / mobiele TopBar). */
  compact?: boolean
  /** Uitlijning van het dropdown-menu t.o.v. de trigger. */
  menuAlign?: 'left' | 'right'
} = {}) {
  const { perspective, isHousehold, availablePerspectives, setPerspective, loading } = usePerspective()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Self-gating: alleen tonen voor leden van een huishouden.
  if (loading || !isHousehold) return null

  const current = availablePerspectives.find((p) => p.id === perspective) ?? availablePerspectives[0]
  const Icon = perspectiveIcons[perspective]

  return (
    <div className="relative" ref={ref} data-testid="perspective-switcher">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border transition-all hover:shadow-[var(--s0)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ink)] ${pillTint[perspective]} ${
          compact ? 'h-8 w-8 justify-center' : 'px-2.5 py-1 text-xs font-medium'
        }`}
        data-testid="perspective-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Weergave: ${current.label}`}
        title={`Weergave: ${current.label}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {!compact && (
          <>
            <span className="truncate">{current.label}</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${menuAlign === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-1 w-56 border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)]`}
          data-testid="perspective-dropdown"
        >
          <div className="px-3 py-2 border-b border-[var(--border-ed)]">
            <p className="text-[10px] font-mono font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Weergave
            </p>
          </div>
          {availablePerspectives.map((option) => {
            const OptionIcon = perspectiveIcons[option.id]
            const isActive = option.id === perspective
            return (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPerspective(option.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-[var(--subtle)]' : 'hover:bg-[var(--subtle)]'
                }`}
                data-testid={`perspective-option-${option.id}`}
                data-active={isActive ? 'true' : 'false'}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    isActive ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                  }`}
                >
                  <OptionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                    {option.label}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--ink-3)]">{option.description}</span>
                </span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-[var(--ink)]" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
