'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Briefcase, TrendingUp, PiggyBank, Rocket, Palmtree,
  AlertTriangle, Gift, Baby, GraduationCap, Home, Wrench, Truck,
  Activity, Hourglass, TrendingDown, UserMinus,
} from 'lucide-react'
import {
  PRESETS, PRESET_CATEGORIES, eventsMatchPreset, clearScenarioEvents,
  type PresetSpec, type PresetCategory,
} from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'

export { PRESET_EXPLAINERS } from '@/lib/scenario-events'

const ICONS: Record<string, React.ReactNode> = {
  Briefcase: <Briefcase className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  PiggyBank: <PiggyBank className="h-5 w-5" />,
  Rocket: <Rocket className="h-5 w-5" />,
  Palmtree: <Palmtree className="h-5 w-5" />,
  AlertTriangle: <AlertTriangle className="h-5 w-5" />,
  Gift: <Gift className="h-5 w-5" />,
  Baby: <Baby className="h-5 w-5" />,
  GraduationCap: <GraduationCap className="h-5 w-5" />,
  Home: <Home className="h-5 w-5" />,
  Wrench: <Wrench className="h-5 w-5" />,
  Truck: <Truck className="h-5 w-5" />,
  Activity: <Activity className="h-5 w-5" />,
  Hourglass: <Hourglass className="h-5 w-5" />,
  TrendingDown: <TrendingDown className="h-5 w-5" />,
  UserMinus: <UserMinus className="h-5 w-5" />,
}

const STORAGE_KEY = 'whatif:presets:category'

interface CardProps {
  preset: PresetSpec
  active: boolean
  baseline: WhatIfOverrides
  onClick: () => void
}

function PresetCard({ preset, active, baseline, onClick }: CardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[88px] flex-col gap-1.5 rounded-lg border p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        active
          ? 'border-horizon-500 bg-horizon-50 shadow-sm ring-2 ring-horizon-500/20'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-horizon-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={active ? 'text-horizon-600' : 'text-[var(--ink-3)]'}>
          {ICONS[preset.iconKey] ?? <Activity className="h-5 w-5" />}
        </span>
        {active && (
          <span className="font-mono text-[10px] tabular-nums text-horizon-700">
            {preset.summary(baseline)}
          </span>
        )}
      </div>
      <h3 className={`font-sans text-sm font-semibold ${active ? 'text-horizon-700' : 'text-[var(--ink)]'}`}>
        {preset.label}
      </h3>
      <p className="font-sans text-xs leading-snug text-[var(--ink-3)]">
        {preset.description}
      </p>
    </button>
  )
}

interface FilterProps {
  value: PresetCategory
  onChange: (v: PresetCategory) => void
}

function CategoryFilter({ value, onChange }: FilterProps) {
  return (
    <div
      role="tablist"
      aria-label="Scenario-categorie"
      className="-mx-1 mb-3 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PRESET_CATEGORIES.map(cat => {
        const active = cat.id === value
        return (
          <button
            key={cat.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(cat.id)}
            className={`shrink-0 snap-start rounded-full border px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
              active
                ? 'border-horizon-500 bg-horizon-500 text-white'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-horizon-300'
            }`}
            style={{ minHeight: 32 }}
          >
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}

export function WhatIfPresets({
  baseline,
  events,
  setEvents,
  currentAge,
  isHousehold = false,
  onActiveChange,
}: {
  baseline: WhatIfOverrides
  events: WhatIfEvent[]
  setEvents: (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => void
  currentAge: number
  isHousehold?: boolean
  /** Optional callback notified when active preset changes (id or null). */
  onActiveChange?: (id: string | null) => void
}) {
  const [category, setCategory] = useState<PresetCategory>(() => {
    if (typeof window === 'undefined') return 'werk'
    const stored = window.localStorage.getItem(STORAGE_KEY) as PresetCategory | null
    if (stored && PRESET_CATEGORIES.some(c => c.id === stored)) return stored
    return 'werk'
  })

  const updateCategory = (c: PresetCategory) => {
    setCategory(c)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, c)
    }
  }

  const visiblePresets = useMemo(
    () => PRESETS.filter(p => p.category === category && (!p.householdOnly || isHousehold)),
    [category, isHousehold],
  )

  // Derive active preset from scenario events.
  const activePresetId = useMemo<string | null>(() => {
    for (const preset of PRESETS) {
      if (eventsMatchPreset(events, preset.id)) return preset.id
    }
    return null
  }, [events])

  useEffect(() => {
    onActiveChange?.(activePresetId)
  }, [activePresetId, onActiveChange])

  const handlePresetClick = (preset: PresetSpec) => {
    if (activePresetId === preset.id) {
      setEvents(prev => clearScenarioEvents(prev, `preset:${preset.id}`))
    } else {
      const newEvents = preset.buildEvents(baseline, currentAge)
      setEvents(prev => [
        ...clearScenarioEvents(prev, 'preset:'),
        ...newEvents,
      ])
    }
  }

  return (
    <div>
      <CategoryFilter value={category} onChange={updateCategory} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePresets.length === 0 ? (
          <p className="col-span-full py-4 text-center font-sans text-xs text-[var(--ink-4)]">
            Geen presets in deze categorie {isHousehold ? '' : '— huishouden-presets vereisen partner-perspectief'}.
          </p>
        ) : (
          visiblePresets.map(preset => (
            <PresetCard
              key={preset.id}
              preset={preset}
              active={activePresetId === preset.id}
              baseline={baseline}
              onClick={() => handlePresetClick(preset)}
            />
          ))
        )}
      </div>
    </div>
  )
}
