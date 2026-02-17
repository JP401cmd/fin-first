'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Section title */
  title: string
  /** 1-line summary shown even when collapsed */
  summary?: string
  /** Full content revealed when expanded */
  children: ReactNode
  /** Start expanded (default: false = collapsed) */
  defaultOpen?: boolean
  /** Optional icon to show next to title */
  icon?: ReactNode
}

export function CollapsibleSection({
  storageKey,
  title,
  summary,
  children,
  defaultOpen = false,
  icon,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(false)

  // Restore collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`collapsible_${storageKey}`)
      if (stored !== null) {
        setIsOpen(stored === 'true')
      }
    } catch {
      // localStorage not available
    }
    setMounted(true)
  }, [storageKey])

  function toggle() {
    const next = !isOpen
    setIsOpen(next)
    try {
      localStorage.setItem(`collapsible_${storageKey}`, String(next))
    } catch {
      // localStorage not available
    }
  }

  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
      data-testid={`collapsible-section-${storageKey}`}
      data-collapsed={!isOpen ? 'true' : 'false'}
    >
      {/* Header - always visible, clickable to toggle */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-zinc-50"
        aria-expanded={isOpen}
        data-testid={`collapsible-toggle-${storageKey}`}
      >
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900" data-testid={`collapsible-title-${storageKey}`}>{title}</h3>
          {/* Show summary preview when collapsed */}
          {!isOpen && summary && (
            <p className="mt-0.5 truncate text-xs text-zinc-400" data-testid={`collapsible-summary-${storageKey}`}>{summary}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expandable content */}
      <div
        data-testid={`collapsible-content-${storageKey}`}
        className={`transition-all duration-300 ease-in-out ${
          isOpen && mounted ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="border-t border-zinc-100 p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
