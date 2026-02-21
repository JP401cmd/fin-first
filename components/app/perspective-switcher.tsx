'use client'

import { useState, useRef, useEffect } from 'react'
import { usePerspective, type Perspective } from '@/components/app/perspective-provider'
import { Users, User, UserCheck } from 'lucide-react'

const perspectiveIcons: Record<Perspective, typeof Users> = {
  personal: User,
  household: Users,
  partner: UserCheck,
}

const perspectiveColors: Record<Perspective, string> = {
  personal: 'text-[var(--ink-2)]',
  household: 'text-kern-600',
  partner: 'text-[var(--ink-2)]',
}

const perspectiveActiveColors: Record<Perspective, string> = {
  personal: 'bg-[var(--subtle)] border-[var(--border-md)] text-[var(--ink)]',
  household: 'bg-kern-50 border-kern-300 text-kern-900',
  partner: 'bg-[var(--subtle)] border-[var(--border-md)] text-[var(--ink)]',
}

export function PerspectiveSwitcher() {
  const { perspective, isHousehold, availablePerspectives, setPerspective, loading } = usePerspective()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Don't show switcher if user is solo (no household)
  if (!isHousehold && !loading) return null

  // Still loading
  if (loading) return null

  const currentOption = availablePerspectives.find(p => p.id === perspective) ?? availablePerspectives[0]
  const Icon = perspectiveIcons[perspective]

  return (
    <div className="relative" ref={dropdownRef} data-testid="perspective-switcher">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all hover:shadow-[var(--s0)] ${perspectiveActiveColors[perspective]}`}
        data-testid="perspective-switcher-trigger"
        aria-label="Perspectief wisselen"
        title={`Perspectief: ${currentOption.label}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{currentOption.label}</span>
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)]" data-testid="perspective-dropdown">
          <div className="px-3 py-2 border-b border-[var(--border-ed)]">
            <p className="text-[10px] font-semibold tracking-wider text-[var(--ink-3)] uppercase">
              Perspectief
            </p>
          </div>
          {availablePerspectives.map((option) => {
            const OptionIcon = perspectiveIcons[option.id]
            const isActive = option.id === perspective
            return (
              <button
                key={option.id}
                onClick={() => {
                  setPerspective(option.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-[var(--subtle)]'
                    : 'hover:bg-[var(--subtle)]'
                }`}
                data-testid={`perspective-option-${option.id}`}
                data-active={isActive ? 'true' : 'false'}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  isActive ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                }`}>
                  <OptionIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                    {option.label}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)] truncate">{option.description}</p>
                </div>
                {isActive && (
                  <svg className="h-4 w-4 text-[var(--ink)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
