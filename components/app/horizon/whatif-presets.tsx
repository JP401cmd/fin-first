'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import {
  Briefcase, TrendingUp, PiggyBank, Rocket, Palmtree,
} from 'lucide-react'

// ── Preset definitions ──────────────────────────────────────────────────────

interface Preset {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  /** Compute the overrides to apply, given the baseline */
  apply: (baseline: WhatIfOverrides) => WhatIfOverrides
  /** Short summary of what changes */
  summary: (baseline: WhatIfOverrides) => string
}

const PRESETS: Preset[] = [
  {
    id: 'part-time',
    label: 'Part-time',
    description: '4 dagen per week werken',
    icon: <Briefcase className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      workDaysPerWeek: 4,
      monthlyIncome: b.monthlyIncome,
    }),
    summary: (b) => b.workDaysPerWeek <= 4 ? '4 dagen/week' : `${b.workDaysPerWeek} → 4 dagen`,
  },
  {
    id: 'raise',
    label: 'Loonsverhoging',
    description: '+10% bruto inkomen',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      monthlyIncome: Math.round(b.monthlyIncome * 1.1 / 100) * 100,
    }),
    summary: (b) => `+${formatCurrency(Math.round(b.monthlyIncome * 0.1 / 100) * 100)}/mnd`,
  },
  {
    id: 'frugal',
    label: 'Zuinig leven',
    description: 'Spaarquote +15 procentpunt',
    icon: <PiggyBank className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      savingsRate: Math.min(80, b.savingsRate + 15),
    }),
    summary: (b) => `${Math.round(b.savingsRate)}% → ${Math.min(80, Math.round(b.savingsRate + 15))}%`,
  },
  {
    id: 'fire-sprinter',
    label: 'FIRE sprinter',
    description: 'Maximaal versnellen',
    icon: <Rocket className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      savingsRate: Math.min(80, b.savingsRate + 10),
      extraContribution: b.extraContribution + 300,
    }),
    summary: () => '+10% sparen, +€ 300 inleg',
  },
  {
    id: 'sabbatical',
    label: 'Mini-sabbatical',
    description: '3 dagen, lager inkomen',
    icon: <Palmtree className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      workDaysPerWeek: 3,
      monthlyIncome: b.monthlyIncome,
      savingsRate: Math.max(0, b.savingsRate - 10),
    }),
    summary: (b) => b.workDaysPerWeek <= 3 ? '3 dagen/week, −10% sparen' : `${b.workDaysPerWeek} → 3 dagen, −10% sparen`,
  },
]

// ── WhatIfPresets component ─────────────────────────────────────────────────

export function WhatIfPresets({
  baseline,
  overrides,
  onChange,
}: {
  baseline: WhatIfOverrides
  overrides: WhatIfOverrides
  onChange: (overrides: WhatIfOverrides) => void
}) {
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const handlePresetClick = (preset: Preset) => {
    if (activePreset === preset.id) {
      // Deactivate — reset to baseline
      setActivePreset(null)
      onChange(baseline)
    } else {
      // Apply preset
      setActivePreset(preset.id)
      onChange(preset.apply(baseline))
    }
  }

  // Clear active preset when user manually changes sliders
  // (detected by overrides not matching any preset's output)
  const isActivePresetStillMatching = activePreset
    ? JSON.stringify(overrides) === JSON.stringify(
        PRESETS.find(p => p.id === activePreset)?.apply(baseline)
      )
    : false

  const effectiveActive = isActivePresetStillMatching ? activePreset : null

  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map(preset => {
        const isActive = effectiveActive === preset.id

        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={effectiveActive === preset.id}
            title={preset.description}
            onClick={() => handlePresetClick(preset)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 transition-all ${
              isActive
                ? 'border-wil-400 bg-wil-50 text-wil-700 shadow-sm'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-wil-300 hover:shadow-sm'
            }`}
          >
            <span className={isActive ? 'text-wil-600' : 'text-[var(--ink-3)]'}>
              {preset.icon}
            </span>
            <span className="font-sans text-xs font-semibold">
              {preset.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
