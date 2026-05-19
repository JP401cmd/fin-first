'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Filter, Check } from 'lucide-react'

/**
 * FilterDropdown — gedeelde dropdown-filter voor hefboom-pages.
 * Generic over key-type T (bv. DebtType, AssetType). Caller levert
 * items-array + onSelect-handler; component handelt UI, accessibility,
 * en outside-click-dismiss.
 *
 * Pattern: trigger-button met Filter-icon + actieve label + chevron,
 * dropdown-listbox met "Alle"-optie bovenaan en gegeven items eronder.
 */
export type FilterItem<T extends string> = {
  key: T
  label: string
}

export function FilterDropdown<T extends string>({
  items,
  activeKey,
  allLabel,
  onSelect,
  minWidth,
}: {
  items: FilterItem<T>[]
  activeKey: T | null
  allLabel: string
  onSelect: (key: T | null) => void
  /** Optional minimum width van de dropdown (e.g. "240px"). */
  minWidth?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const activeLabel =
    activeKey != null
      ? items.find((i) => i.key === activeKey)?.label ?? allLabel
      : allLabel

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleSelect(key: T | null) {
    setOpen(false)
    onSelect(key)
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
      >
        <Filter className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
        <span>{activeLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--ink-3)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-20 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg overflow-hidden"
          style={{ minWidth: minWidth ?? '220px' }}
        >
          <FilterOption
            label={allLabel}
            isActive={activeKey === null}
            onSelect={() => handleSelect(null)}
            isFirst
          />
          <div className="border-t border-[var(--border-ed)]" aria-hidden="true" />
          {items.map((item) => (
            <FilterOption
              key={item.key}
              label={item.label}
              isActive={activeKey === item.key}
              onSelect={() => handleSelect(item.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterOption({
  label,
  isActive,
  onSelect,
  isFirst,
}: {
  label: string
  isActive: boolean
  onSelect: () => void
  isFirst?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      className={[
        'flex items-center justify-between w-full min-h-[44px] px-3 py-2 text-sm text-left transition-colors',
        isActive
          ? 'bg-[var(--subtle)] text-[var(--ink)] font-semibold'
          : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/50',
        isFirst ? 'rounded-t-xl' : '',
      ].join(' ')}
    >
      <span>{label}</span>
      {isActive && <Check className="w-4 h-4 text-[var(--ink-2)]" aria-hidden="true" />}
    </button>
  )
}
