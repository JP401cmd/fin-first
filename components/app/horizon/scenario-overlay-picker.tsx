'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { SavedScenario } from '@/app/api/scenarios/route'
import { WHATIF_SCENARIO_COLORS } from '@/app/api/scenarios/route'
import { formatFireAgeShort } from '@/lib/horizon-data'
import { ChevronDown, Layers } from 'lucide-react'

interface ScenarioOverlayPickerProps {
  scenarios: SavedScenario[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ScenarioOverlayPicker({
  scenarios,
  selectedId,
  onSelect,
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

  const selected = selectedId ? scenarios.find(s => s.id === selectedId) : null
  const color = selected ? WHATIF_SCENARIO_COLORS[selected.colorIndex ?? 0] : null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="card-editorial flex items-center gap-2 px-3 py-2 text-left transition-all hover:shadow-sm"
        style={{ minHeight: 44 }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Layers size={14} className="text-[var(--ink-3)]" />
        <div className="flex-1 min-w-0">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
            Scenario overlay
          </span>
          <div className="flex items-center gap-1.5">
            {color && (
              <span
                className="inline-block h-2 w-2 shrink-0"
                style={{ backgroundColor: color.hex }}
              />
            )}
            <span className="font-sans text-xs text-[var(--ink)] truncate">
              {selected ? selected.name : 'Geen'}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-[var(--ink-4)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 border border-[var(--border-ed)] bg-[var(--paper)] shadow-md"
          role="listbox"
          aria-label="Scenario overlay selectie"
        >
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] ${
              !selectedId ? 'bg-[var(--subtle)]' : ''
            }`}
            style={{ minHeight: 44 }}
            role="option"
            aria-selected={!selectedId}
          >
            <span className="font-sans text-xs text-[var(--ink-2)]">Geen overlay</span>
          </button>

          {scenarios.map(scenario => {
            const c = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]
            const isSelected = scenario.id === selectedId
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => { onSelect(scenario.id); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] ${
                  isSelected ? 'bg-[var(--subtle)]' : ''
                }`}
                style={{ minHeight: 44 }}
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0"
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
              href="/horizon/whatif"
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
