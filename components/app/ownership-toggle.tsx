'use client'

import { useState, useEffect } from 'react'
import { User, Users, AlertTriangle } from 'lucide-react'

export type OwnershipType = 'personal' | 'shared'

interface OwnershipToggleProps {
  value: OwnershipType
  onChange: (value: OwnershipType) => void
  /** Whether the user has an active household */
  hasHousehold: boolean
  /** Optional: compact mode for inline forms */
  compact?: boolean
}

/**
 * OwnershipToggle — reusable component for marking items as personal or shared.
 * Shows a warning if user tries to select "shared" without an active household.
 */
export function OwnershipToggle({ value, onChange, hasHousehold, compact = false }: OwnershipToggleProps) {
  const [showWarning, setShowWarning] = useState(false)

  function handleSelect(newValue: OwnershipType) {
    if (newValue === 'shared' && !hasHousehold) {
      setShowWarning(true)
      return
    }
    setShowWarning(false)
    onChange(newValue)
  }

  if (compact) {
    return (
      <div data-testid="ownership-toggle">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleSelect('personal')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value === 'personal'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-[var(--ink-3)] hover:bg-zinc-200'
            }`}
            data-testid="ownership-personal-btn"
          >
            <User className="h-3 w-3" />
            Persoonlijk
          </button>
          <button
            type="button"
            onClick={() => handleSelect('shared')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value === 'shared'
                ? 'bg-teal-600 text-white'
                : 'bg-zinc-100 text-[var(--ink-3)] hover:bg-zinc-200'
            }`}
            data-testid="ownership-shared-btn"
          >
            <Users className="h-3 w-3" />
            Gedeeld
          </button>
        </div>
        {showWarning && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600" data-testid="ownership-no-household-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Nodig eerst je partner uit via Identiteit
          </p>
        )}
      </div>
    )
  }

  return (
    <div data-testid="ownership-toggle">
      <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
        Eigendom
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSelect('personal')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--r-lg)] border-2 px-4 py-3 text-sm font-medium transition-all ${
            value === 'personal'
              ? 'border-zinc-900 bg-[var(--subtle)] text-[var(--ink)] shadow-[var(--s0)]'
              : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]'
          }`}
          data-testid="ownership-personal-btn"
        >
          <User className={`h-4 w-4 ${value === 'personal' ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`} />
          <div className="text-left">
            <span className="block">Persoonlijk</span>
            <span className={`block text-[10px] font-normal ${value === 'personal' ? 'text-[var(--ink-3)]' : 'text-[var(--ink-3)]'}`}>
              Alleen van jou
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('shared')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--r-lg)] border-2 px-4 py-3 text-sm font-medium transition-all ${
            value === 'shared'
              ? 'border-teal-600 bg-teal-50 text-teal-900 shadow-[var(--s0)]'
              : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]'
          }`}
          data-testid="ownership-shared-btn"
        >
          <Users className={`h-4 w-4 ${value === 'shared' ? 'text-teal-600' : 'text-[var(--ink-3)]'}`} />
          <div className="text-left">
            <span className="block">Gedeeld</span>
            <span className={`block text-[10px] font-normal ${value === 'shared' ? 'text-teal-600' : 'text-[var(--ink-3)]'}`}>
              Samen met partner
            </span>
          </div>
        </button>
      </div>
      {showWarning && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" data-testid="ownership-no-household-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700">
            Je hebt nog geen huishouden. Nodig eerst je partner uit via{' '}
            <a href="/identity" className="font-medium underline">Identiteit</a>.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * OwnershipBadge — small indicator badge for list views.
 */
export function OwnershipBadge({ ownership }: { ownership: OwnershipType }) {
  if (ownership !== 'shared') return null

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 border border-teal-200"
      data-testid="ownership-badge-shared"
      title="Gedeeld met huishouden"
    >
      <Users className="h-2.5 w-2.5" />
      Gedeeld
    </span>
  )
}

/**
 * Hook to check if the current user has an active household.
 * Caches the result in state and fetches once.
 */
export function useHouseholdStatus() {
  const [hasHousehold, setHasHousehold] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/household/status')
        if (res.ok) {
          const data = await res.json()
          setHasHousehold(data.has_household === true)
          setHouseholdId(data.household?.id ?? null)
        }
      } catch {
        // Non-critical
      }
      setLoading(false)
    }
    check()
  }, [])

  return { hasHousehold, householdId, loading }
}
