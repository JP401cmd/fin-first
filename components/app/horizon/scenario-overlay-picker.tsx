'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { SavedScenario } from '@/lib/scenario-types'
import { WHATIF_SCENARIO_COLORS } from '@/lib/scenario-types'
import { formatFireAgeShort } from '@/lib/horizon-data'
import { ChevronDown, Layers, Check } from 'lucide-react'

interface ScenarioOverlayPickerProps {
  scenarios: SavedScenario[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClearAll: () => void
}

export function ScenarioOverlayPicker({
  scenarios,
  selectedIds,
  onToggle,
  onClearAll,
}: ScenarioOverlayPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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

  if (scenarios.length === 0) return null

  const activeCount = selectedIds.size
  const hasActive = activeCount > 0

  // Collect colors of active scenarios for the trigger button dots
  const activeColors = scenarios
    .filter(s => selectedIds.has(s.id))
    .slice(0, 3)
    .map(s => WHATIF_SCENARIO_COLORS[s.colorIndex ?? 0])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none cursor-pointer ${
          hasActive
            ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={hasActive ? `${activeCount} scenario-overlay${activeCount > 1 ? 's' : ''} actief` : 'Scenario-overlays kiezen'}
      >
        {hasActive && (
          <span className="inline-flex items-center gap-0.5">
            {activeColors.map((c, i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.hex }}
              />
            ))}
            {activeCount > 3 && (
              <span className="text-[9px] text-horizon-500">+{activeCount - 3}</span>
            )}
          </span>
        )}
        <Layers size={12} className={hasActive ? 'text-horizon-600' : 'text-[var(--ink-4)]'} />
        <span data-pill-label className="hidden sm:inline max-w-[100px] truncate">
          {hasActive ? `${activeCount} overlay${activeCount > 1 ? 's' : ''}` : 'Overlays'}
        </span>
        <ChevronDown
          size={12}
          className={`hidden sm:inline-block transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-72 border border-[var(--border-ed)] bg-[var(--paper)] shadow-md"
          role="group"
          aria-label="Scenario overlay selectie"
        >
          {/* Header with clear-all */}
          <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-3 py-2">
            <span className="font-sans text-[11px] font-medium text-[var(--ink-3)] uppercase tracking-wide">
              Scenario-overlays
            </span>
            {hasActive && (
              <button
                type="button"
                onClick={onClearAll}
                className="font-sans text-[10px] text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors"
              >
                Alles uit
              </button>
            )}
          </div>

          {scenarios.map(scenario => {
            const c = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]
            const isSelected = selectedIds.has(scenario.id)
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onToggle(scenario.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] ${
                  isSelected ? 'bg-[var(--subtle)]' : ''
                }`}
                style={{ minHeight: 44 }}
                role="checkbox"
                aria-checked={isSelected}
              >
                {/* Color-coded toggle checkbox */}
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${
                    isSelected
                      ? 'text-white'
                      : 'border border-[var(--border-md)] bg-[var(--paper)]'
                  }`}
                  style={isSelected ? { backgroundColor: c.hex } : undefined}
                >
                  {isSelected && <Check size={10} strokeWidth={3} />}
                </span>

                {/* Color dot + label */}
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-sans text-xs font-medium text-[var(--ink)] truncate block">
                    {scenario.name}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-[var(--ink-4)]">
                    FIRE {formatFireAgeShort(scenario.fireAge)}
                  </span>
                </div>
              </button>
            )
          })}

          <div className="border-t border-[var(--border-ed)]">
            <Link
              href="/toekomst/whatif"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans text-xs text-wil-600 hover:text-wil-700 hover:bg-wil-50/30 transition-colors"
              style={{ minHeight: 44 }}
              onClick={() => setOpen(false)}
            >
              Nieuw scenario maken &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
